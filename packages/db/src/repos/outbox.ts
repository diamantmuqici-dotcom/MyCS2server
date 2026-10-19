import { randomUUID } from 'node:crypto';
import type { Db } from '../client.js';
import { parseJson, stringifyJson } from '../json.js';
import type { OutboxRow } from '../rows.js';

export type OutboxTopic = 'DISCORD_ANNOUNCEMENT' | 'DISCORD_LOG';

export interface EnqueueDeliveryInput {
  topic: OutboxTopic;
  dedupeKey: string;
  payload: Record<string, unknown>;
  now: string;
  availableAt?: string;
}

/**
 * Durable outbox for Discord deliveries. The unique dedupe key guarantees an
 * announcement is enqueued at most once even if the dashboard retries.
 */
export async function enqueueDelivery(db: Db, input: EnqueueDeliveryInput): Promise<boolean> {
  const changes = await db.run(
    `INSERT INTO integration_outbox
      (id, topic, dedupe_key, payload_json, status, attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      randomUUID(),
      input.topic,
      input.dedupeKey,
      stringifyJson(input.payload) ?? '{}',
      input.availableAt ?? input.now,
      input.now,
      input.now,
    ],
  );
  return changes > 0;
}

export interface DueDelivery {
  id: string;
  topic: OutboxTopic;
  dedupeKey: string;
  attempts: number;
  payload: Record<string, unknown>;
}

export async function listDueDeliveries(
  db: Db,
  now: string,
  limit = 20,
): Promise<DueDelivery[]> {
  const rows = await db.all<OutboxRow>(
    `SELECT * FROM integration_outbox
     WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= ?
     ORDER BY created_at ASC LIMIT ?`,
    [now, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    topic: row.topic as OutboxTopic,
    dedupeKey: row.dedupe_key,
    attempts: Number(row.attempts),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
  }));
}

export async function completeDelivery(
  db: Db,
  input: {
    id: string;
    ok: boolean;
    error?: string | null;
    maxAttempts?: number;
  },
  now: string,
): Promise<{ status: OutboxRow['status']; attempts: number; nextAttemptAt: string | null }> {
  const row = await db.get<OutboxRow>('SELECT * FROM integration_outbox WHERE id = ?', [input.id]);
  if (!row) throw new Error(`Unknown outbox delivery ${input.id}`);
  const attempts = Number(row.attempts) + 1;
  if (input.ok) {
    await db.run(
      `UPDATE integration_outbox
       SET status = 'SENT', attempts = ?, delivered_at = ?, updated_at = ?, last_error = NULL
       WHERE id = ?`,
      [attempts, now, now, input.id],
    );
    return { status: 'SENT', attempts, nextAttemptAt: null };
  }
  const maxAttempts = input.maxAttempts ?? 10;
  const dead = attempts >= maxAttempts;
  const backoffSeconds = Math.min(3600, 30 * Math.pow(2, Math.max(0, attempts - 1)));
  const nextAttemptAt = new Date(new Date(now).getTime() + backoffSeconds * 1000).toISOString();
  await db.run(
    `UPDATE integration_outbox
     SET status = ?, attempts = ?, updated_at = ?, last_error = ?, next_attempt_at = ?
     WHERE id = ?`,
    [dead ? 'DEAD' : 'FAILED', attempts, now, input.error ?? 'unknown error', nextAttemptAt, input.id],
  );
  return { status: dead ? 'DEAD' : 'FAILED', attempts, nextAttemptAt: dead ? null : nextAttemptAt };
}

export async function markAnnouncementDelivered(
  db: Db,
  announcementId: string,
  info: { discordMessageId: string; discordChannelId: string },
  now: string,
): Promise<void> {
  await db.run(
    `UPDATE announcements
     SET discord_message_id = ?, discord_channel_id = ?, discord_published_at = ?, updated_at = ?
     WHERE id = ?`,
    [info.discordMessageId, info.discordChannelId, now, now, announcementId],
  );
}

export async function getOutboxStats(
  db: Db,
): Promise<{ pending: number; failed: number; dead: number; sent: number }> {
  const rows = await db.all<{ status: string; total: number | string }>(
    'SELECT status, COUNT(*) AS total FROM integration_outbox GROUP BY status',
  );
  const result = { pending: 0, failed: 0, dead: 0, sent: 0 };
  for (const row of rows) {
    const count = Number(row.total);
    if (row.status === 'PENDING') result.pending = count;
    else if (row.status === 'FAILED') result.failed = count;
    else if (row.status === 'DEAD') result.dead = count;
    else if (row.status === 'SENT') result.sent = count;
  }
  return result;
}
