/**
 * Multi-dialect DDL emitter
 * Supports: mariadb | oracle | clickhouse
 */

export type Dialect = "mariadb" | "oracle" | "clickhouse";

export interface EmitField {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  comment: string | null;
  position: number;
}

export interface EmitTable {
  name: string;
  comment: string | null;
  fields: EmitField[];
}

// ── Type mapping ───────────────────────────────────────────────────────────────

function parseSize(type: string): string {
  const m = type.match(/\(([^)]+)\)/);
  return m ? m[1]! : "";
}

function mapTypeOracle(raw: string): string {
  const base = raw.replace(/\s*\(.*\)/, "").toUpperCase().trim();
  const size = parseSize(raw);

  switch (base) {
    case "BIGINT":            return "NUMBER(19)";
    case "INT": case "INTEGER": return "NUMBER(10)";
    case "MEDIUMINT":         return "NUMBER(8)";
    case "SMALLINT":          return "NUMBER(5)";
    case "TINYINT":           return size === "1" ? "NUMBER(1)" : "NUMBER(3)";
    case "FLOAT":             return "BINARY_FLOAT";
    case "DOUBLE": case "DOUBLE PRECISION": return "BINARY_DOUBLE";
    case "DECIMAL": case "NUMERIC":
      return size ? `NUMBER(${size})` : "NUMBER";
    case "VARCHAR": case "NVARCHAR":
      return size ? `VARCHAR2(${size})` : "VARCHAR2(255)";
    case "CHAR": case "NCHAR":
      return size ? `CHAR(${size})` : "CHAR(1)";
    case "TEXT": case "TINYTEXT": case "MEDIUMTEXT": case "LONGTEXT":
      return "CLOB";
    case "BLOB": case "TINYBLOB": case "MEDIUMBLOB": case "LONGBLOB":
      return "BLOB";
    case "DATE":              return "DATE";
    case "TIME":              return "VARCHAR2(8)";
    case "DATETIME": case "TIMESTAMP":
      return "TIMESTAMP";
    case "BOOLEAN": case "BOOL": return "NUMBER(1)";
    case "JSON":              return "CLOB";
    case "ENUM": case "SET":  return size ? `VARCHAR2(${String(size.split(",").reduce((m, v) => Math.max(m, v.replace(/'/g, "").length), 0) + 1)})` : "VARCHAR2(255)";
    default:                  return raw;
  }
}

function mapTypeClickHouse(raw: string): string {
  const base = raw.replace(/\s*\(.*\)/, "").toUpperCase().trim();
  const size = parseSize(raw);

  switch (base) {
    case "BIGINT":            return "Int64";
    case "INT": case "INTEGER": return "Int32";
    case "MEDIUMINT":         return "Int32";
    case "SMALLINT":          return "Int16";
    case "TINYINT":           return size === "1" ? "UInt8" : "Int8";
    case "FLOAT":             return "Float32";
    case "DOUBLE": case "DOUBLE PRECISION": return "Float64";
    case "DECIMAL": case "NUMERIC":
      return size ? `Decimal(${size})` : "Decimal(18, 4)";
    case "VARCHAR": case "NVARCHAR": return "String";
    case "CHAR": case "NCHAR":
      return size ? `FixedString(${size})` : "String";
    case "TEXT": case "TINYTEXT": case "MEDIUMTEXT": case "LONGTEXT":
      return "String";
    case "BLOB": case "TINYBLOB": case "MEDIUMBLOB": case "LONGBLOB":
      return "String";
    case "DATE":              return "Date";
    case "TIME":              return "String";
    case "DATETIME": case "TIMESTAMP": return "DateTime";
    case "BOOLEAN": case "BOOL": return "UInt8";
    case "JSON":              return "String";
    case "ENUM": case "SET":
      return size ? `Enum8(${size})` : "String";
    default:                  return raw;
  }
}

// ── Identifier quoting ─────────────────────────────────────────────────────────

function q(name: string, dialect: Dialect): string {
  if (dialect === "oracle") return `"${name}"`;
  return `\`${name}\``;
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Per-dialect emitters ───────────────────────────────────────────────────────

function emitMariaDB(tables: EmitTable[], schemaName: string): string {
  const lines: string[] = [
    `-- Schema: ${schemaName}`,
    `-- Dialect: MariaDB / MySQL`,
    `-- Generated: ${new Date().toISOString()}`,
    "",
  ];

  for (const table of tables) {
    lines.push(`CREATE TABLE \`${table.name}\` (`);
    const cols: string[] = [];
    const sorted = [...table.fields].sort((a, b) => a.position - b.position);

    for (const f of sorted) {
      let col = `  \`${f.name}\` ${f.dataType}`;
      if (!f.nullable) col += " NOT NULL";
      if (f.isAutoIncrement) col += " AUTO_INCREMENT";
      if (f.defaultValue !== null && !f.isAutoIncrement) col += ` DEFAULT '${esc(f.defaultValue)}'`;
      if (f.comment) col += ` COMMENT '${esc(f.comment)}'`;
      cols.push(col);
    }

    const pks = sorted.filter(f => f.isPrimaryKey).map(f => `\`${f.name}\``);
    if (pks.length) cols.push(`  PRIMARY KEY (${pks.join(", ")})`);

    const uniques = sorted.filter(f => f.isUnique && !f.isPrimaryKey);
    for (const u of uniques)
      cols.push(`  UNIQUE KEY \`uk_${table.name}_${u.name}\` (\`${u.name}\`)`);

    lines.push(cols.join(",\n"));
    const tableOpts = `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
    const tableComment = table.comment ? ` COMMENT='${esc(table.comment)}'` : "";
    lines.push(`) ${tableOpts}${tableComment};`);
    lines.push("");
  }

  return lines.join("\n");
}

function emitOracle(tables: EmitTable[], schemaName: string): string {
  const lines: string[] = [
    `-- Schema: ${schemaName}`,
    `-- Dialect: Oracle`,
    `-- Generated: ${new Date().toISOString()}`,
    "",
  ];

  for (const table of tables) {
    const sorted = [...table.fields].sort((a, b) => a.position - b.position);
    lines.push(`CREATE TABLE "${table.name}" (`);
    const cols: string[] = [];

    for (const f of sorted) {
      const oraType = mapTypeOracle(f.dataType);
      let col = `  "${f.name}" ${oraType}`;
      if (f.isPrimaryKey && f.isAutoIncrement) {
        col += " GENERATED ALWAYS AS IDENTITY";
      }
      if (!f.nullable && !f.isPrimaryKey) col += " NOT NULL";
      if (f.defaultValue !== null && !f.isAutoIncrement) {
        col += ` DEFAULT '${esc(f.defaultValue)}'`;
      }
      cols.push(col);
    }

    const pks = sorted.filter(f => f.isPrimaryKey).map(f => `"${f.name}"`);
    if (pks.length) cols.push(`  CONSTRAINT pk_${table.name} PRIMARY KEY (${pks.join(", ")})`);

    const uniques = sorted.filter(f => f.isUnique && !f.isPrimaryKey);
    for (const u of uniques)
      cols.push(`  CONSTRAINT uk_${table.name}_${u.name} UNIQUE ("${u.name}")`);

    lines.push(cols.join(",\n"));
    lines.push(");");

    // Oracle COMMENT ON statements
    if (table.comment) {
      lines.push(`COMMENT ON TABLE "${table.name}" IS '${esc(table.comment)}';`);
    }
    for (const f of sorted) {
      if (f.comment) {
        lines.push(`COMMENT ON COLUMN "${table.name}"."${f.name}" IS '${esc(f.comment)}';`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function emitClickHouse(tables: EmitTable[], schemaName: string): string {
  const lines: string[] = [
    `-- Schema: ${schemaName}`,
    `-- Dialect: ClickHouse`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Note: Adjust ENGINE, ORDER BY, and PARTITION BY to fit your use case`,
    "",
  ];

  for (const table of tables) {
    const sorted = [...table.fields].sort((a, b) => a.position - b.position);
    lines.push(`CREATE TABLE \`${table.name}\` (`);
    const cols: string[] = [];

    for (const f of sorted) {
      let chType = mapTypeClickHouse(f.dataType);
      if (f.isPrimaryKey) {
        // PK columns: use UInt64 for auto-increment IDs in ClickHouse
        if (f.isAutoIncrement) chType = "UInt64";
      } else if (f.nullable) {
        chType = `Nullable(${chType})`;
      }

      let col = `  \`${f.name}\` ${chType}`;
      if (f.defaultValue !== null && !f.isAutoIncrement) {
        col += ` DEFAULT '${esc(f.defaultValue)}'`;
      }
      if (f.comment) col += ` COMMENT '${esc(f.comment)}'`;
      cols.push(col);
    }

    lines.push(cols.join(",\n"));

    const pkCols = sorted.filter(f => f.isPrimaryKey).map(f => `\`${f.name}\``);
    const orderBy = pkCols.length ? pkCols.join(", ") : "tuple()";
    const tableComment = table.comment ? ` COMMENT '${esc(table.comment)}'` : "";

    lines.push(`) ENGINE = MergeTree()`);
    lines.push(`ORDER BY (${orderBy})${tableComment};`);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function emitDDL(tables: EmitTable[], dialect: Dialect, schemaName: string): string {
  switch (dialect) {
    case "oracle":     return emitOracle(tables, schemaName);
    case "clickhouse": return emitClickHouse(tables, schemaName);
    default:           return emitMariaDB(tables, schemaName);
  }
}

export const DIALECT_LABELS: Record<Dialect, string> = {
  mariadb:    "MariaDB / MySQL",
  oracle:     "Oracle",
  clickhouse: "ClickHouse",
};
