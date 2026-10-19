import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { createDb, migrate, type Db } from '@dardania/db';
import { loadApiEnv, type ApiEnv } from '@dardania/shared/env';
import { buildApp } from '../apps/api/src/app.js';
import { createDeps } from '../apps/api/src/deps.js';

export const GUILD_ID = '100000000000000001';
export const OWNER_ID = '100000000000000010';
export const PC_CHECKER_ID = '100000000000000011';
export const MODERATOR_ID = '100000000000000012';
export const TARGET_ID = '100000000000000101';
export const SERVICE_TOKEN = 'test-service-token-that-is-long-enough';

export interface TestContext {
  db: Db;
  env: ApiEnv;
  app: FastifyInstance;
}

/** Creates an isolated in-memory SQLite database with all migrations applied. */
export async function createTestDb(): Promise<Db> {
  const db = await createDb('sqlite::memory:');
  await migrate(db, fileURLToPath(new URL('../packages/db/migrations', import.meta.url)));
  return db;
}

export function createTestEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'sqlite::memory:',
    SESSION_SECRET: 'test-session-secret-0123456789-abcdefghijklmnop',
    SERVICE_TOKEN,
    DISCORD_GUILD_ID: GUILD_ID,
    DASHBOARD_OWNER_DISCORD_IDS: OWNER_ID,
    DASHBOARD_PC_CHECKER_DISCORD_IDS: PC_CHECKER_ID,
    ALLOW_DEV_LOGIN: 'true',
    WEB_ORIGIN: 'http://localhost:5173',
    PUBLIC_DISCORD_INVITE_URL: 'https://discord.gg/example',
    ...overrides,
  });
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const db = await createTestDb();
  const env = createTestEnv(overrides);
  const app = await buildApp(createDeps(env, db), { logger: false });
  await app.ready();
  return { db, env, app };
}

export async function closeTestContext(context: TestContext): Promise<void> {
  await context.app.close();
  await context.db.close();
}

export async function devLogin(app: FastifyInstance, userId = OWNER_ID): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/dev-login',
    payload: { discordUserId: userId },
  });
  if (response.statusCode !== 200) throw new Error(`dev login failed: ${response.body}`);
  const cookies = response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
  const body = response.json() as { sessionUser: { csrfToken: string } };
  return `${cookies.join('; ')}; csrf=${body.sessionUser.csrfToken}`;
}

export function parseAuthCookie(cookie: string): { cookieHeader: string; csrfToken: string } {
  const parts = cookie.split('; ').filter(Boolean);
  const csrfEntry = parts.find((part) => part.startsWith('csrf='));
  const csrfToken = csrfEntry ? csrfEntry.slice('csrf='.length) : '';
  return {
    cookieHeader: parts.filter((part) => !part.startsWith('csrf=')).join('; '),
    csrfToken,
  };
}

export const SERVICE_HEADERS = { 'x-service-token': SERVICE_TOKEN };
