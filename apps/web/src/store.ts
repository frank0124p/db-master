import { create } from "zustand";

export type Page   = "editor" | "dict" | "versions" | "analysis" | "er" | "wide" | "rules" | "datahub";
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
  setPage: (p: Page) => void;
  setSelectedSchemaId: (id: number | null) => void;
  setSelectedTableId: (id: number | null) => void;
  showToast: (msg: string) => void;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  setActiveSuiteId: (id: number | null) => void;
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("schema-studio-theme", t);
}

const savedTheme  = (localStorage.getItem("schema-studio-theme")  as Theme  | null) ?? "dark";
const savedLocale = (localStorage.getItem("schema-studio-locale") as Locale | null) ?? "zh";
const savedSuiteRaw = localStorage.getItem("schema-studio-suite");
const savedSuiteId: number | null = savedSuiteRaw !== null ? (Number(savedSuiteRaw) || null) : null;
applyTheme(savedTheme);

export const useStore = create<AppStore>((set) => ({
  page: "editor",
  selectedSchemaId: null,
  selectedTableId: null,
  toastMsg: null,
  theme: savedTheme,
  locale: savedLocale,
  activeSuiteId: savedSuiteId,
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
}));
