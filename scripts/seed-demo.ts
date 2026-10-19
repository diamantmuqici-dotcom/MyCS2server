#!/usr/bin/env tsx
/**
 * Seeds clearly-labelled demonstration data into a development database.
 *
 * Every record created here uses source `DEMO_SEED` so the dashboard and the API
 * can flag it. Nothing here invents live state: no player counts, no bot
 * heartbeat, no fake Discord messages.
 *
 * Refuses to run in production and refuses to touch a database that already
 * contains moderation cases unless `--force` is passed.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import {
  createAnnouncement,
  createDb,
  createModerationCase,
  createPcCheck,
  migrate,
  observeSteamProfile,
  publishAnnouncement,
  recordServiceHealth,
  recordUnbanEvent,
  updatePcCheck,
  addPcCheckNote,
  upsertGuild,
} from '@dardania/db';
import { nowIso } from '@dardania/shared';
import { loadApiEnv } from '@dardania/shared/env';

const env = loadApiEnv();
if (env.isProduction) {
  console.error('Refusing to seed demo data in production (NODE_ENV=production).');
  process.exit(1);
}
if (!env.discord.guildId) {
  console.error('DISCORD_GUILD_ID must be set so demo records have a real guild scope.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const db = await createDb(env.databaseUrl);
const now = nowIso();
const guildId = env.discord.guildId;

try {
  await migrate(db, fileURLToPath(new URL('../packages/db/migrations', import.meta.url)));

  const existing = await db.get<{ total: number | string }>(
    'SELECT COUNT(*) AS total FROM moderation_cases',
  );
  if (Number(existing?.total ?? 0) > 0 && !force) {
    console.error(
      'The database already contains moderation cases. Pass --force to seed demo rows anyway.',
    );
    process.exit(2);
  }

  await upsertGuild(db, { id: guildId, name: 'Dardania | Elite (demo seed)' }, now);

  // Steam identities are synthetic IDs inside the valid individual range.
  const steamA = '76561198000000001';
  const steamB = '76561198000000002';
  await observeSteamProfile(db, {
    steamId64: steamA,
    displayName: 'DemoPlayerOne',
    profileStatus: 'PUBLIC',
    source: 'DEMO_SEED',
    checkedAt: now,
  });
  await observeSteamProfile(db, {
    steamId64: steamB,
    displayName: 'DemoPlayerTwo',
    profileStatus: 'PRIVATE',
    source: 'DEMO_SEED',
    checkedAt: now,
  });

  const ban = await createModerationCase(
    db,
    {
      guildId,
      actionType: 'BAN',
      banStatus: 'ACTIVE',
      status: 'ACTIVE',
      targetDiscordUserId: '100000000000000201',
      targetUsername: 'demo-target-one',
      targetGlobalName: 'Demo Target One',
      moderatorDiscordUserId: env.owners[0] ?? '100000000000000010',
      moderatorName: 'Demo Owner',
      reason: 'DEMO DATA — illustrative permanent ban for a recorded PC check.',
      occurredAt: '2026-09-28T18:10:00.000Z',
      source: 'DEMO_SEED',
      attributionStatus: 'VERIFIED',
      steamId64: steamA,
      steamNameAtEvent: 'DemoPlayerOne',
      steamNameSource: 'DEMO_SEED',
    },
    now,
  );

  const secondBan = await createModerationCase(
    db,
    {
      guildId,
      actionType: 'BAN',
      banStatus: 'ACTIVE',
      status: 'ACTIVE',
      targetDiscordUserId: '100000000000000202',
      targetUsername: 'demo-target-two',
      moderatorDiscordUserId: null,
      moderatorName: null,
      reason: 'DEMO DATA — imported ban with unknown attribution (audit log unavailable).',
      occurredAt: '2026-09-30T20:00:00.000Z',
      source: 'DEMO_SEED',
      attributionStatus: 'UNKNOWN',
    },
    now,
  );

  const unban = await recordUnbanEvent(
    db,
    {
      guildId,
      targetDiscordUserId: '100000000000000201',
      targetUsername: 'demo-target-one',
      moderatorDiscordUserId: env.coOwners[0] ?? env.owners[0] ?? '100000000000000011',
      moderatorName: 'Demo Co-Owner',
      reason: 'DEMO DATA — appeal accepted after review.',
      occurredAt: '2026-10-02T12:00:00.000Z',
      source: 'DEMO_SEED',
      attributionStatus: 'VERIFIED',
      dedupeKey: 'demo-seed:unban:1',
      relatedBanCaseId: ban.id,
    },
    now,
  );

  await createModerationCase(
    db,
    {
      guildId,
      actionType: 'WARN',
      targetDiscordUserId: '100000000000000203',
      targetUsername: 'demo-target-three',
      moderatorDiscordUserId: env.owners[0] ?? '100000000000000010',
      moderatorName: 'Demo Owner',
      reason: 'DEMO DATA — warning for repeated team damage.',
      occurredAt: '2026-10-05T16:40:00.000Z',
      source: 'DEMO_SEED',
      attributionStatus: 'VERIFIED',
    },
    now,
  );

  const pc = await createPcCheck(
    db,
    {
      guildId,
      targetDiscordUserId: '100000000000000202',
      steamId64: steamB,
      steamNameAtEvent: 'DemoPlayerTwo',
      requestedBy: env.owners[0] ?? '100000000000000010',
      reason: 'DEMO DATA — recorded PC check requested after a demo review.',
    },
    now,
  );
  await updatePcCheck(
    db,
    {
      id: pc.id,
      status: 'IN_PROGRESS',
      assignedTo: env.pcCheckers[0] ?? null,
    },
    now,
  );
  await addPcCheckNote(
    db,
    {
      pcCheckId: pc.id,
      authorDiscordId: env.owners[0] ?? '100000000000000010',
      authorName: 'Demo Owner',
      note: 'DEMO DATA — synthetic note.',
      visibility: 'STAFF',
    },
    now,
  );

  const announcement = await createAnnouncement(
    db,
    {
      guildId,
      title: 'Demo announcement — synthetic data',
      body: 'This announcement exists only to demonstrate the layout. Delete it (and all DEMO_SEED rows) before launch.',
      category: 'GENERAL',
      authorDiscordId: env.owners[0] ?? '100000000000000010',
      authorName: 'Demo Owner',
    },
    now,
  );
  await publishAnnouncement(
    db,
    {
      id: announcement.id,
      guildId,
      actorDiscordId: env.owners[0] ?? '100000000000000010',
    },
    now,
  );

  // Only true statements about this machine: no fake bot heartbeat.
  await recordServiceHealth(db, 'api', 'operational', 'Recorded by the demo seed script.', now);
  await recordServiceHealth(
    db,
    'database',
    'operational',
    'Recorded by the demo seed script.',
    now,
  );
  await recordServiceHealth(
    db,
    'bot',
    'unknown',
    'Demo seed did not start the bot, so no heartbeat exists.',
    now,
  );
  await recordServiceHealth(
    db,
    'discord',
    'unknown',
    'Demo seed did not connect to Discord, so gateway state is unknown.',
    now,
  );

  console.log('Demo seed complete (all rows are source=DEMO_SEED):');
  console.log(`  ban case            ${ban.caseRef}`);
  console.log(`  unattributed case   ${secondBan.caseRef}`);
  console.log(`  unban case          ${unban.case.caseRef} (linked to ${ban.caseRef})`);
  console.log(`  PC check            ${pc.caseRef}`);
  console.log(`  announcement        /announcements/${announcement.slug}`);
  console.log('');
  console.log(
    'Remove before launch: delete rows where source = DEMO_SEED and the demo announcement.',
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Demo seed failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
