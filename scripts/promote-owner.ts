import 'dotenv/config';
import { loadApiEnv } from '@dardania/shared/env';
import { createDb, getActiveAccess, grantAccess, recordAuditEvent } from '@dardania/db';

/**
 * Grants dashboard OWNER access to a Discord user ID.
 *
 * The environment allowlist (DASHBOARD_OWNER_DISCORD_IDS) always applies and is
 * the recommended path; this script exists for bootstrapping without editing
 * production secrets.
 *
 * Usage: npm run db:promote-owner -- <discordUserId>
 */
async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();
  if (!userId || !/^\d{17,20}$/.test(userId)) {
    throw new Error('Usage: npm run db:promote-owner -- <discordUserId> (17-20 digit snowflake)');
  }
  const env = loadApiEnv();
  if (!env.discord.guildId) throw new Error('DISCORD_GUILD_ID must be configured.');
  const db = await createDb(env.databaseUrl);
  try {
    const now = new Date().toISOString();
    const previous = await getActiveAccess(db, env.discord.guildId, userId);
    const granted = await grantAccess(
      db,
      {
        guildId: env.discord.guildId,
        userId,
        level: 'OWNER',
        grantedBy: 'promote-owner-script',
        note: 'Bootstrap grant from scripts/promote-owner.ts',
      },
      now,
    );
    await recordAuditEvent(
      db,
      {
        guildId: env.discord.guildId,
        actorType: 'SYSTEM',
        action: 'access.bootstrap_owner',
        entityType: 'dashboard_access',
        entityId: userId,
        summary: `OWNER dashboard access bootstrap-granted to ${userId}.`,
        before: previous ? { level: previous.level } : null,
        after: { level: granted.level },
      },
      now,
    );
    console.log(`[access] ${userId} now has ${granted.level} dashboard access in ${env.discord.guildId}.`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('[fatal] promote-owner failed:', error);
  process.exit(1);
});
