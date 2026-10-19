import { describe, expect, it } from 'vitest';
import { parseIdList } from '@dardania/shared/env';
import { loadApiEnv, loadBotEnv } from '@dardania/shared/env';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/dardania',
  SESSION_SECRET: 'x'.repeat(48),
  SERVICE_TOKEN: 'service-token-value-1234567890',
  DASHBOARD_OWNER_DISCORD_IDS: '100000000000000001',
  DISCORD_GUILD_ID: '100000000000000002',
  COOKIE_SECURE: 'true',
};

describe('environment validation', () => {
  it('parses comma/space separated Discord IDs and rejects usernames', () => {
    expect(parseIdList('100000000000000001,100000000000000002 100000000000000003', 'test')).toEqual(
      ['100000000000000001', '100000000000000002', '100000000000000003'],
    );
    expect(() => parseIdList('someone#0001', 'test')).toThrow(/invalid Discord user IDs/);
    expect(parseIdList('', 'test')).toEqual([]);
    expect(parseIdList(undefined, 'test')).toEqual([]);
  });

  it('accepts a complete production configuration', () => {
    const env = loadApiEnv({
      ...base,
      WEB_ORIGIN: 'https://example.com,https://www.example.com',
    });
    expect(env.isProduction).toBe(true);
    expect(env.cookieSecure).toBe(true);
    expect(env.owners).toEqual(['100000000000000001']);
    expect(env.webOrigins).toEqual(['https://example.com', 'https://www.example.com']);
    expect(env.discord.allowedGuildIds).toEqual(['100000000000000002']);
  });

  it('refuses unsafe production settings', () => {
    expect(() => loadApiEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => loadApiEnv({ ...base, DASHBOARD_OWNER_DISCORD_IDS: '' })).toThrow(/owner/i);
    expect(() => loadApiEnv({ ...base, ALLOW_DEV_LOGIN: 'true' })).toThrow(/ALLOW_DEV_LOGIN/);
    expect(() => loadApiEnv({ ...base, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadApiEnv({ ...base, DATABASE_URL: 'sqlite:./dev.sqlite' })).toThrow(
      /PostgreSQL/,
    );
    expect(() => loadApiEnv({ ...base, DASHBOARD_OWNER_DISCORD_IDS: 'a-username' })).toThrow(
      /numeric snowflakes/,
    );
  });

  it('allows the documented development defaults', () => {
    const env = loadApiEnv({ NODE_ENV: 'development' });
    expect(env.isProduction).toBe(false);
    expect(env.databaseUrl).toBe('sqlite:./data/dev.sqlite');
    expect(env.webOrigins).toContain('http://localhost:5173');
    expect(env.publicConfig.servers).toEqual([]);
    expect(env.publicConfig.team).toEqual([]);
  });

  it('parses the public server list and rejects malformed JSON', () => {
    const env = loadApiEnv({
      NODE_ENV: 'development',
      PUBLIC_SERVERS: JSON.stringify([
        { label: 'Dardania | Elite • Retake', connect: '1.2.3.4:27015' },
      ]),
    });
    expect(env.publicConfig.servers[0]).toEqual({
      label: 'Dardania | Elite • Retake',
      connect: '1.2.3.4:27015',
    });
    expect(() => loadApiEnv({ NODE_ENV: 'development', PUBLIC_SERVERS: 'nope' })).toThrow(
      /PUBLIC_SERVERS/,
    );
    expect(() =>
      loadApiEnv({ NODE_ENV: 'development', PUBLIC_SERVERS: '[{"label":"x"}]' }),
    ).toThrow(/PUBLIC_SERVERS/);
  });

  it('requires a bot token and service token for the bot', () => {
    expect(() => loadBotEnv({})).toThrow(/DISCORD_TOKEN/);
    expect(() => loadBotEnv({ DISCORD_TOKEN: 'token' })).toThrow(/SERVICE_TOKEN/);
    const env = loadBotEnv({
      DISCORD_TOKEN: 'token',
      SERVICE_TOKEN: 'service',
      DISCORD_GUILD_ID: '100000000000000001',
      API_BASE_URL_INTERNAL: 'http://127.0.0.1:8787/',
    });
    expect(env.apiBaseUrl).toBe('http://127.0.0.1:8787');
    expect(env.allowedGuildIds).toEqual(['100000000000000001']);
    expect(env.token).toBe('token');
  });
});
