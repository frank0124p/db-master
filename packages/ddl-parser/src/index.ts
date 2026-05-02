/**
 * DDL Parser — converts MySQL/MariaDB CREATE TABLE statements into structured data.
 *
 * Entry point: parseDDL(sql)
 *
 * Parsing pipeline:
 *   1. Strip SQL comments and normalize whitespace
 *   2. splitStatements  — split on `;` while respecting quoted strings
 *   3. parseCreateTable — for each CREATE TABLE block:
 *        a. Extract table name and table-level COMMENT
 *        b. findMatchingParen — locate the closing `)` of the column list
 *        c. splitClauses — split column list by `,` (skip `,` inside parens)
 *        d. First pass: collect PRIMARY KEY / UNIQUE KEY constraints
 *        e. Second pass: parseColumnClause for each column definition
 *
 * Supported syntax:
 *   - Backtick and double-quoted identifiers
 *   - IF NOT EXISTS
 *   - Inline PRIMARY KEY, NOT NULL, AUTO_INCREMENT, UNIQUE on a column
 *   - Table-level PRIMARY KEY (`col`), UNIQUE KEY name (`col`)
 *   - COMMENT '...' and COMMENT='...' on columns and tables
 *   - DEFAULT values (quoted strings, numbers, NULL)
 *   - Nested parentheses in type sizes: DECIMAL(10, 2), ENUM('a','b')
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedField {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  comment: string | null;
  position: number;  // 0-based, reflects order in CREATE TABLE
}

export interface ParsedTable {
  name: string;
  comment: string | null;
  fields: ParsedField[];
}

export interface ParseResult {
  tables: ParsedTable[];
  errors: string[];  // one entry per table that failed to parse; other tables are still returned
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Remove surrounding backticks, double-quotes, brackets, and whitespace from an identifier.
// `lot_id`  →  lot_id
// "schema"  →  schema
function stripIdent(s: string): string {
  return s.replace(/^[`"[\s]+|[`"\]\s]+$/g, "").trim();
}

// Extract COMMENT value from a string fragment.
// Handles both  COMMENT 'text'  and  COMMENT='text'  (table-level syntax).
// Unescapes \'  and  \\  inside the string.
function extractComment(s: string): string | null {
  const m = s.match(/COMMENT\s*=?\s*'((?:[^'\\]|\\.)*)'/i);
  if (!m) return null;
  return m[1]!.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

// Extract DEFAULT value.  Strips surrounding single-quotes.
// DEFAULT 'hello'  →  hello
// DEFAULT 0        →  0
// DEFAULT NULL     →  NULL
function extractDefault(s: string): string | null {
  const m = s.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|\S+)/i);
  return m ? m[1]!.replace(/^'|'$/g, "") : null;
}

// Extract the data type token — includes the optional size/precision.
// "VARCHAR(32) NOT NULL"  →  "VARCHAR(32)"
// "DECIMAL(10,2)"         →  "DECIMAL(10,2)"
function extractDataType(s: string): string {
  // Match type + optional (size, precision) — stops at whitespace or constraint keyword
  const m = s.match(/^([A-Z_]+(?:\s*\([^)]*\))?)/i);
  return m ? m[1]!.replace(/\s+/g, "") : s.split(/\s+/)[0] ?? s;
}

// ── Main parser ────────────────────────────────────────────────────────────────

export function parseDDL(sql: string): ParseResult {
  const tables: ParsedTable[] = [];
  const errors: string[] = [];

  // Normalise: collapse multi-line, remove single-line comments, unify whitespace
  const cleaned = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\r\n/g, "\n");

  // Split on statement boundaries (semicolons outside quoted strings)
  const statements = splitStatements(cleaned);

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const createMatch = trimmed.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?[\w]+[`"]?)\s*\(/is);
    if (!createMatch) continue;  // skip non-CREATE-TABLE statements (INSERT, ALTER, etc.)

    try {
      const table = parseCreateTable(trimmed);
      tables.push(table);
    } catch (e) {
      // Collect parse failures without aborting the whole batch
      errors.push(`解析失敗 (${createMatch[1] ?? "unknown"}): ${String(e)}`);
    }
  }

  return { tables, errors };
}

// ── Split statements at ; but respect quoted strings ──────────────────────────
//
// A naïve split on ";" would break on values like DEFAULT 'a;b'.
// This scanner tracks whether we're inside a quoted string and only
// splits on semicolons that appear outside any quote.

function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = "";
  let inStr = false;
  let strChar = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (!inStr && (ch === "'" || ch === '"' || ch === "`")) {
      inStr = true; strChar = ch; current += ch;
    } else if (inStr && ch === strChar && sql[i - 1] !== "\\") {
      inStr = false; current += ch;
    } else if (!inStr && ch === ";") {
      stmts.push(current); current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) stmts.push(current);
  return stmts;
}

// ── Parse a single CREATE TABLE statement ─────────────────────────────────────

function parseCreateTable(stmt: string): ParsedTable {
  // Extract table name
  const nameMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?[\w]+[`"]?)\s*\(/is);
  if (!nameMatch) throw new Error("無法解析 Table 名稱");
  const tableName = stripIdent(nameMatch[1]!);

  // Table-level COMMENT appears after the closing paren:
  //   CREATE TABLE `t` (...) ENGINE=InnoDB COMMENT='description';
  //                                        ↑ this part
  const tableComment = extractComment(stmt.split(")").slice(-1)[0] ?? "");

  // Extract the column definition block (content between outer parens)
  const bodyStart = stmt.indexOf("(");
  const bodyEnd = findMatchingParen(stmt, bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) throw new Error("括號不對稱");
  const body = stmt.slice(bodyStart + 1, bodyEnd);

  // Split body into individual clauses (respect nested parens for type sizes)
  const clauses = splitClauses(body);

  const fields: ParsedField[] = [];
  const tablePKs = new Set<string>();      // column names declared in table-level PRIMARY KEY(...)
  const tableUniques = new Set<string>();  // column names with a single-column UNIQUE KEY

  // First pass: collect table-level constraint declarations before parsing columns.
  // This ensures PRIMARY KEY / UNIQUE flags are applied even when declared after the columns.
  for (const clause of clauses) {
    const c = clause.trim();
    if (/^PRIMARY\s+KEY/i.test(c)) {
      const pkMatch = c.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        pkMatch[1]!.split(",").map(s => stripIdent(s)).forEach(n => tablePKs.add(n));
      }
    } else if (/^UNIQUE\s+(?:KEY|INDEX)/i.test(c)) {
      // Only mark as isUnique for single-column unique keys
      const ukMatch = c.match(/UNIQUE\s+(?:KEY|INDEX)\s+\S*\s*\(([^)]+)\)/i);
      if (ukMatch) {
        const cols = ukMatch[1]!.split(",").map(s => stripIdent(s));
        if (cols.length === 1 && cols[0]) tableUniques.add(cols[0]);
      }
    }
  }

  // Second pass: parse column definitions
  let position = 0;
  for (const clause of clauses) {
    const c = clause.trim();
    if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FOREIGN)/i.test(c)) continue;  // skip constraint lines
    if (!c) continue;

    const field = parseColumnClause(c, position);
    if (!field) continue;

    // Merge table-level PK / Unique flags into the field
    if (tablePKs.has(field.name)) field.isPrimaryKey = true;
    if (tableUniques.has(field.name)) field.isUnique = true;

    fields.push(field);
    position++;
  }

  return { name: tableName, comment: tableComment, fields };
}

// ── Find matching closing paren ────────────────────────────────────────────────
//
// Walks forward from openIdx, tracking nesting depth.
// Returns the index of the matching ')' or -1 if not found.
// Strings (quoted with ', ", or `) are skipped to avoid false matches.

function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let strChar = "";
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i]!;
    if (!inStr && (ch === "'" || ch === '"' || ch === "`")) { inStr = true; strChar = ch; }
    else if (inStr && ch === strChar && s[i - 1] !== "\\") { inStr = false; }
    else if (!inStr && ch === "(") { depth++; }
    else if (!inStr && ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── Split comma-separated clauses (respect parens and strings) ────────────────
//
// A column list like:
//   `id` BIGINT, `val` DECIMAL(10, 2), PRIMARY KEY (`id`)
//                              ↑ this comma must NOT split
//
// The scanner increments depth on '(' and decrements on ')', only splitting
// on ',' when depth === 0.

function splitClauses(body: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let depth = 0;
  let inStr = false;
  let strChar = "";

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (!inStr && (ch === "'" || ch === '"' || ch === "`")) { inStr = true; strChar = ch; current += ch; }
    else if (inStr && ch === strChar && body[i - 1] !== "\\") { inStr = false; current += ch; }
    else if (!inStr && ch === "(") { depth++; current += ch; }
    else if (!inStr && ch === ")") { depth--; current += ch; }
    else if (!inStr && depth === 0 && ch === ",") { clauses.push(current); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) clauses.push(current);
  return clauses;
}

// ── Parse a single column definition clause ───────────────────────────────────
//
// Input:  "`part_no` VARCHAR(32) NOT NULL COMMENT '料號'"
// Output: { name: "part_no", dataType: "VARCHAR(32)", nullable: false,
//           comment: "料號", isPrimaryKey: false, ... }
//
// Returns null for clauses that don't look like column definitions
// (e.g. lines that start with whitespace or a digit after trimming).

function parseColumnClause(clause: string, position: number): ParsedField | null {
  const trimmed = clause.trim();
  // Must start with identifier (backtick, quote, or word char)
  if (!/^[`"\w]/.test(trimmed)) return null;

  // First token = column name, rest = type + constraints
  const nameMatch = trimmed.match(/^([`"]?[\w]+[`"]?)\s+(.*)/s);
  if (!nameMatch) return null;
  const name = stripIdent(nameMatch[1]!);
  const rest = nameMatch[2]!;

  const dataType = extractDataType(rest);
  // unused but kept in scope for potential future use (e.g. enum value extraction)
  void rest.toUpperCase();

  const nullable = !/\bNOT\s+NULL\b/i.test(rest);
  const isAutoIncrement = /\bAUTO_INCREMENT\b/i.test(rest);
  const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
  // UNIQUE alone makes the column unique; but if it's also PK, isUnique stays false
  const isUnique = /\bUNIQUE\b/i.test(rest) && !isPrimaryKey;
  const defaultValue = extractDefault(rest);
  const comment = extractComment(rest);

  return { name, dataType, nullable, defaultValue, isPrimaryKey, isUnique, isAutoIncrement, comment, position };
}

export const ddlParserVersion = "0.2.0";

export { emitDDL, DIALECT_LABELS } from "./emitter.js";
export type { Dialect, EmitTable, EmitField } from "./emitter.js";
