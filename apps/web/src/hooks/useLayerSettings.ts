import { useQuery } from "@tanstack/react-query";
import { api, type LayerDef } from "../api.js";

// Fixed color palette assigned by index position
const LAYER_COLORS = [
  { color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  { color: "#34d399", bg: "rgba(52,211,153,0.15)"  },
  { color: "#60a5fa", bg: "rgba(96,165,250,0.15)"  },
  { color: "#f59e0b", bg: "rgba(245,158,11,0.15)"  },
  { color: "#f472b6", bg: "rgba(244,114,182,0.15)" },
];

export const GENERAL_LAYER: LayerDef & { color: string; bg: string } = {
  id: "general", label: "通用",
  color: "var(--text-3)", bg: "rgba(100,100,100,0.1)",
};

export function layerColor(idx: number) {
  return LAYER_COLORS[idx % LAYER_COLORS.length] ?? LAYER_COLORS[0]!;
}

export function useLayerSettings() {
  const { data } = useQuery({
    queryKey: ["layer-settings"],
    queryFn: () => api.settings.getLayers(),
    staleTime: 60_000,
  });

  const schemaLayers: (LayerDef & { color: string; bg: string })[] =
    (data?.schemaLayers ?? [{ id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }])
      .map((l, i) => ({ ...l, ...layerColor(i) }));

  const dictLayers: (LayerDef & { color: string; bg: string })[] =
    (data?.dictLayers ?? [{ id: "general", label: "General" }, { id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }])
      .map((l, i) => (l.id === "general" ? { ...l, ...GENERAL_LAYER } : { ...l, ...layerColor(i) }));

  return { schemaLayers, dictLayers };
}
