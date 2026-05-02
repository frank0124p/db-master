# CLAUDE.md

This file is read by Claude Code on session start. It encodes how we build in this repo.
**Read this fully before writing any code.**

---

## TL;DR for the impatient

- **Stack**: Vite + React + TS frontend · Node.js + Express + TS backend · MariaDB · pnpm monorepo
- **No ORM.** Raw SQL via `mariadb` driver. Migrations are plain `.sql` files.
- **Tests are mandatory** for `packages/core` and `packages/ddl-parser`. UI can be tested via Playwright.
- **Conventional Commits** with our scope list (see below).
- **Branch per task**: `task/01-bootstrap`, `task/02-db-schema`, etc.
- **Never commit secrets.** `.env.local` only, `.env.example` checked in.

---

## Repo Layout

```
schema-studio/
├── apps/
│   ├── web/                   # Vite + React + TS
│   └── api/                   # Express + TS
├── packages/
│   ├── core/                  # Shared types, schema model, Rule engine
│   ├── ddl-parser/            # SQL parsing & emission
│   └── eslint-config/         # Shared lint config
├── db/
│   ├── migrations/            # Numbered .sql files
│   └── seed/                  # Default rules, skills, sample schemas
├── skills/                    # Markdown skills (loaded at runtime)
├── prompts/                   # LLM prompt templates
├── docker-compose.yml         # MariaDB + adminer
└── pnpm-workspace.yaml
```

`packages/core` is imported by both `apps/web` and `apps/api`. Keep it environment-agnostic
(no `fetch`, no `fs`, no `process.env` references).

---

## Tech choices — and what NOT to swap them for

| Concern | Choice | Don't suggest |
|---|---|---|
| Frontend framework | React 18 + Vite | Next.js, Remix, SvelteKit |
| State | Zustand + TanStack Query | Redux, MobX, Recoil |
| Styling | Tailwind + CSS variables | styled-components, emotion |
| UI library | None (build primitives) | MUI, Ant Design, Chakra |
| Backend | Express + TS | Fastify, NestJS, Koa |
| DB driver | `mariadb` (official) | mysql2, knex, Prisma, Drizzle |
| Validation | Zod | Joi, Yup, io-ts |
| Test runner | Vitest (unit) + Playwright (e2e) | Jest, Mocha, Cypress |
| Package manager | pnpm | npm, yarn |

**If you're tempted to add an ORM**, stop. We deliberately use raw SQL because (a) the whole
product is *about* schemas, so ORM-mediated table definitions create a layered confusion,
and (b) raw SQL keeps migrations transparent.

---

## Naming conventions

| Layer | Convention | Example |
|---|---|---|
| MariaDB tables / columns | `snake_case`, plural tables | `schema_fields`, `usage_count` |
| TypeScript variables / functions | `camelCase` | `parseDDL`, `usageCount` |
| TypeScript types / interfaces | `PascalCase` | `SchemaTable`, `RuleResult` |
| TypeScript enums / consts | `UPPER_SNAKE_CASE` | `MAX_TABLE_NAME_LENGTH` |
| API routes | `kebab-case` plural | `/api/naming-dictionary` |
| File names (TS) | `kebab-case.ts` | `ddl-parser.ts` |
| React components | `PascalCase.tsx` | `TableCard.tsx` |
| CSS variables | `--kebab-case` | `--bg-1`, `--accent` |

DB→TS mapping happens at the API boundary. Inside `packages/core`, types use `camelCase`.
Don't sprinkle conversion logic—do it once in the API layer's repository functions.

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

**Allowed scopes**: `web`, `api`, `core`, `ddl`, `dict`, `db`, `llm`, `skills`, `infra`, `docs`.

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
- **No type assertions** (`as Foo`) except at trust boundaries (parsing JSON, raw SQL rows).
  Always document why.
- **All exported functions** in `packages/core` have explicit return types.
- **Zod for runtime validation** at every external boundary (HTTP body, DB row, file read).

Pattern for DB rows:

```ts
// In packages/core/src/schema.ts
export const SchemaRow = z.object({
  id: z.number(),
  name: z.string(),
  domain: z.string(),
  // ...
});
export type SchemaRow = z.infer<typeof SchemaRow>;

// In apps/api/src/repositories/schemas.ts
export async function findById(id: number): Promise<Schema | null> {
  const rows = await pool.query('SELECT * FROM schemas WHERE id = ?', [id]);
  if (!rows[0]) return null;
  return SchemaRow.parse(rows[0]);  // ← runtime validation
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

## Database conventions

- All tables have `id BIGINT AUTO_INCREMENT PRIMARY KEY`
- All tables have `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- All tables have `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- Soft delete via `deleted_at TIMESTAMP NULL` where applicable; queries filter `WHERE deleted_at IS NULL`
- FK constraints named `fk_<table>_<column>`; uniques named `uk_<table>_<columns>`
- Use `utf8mb4` / `utf8mb4_unicode_ci` everywhere
- Migrations are immutable once merged. Never edit a committed migration—write a new one.

---

## Testing requirements

| Package | Required coverage |
|---|---|
| `packages/core` | ≥ 90% statements; every Rule has at least one passing & one failing test case |
| `packages/ddl-parser` | Round-trip tests: parse → emit → parse must be idempotent for a corpus of ≥ 10 sample DDLs |
| `apps/api` | Integration tests for each route (real MariaDB via testcontainers or a `_test` schema) |
| `apps/web` | Smoke test per page via Playwright; key flows (NL → schema, DDL import, dict edit) |

Run `pnpm test` from repo root before every commit.

---

## LLM integration rules

- The Anthropic API key lives in `apps/api/.env.local` only. Never in `apps/web/`.
- All LLM calls go through `apps/api/src/services/llm.ts`. No direct `fetch('https://api.anthropic.com')` elsewhere.
- Every LLM call writes an audit log row (request, response, tokens, latency, cost estimate).
- Prompts are loaded from `prompts/*.md` at runtime. Don't inline prompt strings in TS code—they
  must be reviewable as text files and editable without recompiling.
- Skills are loaded from `skills/**/SKILL.md` at server startup; reload on file change in dev mode.

---

## Things I will push back on

If the task or a request asks you to do these, stop and surface a question:

1. **Adding an ORM.** See above.
2. **Adding a UI component library.** We're going for a distinctive editorial look; libraries flatten that.
3. **Storing schema state in localStorage in production.** That was prototype-only. Real persistence is MariaDB.
4. **Putting business logic in React components.** Logic lives in `packages/core`. Components render.
5. **Scope creep into NoSQL, GraphQL schema generation, or visual ER editing.** Not in v1.
6. **Skipping the Naming Dictionary update on schema write.** It is the product's north star.
7. **Inlining LLM prompts in code.** They live in `prompts/`.
8. **Catching exceptions to "make tests pass".** If a test reveals a real bug, fix the bug.

---

## Where to look first

- New to the project? → `PROJECT.md`
- Need the full functional spec? → `docs/SPEC.md`
- Picking a task? → `tasks/README.md` (index) → pick lowest-numbered open task
- Writing a Rule? → `packages/core/src/rules/` + `skills/schema-design/SKILL.md`
- Writing a Skill (markdown)? → `skills/README.md`
- Touching the LLM call? → `prompts/README.md` + `apps/api/src/services/llm.ts`
