import { afterEach, describe, expect, it } from 'vitest';
import { closeTestContext, createTestContext, type TestContext } from '../helpers.js';

let context: TestContext | null = null;

afterEach(async () => {
  if (context) await closeTestContext(context);
  context = null;
});

describe('public API', () => {
  it('reports health and an empty, honest configuration', async () => {
    context = await createTestContext({
      PUBLIC_SERVERS: '[]',
      PUBLIC_TEAM_JSON: '[]',
      PUBLIC_DISCORD_INVITE_URL: 'https://discord.gg/MsT96sPS3e',
    });
    const health = await context.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });

    const config = await context.app.inject({ method: 'GET', url: '/api/config' });
    expect(config.statusCode).toBe(200);
    const body = config.json();
    expect(body.brandName).toBe('Dardania | Elite');
    expect(body.discordInviteUrl).toBe('https://discord.gg/MsT96sPS3e');
    expect(body.servers).toEqual([]);
    expect(body.team).toEqual([]);
    expect(body.announcements).toEqual([]);
    expect(body.rulesVersion).toMatch(/^\d{4}\.\d+$/);
  });

  it('serves configured server labels without inventing player counts', async () => {
    context = await createTestContext({
      PUBLIC_SERVERS: JSON.stringify([
        { label: 'Dardania | Elite • Retake', connect: '127.0.0.1:1' },
      ]),
    });
    const config = await context.app.inject({ method: 'GET', url: '/api/config' });
    expect(config.json().servers).toEqual([
      { label: 'Dardania | Elite • Retake', connect: '127.0.0.1:1' },
    ]);

    const servers = await context.app.inject({ method: 'GET', url: '/api/servers' });
    expect(servers.statusCode).toBe(200);
    const body = servers.json() as { servers: { status: string; players: number | null }[] };
    expect(body.servers).toHaveLength(1);
    expect(['OFFLINE', 'UNKNOWN']).toContain(body.servers[0]!.status);
    expect(body.servers[0]!.players).toBeNull();
  });

  it('reports database health and an unknown bot rather than a fake heartbeat', async () => {
    context = await createTestContext();
    const status = await context.app.inject({ method: 'GET', url: '/api/status' });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body.databaseConnected).toBe(true);
    expect(body.botConnected).toBe(false);
    const bot = body.services.find((service: { service: string }) => service.service === 'bot');
    expect(bot.status).toBe('unknown');
    expect(bot.detail).toMatch(/heartbeat/i);
  });

  it('returns an empty announcement list and a JSON 404 for unknown routes', async () => {
    context = await createTestContext();
    const list = await context.app.inject({ method: 'GET', url: '/api/announcements' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 0, items: [] });

    const missing = await context.app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'not_found' });
  });
});
