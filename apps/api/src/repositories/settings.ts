import * as store from "../db/fileStore.js";

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

interface Settings {
  llm?: Partial<LlmSettings>;
  datahub?: Partial<DataHubSettings>;
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
