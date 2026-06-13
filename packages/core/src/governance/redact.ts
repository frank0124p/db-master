import type { GraphNode } from "../graph/types.js";
import type { Sensitivity } from "../types.js";

export interface RedactPolicy {
  /** When false, redact is a no-op (default: false for internal tools). */
  enabled: boolean;
  /** Sensitivity levels that trigger redaction (default: ['pii']). */
  hideLevels: Sensitivity[];
  /**
   * 'mask-definition' — keep the node but replace its `definition` with
   *    "🔒 [redacted]" (label/ref/kind are preserved for context).
   * 'exclude' — remove nodes whose sensitivity matches hideLevels entirely.
   *    Caller is responsible for pruning dangling edges.
   */
  mode: "mask-definition" | "exclude";
}

/**
 * Apply a RedactPolicy to a list of GraphNodes.
 *
 * - If policy.enabled is false, returns nodes unchanged.
 * - In 'mask-definition' mode: matching nodes have their definition replaced.
 * - In 'exclude' mode: matching nodes are removed from the result.
 *
 * Note: In 'exclude' mode the caller should also filter edges where
 * `edge.from` or `edge.to` refers to a removed node.
 */
export function redactGraphNodes(
  nodes: GraphNode[],
  policy: RedactPolicy,
): GraphNode[] {
  if (!policy.enabled || policy.hideLevels.length === 0) {
    return nodes;
  }

  const hideLevelSet = new Set<Sensitivity>(policy.hideLevels);

  if (policy.mode === "exclude") {
    return nodes.filter(n => {
      const sensitivity = n.meta.sensitivity as Sensitivity | undefined;
      return !sensitivity || !hideLevelSet.has(sensitivity);
    });
  }

  // mask-definition mode
  return nodes.map(n => {
    const sensitivity = n.meta.sensitivity as Sensitivity | undefined;
    if (!sensitivity || !hideLevelSet.has(sensitivity)) {
      return n;
    }
    return {
      ...n,
      meta: {
        ...n.meta,
        definition: "🔒 [redacted]",
      },
    };
  });
}
