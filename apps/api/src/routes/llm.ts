import { Router, type Router as ExpressRouter } from "express";
import { generateSchemaStream } from "../services/llm.js";
import { getSkillsForDomain, formatSkillsForPrompt } from "../services/skills.js";
import { listNamingEntries } from "../repositories/naming.js";
import { createSchema, getSchemaById } from "../repositories/schemas.js";
import { createTable } from "../repositories/tables.js";
import { createField } from "../repositories/fields.js";
import type { GeneratedField } from "../services/llm.js";

const router: ExpressRouter = Router({ mergeParams: true });

// POST /api/v1/llm/generate  — SSE stream
router.post("/generate", async (req, res, next) => {
  try {
    const { prompt, domain = "semiconductor" } = req.body as { prompt?: string; domain?: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: { message: "prompt is required" } });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Build context
    const entries = await listNamingEntries(domain);
    const namingDict = entries
      .map(e => `- ${e.concept} → \`${e.stdName}\`${e.aliases.length ? ` (aliases: ${e.aliases.join(", ")})` : ""}`)
      .join("\n");

    const skills = getSkillsForDomain(domain);
    const skillsText = formatSkillsForPrompt(skills);

    // Stream generation
    let schemaResult = null;
    for await (const event of generateSchemaStream(prompt, namingDict, skillsText)) {
      if (event.type === "token") {
        send({ type: "token", text: event.text });
      } else if (event.type === "result") {
        schemaResult = event.schema;
      } else if (event.type === "error") {
        send({ type: "error", message: event.message });
        res.end();
        return;
      }
    }

    if (!schemaResult) {
      send({ type: "error", message: "Failed to parse schema from LLM response" });
      res.end();
      return;
    }

    // Persist to file store
    const schema = await createSchema({
      name: schemaResult.name,
      description: schemaResult.description,
      domain,
    });

    for (const tbl of schemaResult.tables) {
      const table = await createTable(schema.id, { name: tbl.name, comment: tbl.comment });
      for (let pos = 0; pos < tbl.fields.length; pos++) {
        const f: GeneratedField = tbl.fields[pos]!;
        await createField(table.id, {
          name: f.name,
          data_type: f.dataType,
          nullable: f.nullable,
          default_value: f.defaultValue,
          is_primary_key: f.isPrimaryKey,
          is_unique: f.isUnique,
          comment: f.comment,
          position: pos,
        });
      }
    }

    const saved = await getSchemaById(schema.id);
    send({ type: "done", schemaId: saved.id, schemaName: saved.name, tableCount: saved.tables.length });
    res.end();
  } catch (e) { next(e); }
});

export default router;
