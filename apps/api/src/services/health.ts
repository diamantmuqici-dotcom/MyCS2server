import {
  nowIso,
  type PublicStatusDto,
  type ServiceHealthDto,
} from '@dardania/shared';
import { getServiceHealth, serviceHealthDetail, type Db } from '@dardania/db';

export const APP_VERSION = '1.0.0';
const BOT_STALE_MS = 3 * 60 * 1000;

export async function buildHealth(db: Db, now: string = nowIso()): Promise<ServiceHealthDto[]> {
  let databaseOk = true;
  let databaseDetail = 'Connection healthy.';
  try {
    await db.get('SELECT 1 AS ok');
  } catch {
    databaseOk = false;
    databaseDetail = 'Database query failed.';
  }
  const rows = await getServiceHealth(db).catch(() => []);
  const bot = rows.find((row) => row.service === 'bot');
  const detail = bot ? serviceHealthDetail(bot) : null;
  const lastSeen = bot?.last_seen_at ?? null;
  const stale = lastSeen ? Date.now() - new Date(lastSeen).getTime() > BOT_STALE_MS : null;
  let botStatus: ServiceHealthDto['status'] = 'unknown';
  let botDetail = 'The bot has not reported a heartbeat yet.';
  if (bot && lastSeen) {
    const reported = bot.status === 'operational' || bot.status === 'degraded' || bot.status === 'outage'
      ? bot.status
      : 'unknown';
    if (stale) {
      botStatus = 'degraded';
      botDetail = 'The bot heartbeat is stale — the bot may be offline.';
    } else {
      botStatus = reported;
      const guilds = typeof detail?.guilds === 'number' ? detail.guilds : null;
      botDetail = guilds !== null ? `Connected to ${guilds} guild(s).` : 'Bot heartbeat received.';
    }
  }
  return [
    { service: 'api', status: 'operational', lastSeenAt: now, detail: `API v${APP_VERSION} responding.` },
    {
      service: 'database',
      status: databaseOk ? 'operational' : 'outage',
      lastSeenAt: now,
      detail: databaseDetail,
    },
    {
      service: 'bot',
      status: botStatus,
      lastSeenAt: lastSeen,
      detail: botDetail,
    },
    {
      service: 'discord',
      status: botStatus === 'operational' ? 'operational' : botStatus === 'outage' ? 'outage' : 'unknown',
      lastSeenAt: lastSeen,
      detail:
        botStatus === 'operational'
          ? 'Discord gateway connection reported healthy by the bot.'
          : 'Discord gateway status is reported by the bot heartbeat.',
    },
  ];
}

export async function buildPublicStatus(
  db: Db,
  now: string = nowIso(),
): Promise<PublicStatusDto> {
  const services = await buildHealth(db, now);
  const database = services.find((service) => service.service === 'database');
  const bot = services.find((service) => service.service === 'bot');
  const status: PublicStatusDto['status'] =
    database?.status === 'outage' ? 'outage' : bot?.status === 'degraded' ? 'degraded' : 'operational';
  return {
    status,
    checkedAt: now,
    services,
    botConnected: bot?.status === 'operational',
    databaseConnected: database?.status === 'operational',
    version: APP_VERSION,
  };
}
