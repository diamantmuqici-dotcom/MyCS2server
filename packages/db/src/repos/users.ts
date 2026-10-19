import type { Db } from '../client.js';
import type { UserRow } from '../rows.js';

export interface UpsertUserInput {
  id: string;
  username: string;
  globalName?: string | null;
  avatarHash?: string | null;
  isBot?: boolean;
}

/** Keeps the current Discord profile in `users`; historical snapshots live on cases. */
export async function upsertUser(db: Db, input: UpsertUserInput, now: string): Promise<UserRow> {
  await db.run(
    `INSERT INTO users (id, username, global_name, avatar_hash, is_bot, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       username = excluded.username,
       global_name = excluded.global_name,
       avatar_hash = excluded.avatar_hash,
       is_bot = excluded.is_bot,
       last_seen_at = excluded.last_seen_at`,
    [
      input.id,
      input.username,
      input.globalName ?? null,
      input.avatarHash ?? null,
      input.isBot ? '1' : '0',
      now,
      now,
    ],
  );
  const row = await getUser(db, input.id);
  if (!row) throw new Error(`Failed to persist user ${input.id}`);
  return row;
}

export async function getUser(db: Db, id: string): Promise<UserRow | undefined> {
  return db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
}

export async function getUsersByIds(db: Db, ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return db.all<UserRow>(`SELECT * FROM users WHERE id IN (${placeholders})`, ids);
}
