import { nowIso, type ApiEnv } from '@dardania/shared';
import type { Db } from '@dardania/db';
import { DiscordOAuthClient } from './auth/discord.js';
import { SteamService } from './services/steam.js';

export interface AppDeps {
  env: ApiEnv;
  db: Db;
  oauth: DiscordOAuthClient;
  steam: SteamService;
  now: () => string;
}

export function createDeps(
  env: ApiEnv,
  db: Db,
  overrides: { fetchImpl?: typeof fetch; now?: () => string } = {},
): AppDeps {
  const fetchImpl = overrides.fetchImpl ?? fetch;
  return {
    env,
    db,
    oauth: new DiscordOAuthClient(
      {
        clientId: env.discord.clientId,
        clientSecret: env.discord.clientSecret,
        redirectUri: env.discord.redirectUri,
      },
      fetchImpl,
    ),
    steam: new SteamService(
      db,
      { apiKey: env.steamApiKey, cacheTtlSeconds: env.steamCacheTtlSeconds },
      fetchImpl,
    ),
    now: overrides.now ?? nowIso,
  };
}
