import { afterEach, describe, expect, it } from 'vitest';
import {
  createModerationCase,
  getCaseDetail,
  getSteamAccountDetail,
  observeSteamProfile,
  recordBanEvent,
  recordUnbanEvent,
  type Db,
} from '@dardania/db';
import { createTestDb, GUILD_ID, MODERATOR_ID, TARGET_ID } from '../helpers.js';

const STEAM_ID = '76561197960265729';
let db: Db | null = null;

afterEach(async () => {
  if (db) await db.close();
  db = null;
});

const baseCase = {
  guildId: GUILD_ID,
  targetDiscordUserId: TARGET_ID,
  targetUsername: 'old-username',
  targetGlobalName: 'Old Username',
  moderatorDiscordUserId: MODERATOR_ID,
  moderatorName: 'Moderator At Event',
  reason: 'Historical snapshot test',
  occurredAt: '2026-10-19T05:30:00.000Z',
  source: 'BOT_COMMAND',
  attributionStatus: 'VERIFIED' as const,
  steamId64: STEAM_ID,
  steamNameAtEvent: 'NameAtBanTime',
};

describe('immutable moderation snapshots', () => {
  it('preserves the Steam name captured at event time while tracking later names', async () => {
    db = await createTestDb();
    await observeSteamProfile(db, {
      steamId64: STEAM_ID,
      displayName: 'NameAtBanTime',
      profileStatus: 'PUBLIC',
      source: 'TEST',
      checkedAt: '2026-10-19T05:00:00.000Z',
    });

    const created = await createModerationCase(
      db,
      { ...baseCase, actionType: 'BAN', banStatus: 'ACTIVE' },
      '2026-10-19T05:31:00.000Z',
    );
    expect(created.caseRef).toBe('DE-000001');
    expect(created.steamAtEvent.name).toBe('NameAtBanTime');
    expect(created.target.usernameAtEvent).toBe('old-username');
    expect(created.moderator.discordUserId).toBe(MODERATOR_ID);

    // The player renames after the case was recorded.
    await observeSteamProfile(db, {
      steamId64: STEAM_ID,
      displayName: 'RenamedAfterTheBan',
      profileStatus: 'PUBLIC',
      source: 'TEST',
      checkedAt: '2026-10-19T09:00:00.000Z',
    });

    const detail = await getCaseDetail(db, GUILD_ID, created.caseRef);
    expect(detail?.steamAtEvent.name).toBe('NameAtBanTime');
    expect(detail?.steamCurrent?.displayName).toBe('RenamedAfterTheBan');
    expect(detail?.target.usernameAtEvent).toBe('old-username');

    const account = await getSteamAccountDetail(db, STEAM_ID);
    expect(account?.currentDisplayName).toBe('RenamedAfterTheBan');
    const names = account?.nameHistory.map((row) => row.displayName);
    expect(names).toContain('NameAtBanTime');
    expect(names).toContain('RenamedAfterTheBan');
    expect(account?.moderationCaseCount).toBe(1);
  });

  it('keeps the moderator explicitly unknown when the audit log could not confirm one', async () => {
    db = await createTestDb();
    const created = await createModerationCase(
      db,
      {
        ...baseCase,
        actionType: 'BAN',
        banStatus: 'UNKNOWN',
        moderatorDiscordUserId: null,
        moderatorName: null,
        attributionStatus: 'UNKNOWN',
        source: 'GATEWAY_AUDIT_LOG',
      },
      '2026-10-19T06:00:00.000Z',
    );
    expect(created.moderator.discordUserId).toBeNull();
    expect(created.moderator.nameAtEvent).toBeNull();
    expect(created.attributionStatus).toBe('UNKNOWN');
    expect(created.status).toBe('UNKNOWN');
  });

  it('records an unban as a new case and leaves the original ban intact', async () => {
    db = await createTestDb();
    const ban = await recordBanEvent(
      db,
      { ...baseCase, dedupeKey: 'ban:test:1', banStatus: 'ACTIVE' },
      '2026-10-19T05:31:00.000Z',
    );
    expect(ban.case.actionType).toBe('BAN');

    const unban = await recordUnbanEvent(
      db,
      {
        ...baseCase,
        reason: 'Appeal accepted.',
        steamNameAtEvent: 'NameAtBanTime',
        dedupeKey: 'unban:test:1',
        occurredAt: '2026-10-19T07:00:00.000Z',
      },
      '2026-10-19T07:01:00.000Z',
    );
    expect(unban.case.caseRef).not.toBe(ban.case.caseRef);
    expect(unban.relatedCaseRef).toBe(ban.case.caseRef);

    const original = await getCaseDetail(db, GUILD_ID, ban.case.caseRef);
    expect(original?.reason).toBe('Historical snapshot test');
    expect(original?.banStatus).toBe('LIFTED');
    expect(original?.relatedCases.some((row) => row.caseRef === unban.case.caseRef)).toBe(true);
  });

  it('is idempotent for the same Discord event', async () => {
    db = await createTestDb();
    const first = await recordBanEvent(
      db,
      { ...baseCase, dedupeKey: 'ban:test:2', banStatus: 'ACTIVE' },
      '2026-10-19T05:31:00.000Z',
    );
    const second = await recordBanEvent(
      db,
      { ...baseCase, dedupeKey: 'ban:test:2', banStatus: 'ACTIVE' },
      '2026-10-19T05:32:00.000Z',
    );
    expect(second.duplicate).toBe(true);
    expect(second.case.caseRef).toBe(first.case.caseRef);
  });
});
