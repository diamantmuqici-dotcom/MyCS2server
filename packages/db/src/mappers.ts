import {
  steamProfileUrl,
  type AnnouncementDto,
  type AuditEventDto,
  type BanStatus,
  type CaseRelation,
  type DashboardAccessDto,
  type ModerationCaseDto,
  type ModerationEventDto,
  type PcCheckDto,
  type PcCheckNoteDto,
  type SteamAccountDto,
  type SteamCurrent,
  type SteamNameHistoryDto,
  type SteamSnapshot,
} from '@dardania/shared';
import { parseJson } from './json.js';
import type {
  AnnouncementRow,
  AuditEventRow,
  BanEventRow,
  DashboardAccessRow,
  ModerationCaseRow,
  PcCheckNoteRow,
  PcCheckRow,
  SteamAccountRow,
  SteamNameHistoryRow,
  UnbanEventRow,
} from './rows.js';

const STEAM_PROFILE_STATUSES = new Set(['PUBLIC', 'PRIVATE', 'UNKNOWN', 'UNAVAILABLE']);

function normalizeProfileStatus(value: string | null | undefined): SteamCurrent['profileStatus'] {
  return value && STEAM_PROFILE_STATUSES.has(value)
    ? (value as SteamCurrent['profileStatus'])
    : 'UNKNOWN';
}

function mapSteamCurrent(row: ModerationCaseRow): SteamCurrent | null {
  if (!row.steam_id64) return null;
  return {
    steamId64: row.steam_id64,
    displayName: row.sa_current_display_name ?? null,
    profileUrl: row.sa_profile_url ?? steamProfileUrl(row.steam_id64),
    profileStatus: normalizeProfileStatus(row.sa_profile_status),
    lastCheckedAt: row.sa_last_checked_at ?? null,
  };
}

function mapSteamSnapshot(row: ModerationCaseRow): SteamSnapshot {
  return {
    steamId64: row.steam_id64,
    name: row.steam_name_at_event,
    profileUrl:
      row.steam_profile_url_at_event ??
      (row.steam_id64 ? steamProfileUrl(row.steam_id64) : null),
    nameSource: row.steam_name_source,
  };
}

export function mapCase(
  row: ModerationCaseRow,
  relatedCases: CaseRelation[] = [],
): ModerationCaseDto {
  return {
    id: row.id,
    caseRef: row.case_ref,
    caseNumber: Number(row.case_number),
    guildId: row.guild_id,
    actionType: row.action_type,
    status: row.status,
    banStatus: (row.ban_status as BanStatus | null) ?? null,
    target: {
      discordUserId: row.target_discord_user_id,
      usernameAtEvent: row.target_discord_username_at_event,
      displayNameAtEvent: row.target_discord_global_name_at_event,
    },
    moderator: {
      discordUserId: row.moderator_discord_user_id,
      nameAtEvent: row.moderator_name_at_event,
    },
    reason: row.reason,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    source: row.source,
    attributionStatus: row.attribution_status,
    attributionEvidence: parseJson<Record<string, unknown> | null>(row.attribution_evidence_json, null),
    steamAtEvent: mapSteamSnapshot(row),
    steamCurrent: mapSteamCurrent(row),
    expiresAt: row.expires_at,
    relatedCases,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCaseRelation(row: ModerationCaseRow): CaseRelation {
  return {
    id: row.id,
    caseRef: row.case_ref,
    actionType: row.action_type,
    occurredAt: row.occurred_at,
    status: row.status,
  };
}

export function mapBanEvent(row: BanEventRow): ModerationEventDto {
  return {
    id: row.id,
    kind: 'BAN',
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    moderator: {
      discordUserId: row.moderator_discord_user_id,
      nameAtEvent: row.moderator_name_at_event,
    },
    reason: row.reason,
    source: row.source,
    attributionStatus: row.attribution_status,
    steamNameAtEvent: row.steam_name_at_event,
    relatedCaseRef: null,
  };
}

export function mapUnbanEvent(row: UnbanEventRow, relatedCaseRef: string | null): ModerationEventDto {
  return {
    id: row.id,
    kind: 'UNBAN',
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    moderator: {
      discordUserId: row.moderator_discord_user_id,
      nameAtEvent: row.moderator_name_at_event,
    },
    reason: row.reason,
    source: row.source,
    attributionStatus: row.attribution_status,
    steamNameAtEvent: row.steam_name_at_event,
    relatedCaseRef,
  };
}

export function mapSteamNameHistory(row: SteamNameHistoryRow): SteamNameHistoryDto {
  return {
    id: row.id,
    steamId64: row.steam_id64,
    previousDisplayName: row.previous_display_name,
    displayName: row.display_name,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    source: row.source,
    verification: row.verification,
  };
}

export function mapSteamAccount(
  row: SteamAccountRow,
  history: SteamNameHistoryDto[],
  linkedDiscordUserIds: string[],
  moderationCaseCount: number,
): SteamAccountDto {
  return {
    steamId64: row.steam_id64,
    profileUrl: row.profile_url,
    firstSeenAt: row.first_seen_at,
    lastCheckedAt: row.last_checked_at,
    currentDisplayName: row.current_display_name,
    currentAvatarUrl: row.current_avatar_url,
    profileStatus: row.profile_status,
    refreshFailures: Number(row.refresh_failures),
    lastRefreshError: row.last_refresh_error,
    nameHistory: history,
    linkedDiscordUserIds,
    moderationCaseCount,
  };
}

export function mapPcCheck(row: PcCheckRow, notes?: PcCheckNoteDto[]): PcCheckDto {
  return {
    id: row.id,
    caseRef: row.case_ref,
    guildId: row.guild_id,
    targetDiscordUserId: row.target_discord_user_id,
    steamId64: row.steam_id64,
    steamNameAtEvent: row.steam_name_at_event,
    requestedBy: row.requested_by,
    assignedTo: row.assigned_to,
    reason: row.reason,
    status: row.status,
    outcome: row.outcome,
    channelId: row.channel_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    ...(notes ? { notes } : {}),
  };
}

export function mapPcCheckNote(row: PcCheckNoteRow): PcCheckNoteDto {
  return {
    id: row.id,
    authorDiscordId: row.author_discord_id,
    authorNameAtEvent: row.author_name_at_event,
    note: row.note,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
}

export function mapAnnouncement(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id,
    guildId: row.guild_id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    category: row.category,
    imageUrl: row.image_url,
    status: row.status,
    authorDiscordId: row.author_discord_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    discordMessageId: row.discord_message_id,
    discordChannelId: row.discord_channel_id,
  };
}

export function mapAuditEvent(row: AuditEventRow): AuditEventDto {
  return {
    id: row.id,
    guildId: row.guild_id,
    actorDiscordId: row.actor_discord_id,
    actorType: row.actor_type,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    before: parseJson<Record<string, unknown> | null>(row.before_json, null),
    after: parseJson<Record<string, unknown> | null>(row.after_json, null),
    createdAt: row.created_at,
  };
}

export function mapDashboardAccess(row: DashboardAccessRow): DashboardAccessDto {
  return {
    id: row.id,
    guildId: row.guild_id,
    userDiscordId: row.user_id,
    level: row.level,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    note: row.note,
  };
}

export const CASE_SELECT = `
SELECT c.*,
       sa.current_display_name AS sa_current_display_name,
       sa.last_checked_at AS sa_last_checked_at,
       sa.profile_status AS sa_profile_status,
       sa.profile_url AS sa_profile_url
FROM moderation_cases c
LEFT JOIN steam_accounts sa ON sa.steam_id64 = c.steam_id64`;

export const CASE_SELECT_COUNT = `
SELECT COUNT(*) AS total
FROM moderation_cases c
LEFT JOIN steam_accounts sa ON sa.steam_id64 = c.steam_id64`;
