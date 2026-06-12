export const version = "0.1.0";

export * from "./types.js";
export * from "./roles.js";
export * from "./naming/levenshtein.js";
export * from "./naming/matcher.js";
export * from "./rules/engine.js";
export * from "./rules/built-in.js";
export * from "./rules/validation.js";
export * from "./governance/types.js";
export * from "./governance/classifier-features.js";
export * from "./governance/governance-rules.js";
export { recomputeStations, type RecomputeArtifacts } from "./governance/instance-engine.js";
export * from "./lineage.js";
