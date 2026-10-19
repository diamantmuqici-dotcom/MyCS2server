#!/usr/bin/env bash
# Dardania | Elite — PostgreSQL backup helper.
# Usage: DATABASE_URL=postgres://... BACKUP_DIR=./backups ./scripts/backup-db.sh
# Retains 14 daily compressed dumps. Never commit backups/ (gitignored).
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi
if [[ "$DATABASE_URL" != postgres://* && "$DATABASE_URL" != postgresql://* ]]; then
  echo "Backups via pg_dump require a PostgreSQL DATABASE_URL." >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/dardania-elite-$STAMP.sql.gz"

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$TARGET.tmp"
mv "$TARGET.tmp" "$TARGET"
echo "backup written: $TARGET"

# Keep the 14 newest backups.
ls -1t "$BACKUP_DIR"/dardania-elite-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
