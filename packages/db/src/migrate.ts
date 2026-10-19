import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from '@dardania/shared';
import type { Db } from './client.js';

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);`;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies every *.sql file in `directory` exactly once, in filename order.
 * Each migration runs inside a transaction so a failure leaves no partial schema.
 */
export async function migrate(db: Db, directory: string): Promise<MigrationResult> {
  await db.exec(MIGRATIONS_TABLE);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  const appliedRows = await db.all<{ id: string }>('SELECT id FROM schema_migrations');
  const alreadyApplied = new Set(appliedRows.map((row) => row.id));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(join(directory, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
        file,
        nowIso(),
      ]);
    });
    applied.push(file);
  }
  return { applied, skipped };
}
