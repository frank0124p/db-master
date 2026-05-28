# CLAUDE.md

This file is read by Claude Code on session start. It encodes how we build in this repo.
**Read this fully before writing any code.**

---

## TL;DR for the impatient

- **Stack**: Vite + React + TS frontend · Node.js + Express + TS backend · **File-based JSON storage** · npm workspaces monorepo
- **No database server required.** All data persists as JSON files under `data/`. No ORM, no migrations, no Docker needed to run the app.
- **Tests are mandatory** for `packages/core` and `packages/ddl-parser`. UI can be tested via Playwright.
- **Conventional Commits** with our scope list (see below).
- **Never commit secrets.** `.env.local` only, `.env.example` checked in.

---

## Repo Layout

```
DB Master/
├── apps/
│   ├── web/                   # Vite + React + TS (port 5173)
│   └── api/                   # Express + TS (port 3005)
├── packages/
│   ├── core/                  # Shared types, schema model, Rule engine
│   ├── ddl-parser/            # SQL parsing & emission
│   └── eslint-config/         # Shared lint config
├── data/                      # ← Runtime file-based "database" (not committed except ddl/ & skills/)
│   ├── ddl/                   # .sql files auto-imported on startup
│   └── skills/                # .md files defining custom rules
├── skills/                    # Built-in Skill knowledge base (read-only)
├── prompts/                   # LLM prompt templates (runtime read)
└── package-lock.json
```

`packages/core` is imported by both `apps/web` and `apps/api`. Keep it environment-agnostic
(no `fetch`, no `fs`, no `process.env` references).

---

## Storage layer — how data actually persists

The app uses **file-based JSON storage** via `apps/api/src/db/fileStore.ts`. There is **no running database server**.

| Entity | Stored in |
|---|---|
| Schemas / Tables / Fields | `data/schemas/{id}/` |
| Naming dictionary entries | `data/naming/{id}.json` |
| Rule overrides | `data/rules/overrides.json` |
| Version snapshots | `data/schemas/{id}/versions/` |
| Wide tables | `data/schemas/{id}/wide-tables/` |
| Auto-increment counters | `data/_counters.json` |
| Reverse-lookup index | `data/_index.json` |
| DDL import manifest | `data/_ddl-manifest.json` |

All `data/` subdirectories except `data/ddl/` and `data/skills/` are in `.gitignore` — they are created at runtime and must not be committed.

**Do not introduce a database driver or ORM.** The file storage is intentional: the whole product is *about* schemas, and a live DB would create circular confusion. Raw JSON + `fs` keeps things transparent.

---

## Tech choices — and what NOT to swap them for

| Concern | Choice | Don't suggest |
|---|---|---|
| Frontend framework | React 18 + Vite | Next.js, Remix, SvelteKit |
| State | Zustand + TanStack Query | Redux, MobX, Recoil |
| Styling | Tailwind + CSS variables | styled-components, emotion |
| UI library | None (build primitives) | MUI, Ant Design, Chakra |
| Backend | Express + TS | Fastify, NestJS, Koa |
| Storage | File-based JSON (`fs/promises`) | Any database, ORM, or key-value store |
| Validation | Zod | Joi, Yup, io-ts |
| Test runner | Vitest (unit) + Playwright (e2e) | Jest, Mocha, Cypress |
| Package manager | npm workspaces | pnpm, yarn |

---

## Naming conventions

| Layer | Convention | Example |
|---|---|---|
| JSON file keys | `camelCase` | `stdName`, `fieldCount` |
| TypeScript variables / functions | `camelCase` | `parseDDL`, `usageCount` |
| TypeScript types / interfaces | `PascalCase` | `SchemaTable`, `RuleResult` |
| TypeScript enums / consts | `UPPER_SNAKE_CASE` | `MAX_TABLE_NAME_LENGTH` |
| API routes | `kebab-case` plural | `/api/naming-dictionary` |
| File names (TS) | `kebab-case.ts` | `ddl-parser.ts` |
| React components | `PascalCase.tsx` | `TableCard.tsx` |
| CSS variables | `--kebab-case` | `--bg-1`, `--accent` |

JSON → TS mapping happens at the repository layer. Inside `packages/core`, types use `camelCase`.
Do conversion once in `apps/api/src/repositories/*.ts` — never sprinkle it across the codebase.

---

## Commit conventions

We use Conventional Commits with this scope list:

```
feat(scope): ...
fix(scope): ...
refactor(scope): ...
chore(scope): ...
docs(scope): ...
test(scope): ...
```

**Allowed scopes**: `web`, `api`, `core`, `ddl`, `dict`, `llm`, `skills`, `infra`, `docs`.

Examples:
- `feat(ddl): support generated columns in CREATE TABLE`
- `fix(dict): normalize alias casing on insert`
- `refactor(core): extract rule engine into pure function`

One logical change per commit. If you find yourself writing `and` in the message, split it.

---

## Branch & PR flow

- One branch per task: `task/NN-short-description` (matches `tasks/NN-*.md`)
- Each PR closes exactly one task and references it: `Closes task 03`
- PR description must include the acceptance criteria copied from the task file with
  checkboxes filled in
- Don't merge to `main` until: typecheck passes, tests pass, lint passes

---

## Type discipline

- **No `any`.** Use `unknown` and narrow.
- **No type assertions** (`as Foo`) except at trust boundaries (parsing JSON, file reads).
  Always document why.
- **All exported functions** in `packages/core` have explicit return types.
- **Zod for runtime validation** at every external boundary (HTTP body, JSON file reads).

Pattern for file-store reads:

```ts
// In packages/core/src/types.ts
export const SchemaMetaSchema = z.object({
  id: z.number(),
  name: z.string(),
  domain: z.string(),
});
export type SchemaMeta = z.infer<typeof SchemaMetaSchema>;

// In apps/api/src/repositories/schemas.ts
export async function findById(id: number): Promise<SchemaMeta | null> {
  const raw = await fileStore.read(`schemas/${id}/meta.json`);
  if (!raw) return null;
  return SchemaMetaSchema.parse(raw);  // ← runtime validation
}
```

---

## Error handling

- Throw typed errors from `packages/core`:
  ```ts
  export class RuleViolationError extends Error {
    constructor(public ruleId: string, public detail: string) { super(detail); }
  }
  ```
- API layer catches and maps to HTTP. Use a single error middleware in `apps/api/src/middleware/error.ts`.
- Never `catch (e) { console.log(e) }`. Either rethrow, or handle and document why.
- Frontend uses TanStack Query's error states; surface to user via toast.

Response envelope for API errors:

```json
{ "error": { "code": "RULE_VIOLATION", "message": "...", "detail": {...} } }
```

---

## Testing requirements

| Package | Required coverage |
|---|---|
| `packages/core` | ≥ 90% statements; every Rule has at least one passing & one failing test case |
| `packages/ddl-parser` | Round-trip tests: parse → emit → parse must be idempotent for a corpus of ≥ 10 sample DDLs |
| `apps/api` | Integration tests for each route using a temp `data/` directory (not production data) |
| `apps/web` | Smoke test per page via Playwright; key flows (NL → schema, DDL import, dict edit) |

Run `npm test` from repo root before every commit.

---

## LLM integration rules

- The Anthropic API key lives in `apps/api/.env.local` only. Never in `apps/web/`.
- All LLM calls go through `apps/api/src/services/llm.ts`. No direct `fetch('https://api.anthropic.com')` elsewhere.
- Prompts are loaded from `prompts/*.md` at runtime. Don't inline prompt strings in TS code—they
  must be reviewable as text files and editable without recompiling.
- Skills are loaded from `skills/` (built-in) and `data/skills/` (user-defined) at server startup.
  Reload via `POST /api/v1/reload` without restarting the server.

---

## Things I will push back on

If the task or a request asks you to do these, stop and surface a question:

1. **Adding a database driver or ORM.** Storage is intentionally file-based JSON.
2. **Adding a UI component library.** We're going for a distinctive editorial look; libraries flatten that.
3. **Storing schema state in localStorage in production.** Real persistence is `data/` JSON files on the server.
4. **Putting business logic in React components.** Logic lives in `packages/core`. Components render.
5. **Scope creep into NoSQL, GraphQL schema generation, or visual ER editing.** Not in v1.
6. **Skipping the Naming Dictionary update on schema write.** It is the product's north star.
7. **Inlining LLM prompts in code.** They live in `prompts/`.
8. **Catching exceptions to "make tests pass".** If a test reveals a real bug, fix the bug.
9. **Committing files under `data/` except `data/ddl/` and `data/skills/`.** Runtime data is not version-controlled.

---

## Where to look first

- New to the project? → `README.md`
- Need the full functional spec? → `docs/SPEC.md`
- Picking a task? → `tasks/README.md` (index) → pick lowest-numbered open task
- Writing a Rule? → `packages/core/src/rules/` + `skills/`
- Writing a Skill (markdown)? → `data/skills/README.md`
- Touching the LLM call? → `prompts/` + `apps/api/src/services/llm.ts`
- Touching storage? → `apps/api/src/db/fileStore.ts` + `apps/api/src/repositories/`
