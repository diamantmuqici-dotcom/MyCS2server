import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { loadApiEnv } from '@dardania/shared/env';
import { createDb, migrate } from '@dardania/db';

/** Applies pending SQL migrations to the configured database. Safe to re-run. */
async function main(): Promise<void> {
  const env = loadApiEnv();
  const db = await createDb(env.databaseUrl);
  try {
    const directory = fileURLToPath(new URL('../packages/db/migrations', import.meta.url));
    const result = await migrate(db, directory);
    if (result.applied.length === 0) {
      console.log('[db] schema is up to date — nothing to apply.');
    } else {
      console.log(`[db] applied: ${result.applied.join(', ')}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('[fatal] migration failed:', error);
  process.exit(1);
});
