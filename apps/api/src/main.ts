import { config } from "dotenv";
config({ path: ".env.local", override: true });

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { errorMiddleware } from "./middleware/error.js";
import { loadSkills } from "./services/skills.js";
import { loadDdlFiles } from "./services/ddl-loader.js";
import { runMigration } from "./db/migrate.js";
import schemasRouter from "./routes/schemas.js";
import tablesRouter from "./routes/tables.js";
import fieldsRouter from "./routes/fields.js";
import namingRouter from "./routes/naming.js";
import versionsRouter from "./routes/versions.js";
import ddlRouter from "./routes/ddl.js";
import analyzeRouter from "./routes/analyze.js";
import wideTablesRouter from "./routes/wide-tables.js";
import importDdlRouter from "./routes/import-ddl.js";
import rulesRouter from "./routes/rules.js";
import skillsRouter from "./routes/skills.js";
import llmRouter from "./routes/llm.js";
import settingsRouter from "./routes/settings.js";
import datahubRouter from "./routes/datahub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env["PORT"] ?? 3005);
const isDev = process.env["NODE_ENV"] !== "production";

app.use(cors());
app.use(express.json());

// Health
app.get("/api/v1/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), version: "0.1.0", storage: "local-files" });
});

// Reload DDL files + Skills on demand
app.post("/api/v1/reload", async (_req, res, next) => {
  try {
    await loadSkills();
    await loadDdlFiles();
    res.json({ ok: true, reloadedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

// API routes
app.use("/api/v1/schemas", schemasRouter);
app.use("/api/v1/schemas/:schemaId/tables", tablesRouter);
app.use("/api/v1/tables/:tableId/fields", fieldsRouter);
app.use("/api/v1/naming-dictionary", namingRouter);
app.use("/api/v1/schemas/:schemaId/versions", versionsRouter);
app.use("/api/v1/schemas/:schemaId/ddl", ddlRouter);
app.use("/api/v1/schemas/:schemaId/analyze", analyzeRouter);
app.use("/api/v1/schemas/:schemaId/wide-tables", wideTablesRouter);
app.use("/api/v1/schemas/:schemaId/import-ddl", importDdlRouter);
app.use("/api/v1/rules", rulesRouter);
app.use("/api/v1/skills", skillsRouter);
app.use("/api/v1/llm", llmRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/datahub", datahubRouter);

async function start() {
  await runMigration();
  await loadSkills();
  await loadDdlFiles();
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    const webRoot = path.resolve(__dirname, "../../web");
    const vite = await createViteServer({
      root: webRoot,
      configFile: false,   // inline config — prevents tsx from creating timestamp files next to vite.config.ts
      plugins: [react(), tailwindcss()],
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const pub = path.resolve(__dirname, "../public");
    app.use(express.static(pub));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(pub, "index.html"));
    });
  }

  app.use(errorMiddleware);

  app.listen(PORT, () => {
    console.warn(`[api] http://localhost:${PORT}  (${isDev ? "dev+vite" : "prod"})`);
  });
}

start().catch((e) => { console.error(e); process.exit(1); });
