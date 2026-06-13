/**
 * FK Inference — shared between frontend (ErDiagramPage) and graph builder.
 *
 * Identifies foreign-key relationships by naming convention:
 *   - "{table}_id" pattern where stem maps to an existing table name
 *   - Abbreviation expansions (equip → equipment(s), dept → department(s), etc.)
 *   - Hierarchy prefix stripping (parent_X_id, root_X_id, ...)
 */

export interface FkInferenceInput {
  name: string;
  fields: Array<{ name: string; isPrimaryKey: boolean }>;
}

export interface InferredFkEdge {
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
}

/** Abbreviation expansion map: abbreviated stem → possible expansions */
const ABBREVIATIONS: Record<string, string[]> = {
  equip: ["equipment", "equipments"],
  dept: ["department", "departments"],
  proc: ["process", "processes"],
  cfg: ["config", "configs", "configuration", "configurations"],
  usr: ["user", "users"],
  grp: ["group", "groups"],
  org: ["organization", "organizations"],
  prod: ["product", "products"],
  cat: ["category", "categories"],
  mfg: ["manufacturing"],
  wip: ["wip"],
  fab: ["fab"],
};

/**
 * Check if a table name matches a stem (direct, plural, abbreviated, hierarchy-prefixed).
 */
function stemMatches(tableName: string, stem: string): boolean {
  const n = tableName.toLowerCase();
  const s = stem.toLowerCase();

  // Direct / plural
  if (n === s || n === `${s}s` || n === `${s}es`) return true;
  if (n.endsWith(`_${s}s`) || n.endsWith(`_${s}es`)) return true;
  const irregularPlural = s.replace(/y$/, "ies");
  if (n === irregularPlural || n.endsWith(`_${irregularPlural}`)) return true;
  // Prefix match (handles compound names)
  if (n.startsWith(s) && n.length - s.length <= 6) return true;

  // Abbreviation expansions
  const expansions = ABBREVIATIONS[s];
  if (expansions) {
    for (const exp of expansions) {
      if (n === exp || n === `${exp}s` || n.endsWith(`_${exp}`) || n.endsWith(`_${exp}s`)) return true;
    }
  }

  return false;
}

/**
 * Infer FK edges from a list of tables using naming conventions.
 * Pure function — no I/O.
 *
 * @param tables - Array of tables with their field names
 * @returns Array of inferred FK edges
 */
export function inferFkEdges(
  tables: FkInferenceInput[],
): InferredFkEdge[] {
  const edges: InferredFkEdge[] = [];
  const tableNames = new Set(tables.map(t => t.name));

  for (const table of tables) {
    for (const field of table.fields) {
      if (!field.name.endsWith("_id") || field.isPrimaryKey) continue;

      const stem = field.name.slice(0, -3);

      // Try direct stem match (non-self first)
      let ref = tables.find(t => t.name !== table.name && stemMatches(t.name, stem));

      // If not found, try stripping hierarchy prefixes
      if (!ref) {
        const hierarchyPrefixRe = /^(parent|child|root|prev|next|master|sub)_/;
        const unprefixed = stem.replace(hierarchyPrefixRe, "");
        if (unprefixed !== stem) {
          if (unprefixed === "") {
            // parent_id → self-referential
            ref = tables.find(t => t.name === table.name);
          } else {
            ref = tables.find(t => stemMatches(t.name, unprefixed));
          }
        }
      }

      if (ref && tableNames.has(ref.name)) {
        edges.push({
          fromTable: table.name,
          fromField: field.name,
          toTable: ref.name,
          toField: "id",
        });
      }
    }
  }

  return edges;
}
