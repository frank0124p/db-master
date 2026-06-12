export type LineageTransformType = "direct" | "aggregate" | "join" | "derived" | "filter";

export interface LineageEdge {
  id: string;
  fromSchemaId: number;
  fromSchemaName: string;
  fromDomain: string;
  fromTableId: number;
  fromTableName: string;
  toSchemaId: number;
  toSchemaName: string;
  toDomain: string;
  toTableId: number;
  toTableName: string;
  transformType: LineageTransformType;
  description: string;
  createdAt: string;
}

export interface LineageQueryResult {
  question: string;
  relevantEdgeIds: string[];
  relevantTables: Array<{
    schemaId: number; schemaName: string; domain: string;
    tableId: number; tableName: string;
  }>;
  sql: string;
  explanation: string;
  joinPath: string;
}
