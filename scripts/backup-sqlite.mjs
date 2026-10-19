// Helper for scripts/backup-db.sh — uses SQLite's own VACUUM INTO so the copy
// is consistent even while the API holds the database open.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const url = process.env.DATABASE_URL ?? '';
const target = process.env.TARGET;
if (!url.startsWith('sqlite:') || !target) {
  console.error('backup-sqlite.mjs expects DATABASE_URL=sqlite:... and TARGET.');
  process.exit(1);
}
const sourcePath = url.replace(/^sqlite:(\/\/)?/, '');
if (!sourcePath || sourcePath === ':memory:') {
  console.error('Cannot back up an in-memory database.');
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(sourcePath);
try {
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  console.log(`SQLite snapshot written to ${target}`);
} finally {
  db.close();
}
