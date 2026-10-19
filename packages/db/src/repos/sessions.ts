import type { Db } from '../client.js';
import type { SessionRow, UserRow } from '../rows.js';

export interface CreateSessionInput {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
  ipHash?: string | null;
  userAgent?: string | null;
  loginSource?: 'oauth' | 'allowlist' | 'dev';
}

export async function createSession(
  db: Db,
  input: CreateSessionInput,
  now: string,
): Promise<void> {
  await db.run(
    `INSERT INTO sessions
      (id, user_id, csrf_token, created_at, expires_at, last_seen_at, ip_hash, user_agent, login_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.userId,
      input.csrfToken,
      now,
      input.expiresAt,
      now,
      input.ipHash ?? null,
      input.userAgent ?? null,
      input.loginSource ?? 'oauth',
    ],
  );
}

export async function getActiveSession(
  db: Db,
  id: string,
  now: string,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const session = await db.get<SessionRow>(
    'SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?',
    [id, now],
  );
  if (!session) return null;
  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user) return null;
  return { session, user };
}

export async function touchSession(db: Db, id: string, now: string): Promise<void> {
  await db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now, id]);
}

export async function revokeSession(db: Db, id: string, now: string): Promise<void> {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now, id]);
}

export async function purgeExpiredSessions(db: Db, now: string): Promise<number> {
  return db.run('DELETE FROM sessions WHERE expires_at <= ?', [now]);
}
