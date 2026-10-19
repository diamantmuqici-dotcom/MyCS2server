import { afterEach, describe, expect, it } from 'vitest';
import { observeSteamProfile } from '@dardania/db';
import {
  GUILD_ID,
  MODERATOR_ID,
  OWNER_ID,
  SERVICE_HEADERS,
  TARGET_ID,
  closeTestContext,
  createTestContext,
  devLogin,
  parseAuthCookie,
  type TestContext,
} from '../helpers.js';

const STEAM_ID = '76561197960265729';
let context: TestContext | null = null;

afterEach(async () => {
  if (context) await closeTestContext(context);
  context = null;
});

function banPayload(overrides: Record<string, unknown> = {}) {
  return {
    guildId: GUILD_ID,
    guildName: 'Dardania | Elite',
    actionType: 'BAN',
    target: { id: TARGET_ID, username: 'cheater_account', globalName: 'Cheater Account' },
    moderator: { id: MODERATOR_ID, name: 'Moderator One' },
    reason: 'Aim assist confirmed during a recorded PC check.',
    occurredAt: '2026-10-19T05:00:00.000Z',
    source: 'BOT_COMMAND',
    dedupeKey: 'ban:cmd:interaction-1',
    attributionStatus: 'VERIFIED',
    attributionEvidence: { interactionId: 'interaction-1' },
    steamId64: STEAM_ID,
    steamInput: STEAM_ID,
    banStatus: 'ACTIVE',
    ...overrides,
  };
}

async function ingest(payload: Record<string, unknown>) {
  if (!context) throw new Error('no context');
  return context.app.inject({
    method: 'POST',
    url: '/api/internal/moderation-events',
    headers: SERVICE_HEADERS,
    payload,
  });
}

describe('moderation ingestion and historical accuracy', () => {
  it('rejects internal calls without the service token', async () => {
    context = await createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/internal/moderation-events',
      payload: banPayload(),
    });
    expect(response.statusCode).toBe(401);
  });

  it('records a ban with a case reference and a Steam snapshot', async () => {
    context = await createTestContext();
    const before = await observeSteamProfile(context.db, {
      steamId64: STEAM_ID,
      displayName: 'AimEnjoyer',
      profileStatus: 'PUBLIC',
      source: 'TEST',
      checkedAt: '2026-10-19T04:00:00.000Z',
    });
    expect(before.changed).toBe(false);

    const response = await ingest(banPayload());
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.caseRef).toBe('DE-000001');
    expect(body.duplicate).toBe(false);
    expect(body.steamId64).toBe(STEAM_ID);
    expect(body.steamNameAtEvent).toBe('AimEnjoyer');
  });

  it('deduplicates the same Discord action', async () => {
    context = await createTestContext();
    const first = await ingest(banPayload());
    const second = await ingest(banPayload());
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().caseRef).toBe(first.json().caseRef);
  });

  it('never rewrites a historical Steam name when the account is renamed', async () => {
    context = await createTestContext();
    await observeSteamProfile(context.db, {
      steamId64: STEAM_ID,
      displayName: 'NameAtBanTime',
      profileStatus: 'PUBLIC',
      source: 'TEST',
      checkedAt: '2026-10-19T04:00:00.000Z',
    });
    await ingest(banPayload());

    await observeSteamProfile(context.db, {
      steamId64: STEAM_ID,
      displayName: 'RenamedAfterBan',
      profileStatus: 'PUBLIC',
      source: 'TEST',
      checkedAt: '2026-10-19T09:00:00.000Z',
    });

    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/internal/cases/DE-000001?guildId=${GUILD_ID}`,
      headers: SERVICE_HEADERS,
    });
    const record = detail.json().case;
    expect(record.steamAtEvent.name).toBe('NameAtBanTime');
    expect(record.steamCurrent.displayName).toBe('RenamedAfterBan');
  });

  it('records an unban as a new linked case and keeps the original ban', async () => {
    context = await createTestContext();
    const ban = await ingest(banPayload());
    const banRef = ban.json().caseRef as string;

    const unban = await ingest(
      banPayload({
        actionType: 'UNBAN',
        banStatus: 'LIFTED',
        reason: 'Appeal accepted after review.',
        dedupeKey: 'unban:cmd:interaction-2',
        occurredAt: '2026-10-19T06:00:00.000Z',
      }),
    );
    expect(unban.statusCode).toBe(200);
    const body = unban.json();
    expect(body.caseRef).toBe('DE-000002');
    expect(body.relatedCaseRef).toBe(banRef);

    const original = await context.app.inject({
      method: 'GET',
      url: `/api/internal/cases/${banRef}?guildId=${GUILD_ID}`,
      headers: SERVICE_HEADERS,
    });
    const record = original.json().case;
    expect(record.reason).toMatch(/Aim assist/);
    expect(record.banStatus).toBe('LIFTED');
    expect(
      record.relatedCases.some((relation: { caseRef: string }) => relation.caseRef === 'DE-000002'),
    ).toBe(true);
  });

  it('refuses to ingest data for a different guild', async () => {
    context = await createTestContext();
    const response = await ingest(banPayload({ guildId: '100000000000000777' }));
    expect(response.statusCode).toBe(403);
  });

  it('serves the attributed case to the owner dashboard with warnings and audit data', async () => {
    context = await createTestContext();
    await ingest(banPayload());
    await ingest(
      banPayload({
        actionType: 'WARN',
        banStatus: undefined,
        dedupeKey: 'warn:cmd:interaction-3',
        reason: 'Team damage.',
        occurredAt: '2026-10-19T05:30:00.000Z',
      }),
    );

    const { cookieHeader, csrfToken } = parseAuthCookie(await devLogin(context.app));
    const overview = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/overview',
      headers: { cookie: cookieHeader },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().totals).toMatchObject({
      cases: 2,
      banActions: 1,
      activeBans: 1,
      warnings: 1,
    });

    const cases = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/cases?q=Aim%20assist',
      headers: { cookie: cookieHeader },
    });
    expect(cases.statusCode).toBe(200);
    expect(cases.json().total).toBe(1);

    const detail = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/cases/DE-000001',
      headers: { cookie: cookieHeader },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().case.moderation).toBeUndefined();

    const correction = await context.app.inject({
      method: 'PATCH',
      url: '/api/dashboard/cases/DE-000001',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        moderatorDiscordUserId: OWNER_ID,
        moderatorName: 'Owner Corrected',
        correctionNote: 'Audit log shows the owner executed this action.',
      },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().case.moderator.discordUserId).toBe(OWNER_ID);

    const audit = await context.app.inject({
      method: 'GET',
      url: '/api/dashboard/audit-log?action=case.corrected',
      headers: { cookie: cookieHeader },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThanOrEqual(1);
  });
});
