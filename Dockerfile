# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

# Copy manifests first (better layer cache — only reinstall when deps change)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json           ./packages/core/
COPY packages/ddl-parser/package.json     ./packages/ddl-parser/
COPY packages/eslint-config/package.json  ./packages/eslint-config/
COPY apps/api/package.json                ./apps/api/
COPY apps/web/package.json                ./apps/web/

RUN npm ci

# Copy source
COPY packages/ ./packages/
COPY apps/     ./apps/

# Build order matters: shared packages first, then web (→ apps/api/public/), then api
RUN npm run build -w packages/core && \
    npm run build -w packages/ddl-parser && \
    npm run build -w apps/web && \
    npm run build -w apps/api

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005

# Workspace manifests (npm needs these to resolve internal packages)
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json           ./packages/core/
COPY packages/ddl-parser/package.json     ./packages/ddl-parser/
COPY packages/eslint-config/package.json  ./packages/eslint-config/
COPY apps/api/package.json                ./apps/api/

# Copy the full node_modules (includes symlinks to workspace packages)
COPY --from=builder /build/node_modules  ./node_modules

# Compiled shared packages
COPY --from=builder /build/packages/core/dist/         ./packages/core/dist/
COPY --from=builder /build/packages/ddl-parser/dist/   ./packages/ddl-parser/dist/

# Compiled API + built frontend (served as static files in production mode)
COPY --from=builder /build/apps/api/dist/    ./apps/api/dist/
COPY --from=builder /build/apps/api/public/  ./apps/api/public/

# Runtime read-only assets (paths resolved relative to apps/api/dist/services/)
COPY skills/   ./skills/
COPY prompts/  ./prompts/

# Seed files: copied into /app/data on first container start
COPY data/ddl/    ./seed/ddl/
COPY data/skills/ ./seed/skills/

# Entrypoint handles first-run data initialization
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3005

# /app/data is the entire "database" — mount a volume here for persistence
VOLUME ["/app/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
