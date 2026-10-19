import { badRequest, forbidden, notFound, serviceUnavailable } from '../errors.js';
import type { Db } from '@dardania/db';
import {
  createModerationCase,
  enqueueDelivery,
  getActiveSteamLinkForDiscordUser,
  getGuild,
  recordAuditEvent,
  recordBanEvent,
  recordUnbanEvent,
  recordWarning,
  clearWarnings,
  upsertGuild,
  upsertUser,
  type CaseSnapshotInput,
} from '@dardania/db';
import {
  isValidSteamId64,
  nowIso,
  type ApiEnv,
  type ActionType,
  type AttributionStatus,
} from '@dardania/shared';
import type { SteamService } from './steam.js';
import type { ModerationEventPayload } from '../schemas.js';

export interface IngestResult {
  caseId: string;
  caseRef: string;
  actionType: ActionType;
  duplicate: boolean;
  steamId64: string | null;
  steamNameAtEvent: string | null;
  attributionStatus: AttributionStatus;
  relatedCaseRef: string | null;
}

const DISCORD_LOG_CHANNEL: Partial<Record<ActionType, string>> = {
  BAN: 'ban-logs',
  UNBAN: 'ban-logs',
  WARN: 'mod-logs',
  WARN_CLEAR: 'mod-logs',
  KICK: 'mod-logs',
  TIMEOUT: 'mod-logs',
  UNTIMEOUT: 'mod-logs',
  PURGE: 'mod-logs',
};

export class ModerationService {
  constructor(
    private readonly db: Db,
    private readonly env: ApiEnv,
    private readonly steam: SteamService,
    private readonly now: () => string = nowIso,
  ) {}

  private assertGuildAllowed(guildId: string): void {
    if (this.env.discord.allowedGuildIds.length === 0) return;
    if (!this.env.discord.allowedGuildIds.includes(guildId)) {
      throw forbidden('This guild is not authorised for this deployment.');
    }
  }

  async ingest(payload: ModerationEventPayload): Promise<IngestResult> {
    this.assertGuildAllowed(payload.guildId);
    const now = this.now();

    const existingGuild = await getGuild(this.db, payload.guildId);
    await upsertGuild(
      this.db,
      {
        id: payload.guildId,
        name: payload.guildName ?? existingGuild?.name ?? 'Discord server',
      },
      now,
    );
    if (payload.target.username) {
      await upsertUser(
        this.db,
        {
          id: payload.target.id,
          username: payload.target.username,
          globalName: payload.target.globalName ?? null,
        },
        now,
      );
    }
    if (payload.moderator?.id && payload.moderator.name) {
      await upsertUser(
        this.db,
        { id: payload.moderator.id, username: payload.moderator.name },
        now,
      );
    }

    let steamId64 = payload.steamId64 ?? null;
    if (steamId64 && !isValidSteamId64(steamId64)) {
      throw badRequest('Invalid SteamID64 supplied with the moderation event.');
    }
    if (!steamId64 && payload.steamInput) {
      const resolved = await this.steam.resolveInput(payload.steamInput);
      steamId64 = resolved.steamId64;
    }
    if (!steamId64) {
      // Only an explicit, stored Discord <-> Steam link is used automatically.
      const link = await getActiveSteamLinkForDiscordUser(this.db, payload.target.id);
      steamId64 = link?.steam_id64 ?? null;
    }
    const snapshot = steamId64
      ? await this.steam.snapshotForEvent(steamId64, payload.occurredAt)
      : null;

    const base: CaseSnapshotInput = {
      guildId: payload.guildId,
      targetDiscordUserId: payload.target.id,
      targetUsername: payload.target.username ?? null,
      targetGlobalName: payload.target.globalName ?? null,
      moderatorDiscordUserId: payload.moderator?.id ?? null,
      moderatorName: payload.moderator?.name ?? null,
      reason: payload.reason ?? null,
      occurredAt: payload.occurredAt,
      source: payload.source,
      attributionStatus: payload.attributionStatus,
      attributionEvidence: payload.attributionEvidence ?? {
        source: payload.source,
        auditEntryId: payload.auditEntryId ?? null,
      },
      steamId64: snapshot?.steamId64 ?? null,
      steamNameAtEvent: snapshot?.nameAtEvent ?? null,
      steamProfileUrlAtEvent: snapshot?.profileUrl ?? null,
      steamNameSource: snapshot?.nameSource ?? null,
      expiresAt: payload.expiresAt ?? null,
      discordMessageId: payload.channelMessageId ?? null,
      externalRef: payload.auditEntryId ?? null,
      metadata: payload.metadata ?? null,
    };

    let result: {
      case: { id: string; caseRef: string };
      duplicate: boolean;
      relatedCaseRef: string | null;
    };

    switch (payload.actionType) {
      case 'BAN':
        result = await recordBanEvent(
          this.db,
          {
            ...base,
            dedupeKey: payload.dedupeKey,
            banStatus: payload.banStatus ?? 'ACTIVE',
            auditEntryId: payload.auditEntryId ?? null,
          },
          now,
        );
        break;
      case 'UNBAN':
        result = await recordUnbanEvent(
          this.db,
          {
            ...base,
            dedupeKey: payload.dedupeKey,
            auditEntryId: payload.auditEntryId ?? null,
          },
          now,
        );
        break;
      case 'WARN': {
        const warning = await recordWarning(
          this.db,
          { ...base, dedupeKey: payload.dedupeKey },
          now,
        );
        await recordAuditEvent(
          this.db,
          {
            guildId: payload.guildId,
            actorDiscordId: payload.moderator?.id ?? null,
            actorType: payload.moderator?.id ? 'USER' : 'SYSTEM',
            action: 'case.warning_recorded',
            entityType: 'moderation_case',
            entityId: warning.case.id,
            summary: `Warning ${warning.case.caseRef} recorded for user ${payload.target.id}.`,
            after: { caseRef: warning.case.caseRef, reason: payload.reason ?? null },
          },
          now,
        );
        result = { case: warning.case, duplicate: false, relatedCaseRef: null };
        break;
      }
      case 'WARN_CLEAR': {
        const cleared = await clearWarnings(
          this.db,
          {
            guildId: payload.guildId,
            targetDiscordUserId: payload.target.id,
            moderatorDiscordUserId: payload.moderator?.id ?? 'SYSTEM',
            moderatorName: payload.moderator?.name ?? null,
            reason: payload.reason ?? null,
            targetUsername: payload.target.username ?? null,
            targetGlobalName: payload.target.globalName ?? null,
            steamId64: snapshot?.steamId64 ?? null,
            steamNameAtEvent: snapshot?.nameAtEvent ?? null,
            source: payload.source,
          },
          now,
        );
        if (!cleared.case) {
          throw notFound('No active warnings were found for this user.');
        }
        result = { case: cleared.case, duplicate: false, relatedCaseRef: null };
        break;
      }
      default: {
        const created = await createModerationCase(
          this.db,
          {
            ...base,
            actionType: payload.actionType,
            status: 'COMPLETED',
            banStatus: null,
          },
          now,
        );
        await recordAuditEvent(
          this.db,
          {
            guildId: payload.guildId,
            actorDiscordId: payload.moderator?.id ?? null,
            actorType: payload.moderator?.id ? 'USER' : 'SYSTEM',
            action: `case.${payload.actionType.toLowerCase()}_recorded`,
            entityType: 'moderation_case',
            entityId: created.id,
            summary: `${payload.actionType} ${created.caseRef} recorded for user ${payload.target.id}.`,
            after: { caseRef: created.caseRef, source: payload.source },
          },
          now,
        );
        result = { case: created, duplicate: false, relatedCaseRef: null };
        break;
      }
    }

    if (!result.duplicate) {
      const channelKey = DISCORD_LOG_CHANNEL[payload.actionType] ?? 'mod-logs';
      await enqueueDelivery(this.db, {
        topic: 'DISCORD_LOG',
        dedupeKey: `discord-log:${result.case.id}`,
        payload: {
          guildId: payload.guildId,
          channelKey,
          caseRef: result.case.caseRef,
          actionType: payload.actionType,
          targetDiscordUserId: payload.target.id,
          moderatorDiscordUserId: payload.moderator?.id ?? null,
          reason: payload.reason ?? null,
          occurredAt: payload.occurredAt,
          attributionStatus: payload.attributionStatus,
          steamId64: snapshot?.steamId64 ?? null,
          steamNameAtEvent: snapshot?.nameAtEvent ?? null,
        },
        now,
      });
    }

    return {
      caseId: result.case.id,
      caseRef: result.case.caseRef,
      actionType: payload.actionType,
      duplicate: result.duplicate,
      steamId64: snapshot?.steamId64 ?? null,
      steamNameAtEvent: snapshot?.nameAtEvent ?? null,
      attributionStatus: payload.attributionStatus,
      relatedCaseRef: result.relatedCaseRef,
    };
  }

  /** Health probe used by internal endpoints. */
  async ping(): Promise<void> {
    const ok = await this.db.get<{ ok: number }>('SELECT 1 AS ok');
    if (!ok) throw serviceUnavailable('Database is not responding.');
  }
}
