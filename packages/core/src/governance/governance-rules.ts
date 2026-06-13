import type {
  WideTableDraft,
  ValidationReport,
  GovernanceContext,
  BusinessRule,
  ConceptCard,
} from "./types.js";

export interface GovRuleResult {
  ruleId: string;
  severity: "error" | "warning" | "info";
  passed: boolean;
  violations: Array<{
    target: string;
    message: string;
    evidence?: string;
    suggestion?: string;
  }>;
}

// ── gov.single_source_of_truth ────────────────────────────────────────────────

export function runSsotRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];
  const ssotDeclarations = ctx.businessRules.filter(
    r => r.status === "approved" && r.machine?.kind === "ssot_declaration",
  );

  for (const col of draft.columns) {
    if (!col.conceptId) continue;

    const ssot = ssotDeclarations.find(
      r => (r.machine as { kind: "ssot_declaration"; conceptId: number }).conceptId === col.conceptId,
    );
    if (!ssot) {
      violations.push({
        target: col.name,
        message: `欄位概念 (conceptId=${col.conceptId}) 尚未宣告 SSOT`,
        suggestion: "在知識庫中為此概念新增 ssot_declaration 類型的業務規則",
      });
      continue;
    }

    const m = ssot.machine as {
      kind: "ssot_declaration";
      conceptId: number;
      ssotTable: { schemaId: number; tableName: string };
    };
    if (col.source.tableName !== m.ssotTable.tableName) {
      violations.push({
        target: col.name,
        message: `欄位來源 (${col.source.tableName}) 不是宣告的 SSOT (${m.ssotTable.tableName})`,
        evidence: `BusinessRule: "${ssot.title}" — ${ssot.statement}`,
        suggestion: `請將此欄的 source 改為 ${m.ssotTable.tableName}`,
      });
    }
  }

  return {
    ruleId: "gov.single_source_of_truth",
    severity: "error",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.lineage_complete ──────────────────────────────────────────────────────

export function runLineageRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  const tableFieldIndex = new Map<string, Set<string>>();
  for (const { table, schemaId } of ctx.allTables) {
    const key = `${schemaId}.${table.name}`;
    tableFieldIndex.set(key, new Set((table.fields ?? []).map(f => f.name)));
    tableFieldIndex.set(table.name, new Set((table.fields ?? []).map(f => f.name)));
  }

  for (const col of draft.columns) {
    if (!col.source?.tableName || !col.source?.fieldName) {
      violations.push({
        target: col.name,
        message: "欄位缺少 lineage (source.tableName 或 source.fieldName 為空)",
        suggestion: "為此欄填寫完整的 source 資訊",
      });
      continue;
    }

    const tableKey = `${col.source.schemaId}.${col.source.tableName}`;
    const fieldSet =
      tableFieldIndex.get(tableKey) ?? tableFieldIndex.get(col.source.tableName);
    if (!fieldSet) {
      violations.push({
        target: col.name,
        message: `來源表 ${col.source.tableName} 在系統中找不到`,
        suggestion: "請確認來源表已匯入系統",
      });
    } else if (!fieldSet.has(col.source.fieldName)) {
      violations.push({
        target: col.name,
        message: `來源欄位 ${col.source.tableName}.${col.source.fieldName} 在系統中找不到`,
        suggestion: "請確認欄位名稱正確",
      });
    }
  }

  return {
    ruleId: "gov.lineage_complete",
    severity: "error",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.block_hierarchy ───────────────────────────────────────────────────────

export function runBlockHierarchyRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  if (draft.blockKind !== "medium") {
    return { ruleId: "gov.block_hierarchy", severity: "error", passed: true, violations };
  }

  // Medium block cannot reference governed wide tables that are themselves medium blocks
  const mediumGoverned = new Set(
    ctx.governedWideTables
      .filter(g => g.blockKind === "medium")
      .map(g => g.name),
  );

  for (const join of draft.joinGraph) {
    if (mediumGoverned.has(join.leftRef) || mediumGoverned.has(join.rightRef)) {
      violations.push({
        target: `JOIN ${join.leftRef} ↔ ${join.rightRef}`,
        message: "中積木(medium block)不可引用其他中積木",
        suggestion: "請改用小積木(small block)或原始資料表作為 JOIN 來源",
      });
    }
  }

  return {
    ruleId: "gov.block_hierarchy",
    severity: "error",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.join_key_validity ─────────────────────────────────────────────────────

export function runJoinKeyRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  const fieldIndex = new Map<string, { dataType: string; isPrimaryKey: boolean; isUnique: boolean }>();
  for (const { table } of ctx.allTables) {
    for (const f of table.fields ?? []) {
      fieldIndex.set(`${table.name}.${f.name}`, f);
    }
  }

  for (const join of draft.joinGraph) {
    for (const on of join.on) {
      const leftField = fieldIndex.get(`${join.leftRef.split(".").pop()}.${on.leftField}`);
      const rightField = fieldIndex.get(`${join.rightRef.split(".").pop()}.${on.rightField}`);

      const leftHasPkUq = leftField ? (leftField.isPrimaryKey || leftField.isUnique) : false;
      const rightHasPkUq = rightField ? (rightField.isPrimaryKey || rightField.isUnique) : false;

      if (!leftHasPkUq && !rightHasPkUq) {
        violations.push({
          target: `JOIN ${join.leftRef}.${on.leftField} = ${join.rightRef}.${on.rightField}`,
          message: "JOIN 鍵兩端均非 PK/UNIQUE，可能造成笛卡兒積",
          suggestion: "請確認至少一端為 PK 或 UNIQUE 欄位",
        });
      }
    }
  }

  return {
    ruleId: "gov.join_key_validity",
    severity: "warning",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.naming_dict_coverage ──────────────────────────────────────────────────

export function runNamingCoverageRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
  threshold = 0.8,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  if (draft.columns.length === 0) {
    return { ruleId: "gov.naming_dict_coverage", severity: "warning", passed: true, violations };
  }

  const dictNames = new Set(
    ctx.namingDict.flatMap(d => [d.stdName, ...d.aliases]),
  );

  const uncovered: string[] = [];
  for (const col of draft.columns) {
    if (!dictNames.has(col.name) && !col.namingDictId) {
      uncovered.push(col.name);
    }
  }

  const coverage = 1 - uncovered.length / draft.columns.length;

  if (coverage < threshold) {
    violations.push({
      target: uncovered.join(", "),
      message: `欄位命名字典覆蓋率 ${(coverage * 100).toFixed(0)}% 低於門檻 ${(threshold * 100).toFixed(0)}%`,
      evidence: `未覆蓋欄位: ${uncovered.join(", ")}`,
      suggestion: "請為未覆蓋欄位在命名字典中新增對應詞條",
    });
  }

  return {
    ruleId: "gov.naming_dict_coverage",
    severity: "warning",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.definition_required ───────────────────────────────────────────────────

export function runDefinitionRule(
  draft: WideTableDraft,
  minLength = 10,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  for (const col of draft.columns) {
    if (!col.definition || col.definition.trim().length < minLength) {
      violations.push({
        target: col.name,
        message: `欄位缺少業務定義(至少 ${minLength} 字)`,
        suggestion: "請填寫完整的業務定義",
      });
    }
  }

  return {
    ruleId: "gov.definition_required",
    severity: "error",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.no_duplicate_semantics ────────────────────────────────────────────────

export function runDuplicateSemanticsRule(
  draft: WideTableDraft,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  // Detect columns with same conceptId + same source table.field
  const seen = new Map<string, string>();
  for (const col of draft.columns) {
    if (!col.conceptId) continue;
    const key = `${col.conceptId}:${col.source.tableName}.${col.source.fieldName}`;
    if (seen.has(key)) {
      violations.push({
        target: `${seen.get(key)} & ${col.name}`,
        message: "兩個欄位對應相同概念及來源欄位，疑似重複",
        suggestion: "請移除其中一個重複欄位",
      });
    } else {
      seen.set(key, col.name);
    }
  }

  return {
    ruleId: "gov.no_duplicate_semantics",
    severity: "warning",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.owner_required ────────────────────────────────────────────────────────

/**
 * Governed wide table (or draft being published) must have an ownerUserId set.
 * This rule checks the draft for the ownerUserId field added in Phase 10.
 */
export function runOwnerRequiredRule(
  draft: WideTableDraft,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  if (!draft.ownerUserId) {
    violations.push({
      target: draft.name,
      message: "寬表尚未指定 Data Owner (ownerUserId)",
      suggestion: "請在元資料中設定 ownerUserId，指定對業務定義負責的使用者",
    });
  }

  return {
    ruleId: "gov.owner_required",
    severity: "warning",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.sensitivity_declared ──────────────────────────────────────────────────

/** Default PII-indicator field name patterns */
const DEFAULT_PII_PATTERNS = [
  /.*_name$/i,
  /.*_phone$/i,
  /.*_email$/i,
  /.*_id_no$/i,
];

export function runSensitivityDeclaredRule(
  draft: WideTableDraft,
  opts: { patterns?: RegExp[] } = {},
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];
  const patterns = opts.patterns ?? DEFAULT_PII_PATTERNS;

  for (const col of draft.columns) {
    const looksLikePii = patterns.some(p => p.test(col.name));
    if (looksLikePii && !col.sensitivity) {
      violations.push({
        target: col.name,
        message: `欄位 "${col.name}" 名稱命中 PII 特徵但未標記 sensitivity`,
        suggestion: "請為此欄設定 sensitivity（建議 'pii' 或 'confidential'）",
      });
    }
  }

  return {
    ruleId: "gov.sensitivity_declared",
    severity: "info",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.no_deprecated_source ──────────────────────────────────────────────────

/**
 * Governed wide table columns must not reference deprecated source tables.
 * Uses GovernanceContext.allTables[].table.deprecated for lookup.
 */
export function runNoDeprecatedSourceRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  // Build deprecated table lookup: schemaId.tableName → true
  const deprecatedTables = new Set<string>();
  for (const { schemaId, table } of ctx.allTables) {
    if (table.deprecated) {
      deprecatedTables.add(`${schemaId}.${table.name}`);
      deprecatedTables.add(table.name); // also by name only for loose lookup
    }
  }

  for (const col of draft.columns) {
    const keyFull = `${col.source.schemaId}.${col.source.tableName}`;
    const keyName = col.source.tableName;
    if (deprecatedTables.has(keyFull) || deprecatedTables.has(keyName)) {
      violations.push({
        target: col.name,
        message: `欄位來源 ${col.source.tableName} 已被標記為 deprecated`,
        evidence: `source: ${col.source.tableName}.${col.source.fieldName}`,
        suggestion: "請將此欄的來源改為非 deprecated 的替代表",
      });
    }
  }

  return {
    ruleId: "gov.no_deprecated_source",
    severity: "error",
    passed: violations.length === 0,
    violations,
  };
}

// ── gov.freshness_declared ────────────────────────────────────────────────────

/**
 * Governed wide table source tables should have refreshCycle declared.
 * Coverage = (source tables with refreshCycle) / (total distinct source tables).
 * threshold defaults to 0.5.
 */
export function runFreshnessDeclaredRule(
  draft: WideTableDraft,
  ctx: GovernanceContext,
  threshold = 0.5,
): GovRuleResult {
  const violations: GovRuleResult["violations"] = [];

  // Collect distinct source tables used in this draft
  const sourceTables = new Set<string>();
  for (const col of draft.columns) {
    if (col.source.tableName) {
      sourceTables.add(`${col.source.schemaId ?? 0}.${col.source.tableName}`);
    }
  }

  if (sourceTables.size === 0) {
    return {
      ruleId: "gov.freshness_declared",
      severity: "info",
      passed: true,
      violations,
    };
  }

  // Build refreshCycle lookup
  const tablesWithFreshness = new Set<string>();
  for (const { schemaId, table } of ctx.allTables) {
    if (table.refreshCycle) {
      tablesWithFreshness.add(`${schemaId}.${table.name}`);
      tablesWithFreshness.add(`0.${table.name}`); // also loose match
    }
  }

  let covered = 0;
  const missing: string[] = [];
  for (const key of sourceTables) {
    if (tablesWithFreshness.has(key)) {
      covered++;
    } else {
      // Extract table name from key for display
      missing.push(key.split(".").slice(1).join("."));
    }
  }

  const coverage = covered / sourceTables.size;

  if (coverage < threshold) {
    violations.push({
      target: missing.join(", "),
      message: `來源表 refreshCycle 宣告覆蓋率 ${(coverage * 100).toFixed(0)}% 低於門檻 ${(threshold * 100).toFixed(0)}%`,
      evidence: `未宣告 refreshCycle 的來源表: ${missing.join(", ")}`,
      suggestion: "請為來源表設定 refreshCycle（如 daily/hourly）以說明資料新鮮度",
    });
  }

  return {
    ruleId: "gov.freshness_declared",
    severity: "info",
    passed: violations.length === 0,
    violations,
  };
}

// ── Run all governance rules ──────────────────────────────────────────────────

export function runGovernanceRules(
  draft: WideTableDraft,
  ctx: GovernanceContext,
): ValidationReport["ruleResults"] {
  const results: GovRuleResult[] = [
    runSsotRule(draft, ctx),
    runLineageRule(draft, ctx),
    runBlockHierarchyRule(draft, ctx),
    runJoinKeyRule(draft, ctx),
    runNamingCoverageRule(draft, ctx),
    runDefinitionRule(draft),
    runDuplicateSemanticsRule(draft),
    runOwnerRequiredRule(draft),
    runSensitivityDeclaredRule(draft),
    runNoDeprecatedSourceRule(draft, ctx),
    runFreshnessDeclaredRule(draft, ctx),
  ];

  // Apply overrides (severity adjustments / disable)
  return results.map(r => {
    const override = (ctx.ruleOverrides as Record<string, { severity?: string; disabled?: boolean }>)[r.ruleId];
    if (override?.disabled) {
      return { ...r, passed: true, violations: [], _disabled: true };
    }
    if (override?.severity) {
      return { ...r, severity: override.severity as "error" | "warning" | "info" };
    }
    return r;
  });
}

// Re-export types used externally
export type { WideTableDraft, GovernanceContext, BusinessRule, ConceptCard };
