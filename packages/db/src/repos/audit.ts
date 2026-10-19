import { randomUUID } from 'node:crypto';
import type { AuditEventDto, Paginated } from '@dardania/shared';
import type { Db } from '../client.js';
import { stringifyJson } from '../json.js';
import { mapAuditEvent } from '../mappers.js';
import type { AuditEventRow, CountRow } from '../rows.js';

export interface AuditInput {
  guildId?: string | null;
  actorDiscordId?: string | null;
  actorType: 'USER' | 'SYSTEM' | 'BOT' | 'OWNER';
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export async function recordAuditEvent(
  db: Db,
  input: AuditInput,
  now: string,
): Promise<AuditEventDto> {
  const id = randomUUID();
  await db.run(
    `INSERT INTO audit_events
      (id, guild_id, actor_discord_id, actor_type, action, entity_type, entity_id, summary,
       before_json, after_json, ip_hash, user_agent, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.guildId ?? null,
      input.actorDiscordId ?? null,
      input.actorType,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.summary,
      stringifyJson(input.before),
      stringifyJson(input.after),
      input.ipHash ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
      now,
    ],
  );
  const row = await db.get<AuditEventRow>('SELECT * FROM audit_events WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to persist audit event');
  return mapAuditEvent(row);
}

export interface AuditFilters {
  guildId?: string;
  action?: string;
  actorDiscordId?: string;
  entityType?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditEvents(
  db: Db,
  filters: AuditFilters,
): Promise<Paginated<AuditEventDto>> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.guildId) {
    where.push('guild_id = ?');
    params.push(filters.guildId);
  }
  if (filters.action) {
    where.push('action = ?');
    params.push(filters.action);
  }
  if (filters.actorDiscordId) {
    where.push('actor_discord_id = ?');
    params.push(filters.actorDiscordId);
  }
  if (filters.entityType) {
    where.push('entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    where.push('entity_id = ?');
    params.push(filters.entityId);
  }
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 1), 100);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await db.get<CountRow>(
    `SELECT COUNT(*) AS total FROM audit_events ${whereSql}`,
    params,
  );
  const rows = await db.all<AuditEventRow>(
    `SELECT * FROM audit_events ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const total = Number(totalRow?.total ?? 0);
  return {
    items: rows.map(mapAuditEvent),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listCaseAuditTrail(
  db: Db,
  caseId: string,
  limit = 50,
): Promise<AuditEventDto[]> {
  const rows = await db.all<AuditEventRow>(
    `SELECT * FROM audit_events
     WHERE entity_type = 'moderation_case' AND entity_id = ?
     ORDER BY created_at ASC LIMIT ?`,
    [caseId, limit],
  );
  return rows.map(mapAuditEvent);
}
