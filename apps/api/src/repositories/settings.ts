import * as store from "../db/fileStore.js";
import { z } from "zod";
import type { MinioConfig } from "../services/minio.js";
import type { RedactPolicy } from "@schema-studio/core";

const RedactPolicySchema = z.object({
  enabled: z.boolean(),
  hideLevels: z.array(z.enum(["public", "internal", "confidential", "pii"])),
  mode: z.enum(["mask-definition", "exclude"]),
});

const REDACT_POLICY_FILE = () => store.dataPath("settings", "redact-policy.json");

const DEFAULT_REDACT_POLICY: RedactPolicy = {
  enabled: false,
  hideLevels: ["pii"],
  mode: "mask-definition",
};

const SETTINGS_FILE = () => store.dataPath("settings.json");

export interface LlmSettings {
  provider: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DataHubSettings {
  url: string;
  token: string;
  platform: string;
  env: "PROD" | "DEV" | "STAGING" | "TEST";
}

export type { MinioConfig };

interface Settings {
  llm?: Partial<LlmSettings>;
  datahub?: Partial<DataHubSettings>;
  minio?: Partial<MinioConfig>;
}

export async function getLlmSettings(): Promise<Partial<LlmSettings>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  return settings.llm ?? {};
}

export async function updateLlmSettings(patch: Partial<LlmSettings>): Promise<Partial<LlmSettings>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  settings.llm = { ...settings.llm, ...patch };
  await store.writeJson(SETTINGS_FILE(), settings);
  return settings.llm;
}

export async function getDataHubSettings(): Promise<Partial<DataHubSettings>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  return settings.datahub ?? {};
}

export async function updateDataHubSettings(patch: Partial<DataHubSettings>): Promise<Partial<DataHubSettings>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  settings.datahub = { ...settings.datahub, ...patch };
  await store.writeJson(SETTINGS_FILE(), settings);
  return settings.datahub;
}

export async function getMinioSettings(): Promise<Partial<MinioConfig>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  return settings.minio ?? {};
}

export async function updateMinioSettings(patch: Partial<MinioConfig>): Promise<Partial<MinioConfig>> {
  const settings = (await store.readJson<Settings>(SETTINGS_FILE())) ?? {};
  settings.minio = { ...settings.minio, ...patch };
  await store.writeJson(SETTINGS_FILE(), settings);
  return settings.minio;
}

// ── Redact Policy ──────────────────────────────────────────────────────────────

export async function getRedactPolicy(): Promise<RedactPolicy> {
  const raw = await store.readJson<unknown>(REDACT_POLICY_FILE());
  if (!raw) return DEFAULT_REDACT_POLICY;
  const result = RedactPolicySchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_REDACT_POLICY;
}

export async function updateRedactPolicy(patch: Partial<RedactPolicy>): Promise<RedactPolicy> {
  const current = await getRedactPolicy();
  const updated: RedactPolicy = { ...current, ...patch };
  await store.writeJson(REDACT_POLICY_FILE(), updated);
  return updated;
}
