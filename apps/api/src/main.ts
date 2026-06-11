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
import { seedDemoDataIfNeeded, seedGovernanceDemoIfNeeded } from "./services/demo-seed.js";
import { initMinio, setDataDir } from "./services/minio.js";
import { DATA_DIR } from "./db/fileStore.js";
import { getMinioSettings } from "./repositories/settings.js";
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
import suitesRouter from "./routes/suites.js";
import searchRouter from "./routes/search.js";
import usersRouter from "./routes/users.js";
import knowledgeRouter from "./routes/knowledge.js";
import importBatchesRouter from "./routes/import-batches.js";
import wtProposalsRouter from "./routes/wt-proposals.js";
import workspaceRouter from "./routes/workspace.js";
import catalogRouter from "./routes/catalog.js";
import instancesRouter from "./routes/instances.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env["PORT"] ?? 3005);
const isDev = process.env["NODE_ENV"] !== "production";

// If ALLOWED_ORIGINS is set, use the explicit list.
// If not set (e.g. GCP prod with colocated frontend+API), allow all origins —
// the user can lock this down by setting ALLOWED_ORIGINS in their env.
const explicitOrigins = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map(o => o.trim())
  : null;

// CORS applies only to /api routes — static asset requests (crossorigin attribute
// on <script>/<link> tags) must not hit this middleware or they return 500 in prod.
const apiCors = cors({
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }  // no-origin (curl, same-origin GET)
    if (!explicitOrigins) { cb(null, true); return; }  // no allowlist → open
    if (explicitOrigins.includes(origin)) { cb(null, true); return; }
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
});
app.use("/api", apiCors);
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
app.use("/api/v1/tables", tablesRouter);
app.use("/api/v1/tables/:tableId/fields", fieldsRouter);
app.use("/api/v1/fields", fieldsRouter);
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
app.use("/api/v1/suites", suitesRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/users", usersRouter);

// Governance Workflow routes
app.use("/api/v1/knowledge", knowledgeRouter);
app.use("/api/v1/import-batches", importBatchesRouter);
app.use("/api/v1/wide-table-proposals", wtProposalsRouter);
app.use("/api/v1/workspace", workspaceRouter);
app.use("/api/v1/catalog", catalogRouter);
app.use("/api/v1/instances", instancesRouter);

// Gate-policy settings (admin only)
app.get("/api/v1/settings/gate-policy", async (_req, res, next) => {
  try {
    const { getGatePolicy } = await import("./repositories/instances.js");
    res.json(await getGatePolicy());
  } catch (e) { next(e); }
});
app.patch("/api/v1/settings/gate-policy", async (req, res, next) => {
  try {
    const { getGatePolicy, saveGatePolicy } = await import("./repositories/instances.js");
    const user = (req as { user?: { role?: string } }).user;
    if (user?.role !== "admin") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin only" } });
    }
    const current = await getGatePolicy();
    const updated = { ...current, ...req.body };
    await saveGatePolicy(updated);
    return res.json(updated);
  } catch (e) { next(e); }
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  process.exit(1);
});

async function start() {
  // Verify DATA_DIR exists and is writable before accepting traffic
  const { promises: fsPromises } = await import("fs");
  await fsPromises.mkdir(DATA_DIR, { recursive: true });
  await fsPromises.access(DATA_DIR, fsPromises.constants?.W_OK ?? 2).catch(() => {
    throw new Error(`DATA_DIR is not writable: ${DATA_DIR}`);
  });

  await runMigration();
  await loadSkills();
  await loadDdlFiles();
  await seedDemoDataIfNeeded();
  await seedGovernanceDemoIfNeeded();

  // Init MinIO from persisted settings
  setDataDir(DATA_DIR);
  const minioSettings = await getMinioSettings();
  initMinio(minioSettings);
  if (minioSettings.endpoint) {
    console.warn(`[minio] configured → ${minioSettings.endpoint}:${minioSettings.port ?? 9000}/${minioSettings.bucket ?? ""}`);
  }
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
