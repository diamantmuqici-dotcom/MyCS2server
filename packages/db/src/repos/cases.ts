import { randomUUID } from 'node:crypto';
import {
  steamProfileUrl,
  type ActionType,
  type AttributionStatus,
  type BanStatus,
  type CaseStatus,
  type ModerationCaseDetail,
  type ModerationCaseDto,
  type ModerationEventDto,
  type Paginated,
  type StaffActivityRow,
} from '@dardania/shared';
import type { Db } from '../client.js';
import { parseJson, stringifyJson } from '../json.js';
import {
  CASE_SELECT,
  mapBanEvent,
  mapCase,
  mapCaseRelation,
  mapUnbanEvent,
} from '../mappers.js';
import type {
  BanEventRow,
  CountRow,
  ModerationCaseRow,
  UnbanEventRow,
} from '../rows.js';
import { listCaseAuditTrail, recordAuditEvent } from './audit.js';
import { getGuildConfiguration } from './guilds.js';

export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return false;
  if (candidate.code === '23505' || candidate.code === 'SQLITE_CONSTRAINT') return true;
  return /unique constraint|UNIQUE constraint/i.test(candidate.message ?? '');
}

export async function nextSequence(db: Db, name: string): Promise<number> {
  await db.run(
    `INSERT INTO counters (name, value) VALUES (?, 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1`,
    [name],
  );
  const row = await db.get<{ value: number | string }>('SELECT value FROM counters WHERE name = ?', [
    name,
  ]);
  return Number(row?.value ?? 1);
}

export function caseRefForNumber(caseNumber: number): string {
  return `DE-${String(caseNumber).padStart(6, '0')}`;
}

export interface CaseSnapshotInput {
  guildId: string;
  targetDiscordUserId: string;
  targetUsername?: string | null;
  targetGlobalName?: string | null;
  moderatorDiscordUserId?: string | null;
  moderatorName?: string | null;
  reason?: string | null;
  occurredAt: string;
  source: string;
  attributionStatus: AttributionStatus;
  attributionEvidence?: unknown;
  steamId64?: string | null;
  steamNameAtEvent?: string | null;
  steamProfileUrlAtEvent?: string | null;
  steamNameSource?: string | null;
  expiresAt?: string | null;
  discordMessageId?: string | null;
  externalRef?: string | null;
  metadata?: unknown;
}

export interface CreateCaseInput extends CaseSnapshotInput {
  actionType: ActionType;
  status?: CaseStatus;
  banStatus?: BanStatus | null;
  relatedCaseId?: string | null;
}

/** Inserts a moderation case with a gapless, globally unique case reference. */
export async function createModerationCase(
  db: Db,
  input: CreateCaseInput,
  now: string,
): Promise<ModerationCaseDto> {
  const caseNumber = await nextSequence(db, 'case_sequence');
  const id = randomUUID();
  const caseRef = caseRefForNumber(caseNumber);
  const status: CaseStatus =
    input.status ??
    (input.actionType === 'BAN'
      ? input.banStatus === 'ACTIVE'
        ? 'ACTIVE'
        : 'UNKNOWN'
      : 'COMPLETED');

  await db.run(
    `INSERT INTO moderation_cases (
      id, case_ref, case_number, guild_id, action_type, status, ban_status, related_case_id,
      target_discord_user_id, target_discord_username_at_event, target_discord_global_name_at_event,
      moderator_discord_user_id, moderator_name_at_event, reason, occurred_at, recorded_at, source,
      attribution_status, attribution_evidence_json, steam_id64, steam_name_at_event,
      steam_profile_url_at_event, steam_name_source, expires_at, discord_message_id, external_ref,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      caseRef,
      caseNumber,
      input.guildId,
      input.actionType,
      status,
      input.banStatus ?? null,
      input.relatedCaseId ?? null,
      input.targetDiscordUserId,
      input.targetUsername ?? null,
      input.targetGlobalName ?? null,
      input.moderatorDiscordUserId ?? null,
      input.moderatorName ?? null,
      input.reason ?? null,
      input.occurredAt,
      now,
      input.source,
      input.attributionStatus,
      stringifyJson(input.attributionEvidence),
      input.steamId64 ?? null,
      input.steamNameAtEvent ?? null,
      input.steamProfileUrlAtEvent ??
        (input.steamId64 ? steamProfileUrl(input.steamId64) : null),
      input.steamNameSource ?? null,
      input.expiresAt ?? null,
      input.discordMessageId ?? null,
      input.externalRef ?? null,
      stringifyJson(input.metadata),
      now,
      now,
    ],
  );

  const row = await db.get<ModerationCaseRow>(`${CASE_SELECT} WHERE c.id = ?`, [id]);
  if (!row) throw new Error(`Failed to read back case ${caseRef}`);
  return mapCase(row);
}

export async function getCaseRowById(db: Db, id: string): Promise<ModerationCaseRow | undefined> {
  return db.get<ModerationCaseRow>(`${CASE_SELECT} WHERE c.id = ?`, [id]);
}

export async function getCaseById(db: Db, id: string): Promise<ModerationCaseDto | null> {
  const row = await getCaseRowById(db, id);
  if (!row) return null;
  const relations = await loadRelatedCases(db, [row]);
  return mapCase(row, relations.get(row.id) ?? []);
}

export async function getCaseByRef(
  db: Db,
  guildId: string,
  caseRef: string,
): Promise<ModerationCaseDto | null> {
  const row = await db.get<ModerationCaseRow>(
    `${CASE_SELECT} WHERE c.guild_id = ? AND c.case_ref = ?`,
    [guildId, caseRef.trim().toUpperCase()],
  );
  if (!row) return null;
  const relations = await loadRelatedCases(db, [row]);
  return mapCase(row, relations.get(row.id) ?? []);
}

/** Loads counterpart cases (ban <-> unban) for a page of cases in one query. */
export async function loadRelatedCases(
  db: Db,
  rows: ModerationCaseRow[],
): Promise<Map<string, ReturnType<typeof mapCaseRelation>[]>> {
  const result = new Map<string, ReturnType<typeof mapCaseRelation>[]>();
  if (rows.length === 0) return result;
  const ids = [...new Set(rows.flatMap((row) => [row.id, row.related_case_id]).filter(Boolean))] as string[];
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => '?').join(', ');
  const linked = await db.all<ModerationCaseRow>(
    `SELECT id, case_ref, case_number, guild_id, action_type, status, occurred_at, related_case_id
     FROM moderation_cases
     WHERE id IN (${placeholders}) OR related_case_id IN (${placeholders})`,
    [...ids, ...ids],
  );
  for (const row of rows) {
    const related = linked.filter(
      (candidate) =>
        candidate.id !== row.id &&
        (candidate.id === row.related_case_id || candidate.related_case_id === row.id),
    );
    result.set(row.id, related.map(mapCaseRelation));
  }
  return result;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&').toLowerCase();
}

export interface CaseFilters {
  guildId: string;
  q?: string;
  targetDiscordId?: string;
  moderatorDiscordId?: string;
  steamId64?: string;
  caseRef?: string;
  actionType?: ActionType;
  banStatus?: BanStatus;
  status?: CaseStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sort?: 'occurred_at_desc' | 'occurred_at_asc';
}

function buildCaseWhere(filters: CaseFilters): { whereSql: string; params: (string | number)[] } {
  const where: string[] = ['c.guild_id = ?'];
  const params: (string | number)[] = [filters.guildId];
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    where.push(`(
      lower(c.case_ref) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.target_discord_username_at_event, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.target_discord_global_name_at_event, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.moderator_name_at_event, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.reason, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.steam_id64, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.steam_name_at_event, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.target_discord_user_id, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(c.moderator_discord_user_id, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(sa.current_display_name, '')) LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM steam_name_history h
        WHERE h.steam_id64 = c.steam_id64 AND lower(h.display_name) LIKE ? ESCAPE '\\'
      )
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  if (filters.targetDiscordId) {
    where.push('c.target_discord_user_id = ?');
    params.push(filters.targetDiscordId);
  }
  if (filters.moderatorDiscordId) {
    where.push('c.moderator_discord_user_id = ?');
    params.push(filters.moderatorDiscordId);
  }
  if (filters.steamId64) {
    where.push('c.steam_id64 = ?');
    params.push(filters.steamId64);
  }
  if (filters.caseRef) {
    where.push('c.case_ref = ?');
    params.push(filters.caseRef.trim().toUpperCase());
  }
  if (filters.actionType) {
    where.push('c.action_type = ?');
    params.push(filters.actionType);
  }
  if (filters.status) {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  if (filters.banStatus) {
    where.push(`c.action_type = 'BAN' AND c.ban_status = ?`);
    params.push(filters.banStatus);
  }
  if (filters.dateFrom) {
    where.push('c.occurred_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('c.occurred_at <= ?');
    params.push(filters.dateTo);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

export async function listCases(
  db: Db,
  filters: CaseFilters,
): Promise<Paginated<ModerationCaseDto>> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 1), 100);
  const { whereSql, params } = buildCaseWhere(filters);
  const order = filters.sort === 'occurred_at_asc' ? 'ASC' : 'DESC';
  const totalRow = await db.get<CountRow>(
    `SELECT COUNT(*) AS total FROM moderation_cases c
     LEFT JOIN steam_accounts sa ON sa.steam_id64 = c.steam_id64 ${whereSql}`,
    params,
  );
  const rows = await db.all<ModerationCaseRow>(
    `${CASE_SELECT} ${whereSql} ORDER BY c.occurred_at ${order}, c.case_number ${order}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const relations = await loadRelatedCases(db, rows);
  const total = Number(totalRow?.total ?? 0);
  return {
    items: rows.map((row) => mapCase(row, relations.get(row.id) ?? [])),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCaseDetail(
  db: Db,
  guildId: string,
  idOrRef: string,
): Promise<ModerationCaseDetail | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
  const row = isUuid
    ? await getCaseRowById(db, idOrRef)
    : (await db.get<ModerationCaseRow>(`${CASE_SELECT} WHERE c.guild_id = ? AND c.case_ref = ?`, [
        guildId,
        idOrRef.trim().toUpperCase(),
      ]));
  if (!row || row.guild_id !== guildId) return null;
  const relations = await loadRelatedCases(db, [row]);
  const banRows = await db.all<BanEventRow>('SELECT * FROM ban_events WHERE case_id = ?', [row.id]);
  const unbanRows = await db.all<UnbanEventRow>('SELECT * FROM unban_events WHERE case_id = ?', [
    row.id,
  ]);
  const relatedRefs = new Map(relations.get(row.id)?.map((rel) => [rel.id, rel.caseRef]) ?? []);
  const events: ModerationEventDto[] = [
    ...banRows.map(mapBanEvent),
    ...unbanRows.map((unban) =>
      mapUnbanEvent(
        unban,
        unban.related_ban_case_id ? (relatedRefs.get(unban.related_ban_case_id) ?? null) : null,
      ),
    ),
  ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return {
    ...mapCase(row, relations.get(row.id) ?? []),
    events,
    auditTrail: await listCaseAuditTrail(db, row.id),
    discordMessageId: row.discord_message_id,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
  };
}

export async function findActiveBanForTarget(
  db: Db,
  guildId: string,
  targetDiscordUserId: string,
): Promise<ModerationCaseRow | undefined> {
  return db.get<ModerationCaseRow>(
    `${CASE_SELECT}
     WHERE c.guild_id = ? AND c.target_discord_user_id = ? AND c.action_type = 'BAN' AND c.ban_status = 'ACTIVE'
     ORDER BY c.occurred_at DESC LIMIT 1`,
    [guildId, targetDiscordUserId],
  );
}

export async function findActiveBanBySteam(
  db: Db,
  guildId: string,
  steamId64: string,
): Promise<ModerationCaseRow[]> {
  return db.all<ModerationCaseRow>(
    `${CASE_SELECT}
     WHERE c.guild_id = ? AND c.steam_id64 = ? AND c.action_type = 'BAN' AND c.ban_status = 'ACTIVE'
     ORDER BY c.occurred_at DESC`,
    [guildId, steamId64],
  );
}

async function findRecentCase(
  db: Db,
  filters: {
    guildId: string;
    targetDiscordUserId: string;
    actionType: ActionType;
    withinSeconds: number;
    now: string;
  },
): Promise<ModerationCaseRow | undefined> {
  const threshold = new Date(
    new Date(filters.now).getTime() - filters.withinSeconds * 1000,
  ).toISOString();
  return db.get<ModerationCaseRow>(
    `${CASE_SELECT}
     WHERE c.guild_id = ? AND c.target_discord_user_id = ? AND c.action_type = ? AND c.occurred_at >= ?
     ORDER BY c.occurred_at DESC LIMIT 1`,
    [filters.guildId, filters.targetDiscordUserId, filters.actionType, threshold],
  );
}

export interface RecordBanInput extends CaseSnapshotInput {
  dedupeKey: string;
  banStatus?: BanStatus;
  auditEntryId?: string | null;
  /** Dedupe window used when reconciling with audit-log events. */
  dedupeWindowSeconds?: number;
}

export interface RecordEventResult {
  case: ModerationCaseDto;
  duplicate: boolean;
  relatedCaseRef: string | null;
}

export async function recordBanEvent(
  db: Db,
  input: RecordBanInput,
  now: string,
): Promise<RecordEventResult> {
  const existing = await db.get<BanEventRow>('SELECT * FROM ban_events WHERE dedupe_key = ?', [
    input.dedupeKey,
  ]);
  if (existing) {
    const existingCase = await getCaseById(db, existing.case_id);
    if (existingCase) return { case: existingCase, duplicate: true, relatedCaseRef: null };
  }
  if (input.source === 'GATEWAY_AUDIT_LOG' || input.source === 'RECONCILIATION') {
    const recent = await findRecentCase(db, {
      guildId: input.guildId,
      targetDiscordUserId: input.targetDiscordUserId,
      actionType: 'BAN',
      withinSeconds: input.dedupeWindowSeconds ?? 300,
      now,
    });
    if (recent) {
      return { case: mapCase(recent), duplicate: true, relatedCaseRef: null };
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const duplicate = await tx.get<BanEventRow>(
        'SELECT * FROM ban_events WHERE dedupe_key = ?',
        [input.dedupeKey],
      );
      if (duplicate) {
        const existingCase = await getCaseById(tx, duplicate.case_id);
        if (existingCase) return { case: existingCase, duplicate: true, relatedCaseRef: null };
      }

      const banStatus: BanStatus = input.banStatus ?? 'ACTIVE';
      const superseded = await findActiveBanForTarget(tx, input.guildId, input.targetDiscordUserId);
      if (superseded && banStatus === 'ACTIVE') {
        await tx.run(
          `UPDATE moderation_cases SET status = 'LIFTED', ban_status = 'LIFTED', updated_at = ?
           WHERE id = ?`,
          [now, superseded.id],
        );
        await recordAuditEvent(
          tx,
          {
            guildId: input.guildId,
            actorType: 'SYSTEM',
            action: 'case.superseded',
            entityType: 'moderation_case',
            entityId: superseded.id,
            summary: `Case ${superseded.case_ref} superseded by a newer ban record for the same user.`,
            before: { banStatus: 'ACTIVE' },
            after: { banStatus: 'LIFTED', supersededBySource: input.source },
          },
          now,
        );
      }

      const created = await createModerationCase(
        tx,
        {
          ...input,
          actionType: 'BAN',
          status: banStatus === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN',
          banStatus,
        },
        now,
      );
      await tx.run(
        `INSERT INTO ban_events (
          id, case_id, guild_id, target_discord_user_id, target_discord_username_at_event,
          target_discord_global_name_at_event, moderator_discord_user_id, moderator_name_at_event,
          reason, occurred_at, recorded_at, source, attribution_status, discord_audit_log_entry_id,
          steam_id64, steam_name_at_event, steam_profile_url_at_event, dedupe_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          created.id,
          input.guildId,
          input.targetDiscordUserId,
          input.targetUsername ?? null,
          input.targetGlobalName ?? null,
          input.moderatorDiscordUserId ?? null,
          input.moderatorName ?? null,
          input.reason ?? null,
          input.occurredAt,
          now,
          input.source,
          input.attributionStatus,
          input.auditEntryId ?? null,
          input.steamId64 ?? null,
          input.steamNameAtEvent ?? null,
          input.steamProfileUrlAtEvent ??
            (input.steamId64 ? steamProfileUrl(input.steamId64) : null),
          input.dedupeKey,
          now,
        ],
      );
      await recordAuditEvent(
        tx,
        {
          guildId: input.guildId,
          actorDiscordId: input.moderatorDiscordUserId ?? null,
          actorType: input.moderatorDiscordUserId ? 'USER' : 'SYSTEM',
          action: 'case.ban_recorded',
          entityType: 'moderation_case',
          entityId: created.id,
          summary: `Ban case ${created.caseRef} recorded for user ${input.targetDiscordUserId}.`,
          after: {
            caseRef: created.caseRef,
            source: input.source,
            attributionStatus: input.attributionStatus,
            moderatorDiscordUserId: input.moderatorDiscordUserId ?? null,
          },
        },
        now,
      );
      return { case: created, duplicate: false, relatedCaseRef: null };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await db.get<BanEventRow>('SELECT * FROM ban_events WHERE dedupe_key = ?', [
        input.dedupeKey,
      ]);
      if (duplicate) {
        const existingCase = await getCaseById(db, duplicate.case_id);
        if (existingCase) return { case: existingCase, duplicate: true, relatedCaseRef: null };
      }
    }
    throw error;
  }
}

export interface RecordUnbanInput extends CaseSnapshotInput {
  dedupeKey: string;
  auditEntryId?: string | null;
  relatedBanCaseId?: string | null;
  dedupeWindowSeconds?: number;
}

export async function recordUnbanEvent(
  db: Db,
  input: RecordUnbanInput,
  now: string,
): Promise<RecordEventResult> {
  const existing = await db.get<UnbanEventRow>('SELECT * FROM unban_events WHERE dedupe_key = ?', [
    input.dedupeKey,
  ]);
  if (existing) {
    const existingCase = await getCaseById(db, existing.case_id);
    if (existingCase) {
      return {
        case: existingCase,
        duplicate: true,
        relatedCaseRef: null,
      };
    }
  }
  if (input.source === 'GATEWAY_AUDIT_LOG' || input.source === 'RECONCILIATION') {
    const recent = await findRecentCase(db, {
      guildId: input.guildId,
      targetDiscordUserId: input.targetDiscordUserId,
      actionType: 'UNBAN',
      withinSeconds: input.dedupeWindowSeconds ?? 300,
      now,
    });
    if (recent) return { case: mapCase(recent), duplicate: true, relatedCaseRef: null };
  }

  try {
    return await db.transaction(async (tx) => {
      const duplicate = await tx.get<UnbanEventRow>(
        'SELECT * FROM unban_events WHERE dedupe_key = ?',
        [input.dedupeKey],
      );
      if (duplicate) {
        const existingCase = await getCaseById(tx, duplicate.case_id);
        if (existingCase) {
          return { case: existingCase, duplicate: true, relatedCaseRef: null };
        }
      }

      let banCaseId = input.relatedBanCaseId ?? null;
      if (!banCaseId) {
        const active = await findActiveBanForTarget(tx, input.guildId, input.targetDiscordUserId);
        banCaseId = active?.id ?? null;
      }
      let relatedCaseRef: string | null = null;
      if (banCaseId) {
        const banCase = await getCaseRowById(tx, banCaseId);
        relatedCaseRef = banCase?.case_ref ?? null;
      }

      const created = await createModerationCase(
        tx,
        {
          ...input,
          actionType: 'UNBAN',
          status: 'COMPLETED',
          banStatus: null,
          relatedCaseId: banCaseId,
        },
        now,
      );
      await tx.run(
        `INSERT INTO unban_events (
          id, case_id, guild_id, target_discord_user_id, target_discord_username_at_event,
          target_discord_global_name_at_event, moderator_discord_user_id, moderator_name_at_event,
          reason, occurred_at, recorded_at, source, attribution_status, discord_audit_log_entry_id,
          related_ban_case_id, steam_id64, steam_name_at_event, steam_profile_url_at_event,
          dedupe_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          created.id,
          input.guildId,
          input.targetDiscordUserId,
          input.targetUsername ?? null,
          input.targetGlobalName ?? null,
          input.moderatorDiscordUserId ?? null,
          input.moderatorName ?? null,
          input.reason ?? null,
          input.occurredAt,
          now,
          input.source,
          input.attributionStatus,
          input.auditEntryId ?? null,
          banCaseId,
          input.steamId64 ?? null,
          input.steamNameAtEvent ?? null,
          input.steamProfileUrlAtEvent ??
            (input.steamId64 ? steamProfileUrl(input.steamId64) : null),
          input.dedupeKey,
          now,
        ],
      );
      if (banCaseId) {
        await tx.run(
          `UPDATE moderation_cases SET status = 'LIFTED', ban_status = 'LIFTED', updated_at = ?
           WHERE id = ?`,
          [now, banCaseId],
        );
      }
      await recordAuditEvent(
        tx,
        {
          guildId: input.guildId,
          actorDiscordId: input.moderatorDiscordUserId ?? null,
          actorType: input.moderatorDiscordUserId ? 'USER' : 'SYSTEM',
          action: 'case.unban_recorded',
          entityType: 'moderation_case',
          entityId: created.id,
          summary: `Unban case ${created.caseRef} recorded for user ${input.targetDiscordUserId}.`,
          after: {
            caseRef: created.caseRef,
            relatedBanCaseId: banCaseId,
            source: input.source,
            moderatorDiscordUserId: input.moderatorDiscordUserId ?? null,
          },
        },
        now,
      );
      return { case: created, duplicate: false, relatedCaseRef };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await db.get<UnbanEventRow>(
        'SELECT * FROM unban_events WHERE dedupe_key = ?',
        [input.dedupeKey],
      );
      if (duplicate) {
        const existingCase = await getCaseById(db, duplicate.case_id);
        if (existingCase) {
          return { case: existingCase, duplicate: true, relatedCaseRef: null };
        }
      }
    }
    throw error;
  }
}

/**
 * Explicit, audited correction of an inaccurate case record. Only fields that
 * can legitimately be corrected are accepted; event snapshots are otherwise
 * immutable.
 */
export async function correctCaseFields(
  db: Db,
  input: {
    caseId: string;
    actorDiscordId: string;
    patch: {
      reason?: string;
      moderatorDiscordUserId?: string | null;
      moderatorName?: string | null;
      steamId64?: string | null;
      steamNameAtEvent?: string | null;
      steamProfileUrlAtEvent?: string | null;
      attributionStatus?: AttributionStatus;
    };
  },
  now: string,
): Promise<ModerationCaseDto | null> {
  const before = await getCaseRowById(db, input.caseId);
  if (!before) return null;
  const assignments: string[] = [];
  const params: (string | null)[] = [];
  const patch = input.patch;
  const columns: Record<string, string | null | undefined> = {
    reason: patch.reason,
    moderator_discord_user_id: patch.moderatorDiscordUserId,
    moderator_name_at_event: patch.moderatorName,
    steam_id64: patch.steamId64,
    steam_name_at_event: patch.steamNameAtEvent,
    steam_profile_url_at_event: patch.steamProfileUrlAtEvent,
    attribution_status: patch.attributionStatus,
  };
  for (const [column, value] of Object.entries(columns)) {
    if (value !== undefined) {
      assignments.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (assignments.length === 0) return getCaseById(db, input.caseId);
  assignments.push('updated_at = ?');
  params.push(now, input.caseId);
  await db.run(
    `UPDATE moderation_cases SET ${assignments.join(', ')} WHERE id = ?`,
    params,
  );
  await recordAuditEvent(
    db,
    {
      guildId: before.guild_id,
      actorDiscordId: input.actorDiscordId,
      actorType: 'USER',
      action: 'case.corrected',
      entityType: 'moderation_case',
      entityId: input.caseId,
      summary: `Case ${before.case_ref} was corrected by ${input.actorDiscordId}.`,
      before: {
        reason: before.reason,
        moderatorDiscordUserId: before.moderator_discord_user_id,
        moderatorName: before.moderator_name_at_event,
        steamId64: before.steam_id64,
        steamNameAtEvent: before.steam_name_at_event,
        attributionStatus: before.attribution_status,
      },
      after: patch,
    },
    now,
  );
  return getCaseById(db, input.caseId);
}

export interface OverviewCounts {
  cases: number;
  banActions: number;
  activeBans: number;
  unbans: number;
  unknownBanStatus: number;
  warnings: number;
  pcOpen: number;
  pcCompleted: number;
  pcTotal: number;
  announcementsPublished: number;
  announcementsDrafts: number;
  earliestRecordedAt: string | null;
  demoData: boolean;
}

export async function getOverviewCounts(db: Db, guildId: string): Promise<OverviewCounts> {
  const caseRow = await db.get<{
    cases: number | string | null;
    ban_actions: number | string | null;
    active_bans: number | string | null;
    unbans: number | string | null;
    unknown_ban_status: number | string | null;
    warnings: number | string | null;
    earliest: string | null;
  }>(
    `SELECT
       COUNT(*) AS cases,
       SUM(CASE WHEN action_type = 'BAN' THEN 1 ELSE 0 END) AS ban_actions,
       SUM(CASE WHEN action_type = 'BAN' AND ban_status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_bans,
       SUM(CASE WHEN action_type = 'UNBAN' THEN 1 ELSE 0 END) AS unbans,
       SUM(CASE WHEN action_type = 'BAN' AND (ban_status = 'UNKNOWN' OR ban_status IS NULL) THEN 1 ELSE 0 END) AS unknown_ban_status,
       SUM(CASE WHEN action_type = 'WARN' THEN 1 ELSE 0 END) AS warnings,
       MIN(recorded_at) AS earliest
     FROM moderation_cases WHERE guild_id = ?`,
    [guildId],
  );
  const pcRow = await db.get<{
    total: number | string | null;
    open: number | string | null;
    completed: number | string | null;
  }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status IN ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
     FROM pc_check_cases WHERE guild_id = ?`,
    [guildId],
  );
  const announcementRow = await db.get<{
    published: number | string | null;
    drafts: number | string | null;
  }>(
    `SELECT
       SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS drafts
     FROM announcements WHERE guild_id = ?`,
    [guildId],
  );
  const demoCase = await db.get<{ id: string }>(
    `SELECT id FROM moderation_cases WHERE source = 'DEMO_SEED' LIMIT 1`,
  );
  const demoPc = await db.get<{ id: string }>(
    `SELECT id FROM pc_check_cases WHERE requested_by = 'DEMO_SEED' LIMIT 1`,
  );
  const demoAnnouncement = await db.get<{ id: string }>(
    `SELECT id FROM announcements WHERE author_discord_id = 'DEMO_SEED' LIMIT 1`,
  );

  const number = (value: number | string | null | undefined): number => Number(value ?? 0);
  return {
    cases: number(caseRow?.cases),
    banActions: number(caseRow?.ban_actions),
    activeBans: number(caseRow?.active_bans),
    unbans: number(caseRow?.unbans),
    unknownBanStatus: number(caseRow?.unknown_ban_status),
    warnings: number(caseRow?.warnings),
    pcOpen: number(pcRow?.open),
    pcCompleted: number(pcRow?.completed),
    pcTotal: number(pcRow?.total),
    announcementsPublished: number(announcementRow?.published),
    announcementsDrafts: number(announcementRow?.drafts),
    earliestRecordedAt: caseRow?.earliest ?? null,
    demoData: Boolean(demoCase || demoPc || demoAnnouncement),
  };
}

export async function getStaffActivity(
  db: Db,
  guildId: string,
  limit = 50,
): Promise<StaffActivityRow[]> {
  const rows = await db.all<{
    id: string;
    total: number | string;
    bans: number | string | null;
    unbans: number | string | null;
    warnings: number | string | null;
    last_at: string | null;
    latest_name: string | null;
  }>(
    `SELECT c.moderator_discord_user_id AS id,
       COUNT(*) AS total,
       SUM(CASE WHEN c.action_type = 'BAN' THEN 1 ELSE 0 END) AS bans,
       SUM(CASE WHEN c.action_type = 'UNBAN' THEN 1 ELSE 0 END) AS unbans,
       SUM(CASE WHEN c.action_type = 'WARN' THEN 1 ELSE 0 END) AS warnings,
       MAX(c.occurred_at) AS last_at,
       (SELECT c2.moderator_name_at_event FROM moderation_cases c2
         WHERE c2.moderator_discord_user_id = c.moderator_discord_user_id
           AND c2.guild_id = c.guild_id
         ORDER BY c2.occurred_at DESC LIMIT 1) AS latest_name
     FROM moderation_cases c
     WHERE c.guild_id = ? AND c.moderator_discord_user_id IS NOT NULL
     GROUP BY c.moderator_discord_user_id
     ORDER BY total DESC
     LIMIT ?`,
    [guildId, limit],
  );
  const pcRows = await db.all<{ id: string; assigned: number | string; closed: number | string }>(
    `SELECT assigned_to AS id, COUNT(*) AS assigned,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS closed
     FROM pc_check_cases WHERE guild_id = ? AND assigned_to IS NOT NULL
     GROUP BY assigned_to`,
    [guildId],
  );
  const pcMap = new Map(pcRows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const pc = pcMap.get(row.id);
    return {
      moderatorDiscordId: row.id,
      moderatorName: row.latest_name,
      totalActions: Number(row.total),
      banActions: Number(row.bans ?? 0),
      unbanActions: Number(row.unbans ?? 0),
      warningsIssued: Number(row.warnings ?? 0),
      pcChecksAssigned: Number(pc?.assigned ?? 0),
      pcChecksClosed: Number(pc?.closed ?? 0),
      lastActionAt: row.last_at,
    };
  });
}

/** Used by the dashboard settings page to show whether setup has run. */
export async function getSetupState(
  db: Db,
  guildId: string,
): Promise<{ configUpdatedAt: string | null; configured: boolean }> {
  const config = await getGuildConfiguration(db, guildId);
  return {
    configUpdatedAt: config.updatedAt,
    configured: Boolean(config.config.setupCompletedAt),
  };
}

/** Cases whose Discord actor could not be verified yet (used for reconciliation). */
export async function listUnattributedCases(
  db: Db,
  guildId: string,
  sinceIso: string,
  limit = 50,
): Promise<ModerationCaseDto[]> {
  const rows = await db.all<ModerationCaseRow>(
    `${CASE_SELECT}
     WHERE c.guild_id = ?
       AND c.attribution_status IN ('UNKNOWN', 'PARTIAL')
       AND c.occurred_at >= ?
       AND c.action_type IN ('BAN', 'UNBAN')
     ORDER BY c.occurred_at DESC LIMIT ?`,
    [guildId, sinceIso, limit],
  );
  return rows.map((row) => mapCase(row));
}

/**
 * Audited attribution update, used when Discord audit-log entries appear after
 * the original event (or when a moderator was previously unknown).
 */
export async function updateCaseAttribution(
  db: Db,
  input: {
    caseId: string;
    guildId: string;
    moderatorDiscordUserId: string | null;
    moderatorName: string | null;
    attributionStatus: AttributionStatus;
    auditEntryId: string | null;
    evidence: Record<string, unknown>;
  },
  now: string,
): Promise<ModerationCaseDto | null> {
  return db.transaction(async (tx) => {
    const before = await getCaseRowById(tx, input.caseId);
    if (!before || before.guild_id !== input.guildId) return null;
    await tx.run(
      `UPDATE moderation_cases
       SET moderator_discord_user_id = ?, moderator_name_at_event = ?, attribution_status = ?,
           attribution_evidence_json = ?, external_ref = COALESCE(?, external_ref), updated_at = ?
       WHERE id = ?`,
      [
        input.moderatorDiscordUserId,
        input.moderatorName,
        input.attributionStatus,
        stringifyJson(input.evidence),
        input.auditEntryId,
        now,
        input.caseId,
      ],
    );
    for (const table of ['ban_events', 'unban_events']) {
      await tx.run(
        `UPDATE ${table}
         SET moderator_discord_user_id = ?, moderator_name_at_event = ?, attribution_status = ?,
             discord_audit_log_entry_id = COALESCE(?, discord_audit_log_entry_id)
         WHERE case_id = ?`,
        [
          input.moderatorDiscordUserId,
          input.moderatorName,
          input.attributionStatus,
          input.auditEntryId,
          input.caseId,
        ],
      );
    }
    await recordAuditEvent(
      tx,
      {
        guildId: input.guildId,
        actorType: 'SYSTEM',
        action: 'case.attribution_updated',
        entityType: 'moderation_case',
        entityId: input.caseId,
        summary: `Attribution for ${before.case_ref} updated to ${input.attributionStatus}.`,
        before: {
          moderatorDiscordUserId: before.moderator_discord_user_id,
          attributionStatus: before.attribution_status,
        },
        after: {
          moderatorDiscordUserId: input.moderatorDiscordUserId,
          attributionStatus: input.attributionStatus,
          evidence: input.evidence,
        },
      },
      now,
    );
    const updated = await getCaseRowById(tx, input.caseId);
    return updated ? mapCase(updated) : null;
  });
}
