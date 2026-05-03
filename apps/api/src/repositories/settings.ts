import * as store from "../db/fileStore.js";

const SETTINGS_FILE = () => store.dataPath("settings.json");

export interface LlmSettings {
  provider: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface Settings {
  llm?: Partial<LlmSettings>;
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
