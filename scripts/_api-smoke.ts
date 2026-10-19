import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiEnv } from '@dardania/shared';
import { createDb, migrate } from '@dardania/db';
import { buildApp } from '../apps/api/src/app.js';
import { createDeps } from '../apps/api/src/deps.js';

const env = loadApiEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'sqlite::memory:',
  SESSION_SECRET: 'x'.repeat(40),
  SERVICE_TOKEN: 'service-token-for-tests-123456',
  DISCORD_GUILD_ID: '100000000000000001',
  DASHBOARD_OWNER_DISCORD_IDS: '200000000000000001',
  DASHBOARD_CO_OWNER_DISCORD_IDS: '200000000000000002',
  ALLOW_DEV_LOGIN: 'true',
  WEB_ORIGIN: 'http://localhost:5173',
  PUBLIC_DISCORD_INVITE_URL: 'https://discord.gg/test',
} as NodeJS.ProcessEnv);
const db = await createDb(env.databaseUrl);
await migrate(db, join(process.cwd(), 'packages/db/migrations'));
const app = await buildApp(createDeps(env, db), { logger: false });

const health = await app.inject({ method: 'GET', url: '/api/health' });
console.log('health', health.statusCode, health.json());
const config = await app.inject({ method: 'GET', url: '/api/config' });
console.log('config', config.statusCode, Object.keys(config.json()));
const unauth = await app.inject({ method: 'GET', url: '/api/dashboard/overview' });
console.log('unauth overview', unauth.statusCode, unauth.json());
const dev = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: {} });
console.log('dev login', dev.statusCode, dev.json());
const cookies = dev.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const session = dev.json().sessionUser;
const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookies } });
console.log('me', me.statusCode, me.json().sessionUser?.accessLevel);
const overview = await app.inject({ method: 'GET', url: '/api/dashboard/overview', headers: { cookie: cookies } });
console.log('overview', overview.statusCode, overview.json().totals, overview.json().coverage);
const noCsrf = await app.inject({ method: 'POST', url: '/api/dashboard/announcements', headers: { cookie: cookies }, payload: { title: 'Test announcement', body: 'This is a test announcement body.', category: 'GENERAL' } });
console.log('announcement no csrf', noCsrf.statusCode, noCsrf.json());
const created = await app.inject({ method: 'POST', url: '/api/dashboard/announcements', headers: { cookie: cookies, 'x-csrf-token': session.csrfToken }, payload: { title: 'Test announcement', body: 'This is a test announcement body.', category: 'GENERAL' } });
console.log('announcement create', created.statusCode, created.json().announcement?.slug);
const annId = created.json().announcement.id;
const published = await app.inject({ method: 'POST', url: `/api/dashboard/announcements/${annId}/publish`, headers: { cookie: cookies, 'x-csrf-token': session.csrfToken }, payload: {} });
console.log('publish', published.statusCode, published.json().enqueued);
const internalNoAuth = await app.inject({ method: 'GET', url: '/api/internal/discord-deliveries' });
console.log('internal no auth', internalNoAuth.statusCode);
const deliveries = await app.inject({ method: 'GET', url: '/api/internal/discord-deliveries', headers: { 'x-service-token': env.serviceToken } });
console.log('deliveries', deliveries.statusCode, deliveries.json().deliveries?.length, deliveries.json().deliveries?.[0]?.topic);
const evt = await app.inject({
  method: 'POST', url: '/api/internal/moderation-events', headers: { 'x-service-token': env.serviceToken },
  payload: { guildId: '100000000000000001', actionType: 'BAN', target: { id: '300000000000000001', username: 'badplayer' }, moderator: { id: '200000000000000002', name: 'mod' }, reason: 'cheating', occurredAt: new Date().toISOString(), source: 'BOT_COMMAND', dedupeKey: 'test-ban-1', attributionStatus: 'VERIFIED', steamId64: '76561198000000001' },
});
console.log('ingest', evt.statusCode, evt.json());
const cases = await app.inject({ method: 'GET', url: '/api/dashboard/cases', headers: { cookie: cookies } });
console.log('cases', cases.statusCode, cases.json().total, cases.json().items?.[0]?.caseRef, cases.json().items?.[0]?.steamAtEvent);
const pcOnly = await app.inject({ method: 'GET', url: '/api/dashboard/cases', headers: { cookie: cookies } });
console.log('cases again', pcOnly.statusCode, pcOnly.json().total);
const announced = await app.inject({ method: 'GET', url: '/api/announcements' });
console.log('public announcements', announced.statusCode, announced.json().total, announced.json().items?.[0]?.title);
const status = await app.inject({ method: 'GET', url: '/api/status' });
console.log('status', status.statusCode, status.json().status, status.json().services?.map((s: {service:string;status:string}) => `${s.service}:${s.status}`));
await app.close();
await db.close();
