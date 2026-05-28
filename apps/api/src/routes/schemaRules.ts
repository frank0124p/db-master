import type { RuleDefinition, RuleLayer } from "@schema-studio/core";
import type { SchemaWithTables } from "../repositories/schemas.js";

export function resolveSchemaRuleIds(
  schema: Pick<SchemaWithTables, "selectedRuleIds" | "layerType">,
  allRules: RuleDefinition[],
): Set<string> {
  if (schema.selectedRuleIds !== null) {
    return new Set(schema.selectedRuleIds);
  }
  // compute default: rules where layers includes "general" OR schema's layerType
  return new Set(
    allRules
      .filter(r => {
        const layers = r.layers ?? (["general"] as RuleLayer[]);
        return layers.includes("general") || (schema.layerType !== null && layers.includes(schema.layerType as RuleLayer));
      })
      .map(r => r.id)
  );
}
