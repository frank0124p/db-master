import { z } from "zod";

// MariaDB returns BIGINT columns as BigInt — coerce all ids to number
const dbId = z.coerce.number();
const dbBool = z.coerce.boolean();

// ── ProductSuite ──
export const ProductSuiteSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductSuite = z.infer<typeof ProductSuiteSchema>;

// ── Schema ──
export const SchemaRowSchema = z.object({
  id: dbId,
  name: z.string(),
  description: z.string().nullable(),
  domain: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable(),
});
export type SchemaRow = z.infer<typeof SchemaRowSchema>;

// ── Table ──
export const TableRowSchema = z.object({
  id: dbId,
  schema_id: dbId,
  name: z.string(),
  comment: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable(),
});
export type TableRow = z.infer<typeof TableRowSchema>;

// ── Field ──
export const FieldRowSchema = z.object({
  id: dbId,
  table_id: dbId,
  name: z.string(),
  data_type: z.string(),
  nullable: dbBool,
  default_value: z.string().nullable(),
  is_primary_key: dbBool,
  is_unique: dbBool,
  comment: z.string().nullable(),
  position: z.coerce.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type FieldRow = z.infer<typeof FieldRowSchema>;

// ── NamingEntry ──
export const NamingEntryRowSchema = z.object({
  id: dbId,
  concept: z.string(),
  std_name: z.string(),
  aliases: z.union([z.string(), z.array(z.string())]), // JSON col: string or auto-parsed array
  domain: z.string(),
  tags: z.union([z.string(), z.array(z.string())]).default("[]"), // JSON col
  ai_description: z.string().nullable().optional(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type NamingEntryRow = z.infer<typeof NamingEntryRowSchema>;

export interface NamingEntry {
  id: number;
  concept: string;
  stdName: string;
  aliases: string[];
  domain: string;
  tags: string[];
  layers: string[];
  aiDescription: string | null;
  description: string | null;
  updatedAt: string;
}

// ── SchemaLayer ──
export const SCHEMA_LAYERS = ["transaction", "r2u", "unified"] as const;
export type SchemaLayer = typeof SCHEMA_LAYERS[number];

// ── API Input types ──
export const SCHEMA_ENVIRONMENTS = ["DEV", "TEST", "STAGING", "PROD"] as const;
export type SchemaEnvironment = typeof SCHEMA_ENVIRONMENTS[number];

export const TARGET_DBS = ["mariadb", "oracle", "clickhouse"] as const;
export type TargetDb = typeof TARGET_DBS[number];

export const CreateSchemaInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  domain: z.string().default("semiconductor"),
  suiteId: z.number().int().nullable().optional(),
  layerType: z.enum(SCHEMA_LAYERS).nullable().optional(),
  tags: z.array(z.string()).optional(),
  environment: z.enum(SCHEMA_ENVIRONMENTS).nullable().optional(),
  targetDb: z.enum(TARGET_DBS).nullable().optional(),
});
export type CreateSchemaInput = z.infer<typeof CreateSchemaInput>;

export const CreateTableInput = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case"),
  comment: z.string().optional(),
});
export type CreateTableInput = z.infer<typeof CreateTableInput>;

export const CreateFieldInput = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case"),
  data_type: z.string().min(1),
  nullable: z.boolean().default(true),
  default_value: z.string().optional().nullable(),
  is_primary_key: z.boolean().default(false),
  is_unique: z.boolean().default(false),
  comment: z.string().optional().nullable(),
  position: z.number().int().optional(),
  source_table: z.string().max(128).optional().nullable(),
  source_field: z.string().max(128).optional().nullable(),
});
export type CreateFieldInput = z.infer<typeof CreateFieldInput>;

// ── Errors ──
export class NotFoundError extends Error {
  constructor(resource: string, id: number | string) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(public detail: unknown) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}
