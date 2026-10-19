import { afterEach, describe, expect, it } from 'vitest';
import {
  MODERATOR_ID,
  OWNER_ID,
  PC_CHECKER_ID,
  closeTestContext,
  createTestContext,
  devLogin,
  parseAuthCookie,
  type TestContext,
} from '../helpers.js';

let context: TestContext | null = null;

afterEach(async () => {
  if (context) await closeTestContext(context);
  context = null;
});

describe('dashboard authentication and CSRF', () => {
  it('rejects unauthenticated dashboard access', async () => {
    context = await createTestContext();
    const response = await context.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.statusCode).toBe(401);

    const overview = await context.app.inject({ method: 'GET', url: '/api/dashboard/overview' });
    expect(overview.statusCode).toBe(401);
  });

  it('logs in an allowlisted owner and reports the session source honestly', async () => {
    context = await createTestContext();
    const login = await context.app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { discordUserId: OWNER_ID },
    });
    expect(login.statusCode).toBe(200);
    const { cookieHeader } = parseAuthCookie(await devLogin(context.app));
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(me.statusCode).toBe(200);
    const session = me.json().sessionUser;
    expect(session).toMatchObject({
      discordUserId: OWNER_ID,
      accessLevel: 'OWNER',
      source: 'dev',
      guildId: '100000000000000001',
    });
    expect(session.csrfToken.length).toBeGreaterThan(20);
  });

  it('refuses a Discord ID that is not on the allowlist', async () => {
    context = await createTestContext();
    const login = await context.app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { discordUserId: '100000000000000999' },
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().message).toMatch(/allowlist/i);
  });

  it('accepts PC Checker sessions for PC checks but not moderation history', async () => {
    context = await createTestContext();
    const { cookieHeader } = parseAuthCookie(await devLogin(context.app, PC_CHECKER_ID));
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(me.json().sessionUser.accessLevel).toBe('PC_CHECKER');

    const overview = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/overview',
      headers: { cookie: cookieHeader },
    });
    expect(overview.statusCode).toBe(403);

    const pcChecks = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/pc-checks',
      headers: { cookie: cookieHeader },
    });
    expect(pcChecks.statusCode).toBe(200);
  });

  it('enforces the double-submit CSRF token on writes', async () => {
    context = await createTestContext();
    const { cookieHeader, csrfToken } = parseAuthCookie(await devLogin(context.app));

    const withoutToken = await context.app.inject({
      method: 'PATCH',
      url: '/api/dashboard/settings',
      headers: { cookie: cookieHeader },
      payload: { features: { test: true } },
    });
    expect(withoutToken.statusCode).toBe(403);

    const withToken = await context.app.inject({
      method: 'PATCH',
      url: '/api/dashboard/settings',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { features: { test: true } },
    });
    expect(withToken.statusCode).toBe(200);
    expect(withToken.json().settings.features.test).toBe(true);
  });

  it('does not let a co-owner write settings, and never grants access from Discord roles', async () => {
    context = await createTestContext({
      DASHBOARD_CO_OWNER_DISCORD_IDS: MODERATOR_ID,
    });
    const { cookieHeader, csrfToken } = parseAuthCookie(await devLogin(context.app, MODERATOR_ID));
    const settings = await context.app.inject({
      method: 'PATCH',
      url: '/api/dashboard/settings',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { features: { test: true } },
    });
    expect(settings.statusCode).toBe(403);

    const history = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/cases',
      headers: { cookie: cookieHeader },
    });
    expect(history.statusCode).toBe(200);
  });

  it('refuses to revoke environment-allowlisted IDs through the API', async () => {
    context = await createTestContext();
    const { cookieHeader, csrfToken } = parseAuthCookie(await devLogin(context.app));
    const response = await context.app.inject({
      method: 'DELETE',
      url: `/api/dashboard/access/${OWNER_ID}`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/environment/i);
  });

  it('logs out and clears the session', async () => {
    context = await createTestContext();
    const { cookieHeader, csrfToken } = parseAuthCookie(await devLogin(context.app));
    const logout = await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    expect(logout.statusCode).toBe(204);
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(me.statusCode).toBe(401);
  });
});
