import {
  nowIso,
  type AccessLevel,
  type Paginated,
  type PcCheckDto,
  type PcCheckNoteDto,
  type PcCheckOutcome,
  type PcCheckStatus,
  type PcCheckStatus as PcStatus,
} from '@dardania/shared';
import {
  addPcCheckNote,
  createPcCheck,
  enqueueDelivery,
  getPcCheck,
  getUsersByIds,
  listPcCheckNotes,
  listPcChecks,
  recordAuditEvent,
  updatePcCheck,
  type Db,
} from '@dardania/db';
import { badRequest, notFound } from '../errors.js';
import type { SteamService } from './steam.js';

const HISTORY_LEVELS: AccessLevel[] = ['OWNER', 'CO_OWNER'];

export class PcCheckService {
  constructor(
    private readonly db: Db,
    private readonly guildId: string,
    private readonly steam: SteamService,
    private readonly now: () => string = nowIso,
  ) {}

  private assertGuild(): string {
    if (!this.guildId) throw badRequest('DISCORD_GUILD_ID is not configured on the backend.');
    return this.guildId;
  }

  async create(
    input: {
      targetDiscordUserId: string;
      steamId64?: string | null;
      steamInput?: string | null;
      requestedBy?: string | null;
      assignedTo?: string | null;
      reason?: string | null;
      channelId?: string | null;
    },
    actorDiscordId: string,
  ): Promise<PcCheckDto> {
    let steamId64 = input.steamId64 ?? null;
    if (!steamId64 && input.steamInput) {
      const resolved = await this.steam.resolveInput(input.steamInput);
      steamId64 = resolved.steamId64;
      if (!steamId64) throw badRequest(resolved.error ?? 'Steam profile could not be resolved.');
    }
    const snapshot = steamId64 ? await this.steam.snapshotForEvent(steamId64, this.now()) : null;
    const created = await createPcCheck(
      this.db,
      {
        guildId: this.assertGuild(),
        targetDiscordUserId: input.targetDiscordUserId,
        steamId64: snapshot?.steamId64 ?? null,
        steamNameAtEvent: snapshot?.nameAtEvent ?? null,
        requestedBy: input.requestedBy ?? actorDiscordId,
        assignedTo: input.assignedTo ?? null,
        reason: input.reason ?? null,
        channelId: input.channelId ?? null,
      },
      this.now(),
    );
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'pc_check.created',
        entityType: 'pc_check_case',
        entityId: created.id,
        summary: `PC check ${created.caseRef} created for ${created.targetDiscordUserId}.`,
        after: { caseRef: created.caseRef, status: created.status },
      },
      this.now(),
    );
    await enqueueDelivery(this.db, {
      topic: 'DISCORD_LOG',
      dedupeKey: `discord-log:pc:${created.id}:created`,
      payload: {
        guildId: this.guildId,
        channelKey: 'pc-check-logs',
        caseRef: created.caseRef,
        actionType: 'PC_CHECK_CREATED',
        targetDiscordUserId: created.targetDiscordUserId,
        steamId64: created.steamId64,
        steamNameAtEvent: created.steamNameAtEvent,
        occurredAt: created.createdAt,
      },
      now: this.now(),
    });
    return created;
  }

  async list(filters: {
    status?: PcStatus;
    targetDiscordUserId?: string;
    assignedTo?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<PcCheckDto>> {
    return listPcChecks(this.db, { ...filters, guildId: this.assertGuild() });
  }

  async detail(
    idOrRef: string,
    level: AccessLevel,
  ): Promise<PcCheckDto & { notes: PcCheckNoteDto[]; targetName: string | null }> {
    const pcCheck = await getPcCheck(this.db, this.assertGuild(), idOrRef);
    if (!pcCheck) throw notFound('PC check not found.');
    const notes = await listPcCheckNotes(this.db, pcCheck.id, {
      includeOwnerOnly: HISTORY_LEVELS.includes(level),
    });
    const users = await getUsersByIds(this.db, [pcCheck.targetDiscordUserId]);
    const target = users[0];
    return { ...pcCheck, notes, targetName: target?.global_name ?? target?.username ?? null };
  }

  async update(
    idOrRef: string,
    patch: {
      status?: PcCheckStatus;
      outcome?: PcCheckOutcome | null;
      assignedTo?: string | null;
      reason?: string;
      channelId?: string | null;
    },
    actorDiscordId: string,
  ): Promise<PcCheckDto> {
    const existing = await getPcCheck(this.db, this.assertGuild(), idOrRef);
    if (!existing) throw notFound('PC check not found.');
    const updated = await updatePcCheck(this.db, { id: existing.id, ...patch }, this.now());
    if (!updated) throw notFound('PC check not found.');
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'pc_check.updated',
        entityType: 'pc_check_case',
        entityId: existing.id,
        summary: `PC check ${existing.caseRef} updated (${existing.status} → ${updated.status}).`,
        before: { status: existing.status, assignedTo: existing.assignedTo, outcome: existing.outcome },
        after: { status: updated.status, assignedTo: updated.assignedTo, outcome: updated.outcome },
      },
      this.now(),
    );
    if (existing.status !== updated.status && (updated.status === 'COMPLETED' || updated.status === 'CANCELLED')) {
      await enqueueDelivery(this.db, {
        topic: 'DISCORD_LOG',
        dedupeKey: `discord-log:pc:${existing.id}:${updated.status.toLowerCase()}`,
        payload: {
          guildId: this.guildId,
          channelKey: 'pc-check-logs',
          caseRef: updated.caseRef,
          actionType: updated.status === 'COMPLETED' ? 'PC_CHECK_COMPLETED' : 'PC_CHECK_CANCELLED',
          targetDiscordUserId: updated.targetDiscordUserId,
          outcome: updated.outcome,
          occurredAt: this.now(),
        },
        now: this.now(),
      });
    }
    return updated;
  }

  async addNote(
    idOrRef: string,
    input: { note: string; visibility: 'STAFF' | 'OWNER' },
    actor: { discordUserId: string; name: string | null; level: AccessLevel },
  ): Promise<PcCheckNoteDto> {
    const existing = await getPcCheck(this.db, this.assertGuild(), idOrRef);
    if (!existing) throw notFound('PC check not found.');
    if (input.visibility === 'OWNER' && !HISTORY_LEVELS.includes(actor.level)) {
      throw badRequest('Owner-only notes require Owner or Co-Owner access.');
    }
    const note = await addPcCheckNote(
      this.db,
      {
        pcCheckId: existing.id,
        authorDiscordId: actor.discordUserId,
        authorName: actor.name,
        note: input.note,
        visibility: input.visibility,
      },
      this.now(),
    );
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId: actor.discordUserId,
        actorType: 'USER',
        action: 'pc_check.note_added',
        entityType: 'pc_check_case',
        entityId: existing.id,
        summary: `A ${input.visibility.toLowerCase()} note was added to PC check ${existing.caseRef}.`,
        after: { noteId: note.id, visibility: note.visibility },
      },
      this.now(),
    );
    return note;
  }
}
