import * as store from "../db/fileStore.js";

const LAYER_SETTINGS_FILE = () => store.dataPath("settings", "layers.json");

export interface LayerDef {
  id: string;
  label: string;
}

export interface LayerSettings {
  schemaLayers: LayerDef[];
  dictLayers: LayerDef[];
}

const DEFAULT_SCHEMA_LAYERS: LayerDef[] = [
  { id: "transaction", label: "Transaction" },
  { id: "r2u",         label: "R2U" },
  { id: "unified",     label: "Unified" },
];

const DEFAULT_DICT_LAYERS: LayerDef[] = [
  { id: "transaction", label: "Transaction" },
  { id: "r2u",         label: "R2U" },
  { id: "unified",     label: "Unified" },
  { id: "general",     label: "General" },
];

export async function getLayerSettings(): Promise<LayerSettings> {
  const raw = await store.readJson<Partial<LayerSettings>>(LAYER_SETTINGS_FILE());
  return {
    schemaLayers: raw?.schemaLayers ?? DEFAULT_SCHEMA_LAYERS,
    dictLayers:   raw?.dictLayers   ?? DEFAULT_DICT_LAYERS,
  };
}

export async function updateLayerSettings(patch: Partial<LayerSettings>): Promise<LayerSettings> {
  const current = await getLayerSettings();
  const updated: LayerSettings = {
    schemaLayers: patch.schemaLayers ?? current.schemaLayers,
    dictLayers:   patch.dictLayers   ?? current.dictLayers,
  };
  await store.writeJson(LAYER_SETTINGS_FILE(), updated);
  return updated;
}
