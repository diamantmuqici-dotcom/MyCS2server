import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { loadApiEnv, describeApiEnv } from '@dardania/shared/env';
import { createDb, migrate } from '@dardania/db';
import { buildApp } from './app.js';
import { createDeps } from './deps.js';

async function main(): Promise<void> {
  const env = loadApiEnv();
  const db = await createDb(env.databaseUrl);
  const migrationsDir = fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url));
  const migrationResult = await migrate(db, migrationsDir);
  if (migrationResult.applied.length > 0) {
    console.log(`[db] applied migrations: ${migrationResult.applied.join(', ')}`);
  }

  const deps = createDeps(env, db);
  const app = await buildApp(deps);
  await app.listen({ port: env.port, host: env.host });

  console.log('[startup] Dardania | Elite API ready', describeApiEnv(env));

  const purgeTimer = setInterval(
    () => {
      void import('@dardania/db').then(({ purgeExpiredSessions }) =>
        purgeExpiredSessions(db, new Date().toISOString()).catch((error: unknown) => {
          app.log.warn({ err: error }, 'Failed to purge expired sessions');
        }),
      );
    },
    60 * 60 * 1000,
  );
  purgeTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[shutdown] received ${signal}`);
    clearInterval(purgeTimer);
    try {
      await app.close();
      await db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[fatal] API failed to start:', error);
  process.exit(1);
});
