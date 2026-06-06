import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isMock   = process.env.VITE_USE_MOCK === "true";
const base     = process.env.VITE_BASE ?? "/";
const apiProxy = process.env.VITE_API_URL ?? "http://localhost:3005";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: isMock ? {} : { "/api": apiProxy },
  },
  build: {
    outDir: isMock ? "dist" : "../api/public",
    emptyOutDir: true,
  },
});
