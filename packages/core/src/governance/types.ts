// ── Step 1 — Knowledge Base ──────────────────────────────────────────────────

export interface SourceDoc {
  id: number;
  slug: string;
  title: string;
  format: "markdown" | "text";
  content: string;
  chunks: Array<{ idx: number; text: string }>;
  uploadedBy: string;
  createdAt: string;
}

export interface ConceptCard {
  id: number;
  slug: string;
  name: string;
  stdName: string;
  definition: string;
  aliases: string[];
  domain?: string;
  relatedConcepts: number[];
  tableHints: Array<{
    schemaId?: number;
    tableName: string;
    role: "ssot" | "replica" | "reference";
    note?: string;
  }>;
  namingDictIds: number[];
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;
  status: "pending" | "approved" | "rejected";
  reviewers: Array<{ userId: number; name: string; signedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessRule {
  id: number;
  slug: string;
  title: string;
  ruleType: "ssot" | "constraint" | "relationship" | "process";
  statement: string;
  machine?:
    | {
        kind: "ssot_declaration";
        conceptId: number;
        ssotTable: { schemaId: number; tableName: string };
      }
    | {
        kind: "field_constraint";
        fieldPattern: string;
        requirement: string;
      };
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;
  status: "pending" | "approved" | "rejected";
  reviewers: Array<{ userId: number; name: string; signedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

// ── Step 2 — Import & Classification ─────────────────────────────────────────

export interface ImportBatch {
  id: number;
  name: string;
  source: "ddl-files" | "ui-upload" | "paste";
  schemaIds: number[];
  tableCount: number;
  status: "imported" | "classifying" | "classified" | "review-done";
  proposals: ClassificationProposal[];
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationProposal {
  tableId: number;
  schemaId: number;
  tableName: string;
  suggested: {
    suiteId?: number;
    domain?: string;
    layerType?: string;
  };
  confidence: number;
  rationale: {
    matchedConcepts: number[];
    matchedDictEntries: number[];
    similarTables: Array<{
      schemaId: number;
      tableName: string;
      score: number;
      reason: string;
    }>;
    summary: string;
  };
  status: "pending" | "accepted" | "overridden" | "rejected";
  override?: {
    suiteId?: number;
    domain?: string;
    layerType?: string;
    by: string;
    at: string;
  };
}

// ── Step 3 — Wide Table Proposals ────────────────────────────────────────────

export type BlockKind = "small" | "medium";

export interface ProposedColumn {
  name: string;
  dataType: string;
  definition: string;
  source: { schemaId: number; tableName: string; fieldName: string };
  namingDictId?: number;
  conceptId?: number;
  transform?: string;
}

export interface ProposedJoin {
  leftRef: string;
  rightRef: string;
  type: "inner" | "left";
  on: Array<{ leftField: string; rightField: string }>;
}

export interface WideTableProposal {
  id: number;
  scenario: string;
  blockKind: BlockKind;
  name: string;
  description: string;
  columns: ProposedColumn[];
  joinGraph: ProposedJoin[];
  relationships: Array<{
    targetKind: "table" | "wide-table" | "governed-wide-table";
    targetRef: string;
    relation: "shares_key" | "upstream_of" | "subset_of" | "joins_with";
    onFields: string[];
    note: string;
  }>;
  reasoningTrace: Array<{
    step: string;
    detail: string;
    refs?: {
      conceptIds?: number[];
      dictIds?: number[];
      tableRefs?: string[];
    };
  }>;
  candidatePool: Array<{
    schemaId: number;
    tableName: string;
    fromBatchId?: number;
  }>;
  status: "proposed" | "drafted" | "discarded";
  createdAt: string;
}

// ── Step 4 — Workspace Draft ─────────────────────────────────────────────────

export interface WideTableDraft {
  id: number;
  proposalId?: number;
  blockKind: BlockKind;
  name: string;
  description: string;
  columns: ProposedColumn[];
  joinGraph: ProposedJoin[];
  relationships: WideTableProposal["relationships"];
  editLog: Array<{
    at: string;
    by: string;
    action:
      | "add-column"
      | "remove-column"
      | "edit-column"
      | "edit-join"
      | "edit-meta";
    detail: string;
  }>;
  versions: Array<{ v: number; savedAt: string; snapshot: unknown }>;
  lastReportId?: number;
  status: "draft" | "validating" | "failed" | "passed" | "published";
  createdAt: string;
  updatedAt: string;
}

// ── Step 5 — Validation & Catalog ────────────────────────────────────────────

export interface ValidationReport {
  id: number;
  draftId: number;
  ranAt: string;
  ruleResults: Array<{
    ruleId: string;
    severity: "error" | "warning" | "info";
    passed: boolean;
    violations: Array<{
      target: string;
      message: string;
      evidence?: string;
      suggestion?: string;
    }>;
  }>;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    passed: boolean;
  };
}

export interface GovernedWideTable {
  id: number;
  slug: string;
  draftId: number;
  reportId: number;
  blockKind: BlockKind;
  name: string;
  description: string;
  columns: ProposedColumn[];
  joinGraph: ProposedJoin[];
  relationships: WideTableProposal["relationships"];
  publishedBy: string;
  publishedAt: string;
  version: number;
}

export interface CatalogGraph {
  generatedAt: string;
  nodes: Array<{
    id: string;
    kind: "governed-wide-table" | "table" | "field" | "concept";
    label: string;
    meta: Record<string, unknown>;
  }>;
  edges: Array<{
    from: string;
    to: string;
    kind:
      | "composed_from"
      | "joins_on"
      | "maps_to_concept"
      | "related_to"
      | "has_field";
    meta?: Record<string, unknown>;
  }>;
}

// ── Governance Context (for rule engine) ─────────────────────────────────────

export interface GovernanceContext {
  allTables: Array<{
    schemaId: number;
    schemaSlug: string;
    table: { name: string; fields?: Array<{ name: string; dataType: string; isPrimaryKey: boolean; isUnique: boolean }> };
  }>;
  concepts: ConceptCard[];
  businessRules: BusinessRule[];
  namingDict: Array<{ id: number; stdName: string; aliases: string[] }>;
  governedWideTables: GovernedWideTable[];
  ruleOverrides: Record<string, unknown>;
}

// ── Workflow Instance ─────────────────────────────────────────────────────────

export type StationId =
  | "knowledge"
  | "classify"
  | "compose"
  | "review"
  | "validate";

export type StationStatus =
  | "not-started"
  | "in-progress"
  | "done"
  | "bypassed"
  | "blocked";

export interface StationState {
  station: StationId;
  status: StationStatus;
  enteredAt?: string;
  completedAt?: string;
  manualComplete?: { by: string; at: string; reason: string };
  bypass?: { by: string; at: string; reason: string };
  gate: {
    required: boolean;
    source: "policy" | "override";
  };
  exitCheck?: {
    met: boolean;
    detail: string;
    checkedAt: string;
  };
}

export interface GovernanceInstance {
  id: number;
  slug: string;
  subjectName: string;
  description?: string;
  owner: { userId: number; name: string };
  suiteId?: number;
  routeTemplate: "default-5";
  stations: StationState[];
  currentStation: StationId | "completed";
  artifacts: {
    sourceDocIds: number[];
    conceptIds: number[];
    businessRuleIds: number[];
    importBatchIds: number[];
    wtProposalIds: number[];
    draftIds: number[];
    reportIds: number[];
    governedIds: number[];
  };
  status: "active" | "on-hold" | "completed" | "cancelled";
  holdReason?: string;
  events: Array<{
    at: string;
    by: string;
    type: string;
    detail: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface GatePolicy {
  stations: Record<
    StationId,
    {
      required: boolean;
      note?: string;
    }
  >;
  bypassRoles: Array<"admin" | "suite_owner" | "maintainer">;
  manualCompleteRoles: Array<"admin" | "suite_owner">;
}
