import { randomUUID } from 'node:crypto';
import type { ModerationCaseDto } from '@dardania/shared';
import type { Db } from '../client.js';
import { createModerationCase, type CaseSnapshotInput } from './cases.js';
import type { WarningRow } from '../rows.js';

export interface RecordWarningInput extends CaseSnapshotInput {
  dedupeKey?: string | null;
}

export async function recordWarning(
  db: Db,
  input: RecordWarningInput,
  now: string,
): Promise<{ case: ModerationCaseDto; warningId: string }> {
  return db.transaction(async (tx) => {
    const created = await createModerationCase(
      tx,
      { ...input, actionType: 'WARN', status: 'COMPLETED', banStatus: null },
      now,
    );
    const warningId = randomUUID();
    await tx.run(
      `INSERT INTO warnings
        (id, guild_id, case_id, target_discord_user_id, moderator_discord_user_id,
         moderator_name_at_event, reason, created_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '1')`,
      [
        warningId,
        input.guildId,
        created.id,
        input.targetDiscordUserId,
        input.moderatorDiscordUserId ?? null,
        input.moderatorName ?? null,
        input.reason ?? null,
        now,
      ],
    );
    return { case: created, warningId };
  });
}

export async function listActiveWarnings(
  db: Db,
  guildId: string,
  targetDiscordUserId: string,
): Promise<WarningRow[]> {
  return db.all<WarningRow>(
    `SELECT * FROM warnings
     WHERE guild_id = ? AND target_discord_user_id = ? AND active = '1'
     ORDER BY created_at ASC`,
    [guildId, targetDiscordUserId],
  );
}

export async function countActiveWarnings(
  db: Db,
  guildId: string,
  targetDiscordUserId: string,
): Promise<number> {
  const row = await db.get<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM warnings
     WHERE guild_id = ? AND target_discord_user_id = ? AND active = '1'`,
    [guildId, targetDiscordUserId],
  );
  return Number(row?.total ?? 0);
}

export async function clearWarnings(
  db: Db,
  input: {
    guildId: string;
    targetDiscordUserId: string;
    moderatorDiscordUserId: string;
    moderatorName?: string | null;
    reason?: string | null;
    targetUsername?: string | null;
    targetGlobalName?: string | null;
    steamId64?: string | null;
    steamNameAtEvent?: string | null;
    source: string;
  },
  now: string,
): Promise<{ cleared: number; case: ModerationCaseDto | null }> {
  return db.transaction(async (tx) => {
    const active = await listActiveWarnings(tx, input.guildId, input.targetDiscordUserId);
    if (active.length === 0) return { cleared: 0, case: null };
    const created = await createModerationCase(
      tx,
      {
        guildId: input.guildId,
        actionType: 'WARN_CLEAR',
        status: 'COMPLETED',
        banStatus: null,
        targetDiscordUserId: input.targetDiscordUserId,
        targetUsername: input.targetUsername ?? null,
        targetGlobalName: input.targetGlobalName ?? null,
        moderatorDiscordUserId: input.moderatorDiscordUserId,
        moderatorName: input.moderatorName ?? null,
        reason: input.reason ?? `Cleared ${active.length} warning(s)`,
        occurredAt: now,
        source: input.source,
        attributionStatus: 'VERIFIED',
        steamId64: input.steamId64 ?? null,
        steamNameAtEvent: input.steamNameAtEvent ?? null,
        metadata: { clearedWarningIds: active.map((row) => row.id) },
      },
      now,
    );
    for (const warning of active) {
      await tx.run(
        `UPDATE warnings SET active = '0', cleared_at = ?, cleared_by = ?, cleared_case_id = ?
         WHERE id = ?`,
        [now, input.moderatorDiscordUserId, created.id, warning.id],
      );
    }
    return { cleared: active.length, case: created };
  });
}
