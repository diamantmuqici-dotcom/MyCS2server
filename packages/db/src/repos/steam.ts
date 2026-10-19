import { randomUUID } from 'node:crypto';
import {
  steamProfileUrl,
  type Paginated,
  type SteamAccountDto,
  type SteamNameHistoryDto,
} from '@dardania/shared';
import type { Db } from '../client.js';
import { mapSteamAccount, mapSteamNameHistory } from '../mappers.js';
import type { CountRow, SteamAccountRow, SteamLinkRow, SteamNameHistoryRow } from '../rows.js';

export interface ObserveSteamInput {
  steamId64: string;
  displayName: string | null;
  avatarUrl?: string | null;
  profileStatus: 'PUBLIC' | 'PRIVATE' | 'UNKNOWN' | 'UNAVAILABLE';
  source: string;
  checkedAt: string;
}

export async function ensureSteamAccount(
  db: Db,
  input: { steamId64: string; profileUrl?: string; now: string },
): Promise<void> {
  await db.run(
    `INSERT INTO steam_accounts (steam_id64, profile_url, first_seen_at, profile_status)
     VALUES (?, ?, ?, 'UNKNOWN')
     ON CONFLICT (steam_id64) DO NOTHING`,
    [input.steamId64, input.profileUrl ?? steamProfileUrl(input.steamId64), input.now],
  );
}

export async function getSteamAccountRow(
  db: Db,
  steamId64: string,
): Promise<SteamAccountRow | undefined> {
  return db.get<SteamAccountRow>('SELECT * FROM steam_accounts WHERE steam_id64 = ?', [steamId64]);
}

/**
 * Records a fresh observation of a Steam profile.
 *
 * - A changed public name closes the previous history row and opens a new one.
 * - Re-observing the same name only extends `last_observed_at`.
 * - The current name on `steam_accounts` is updated; moderation-case snapshots
 *   are NEVER touched here (see cases.ts).
 */
export async function observeSteamProfile(
  db: Db,
  input: ObserveSteamInput,
): Promise<{ changed: boolean; previousName: string | null }> {
  return db.transaction(async (tx) => {
    await ensureSteamAccount(tx, { steamId64: input.steamId64, now: input.checkedAt });
    const account = await getSteamAccountRow(tx, input.steamId64);
    if (!account) throw new Error(`Steam account ${input.steamId64} missing after upsert`);
    const previousName = account.current_display_name;
    let changed = false;

    if (input.displayName) {
      const openRow = await tx.get<SteamNameHistoryRow>(
        `SELECT * FROM steam_name_history
         WHERE steam_id64 = ? AND last_observed_at IS NULL
         ORDER BY first_observed_at DESC LIMIT 1`,
        [input.steamId64],
      );
      if (!previousName || previousName !== input.displayName) {
        if (openRow) {
          await tx.run(
            'UPDATE steam_name_history SET last_observed_at = ? WHERE id = ? AND last_observed_at IS NULL',
            [input.checkedAt, openRow.id],
          );
        }
        await tx.run(
          `INSERT INTO steam_name_history
            (id, steam_id64, previous_display_name, display_name, first_observed_at,
             last_observed_at, source, verification)
           VALUES (?, ?, ?, ?, ?, NULL, ?, 'OBSERVED')`,
          [
            randomUUID(),
            input.steamId64,
            previousName,
            input.displayName,
            input.checkedAt,
            input.source,
          ],
        );
        changed = previousName !== null;
      } else if (openRow) {
        await tx.run('UPDATE steam_name_history SET last_observed_at = ? WHERE id = ?', [
          input.checkedAt,
          openRow.id,
        ]);
      } else {
        // Name matches the account row but no open history exists (e.g. seeded data).
        await tx.run(
          `INSERT INTO steam_name_history
            (id, steam_id64, previous_display_name, display_name, first_observed_at,
             last_observed_at, source, verification)
           VALUES (?, ?, NULL, ?, ?, NULL, ?, 'OBSERVED')`,
          [randomUUID(), input.steamId64, input.displayName, input.checkedAt, input.source],
        );
      }
    }

    await tx.run(
      `UPDATE steam_accounts
       SET current_display_name = COALESCE(?, current_display_name),
           current_avatar_url = COALESCE(?, current_avatar_url),
           last_checked_at = ?,
           last_refresh_source = ?,
           profile_status = ?,
           refresh_failures = 0,
           last_refresh_error = NULL
       WHERE steam_id64 = ?`,
      [
        input.displayName,
        input.avatarUrl ?? null,
        input.checkedAt,
        input.source,
        input.profileStatus,
        input.steamId64,
      ],
    );
    return { changed, previousName };
  });
}

export async function markSteamRefreshFailure(
  db: Db,
  input: { steamId64: string; error: string; now: string; profileStatus?: string },
): Promise<void> {
  await ensureSteamAccount(db, { steamId64: input.steamId64, now: input.now });
  await db.run(
    `UPDATE steam_accounts
     SET refresh_failures = refresh_failures + 1,
         last_refresh_error = ?,
         last_checked_at = ?,
         profile_status = COALESCE(?, profile_status)
     WHERE steam_id64 = ?`,
    [input.error.slice(0, 500), input.now, input.profileStatus ?? null, input.steamId64],
  );
}

export async function getSteamNameHistory(
  db: Db,
  steamId64: string,
  limit = 100,
): Promise<SteamNameHistoryDto[]> {
  const rows = await db.all<SteamNameHistoryRow>(
    `SELECT * FROM steam_name_history WHERE steam_id64 = ?
     ORDER BY first_observed_at DESC LIMIT ?`,
    [steamId64, limit],
  );
  return rows.map(mapSteamNameHistory);
}

export async function getSteamLinksForAccount(db: Db, steamId64: string): Promise<SteamLinkRow[]> {
  return db.all<SteamLinkRow>(
    'SELECT * FROM steam_account_links WHERE steam_id64 = ? AND unlinked_at IS NULL',
    [steamId64],
  );
}

export async function getActiveSteamLinkForDiscordUser(
  db: Db,
  discordUserId: string,
): Promise<SteamLinkRow | undefined> {
  return db.get<SteamLinkRow>(
    `SELECT * FROM steam_account_links
     WHERE discord_user_id = ? AND unlinked_at IS NULL
     ORDER BY linked_at DESC LIMIT 1`,
    [discordUserId],
  );
}

export async function linkSteamAccount(
  db: Db,
  input: {
    steamId64: string;
    discordUserId: string;
    linkedBy: string;
    source: string;
    verification?: 'VERIFIED' | 'UNVERIFIED';
    now: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await ensureSteamAccount(tx, { steamId64: input.steamId64, now: input.now });
    await tx.run(
      `UPDATE steam_account_links SET unlinked_at = ?
       WHERE steam_id64 = ? AND discord_user_id = ? AND unlinked_at IS NULL`,
      [input.now, input.steamId64, input.discordUserId],
    );
    await tx.run(
      `INSERT INTO steam_account_links
        (id, steam_id64, discord_user_id, linked_by, linked_at, source, verification)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.steamId64,
        input.discordUserId,
        input.linkedBy,
        input.now,
        input.source,
        input.verification ?? 'UNVERIFIED',
      ],
    );
  });
}

export async function getSteamAccountDetail(
  db: Db,
  steamId64: string,
): Promise<SteamAccountDto | null> {
  const account = await getSteamAccountRow(db, steamId64);
  if (!account) return null;
  const [history, links, caseCount] = await Promise.all([
    getSteamNameHistory(db, steamId64),
    getSteamLinksForAccount(db, steamId64),
    db.get<CountRow>('SELECT COUNT(*) AS total FROM moderation_cases WHERE steam_id64 = ?', [
      steamId64,
    ]),
  ]);
  return mapSteamAccount(
    account,
    history,
    links.map((link) => link.discord_user_id),
    Number(caseCount?.total ?? 0),
  );
}

export async function searchSteamAccounts(
  db: Db,
  filters: { q?: string; page?: number; pageSize?: number },
): Promise<Paginated<SteamAccountDto>> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 1), 100);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&').toLowerCase()}%`;
    where.push(`(
      lower(sa.steam_id64) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(sa.current_display_name, '')) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM steam_name_history h WHERE h.steam_id64 = sa.steam_id64 AND lower(h.display_name) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM steam_account_links l WHERE l.steam_id64 = sa.steam_id64 AND l.discord_user_id LIKE ? ESCAPE '\\')
    )`);
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await db.get<CountRow>(
    `SELECT COUNT(*) AS total FROM steam_accounts sa ${whereSql}`,
    params,
  );
  const rows = await db.all<SteamAccountRow>(
    `SELECT sa.* FROM steam_accounts sa ${whereSql}
     ORDER BY COALESCE(sa.last_checked_at, sa.first_seen_at) DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const items: SteamAccountDto[] = [];
  for (const row of rows) {
    const detail = await getSteamAccountDetail(db, row.steam_id64);
    if (detail) items.push(detail);
  }
  const total = Number(totalRow?.total ?? 0);
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSteamTrackingStats(
  db: Db,
): Promise<{ accounts: number; nameChanges: number; pendingRefreshes: number }> {
  const accounts = await db.get<CountRow>('SELECT COUNT(*) AS total FROM steam_accounts');
  const changes = await db.get<CountRow>(
    'SELECT COUNT(*) AS total FROM steam_name_history WHERE previous_display_name IS NOT NULL',
  );
  const failing = await db.get<CountRow>(
    'SELECT COUNT(*) AS total FROM steam_accounts WHERE refresh_failures > 0',
  );
  return {
    accounts: Number(accounts?.total ?? 0),
    nameChanges: Number(changes?.total ?? 0),
    pendingRefreshes: Number(failing?.total ?? 0),
  };
}

/**
 * Returns the observed display name that covers `at`, if this system actually
 * observed the account at that time. Never guesses a historical name.
 */
export async function getSteamNameAt(
  db: Db,
  steamId64: string,
  at: string,
): Promise<string | null> {
  const row = await db.get<{ display_name: string }>(
    `SELECT display_name FROM steam_name_history
     WHERE steam_id64 = ?
       AND first_observed_at <= ?
       AND (last_observed_at IS NULL OR last_observed_at >= ?)
     ORDER BY first_observed_at DESC LIMIT 1`,
    [steamId64, at, at],
  );
  return row?.display_name ?? null;
}
