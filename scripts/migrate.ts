#!/usr/bin/env tsx
/**
 * Applies pending SQL migrations to DATABASE_URL.
 * Safe to run repeatedly; already-applied files are skipped.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createDb, migrate } from '@dardania/db';
import { loadApiEnv } from '@dardania/shared/env';

const env = loadApiEnv();
const db = await createDb(env.databaseUrl);
try {
  const result = await migrate(
    db,
    fileURLToPath(new URL('../packages/db/migrations', import.meta.url)),
  );
  if (result.applied.length > 0) {
    console.log(`Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`);
  } else {
    console.log('Database is up to date; no migrations applied.');
  }
} finally {
  await db.close();
}
