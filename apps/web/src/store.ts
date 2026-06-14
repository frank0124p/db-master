import { create } from "zustand";

export type Page   = "editor" | "dict" | "versions" | "analysis" | "er" | "wide" | "rules" | "datahub"
  | "knowledge" | "import-classify" | "compose" | "workspace" | "catalog" | "instances" | "lineage" | "lineage-graph"
  | "ask";
export type Theme  = "dark" | "light";
export type Locale = "zh" | "en";

interface AppStore {
  page: Page;
  selectedSchemaId: number | null;
  selectedTableId: number | null;
  toastMsg: string | null;
  theme: Theme;
  locale: Locale;
  activeSuiteId: number | null;
  suitePicked: boolean;
  knowledgeDomain: string | null;
  knowledgeDomainPicked: boolean;
  activeInstanceId: number | null;
  setPage: (p: Page) => void;
  setSelectedSchemaId: (id: number | null) => void;
  setSelectedTableId: (id: number | null) => void;
  showToast: (msg: string) => void;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  setActiveSuiteId: (id: number | null) => void;
  setSuitePicked: (picked: boolean) => void;
  setKnowledgeDomain: (domain: string | null, picked: boolean) => void;
  setActiveInstanceId: (id: number | null) => void;
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("schema-studio-theme", t);
}

const savedTheme  = (localStorage.getItem("schema-studio-theme")  as Theme  | null) ?? "dark";
const savedLocale = (localStorage.getItem("schema-studio-locale") as Locale | null) ?? "zh";
const savedSuiteRaw = localStorage.getItem("schema-studio-suite");
const savedSuiteId: number | null = savedSuiteRaw !== null ? (Number(savedSuiteRaw) || null) : null;
const savedSuitePicked = localStorage.getItem("schema-studio-suite-picked") === "1";
applyTheme(savedTheme);

const savedKnowledgeDomain = localStorage.getItem("knowledge-domain") ?? null;
const savedKnowledgeDomainPicked = localStorage.getItem("knowledge-domain-picked") === "1";
const savedActiveInstanceId = (() => {
  const v = localStorage.getItem("gov-active-instance");
  return v ? Number(v) || null : null;
})();

export const useStore = create<AppStore>((set) => ({
  page: "editor",
  selectedSchemaId: null,
  selectedTableId: null,
  toastMsg: null,
  theme: savedTheme,
  locale: savedLocale,
  activeSuiteId: savedSuiteId,
  suitePicked: savedSuitePicked,
  knowledgeDomain: savedKnowledgeDomain,
  knowledgeDomainPicked: savedKnowledgeDomainPicked,
  activeInstanceId: savedActiveInstanceId,
  setPage: (page) => set({ page }),
  setSelectedSchemaId: (selectedSchemaId) => set({ selectedSchemaId, selectedTableId: null }),
  setSelectedTableId:  (selectedTableId)  => set({ selectedTableId }),
  showToast: (msg) => {
    set({ toastMsg: msg });
    setTimeout(() => set({ toastMsg: null }), 2500);
  },
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  setLocale: (locale) => {
    localStorage.setItem("schema-studio-locale", locale);
    set({ locale });
  },
  setActiveSuiteId: (activeSuiteId) => {
    if (activeSuiteId === null) {
      localStorage.removeItem("schema-studio-suite");
    } else {
      localStorage.setItem("schema-studio-suite", String(activeSuiteId));
    }
    set({ activeSuiteId });
  },
  setSuitePicked: (picked) => {
    if (picked) localStorage.setItem("schema-studio-suite-picked", "1");
    else localStorage.removeItem("schema-studio-suite-picked");
    set({ suitePicked: picked });
  },
  setKnowledgeDomain: (domain, picked) => {
    if (domain) localStorage.setItem("knowledge-domain", domain);
    else localStorage.removeItem("knowledge-domain");
    if (picked) localStorage.setItem("knowledge-domain-picked", "1");
    else localStorage.removeItem("knowledge-domain-picked");
    set({ knowledgeDomain: domain, knowledgeDomainPicked: picked });
  },
  setActiveInstanceId: (id) => {
    if (id === null) localStorage.removeItem("gov-active-instance");
    else localStorage.setItem("gov-active-instance", String(id));
    set({ activeInstanceId: id });
  },
}));
