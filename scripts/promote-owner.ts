#!/usr/bin/env tsx
/**
 * Grants dashboard access to a Discord user ID without editing environment
 * variables or redeploying. The grant is written to the database, audited by the
 * API, and can be revoked from the dashboard.
 *
 * Usage: npm run db:promote-owner -- <discord-user-id> [--level CO_OWNER]
 */
import 'dotenv/config';
import { createDb, grantAccess, listActiveAccess, upsertGuild } from '@dardania/db';
import { nowIso, isAccessLevel, type AccessLevel } from '@dardania/shared';
import { loadApiEnv } from '@dardania/shared/env';

const env = loadApiEnv();
if (!env.discord.guildId) {
  console.error('DISCORD_GUILD_ID must be set.');
  process.exit(1);
}

const args = process.argv.slice(2);
const userId = args.find((arg) => /^\d{17,20}$/.test(arg));
const levelArg = args.find((arg) => arg.startsWith('--level='))?.split('=')[1];
const level: AccessLevel = isAccessLevel(levelArg) ? levelArg : 'OWNER';

if (!userId) {
  console.error(
    'Usage: npm run db:promote-owner -- <discord-user-id> [--level=OWNER|CO_OWNER|PC_CHECKER]',
  );
  const existing = await (async () => {
    const db = await createDb(env.databaseUrl);
    try {
      return await listActiveAccess(db, env.discord.guildId!);
    } finally {
      await db.close();
    }
  })();
  console.error(
    existing.length === 0
      ? 'No database grants exist yet. The environment allowlist is still enforced.'
      : `Existing grants: ${existing.map((row) => `${row.userDiscordId} (${row.level})`).join(', ')}`,
  );
  process.exit(1);
}

const db = await createDb(env.databaseUrl);
try {
  const now = nowIso();
  await upsertGuild(db, { id: env.discord.guildId, name: 'Dardania | Elite' }, now);
  const grant = await grantAccess(
    db,
    {
      guildId: env.discord.guildId,
      userId,
      level,
      grantedBy: 'cli:promote-owner',
      note: 'Granted from the local CLI.',
    },
    now,
  );
  console.log(`Granted ${grant.level} dashboard access to ${grant.userDiscordId}.`);
  console.log(
    'Remove this grant from the dashboard (Settings → Access) when it is no longer needed.',
  );
} finally {
  await db.close();
}
