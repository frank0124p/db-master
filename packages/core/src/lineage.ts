export type LineageTransformType = "direct" | "aggregate" | "join" | "derived" | "filter";
export type LineageNodeKind = "table" | "wide-table" | "governed";
export type LineageSource = "manual" | "wide-table" | "governance" | "field";

export interface LineageEdge {
  id: string;
  fromSchemaId: number;
  fromSchemaName: string;
  fromDomain: string;
  fromTableId: number;
  fromTableName: string;
  fromKind: LineageNodeKind;
  toSchemaId: number;
  toSchemaName: string;
  toDomain: string;
  toTableId: number;
  toTableName: string;
  toKind: LineageNodeKind;
  transformType: LineageTransformType;
  description: string;
  source: LineageSource;
  createdAt: string;
}

export interface LineageQueryResult {
  question: string;
  relevantEdgeIds: string[];
  relevantTables: Array<{
    schemaId: number; schemaName: string; domain: string;
    tableId: number; tableName: string; kind: LineageNodeKind;
  }>;
  sql: string;
  explanation: string;
  joinPath: string;
}

export interface LineageThinkingStep {
  step: string;
  text: string;
}
