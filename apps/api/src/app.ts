/**
 * createApp — Express app factory for testing.
 *
 * Sets up all routes and middleware but does NOT call start(), listen(),
 * seed data, or load DDL/skills. Call this from integration tests after
 * setting process.env["DATA_DIR"] to a tmp directory.
 */

import express from "express";
import { errorMiddleware } from "./middleware/error.js";
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
import governanceRouter from "./routes/governance.js";
import lineageRouter from "./routes/lineage.js";
import graphRouter from "./routes/graph.js";
import askRouter from "./routes/ask.js";

export function createApp(dataDir?: string) {
  if (dataDir) process.env["DATA_DIR"] = dataDir;

  const app = express();
  app.use(express.json());

  // Health
  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), version: "0.1.0", storage: "local-files" });
  });

  // Core routes
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
  app.use("/api/v1/governance", governanceRouter);
  app.use("/api/v1/lineage", lineageRouter);
  app.use("/api/v1/graph", graphRouter);
  app.use("/api/v1/ask", askRouter);

  app.use(errorMiddleware);
  return app;
}
