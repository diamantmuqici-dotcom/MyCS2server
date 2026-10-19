#!/usr/bin/env bash
# Creates a consistent backup of DATABASE_URL.
#   - sqlite:  uses VACUUM INTO through Node's built-in SQLite driver
#   - postgres: uses pg_dump (custom format)
# Backups land in ./backups/<timestamp>/ and are gitignored.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
outdir="backups/$stamp"
mkdir -p "$outdir"

case "$DATABASE_URL" in
  sqlite:*)
    target="$outdir/database.sqlite"
    DATABASE_URL="$DATABASE_URL" TARGET="$target" node --experimental-sqlite scripts/backup-sqlite.mjs
    ;;
  postgres://*|postgresql://*)
    pg_dump --format=custom --no-owner --file "$outdir/database.dump" "$DATABASE_URL"
    ;;
  *)
    echo "Unsupported DATABASE_URL scheme." >&2
    exit 1
    ;;
esac

echo "Backup written to $outdir"
ls -lh "$outdir"
