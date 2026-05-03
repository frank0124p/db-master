# Task 01: Bootstrap Monorepo

**Phase**: 1
**Effort**: ~0.5d
**Depends on**: —
**Branch**: `task/01-bootstrap`

## Goal

Stand up a pnpm monorepo with `apps/web`, `apps/api`, `packages/core`, plus a `docker-compose.yml`
that runs MariaDB locally. After this task, `pnpm dev` starts both apps and they can connect to MariaDB.

## Context

We're using pnpm workspaces, not npm/yarn workspaces. See `CLAUDE.md` for the rationale.

## Approach

1. **Init repo**
   ```bash
   pnpm init
   echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml
   ```

2. **Root devDeps**: `typescript`, `@types/node`, `prettier`, `eslint`, `tsx`, `vitest`.
   Pin TypeScript to a specific minor (e.g. `5.6.x`) so all packages line up.

3. **Root `tsconfig.base.json`** with strict mode, target ES2022, moduleResolution `bundler`.
   Each package extends this.

4. **`apps/api`**: Express + TypeScript. Use `tsx` for dev, `tsc` for build.
   Entry `src/main.ts`. Health route `/api/v1/health` returns `{ ok: true, ts: ... }`.

5. **`apps/web`**: Vite + React + TS. Default Vite template, then strip the demo to `<App>`
   that fetches `/api/v1/health` and renders the result. Configure Vite proxy to forward `/api/*`
   to `http://localhost:3000`.

6. **`packages/core`**: bare TS package, exports a placeholder `version` string. Build with `tsc`.
   Make it a workspace dep of both apps (`"@schema-studio/core": "workspace:*"`).

7. **`docker-compose.yml`** at repo root:
   - service `db`: `mariadb:11` with `MARIADB_ROOT_PASSWORD`, `MARIADB_DATABASE=schema_studio`,
     port `3306` exposed
   - service `adminer`: port `8080`, optional but useful
   - named volume for DB persistence

8. **`.env.example`** at repo root listing required env vars; `.env.local` in `.gitignore`.

9. **Lint config** in `packages/eslint-config` (yes, even at this stage—saves pain later).
   Extends `eslint:recommended`, `@typescript-eslint/recommended`, plus a few rules we care about
   (no-explicit-any, prefer-const, eqeqeq).

10. **Root scripts** in `package.json`:
    ```json
    "scripts": {
      "dev": "pnpm -r --parallel dev",
      "build": "pnpm -r build",
      "test": "pnpm -r test",
      "lint": "pnpm -r lint",
      "typecheck": "pnpm -r typecheck",
      "db:up": "docker compose up -d db",
      "db:down": "docker compose down"
    }
    ```

## Acceptance criteria

- [ ] `pnpm install` from clean checkout succeeds
- [ ] `pnpm db:up` starts MariaDB; `mysql -h localhost -P 3306 -u root -p` connects
- [ ] `pnpm dev` starts both apps; web on :5173, api on :3000
- [ ] Browser: `http://localhost:5173` shows page that displays `{ ok: true, ts: <number> }` (proxy works)
- [ ] `pnpm typecheck` passes from clean checkout
- [ ] `pnpm lint` passes
- [ ] `.env.example` documents `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `PORT`
- [ ] README at root has a "Getting started" section with the 3 commands above

## Out of scope

- Real DB connection logic (task 02 handles migrations and connection)
- Any Tailwind / UI styling (task 06)
- CI config (later, once we have something worth running)

## Tips / gotchas

- pnpm doesn't auto-link workspace packages until you've run `pnpm install` once after adding them.
  If a `workspace:*` import isn't found, run install again.
- Vite proxy config goes in `vite.config.ts` under `server.proxy`.
- If the api dies on first start with "ECONNREFUSED" on the DB, that's fine for this task—we don't
  connect yet. Just get the server up.
