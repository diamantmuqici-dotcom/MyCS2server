import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const DISCORD_ID = /^\d{17,20}$/;

export function parseIdList(value: string | undefined, label: string): string[] {
  if (!value) return [];
  const parts = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const invalid = parts.filter((entry) => !DISCORD_ID.test(entry));
  if (invalid.length > 0) {
    throw new Error(
      `${label} contains invalid Discord user IDs: ${invalid.join(', ')}. ` +
        'Use numeric snowflakes, not usernames.',
    );
  }
  return [...new Set(parts)];
}

const flag = (defaultValue = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }, z.boolean());

const numeric = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }, z.number());

const text = (defaultValue = '') =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return defaultValue;
    return String(value).trim();
  }, z.string());

const rawApiEnvSchema = z.object({
  NODE_ENV: text('development'),
  LOG_LEVEL: text('info'),
  DATABASE_URL: text(''),
  API_HOST: text('0.0.0.0'),
  API_PORT: numeric(8787),
  API_BASE_URL: text(''),
  WEB_ORIGIN: text('http://localhost:5173'),
  SERVE_WEB: flag(false),
  WEB_DIST_DIR: text('apps/web/dist'),
  SESSION_SECRET: text(''),
  SESSION_TTL_HOURS: numeric(8),
  COOKIE_SECURE: flag(false),
  COOKIE_DOMAIN: text(''),
  SERVICE_TOKEN: text(''),
  STEAM_API_KEY: text(''),
  STEAM_CACHE_TTL_SECONDS: numeric(300),
  DISCORD_CLIENT_ID: text(''),
  DISCORD_OAUTH_CLIENT_SECRET: text(''),
  DISCORD_OAUTH_REDIRECT_URI: text(''),
  DISCORD_GUILD_ID: text(''),
  DISCORD_ALLOWED_GUILD_IDS: text(''),
  DASHBOARD_OWNER_DISCORD_IDS: text(''),
  DASHBOARD_CO_OWNER_DISCORD_IDS: text(''),
  DASHBOARD_PC_CHECKER_DISCORD_IDS: text(''),
  ALLOW_DEV_LOGIN: flag(false),
  PUBLIC_DISCORD_INVITE_URL: text(''),
  PUBLIC_SUPPORT_URL: text(''),
  PUBLIC_CONTACT_EMAIL: text(''),
  PUBLIC_STEAM_GROUP_URL: text(''),
  PUBLIC_SERVERS: text('[]'),
  PUBLIC_TEAM_JSON: text('[]'),
});

export interface PublicTeamMember {
  name: string;
  role: string;
  note?: string;
}

export interface PublicServer {
  label: string;
  connect: string;
}

export interface ApiEnv {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  logLevel: string;
  databaseUrl: string;
  host: string;
  port: number;
  apiBaseUrl: string;
  webOrigins: string[];
  serveWeb: boolean;
  webDistDir: string;
  sessionSecret: string;
  sessionTtlHours: number;
  cookieSecure: boolean;
  cookieDomain: string | null;
  serviceToken: string;
  steamApiKey: string;
  steamCacheTtlSeconds: number;
  discord: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    guildId: string;
    allowedGuildIds: string[];
  };
  owners: string[];
  coOwners: string[];
  pcCheckers: string[];
  allowDevLogin: boolean;
  publicConfig: {
    discordInviteUrl: string;
    supportUrl: string;
    contactEmail: string;
    steamGroupUrl: string;
    servers: PublicServer[];
    team: PublicTeamMember[];
  };
}

function parseJsonArray(raw: string, label: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed;
  } catch {
    throw new Error(`${label} must be a valid JSON array.`);
  }
}

const teamSchema = z.array(
  z.object({
    name: z.string().min(1).max(64),
    role: z.string().min(1).max(64),
    note: z.string().max(160).optional(),
  }),
);

const serverSchema = z.array(
  z.object({
    label: z.string().min(1).max(64),
    connect: z.string().min(1).max(128),
  }),
);

/**
 * Parses and validates backend configuration. Throws on unsafe production
 * configurations instead of silently starting with weak defaults.
 */
export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const raw = rawApiEnvSchema.parse(source);
  const nodeEnv = raw.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV must be development, test or production (received "${nodeEnv}").`);
  }
  const isProduction = nodeEnv === 'production';
  const port = Math.trunc(raw.API_PORT);
  if (port < 1 || port > 65535) throw new Error('API_PORT must be between 1 and 65535.');

  let sessionSecret = raw.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) throw new Error('SESSION_SECRET is required in production.');
    sessionSecret = randomBytes(48).toString('base64url');
    console.warn('[config] SESSION_SECRET not set — generated an ephemeral development secret.');
  }
  if (isProduction && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
  if (isProduction && raw.ALLOW_DEV_LOGIN) {
    throw new Error('ALLOW_DEV_LOGIN must be false in production.');
  }
  if (isProduction && !raw.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production (HTTPS only).');
  }

  const owners = parseIdList(raw.DASHBOARD_OWNER_DISCORD_IDS, 'DASHBOARD_OWNER_DISCORD_IDS');
  const coOwners = parseIdList(
    raw.DASHBOARD_CO_OWNER_DISCORD_IDS,
    'DASHBOARD_CO_OWNER_DISCORD_IDS',
  );
  const pcCheckers = parseIdList(
    raw.DASHBOARD_PC_CHECKER_DISCORD_IDS,
    'DASHBOARD_PC_CHECKER_DISCORD_IDS',
  );
  if (isProduction && owners.length === 0) {
    throw new Error('DASHBOARD_OWNER_DISCORD_IDS must contain at least one owner in production.');
  }

  const databaseUrl = raw.DATABASE_URL || (isProduction ? '' : 'sqlite:./data/dev.sqlite');
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (
    isProduction &&
    !databaseUrl.startsWith('postgres://') &&
    !databaseUrl.startsWith('postgresql://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string in production.');
  }

  const apiBaseUrl = raw.API_BASE_URL || `http://localhost:${port}`;
  const webOrigins = raw.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const guildId = raw.DISCORD_GUILD_ID;
  if (guildId && !DISCORD_ID.test(guildId)) {
    throw new Error('DISCORD_GUILD_ID must be a numeric Discord guild ID.');
  }
  const allowedGuildIds = [
    ...(guildId ? [guildId] : []),
    ...parseIdList(raw.DISCORD_ALLOWED_GUILD_IDS, 'DISCORD_ALLOWED_GUILD_IDS'),
  ].filter((value, index, all) => all.indexOf(value) === index);

  const team = teamSchema.parse(parseJsonArray(raw.PUBLIC_TEAM_JSON, 'PUBLIC_TEAM_JSON'));
  let servers: PublicServer[];
  try {
    servers = serverSchema.parse(parseJsonArray(raw.PUBLIC_SERVERS, 'PUBLIC_SERVERS'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid value';
    throw new Error(
      `PUBLIC_SERVERS must be a JSON array of { label, connect } objects (${reason}).`,
    );
  }

  return {
    nodeEnv,
    isProduction,
    logLevel: raw.LOG_LEVEL,
    databaseUrl,
    host: raw.API_HOST || '0.0.0.0',
    port,
    apiBaseUrl,
    webOrigins,
    serveWeb: raw.SERVE_WEB,
    webDistDir: raw.WEB_DIST_DIR,
    sessionSecret,
    sessionTtlHours: Math.min(Math.max(Math.trunc(raw.SESSION_TTL_HOURS), 1), 72),
    cookieSecure: raw.COOKIE_SECURE,
    cookieDomain: raw.COOKIE_DOMAIN || null,
    serviceToken: raw.SERVICE_TOKEN,
    steamApiKey: raw.STEAM_API_KEY,
    steamCacheTtlSeconds: Math.max(30, Math.trunc(raw.STEAM_CACHE_TTL_SECONDS)),
    discord: {
      clientId: raw.DISCORD_CLIENT_ID,
      clientSecret: raw.DISCORD_OAUTH_CLIENT_SECRET,
      redirectUri:
        raw.DISCORD_OAUTH_REDIRECT_URI ||
        `${apiBaseUrl.replace(/\/$/, '')}/api/auth/discord/callback`,
      guildId,
      allowedGuildIds,
    },
    owners,
    coOwners,
    pcCheckers,
    allowDevLogin: raw.ALLOW_DEV_LOGIN,
    publicConfig: {
      discordInviteUrl: raw.PUBLIC_DISCORD_INVITE_URL,
      supportUrl: raw.PUBLIC_SUPPORT_URL,
      contactEmail: raw.PUBLIC_CONTACT_EMAIL,
      steamGroupUrl: raw.PUBLIC_STEAM_GROUP_URL,
      servers,
      team,
    },
  };
}

const rawBotEnvSchema = z.object({
  NODE_ENV: text('development'),
  LOG_LEVEL: text('info'),
  DISCORD_TOKEN: text(''),
  DISCORD_CLIENT_ID: text(''),
  DISCORD_GUILD_ID: text(''),
  DISCORD_ALLOWED_GUILD_IDS: text(''),
  API_BASE_URL_INTERNAL: text('http://127.0.0.1:8787'),
  SERVICE_TOKEN: text(''),
  DASHBOARD_OWNER_DISCORD_IDS: text(''),
  DASHBOARD_CO_OWNER_DISCORD_IDS: text(''),
  WEB_BASE_URL: text(''),
});

export interface BotEnv {
  nodeEnv: string;
  logLevel: string;
  token: string;
  clientId: string;
  guildId: string;
  allowedGuildIds: string[];
  apiBaseUrl: string;
  serviceToken: string;
  ownerIds: string[];
  coOwnerIds: string[];
  webBaseUrl: string;
}

export function loadBotEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  const raw = rawBotEnvSchema.parse(source);
  if (!raw.DISCORD_TOKEN) {
    throw new Error('DISCORD_TOKEN is required to start the Discord bot.');
  }
  if (!raw.SERVICE_TOKEN) {
    throw new Error('SERVICE_TOKEN is required — the bot must authenticate to the backend API.');
  }
  if (raw.DISCORD_CLIENT_ID && !DISCORD_ID.test(raw.DISCORD_CLIENT_ID)) {
    throw new Error('DISCORD_CLIENT_ID must be a numeric Discord application ID.');
  }
  if (raw.DISCORD_GUILD_ID && !DISCORD_ID.test(raw.DISCORD_GUILD_ID)) {
    throw new Error('DISCORD_GUILD_ID must be a numeric Discord guild ID.');
  }
  const allowedGuildIds = [
    ...(raw.DISCORD_GUILD_ID ? [raw.DISCORD_GUILD_ID] : []),
    ...parseIdList(raw.DISCORD_ALLOWED_GUILD_IDS, 'DISCORD_ALLOWED_GUILD_IDS'),
  ].filter((value, index, all) => all.indexOf(value) === index);

  return {
    nodeEnv: raw.NODE_ENV,
    logLevel: raw.LOG_LEVEL,
    token: raw.DISCORD_TOKEN,
    clientId: raw.DISCORD_CLIENT_ID,
    guildId: raw.DISCORD_GUILD_ID,
    allowedGuildIds,
    apiBaseUrl: raw.API_BASE_URL_INTERNAL.replace(/\/$/, ''),
    serviceToken: raw.SERVICE_TOKEN,
    ownerIds: parseIdList(raw.DASHBOARD_OWNER_DISCORD_IDS, 'DASHBOARD_OWNER_DISCORD_IDS'),
    coOwnerIds: parseIdList(raw.DASHBOARD_CO_OWNER_DISCORD_IDS, 'DASHBOARD_CO_OWNER_DISCORD_IDS'),
    webBaseUrl: raw.WEB_BASE_URL.replace(/\/$/, ''),
  };
}

/** Log-safe summary — never includes secret values. */
export function describeApiEnv(env: ApiEnv): Record<string, string | number | boolean | string[]> {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    database: env.databaseUrl.startsWith('postgres') ? 'postgresql' : 'sqlite',
    serveWeb: env.serveWeb,
    ownersConfigured: env.owners.length,
    coOwnersConfigured: env.coOwners.length,
    pcCheckersConfigured: env.pcCheckers.length,
    oauthConfigured: Boolean(env.discord.clientId && env.discord.clientSecret),
    steamConfigured: Boolean(env.steamApiKey),
    devLogin: env.allowDevLogin,
    webOrigins: env.webOrigins,
  };
}
