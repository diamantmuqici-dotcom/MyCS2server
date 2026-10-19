import type {
  ActionType,
  AnnouncementCategory,
  AnnouncementStatus,
  AttributionStatus,
  BanStatus,
  CaseStatus,
  PcCheckOutcome,
  PcCheckStatus,
} from '@dardania/shared';

export interface UserRow {
  id: string;
  username: string;
  global_name: string | null;
  avatar_hash: string | null;
  is_bot: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface GuildRow {
  id: string;
  name: string;
  icon_hash: string | null;
  owner_discord_id: string | null;
  joined_at: string;
  updated_at: string;
}

export interface GuildConfigRow {
  guild_id: string;
  config_json: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DashboardAccessRow {
  id: string;
  guild_id: string;
  user_id: string;
  level: 'OWNER' | 'CO_OWNER' | 'PC_CHECKER';
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  note: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  csrf_token: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  login_source: 'oauth' | 'allowlist' | 'dev';
}

export interface SteamAccountRow {
  steam_id64: string;
  profile_url: string;
  first_seen_at: string;
  last_checked_at: string | null;
  current_display_name: string | null;
  current_avatar_url: string | null;
  profile_status: string;
  last_refresh_source: string | null;
  refresh_failures: number;
  last_refresh_error: string | null;
}

export interface SteamNameHistoryRow {
  id: string;
  steam_id64: string;
  previous_display_name: string | null;
  display_name: string;
  first_observed_at: string;
  last_observed_at: string | null;
  source: string;
  verification: string;
}

export interface SteamLinkRow {
  id: string;
  steam_id64: string;
  discord_user_id: string;
  linked_by: string;
  linked_at: string;
  source: string;
  verification: string;
  unlinked_at: string | null;
}

export interface ModerationCaseRow {
  id: string;
  case_ref: string;
  case_number: number;
  guild_id: string;
  action_type: ActionType;
  status: CaseStatus;
  ban_status: BanStatus | null;
  related_case_id: string | null;
  target_discord_user_id: string;
  target_discord_username_at_event: string | null;
  target_discord_global_name_at_event: string | null;
  moderator_discord_user_id: string | null;
  moderator_name_at_event: string | null;
  reason: string | null;
  occurred_at: string;
  recorded_at: string;
  source: string;
  attribution_status: AttributionStatus;
  attribution_evidence_json: string | null;
  steam_id64: string | null;
  steam_name_at_event: string | null;
  steam_profile_url_at_event: string | null;
  steam_name_source: string | null;
  expires_at: string | null;
  discord_message_id: string | null;
  external_ref: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  // Optional joined columns from steam_accounts (aliased).
  sa_current_display_name?: string | null;
  sa_last_checked_at?: string | null;
  sa_profile_status?: string | null;
  sa_profile_url?: string | null;
}

export interface BanEventRow {
  id: string;
  case_id: string;
  guild_id: string;
  target_discord_user_id: string;
  target_discord_username_at_event: string | null;
  target_discord_global_name_at_event: string | null;
  moderator_discord_user_id: string | null;
  moderator_name_at_event: string | null;
  reason: string | null;
  occurred_at: string;
  recorded_at: string;
  source: string;
  attribution_status: AttributionStatus;
  discord_audit_log_entry_id: string | null;
  steam_id64: string | null;
  steam_name_at_event: string | null;
  steam_profile_url_at_event: string | null;
  dedupe_key: string;
  created_at: string;
}

export interface UnbanEventRow extends Omit<BanEventRow, 'discord_audit_log_entry_id'> {
  related_ban_case_id: string | null;
  discord_audit_log_entry_id: string | null;
}

export interface WarningRow {
  id: string;
  guild_id: string;
  case_id: string;
  target_discord_user_id: string;
  moderator_discord_user_id: string | null;
  moderator_name_at_event: string | null;
  reason: string | null;
  created_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
  cleared_case_id: string | null;
  active: string;
}

export interface PcCheckRow {
  id: string;
  case_ref: string;
  case_number: number;
  guild_id: string;
  target_discord_user_id: string;
  steam_id64: string | null;
  steam_name_at_event: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  reason: string | null;
  status: PcCheckStatus;
  outcome: PcCheckOutcome | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface PcCheckNoteRow {
  id: string;
  pc_check_id: string;
  author_discord_id: string;
  author_name_at_event: string | null;
  note: string;
  visibility: 'STAFF' | 'OWNER';
  created_at: string;
}

export interface AnnouncementRow {
  id: string;
  guild_id: string;
  slug: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  image_url: string | null;
  status: AnnouncementStatus;
  author_discord_id: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  discord_published_at: string | null;
}

export interface AuditEventRow {
  id: string;
  guild_id: string | null;
  actor_discord_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
}

export interface OutboxRow {
  id: string;
  topic: string;
  dedupe_key: string;
  payload_json: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
}

export interface ServiceHealthRow {
  service: string;
  status: string;
  last_seen_at: string;
  detail_json: string | null;
}

export interface CountRow {
  total: number | string;
}
