#!/bin/sh
set -e

DATA_DIR="/app/data"
INITIALIZED_FLAG="$DATA_DIR/.initialized"

# ── First-run initialization ───────────────────────────────────────────────────
if [ ! -f "$INITIALIZED_FLAG" ]; then
  echo "[startup] First run detected — initializing data directory..."

  # Seed DDL files (auto-imported on startup by ddl-loader.ts)
  mkdir -p "$DATA_DIR/ddl"
  if [ -d "/app/seed/ddl" ] && [ "$(ls -A /app/seed/ddl 2>/dev/null)" ]; then
    cp /app/seed/ddl/* "$DATA_DIR/ddl/"
    echo "[startup] Seeded DDL files: $(ls /app/seed/ddl | tr '\n' ' ')"
  fi

  # Seed custom skills (empty by default, user can add .md files later)
  mkdir -p "$DATA_DIR/skills"
  if [ -d "/app/seed/skills" ] && [ "$(ls -A /app/seed/skills 2>/dev/null)" ]; then
    cp /app/seed/skills/* "$DATA_DIR/skills/"
    echo "[startup] Seeded skills: $(ls /app/seed/skills | tr '\n' ' ')"
  fi

  touch "$INITIALIZED_FLAG"
  echo "[startup] Done. Data directory ready at $DATA_DIR"
fi

# ── Start server ───────────────────────────────────────────────────────────────
echo "[startup] Starting DB Master on port ${PORT:-3005}..."
exec node apps/api/dist/main.js
