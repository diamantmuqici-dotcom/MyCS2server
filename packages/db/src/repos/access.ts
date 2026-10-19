import { randomUUID } from 'node:crypto';
import type { AccessLevel, DashboardAccessDto } from '@dardania/shared';
import type { Db } from '../client.js';
import { mapDashboardAccess } from '../mappers.js';
import type { DashboardAccessRow } from '../rows.js';

export async function listActiveAccess(db: Db, guildId: string): Promise<DashboardAccessDto[]> {
  const rows = await db.all<DashboardAccessRow>(
    'SELECT * FROM dashboard_access WHERE guild_id = ? AND revoked_at IS NULL ORDER BY granted_at DESC',
    [guildId],
  );
  return rows.map(mapDashboardAccess);
}

export async function listAccessHistory(
  db: Db,
  guildId: string,
  limit = 50,
): Promise<DashboardAccessDto[]> {
  const rows = await db.all<DashboardAccessRow>(
    'SELECT * FROM dashboard_access WHERE guild_id = ? ORDER BY granted_at DESC LIMIT ?',
    [guildId, limit],
  );
  return rows.map(mapDashboardAccess);
}

export async function getActiveAccess(
  db: Db,
  guildId: string,
  userId: string,
): Promise<DashboardAccessDto | null> {
  const row = await db.get<DashboardAccessRow>(
    'SELECT * FROM dashboard_access WHERE guild_id = ? AND user_id = ? AND revoked_at IS NULL',
    [guildId, userId],
  );
  return row ? mapDashboardAccess(row) : null;
}

/**
 * Grants (or changes) dashboard access. Any previous active grant for the user
 * is revoked in the same transaction so the audit history stays complete.
 */
export async function grantAccess(
  db: Db,
  input: {
    guildId: string;
    userId: string;
    level: AccessLevel;
    grantedBy: string;
    note?: string | null;
  },
  now: string,
): Promise<DashboardAccessDto> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<DashboardAccessRow>(
      'SELECT * FROM dashboard_access WHERE guild_id = ? AND user_id = ? AND revoked_at IS NULL',
      [input.guildId, input.userId],
    );
    if (existing && existing.level === input.level) {
      return mapDashboardAccess(existing);
    }
    if (existing) {
      await tx.run('UPDATE dashboard_access SET revoked_at = ?, revoked_by = ? WHERE id = ?', [
        now,
        input.grantedBy,
        existing.id,
      ]);
    }
    const id = randomUUID();
    await tx.run(
      `INSERT INTO dashboard_access (id, guild_id, user_id, level, granted_by, granted_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.guildId, input.userId, input.level, input.grantedBy, now, input.note ?? null],
    );
    return {
      id,
      guildId: input.guildId,
      userDiscordId: input.userId,
      level: input.level,
      grantedBy: input.grantedBy,
      grantedAt: now,
      revokedAt: null,
      note: input.note ?? null,
    };
  });
}

export async function revokeAccess(
  db: Db,
  input: { guildId: string; userId: string; revokedBy: string },
  now: string,
): Promise<boolean> {
  const changes = await db.run(
    `UPDATE dashboard_access SET revoked_at = ?, revoked_by = ?
     WHERE guild_id = ? AND user_id = ? AND revoked_at IS NULL`,
    [now, input.revokedBy, input.guildId, input.userId],
  );
  return changes > 0;
}
