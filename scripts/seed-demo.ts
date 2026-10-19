import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { loadApiEnv } from '@dardania/shared/env';
import {
  createAnnouncement,
  createDb,
  createModerationCase,
  createPcCheck,
  ensureSteamAccount,
  linkSteamAccount,
  migrate,
  observeSteamProfile,
  publishAnnouncement,
  upsertGuild,
} from '@dardania/db';

/**
 * Inserts clearly-labelled SYNTHETIC demo data (source = DEMO_SEED) so the
 * dashboard and website can be reviewed without touching real moderation data.
 * It refuses to run in production and refuses to run twice.
 */
const DEMO_GUILD = '100000000000000001';
const MODERATOR = { id: '100000000000000010', name: 'Demo Moderator' };
const STEAM_ID = '76561197960265729';

async function main(): Promise<void> {
  const env = loadApiEnv();
  if (env.isProduction) {
    throw new Error('Refusing to seed demo data in production. Set NODE_ENV=development.');
  }
  const guildId = env.discord.guildId || DEMO_GUILD;
  const db = await createDb(env.databaseUrl);
  try {
    await migrate(db, fileURLToPath(new URL('../packages/db/migrations', import.meta.url)));

    const existing = await db.get<{ total: number | string }>(
      'SELECT COUNT(*) AS total FROM moderation_cases WHERE source = ?',
      ['DEMO_SEED'],
    );
    if (Number(existing?.total ?? 0) > 0) {
      console.log('[seed] demo data already present — nothing to do.');
      return;
    }

    const now = new Date().toISOString();
    await upsertGuild(db, { id: guildId, name: 'Dardania | Elite (demo guild)' }, now);

    await ensureSteamAccount(db, { steamId64: STEAM_ID, now });
    await observeSteamProfile(db, {
      steamId64: STEAM_ID,
      displayName: 'AimEnjoyer',
      avatarUrl: null,
      profileStatus: 'PUBLIC',
      source: 'DEMO_SEED',
      checkedAt: new Date(Date.now() - 86_400_000 * 20).toISOString(),
    });
    await observeSteamProfile(db, {
      steamId64: STEAM_ID,
      displayName: 'Renamed Later',
      avatarUrl: null,
      profileStatus: 'PUBLIC',
      source: 'DEMO_SEED',
      checkedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    });
    await linkSteamAccount(db, {
      steamId64: STEAM_ID,
      discordUserId: '100000000000000101',
      linkedBy: MODERATOR.id,
      source: 'DEMO_SEED',
      verification: 'UNVERIFIED',
      now,
    });

    const ban = await createModerationCase(
      db,
      {
        guildId,
        actionType: 'BAN',
        status: 'ACTIVE',
        banStatus: 'ACTIVE',
        targetDiscordUserId: '100000000000000101',
        targetUsername: 'demo_target',
        targetGlobalName: 'Demo Target',
        moderatorDiscordUserId: MODERATOR.id,
        moderatorName: MODERATOR.name,
        reason: 'SYNTHETIC DEMO RECORD — cheating confirmed by a demo PC check.',
        occurredAt: new Date(Date.now() - 86_400_000 * 18).toISOString(),
        source: 'DEMO_SEED',
        attributionStatus: 'VERIFIED',
        attributionEvidence: { note: 'Synthetic demo data, not a real moderation action.' },
        steamId64: STEAM_ID,
        steamNameAtEvent: 'AimEnjoyer',
        steamProfileUrlAtEvent: `https://steamcommunity.com/profiles/${STEAM_ID}`,
        steamNameSource: 'DEMO_SEED',
      },
      now,
    );

    await createModerationCase(
      db,
      {
        guildId,
        actionType: 'WARN',
        status: 'COMPLETED',
        targetDiscordUserId: '100000000000000102',
        targetUsername: 'demo_warned',
        targetGlobalName: 'Demo Warned',
        moderatorDiscordUserId: MODERATOR.id,
        moderatorName: MODERATOR.name,
        reason: 'SYNTHETIC DEMO RECORD — repeated team damage.',
        occurredAt: new Date(Date.now() - 86_400_000 * 10).toISOString(),
        source: 'DEMO_SEED',
        attributionStatus: 'VERIFIED',
      },
      now,
    );

    await createModerationCase(
      db,
      {
        guildId,
        actionType: 'UNBAN',
        status: 'COMPLETED',
        banStatus: 'LIFTED',
        relatedCaseId: ban.id,
        targetDiscordUserId: '100000000000000101',
        targetUsername: 'demo_target',
        targetGlobalName: 'Demo Target',
        moderatorDiscordUserId: MODERATOR.id,
        moderatorName: MODERATOR.name,
        reason: 'SYNTHETIC DEMO RECORD — appeal accepted; the original ban stays in history.',
        occurredAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        source: 'DEMO_SEED',
        attributionStatus: 'VERIFIED',
      },
      now,
    );

    await createModerationCase(
      db,
      {
        guildId,
        actionType: 'BAN',
        status: 'UNKNOWN',
        banStatus: 'UNKNOWN',
        targetDiscordUserId: '100000000000000103',
        targetUsername: 'demo_unknown',
        moderatorDiscordUserId: null,
        moderatorName: null,
        reason: 'SYNTHETIC DEMO RECORD — imported from an audit log entry with no matching moderator.',
        occurredAt: new Date(Date.now() - 86_400_000 * 6).toISOString(),
        source: 'DEMO_SEED',
        attributionStatus: 'UNKNOWN',
        attributionEvidence: { note: 'Deliberately unattributed to demonstrate that the dashboard never guesses.' },
      },
      now,
    );

    const pc = await createPcCheck(
      db,
      {
        guildId,
        targetDiscordUserId: '100000000000000104',
        steamId64: STEAM_ID,
        steamNameAtEvent: 'Renamed Later',
        requestedBy: MODERATOR.id,
        assignedTo: MODERATOR.id,
        reason: 'SYNTHETIC DEMO RECORD — suspicious demo demo.',
      },
      now,
    );
    await db.run('UPDATE pc_check_cases SET status = ? WHERE id = ?', ['COMPLETED', pc.id]);

    const announcement = await createAnnouncement(
      db,
      {
        guildId,
        title: 'Demo announcement (synthetic data)',
        body:
          'This announcement exists only to demonstrate the dashboard and website. It is labelled as demo ' +
          'data in the database (source DEMO_SEED) and should be removed before launch.',
        category: 'GENERAL',
        authorDiscordId: MODERATOR.id,
        authorName: 'Demo Moderator',
      },
      now,
    );
    await publishAnnouncement(db, { id: announcement.id, guildId, actorDiscordId: MODERATOR.id }, now);

    console.log('[seed] demo data created:');
    console.log('  ban case  :', ban.caseRef);
    console.log('  pc check  :', pc.caseRef);
    console.log('  announce  :', announcement.slug);
    console.log('Every record is marked source=DEMO_SEED and must not be presented as real history.');
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('[fatal] demo seed failed:', error);
  process.exit(1);
});
