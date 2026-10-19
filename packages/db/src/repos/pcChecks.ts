import { randomUUID } from 'node:crypto';
import type {
  Paginated,
  PcCheckDto,
  PcCheckOutcome,
  PcCheckStatus,
  PcCheckNoteDto,
} from '@dardania/shared';
import type { Db } from '../client.js';
import { mapPcCheck, mapPcCheckNote } from '../mappers.js';
import type { CountRow, PcCheckNoteRow, PcCheckRow } from '../rows.js';
import { nextSequence } from './cases.js';

export interface CreatePcCheckInput {
  guildId: string;
  targetDiscordUserId: string;
  steamId64?: string | null;
  steamNameAtEvent?: string | null;
  requestedBy: string | null;
  reason?: string | null;
  channelId?: string | null;
  assignedTo?: string | null;
}

export async function createPcCheck(
  db: Db,
  input: CreatePcCheckInput,
  now: string,
): Promise<PcCheckDto> {
  return db.transaction(async (tx) => {
    const caseNumber = await nextSequence(tx, 'pc_check_sequence');
    const id = randomUUID();
    const caseRef = `PC-${String(caseNumber).padStart(6, '0')}`;
    await tx.run(
      `INSERT INTO pc_check_cases
        (id, case_ref, case_number, guild_id, target_discord_user_id, steam_id64, steam_name_at_event,
         requested_by, assigned_to, reason, status, channel_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        caseRef,
        caseNumber,
        input.guildId,
        input.targetDiscordUserId,
        input.steamId64 ?? null,
        input.steamNameAtEvent ?? null,
        input.requestedBy,
        input.assignedTo ?? null,
        input.reason ?? null,
        input.assignedTo ? 'ASSIGNED' : 'REQUESTED',
        input.channelId ?? null,
        now,
        now,
      ],
    );
    const row = await tx.get<PcCheckRow>('SELECT * FROM pc_check_cases WHERE id = ?', [id]);
    if (!row) throw new Error(`Failed to read back PC check ${caseRef}`);
    return mapPcCheck(row);
  });
}

export async function getPcCheck(
  db: Db,
  guildId: string,
  idOrRef: string,
): Promise<PcCheckDto | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
  const row = isUuid
    ? await db.get<PcCheckRow>('SELECT * FROM pc_check_cases WHERE id = ? AND guild_id = ?', [
        idOrRef,
        guildId,
      ])
    : await db.get<PcCheckRow>('SELECT * FROM pc_check_cases WHERE case_ref = ? AND guild_id = ?', [
        idOrRef.trim().toUpperCase(),
        guildId,
      ]);
  return row ? mapPcCheck(row) : null;
}

export async function updatePcCheck(
  db: Db,
  input: {
    id: string;
    status?: PcCheckStatus;
    outcome?: PcCheckOutcome | null;
    assignedTo?: string | null;
    reason?: string;
    channelId?: string | null;
  },
  now: string,
): Promise<PcCheckDto | null> {
  const existing = await db.get<PcCheckRow>('SELECT * FROM pc_check_cases WHERE id = ?', [
    input.id,
  ]);
  if (!existing) return null;
  const assignments: string[] = [];
  const params: (string | null)[] = [];
  if (input.status) {
    assignments.push('status = ?');
    params.push(input.status);
    if (input.status === 'COMPLETED' || input.status === 'CANCELLED') {
      assignments.push('closed_at = ?');
      params.push(existing.closed_at ?? now);
    }
  }
  if (input.outcome !== undefined) {
    assignments.push('outcome = ?');
    params.push(input.outcome);
  }
  if (input.assignedTo !== undefined) {
    assignments.push('assigned_to = ?');
    params.push(input.assignedTo);
    if (input.assignedTo && existing.status === 'REQUESTED' && !input.status) {
      assignments.push('status = ?');
      params.push('ASSIGNED');
    }
  }
  if (input.reason !== undefined) {
    assignments.push('reason = ?');
    params.push(input.reason);
  }
  if (input.channelId !== undefined) {
    assignments.push('channel_id = ?');
    params.push(input.channelId);
  }
  if (assignments.length === 0) return mapPcCheck(existing);
  assignments.push('updated_at = ?');
  params.push(now, input.id);
  await db.run(`UPDATE pc_check_cases SET ${assignments.join(', ')} WHERE id = ?`, params);
  const row = await db.get<PcCheckRow>('SELECT * FROM pc_check_cases WHERE id = ?', [input.id]);
  return row ? mapPcCheck(row) : null;
}

export interface PcCheckFilters {
  guildId: string;
  status?: PcCheckStatus;
  targetDiscordUserId?: string;
  assignedTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listPcChecks(
  db: Db,
  filters: PcCheckFilters,
): Promise<Paginated<PcCheckDto>> {
  const where: string[] = ['guild_id = ?'];
  const params: (string | number)[] = [filters.guildId];
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.targetDiscordUserId) {
    where.push('target_discord_user_id = ?');
    params.push(filters.targetDiscordUserId);
  }
  if (filters.assignedTo) {
    where.push('assigned_to = ?');
    params.push(filters.assignedTo);
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&').toLowerCase()}%`;
    where.push(`(lower(case_ref) LIKE ? ESCAPE '\\'
      OR lower(target_discord_user_id) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(steam_id64, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(steam_name_at_event, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(reason, '')) LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 1), 100);
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = await db.get<CountRow>(
    `SELECT COUNT(*) AS total FROM pc_check_cases ${whereSql}`,
    params,
  );
  const rows = await db.all<PcCheckRow>(
    `SELECT * FROM pc_check_cases ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const total = Number(totalRow?.total ?? 0);
  return {
    items: rows.map((row) => mapPcCheck(row)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function addPcCheckNote(
  db: Db,
  input: {
    pcCheckId: string;
    authorDiscordId: string;
    authorName?: string | null;
    note: string;
    visibility?: 'STAFF' | 'OWNER';
  },
  now: string,
): Promise<PcCheckNoteDto> {
  const id = randomUUID();
  await db.run(
    `INSERT INTO pc_check_notes
      (id, pc_check_id, author_discord_id, author_name_at_event, note, visibility, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.pcCheckId,
      input.authorDiscordId,
      input.authorName ?? null,
      input.note,
      input.visibility ?? 'STAFF',
      now,
    ],
  );
  const row = await db.get<PcCheckNoteRow>('SELECT * FROM pc_check_notes WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to persist PC check note');
  return mapPcCheckNote(row);
}

export async function listPcCheckNotes(
  db: Db,
  pcCheckId: string,
  options: { includeOwnerOnly: boolean },
): Promise<PcCheckNoteDto[]> {
  const rows = await db.all<PcCheckNoteRow>(
    `SELECT * FROM pc_check_notes WHERE pc_check_id = ?
     ${options.includeOwnerOnly ? '' : "AND visibility = 'STAFF'"}
     ORDER BY created_at ASC`,
    [pcCheckId],
  );
  return rows.map(mapPcCheckNote);
}

export async function getPcCheckStats(
  db: Db,
  guildId: string,
): Promise<{ total: number; open: number; completed: number; cancelled: number }> {
  const row = await db.get<{
    total: number | string;
    open: number | string | null;
    completed: number | string | null;
    cancelled: number | string | null;
  }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status IN ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
     FROM pc_check_cases WHERE guild_id = ?`,
    [guildId],
  );
  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
  };
}
