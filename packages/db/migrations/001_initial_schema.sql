-- Dardania | Elite — initial schema.
-- Portable between SQLite (local dev/tests) and PostgreSQL (production).
-- All timestamps are UTC ISO-8601 TEXT. Discord/Steam identifiers are TEXT.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  global_name TEXT,
  avatar_hash TEXT,
  is_bot TEXT NOT NULL DEFAULT '0',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_hash TEXT,
  owner_discord_id TEXT,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_configurations (
  guild_id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  CONSTRAINT fk_guild_config_guild FOREIGN KEY (guild_id) REFERENCES guilds (id)
);

CREATE TABLE IF NOT EXISTS dashboard_access (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('OWNER', 'CO_OWNER', 'PC_CHECKER')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS steam_accounts (
  steam_id64 TEXT PRIMARY KEY,
  profile_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_checked_at TEXT,
  current_display_name TEXT,
  current_avatar_url TEXT,
  profile_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_refresh_source TEXT,
  refresh_failures INTEGER NOT NULL DEFAULT 0,
  last_refresh_error TEXT
);

CREATE TABLE IF NOT EXISTS steam_name_history (
  id TEXT PRIMARY KEY,
  steam_id64 TEXT NOT NULL,
  previous_display_name TEXT,
  display_name TEXT NOT NULL,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT,
  source TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'OBSERVED',
  CONSTRAINT fk_name_history_account FOREIGN KEY (steam_id64) REFERENCES steam_accounts (steam_id64)
);

CREATE TABLE IF NOT EXISTS steam_account_links (
  id TEXT PRIMARY KEY,
  steam_id64 TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  linked_by TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  source TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'UNVERIFIED',
  unlinked_at TEXT,
  CONSTRAINT fk_steam_link_account FOREIGN KEY (steam_id64) REFERENCES steam_accounts (steam_id64)
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id TEXT PRIMARY KEY,
  case_ref TEXT NOT NULL UNIQUE,
  case_number INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('BAN', 'UNBAN', 'KICK', 'TIMEOUT', 'UNTIMEOUT', 'WARN', 'WARN_CLEAR', 'PURGE')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LIFTED', 'COMPLETED', 'UNKNOWN')),
  ban_status TEXT CHECK (ban_status IN ('ACTIVE', 'LIFTED', 'UNKNOWN')),
  related_case_id TEXT,
  target_discord_user_id TEXT NOT NULL,
  target_discord_username_at_event TEXT,
  target_discord_global_name_at_event TEXT,
  moderator_discord_user_id TEXT,
  moderator_name_at_event TEXT,
  reason TEXT,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  attribution_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (attribution_status IN ('VERIFIED', 'PARTIAL', 'UNKNOWN')),
  attribution_evidence_json TEXT,
  steam_id64 TEXT,
  steam_name_at_event TEXT,
  steam_profile_url_at_event TEXT,
  steam_name_source TEXT,
  expires_at TEXT,
  discord_message_id TEXT,
  external_ref TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT uq_case_number UNIQUE (guild_id, case_number)
);

CREATE TABLE IF NOT EXISTS ban_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  target_discord_user_id TEXT NOT NULL,
  target_discord_username_at_event TEXT,
  target_discord_global_name_at_event TEXT,
  moderator_discord_user_id TEXT,
  moderator_name_at_event TEXT,
  reason TEXT,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  attribution_status TEXT NOT NULL CHECK (attribution_status IN ('VERIFIED', 'PARTIAL', 'UNKNOWN')),
  discord_audit_log_entry_id TEXT,
  steam_id64 TEXT,
  steam_name_at_event TEXT,
  steam_profile_url_at_event TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_ban_case FOREIGN KEY (case_id) REFERENCES moderation_cases (id)
);

CREATE TABLE IF NOT EXISTS unban_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  target_discord_user_id TEXT NOT NULL,
  target_discord_username_at_event TEXT,
  target_discord_global_name_at_event TEXT,
  moderator_discord_user_id TEXT,
  moderator_name_at_event TEXT,
  reason TEXT,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  attribution_status TEXT NOT NULL CHECK (attribution_status IN ('VERIFIED', 'PARTIAL', 'UNKNOWN')),
  discord_audit_log_entry_id TEXT,
  related_ban_case_id TEXT,
  steam_id64 TEXT,
  steam_name_at_event TEXT,
  steam_profile_url_at_event TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_unban_case FOREIGN KEY (case_id) REFERENCES moderation_cases (id),
  CONSTRAINT fk_unban_related_ban FOREIGN KEY (related_ban_case_id) REFERENCES moderation_cases (id)
);

CREATE TABLE IF NOT EXISTS warnings (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  target_discord_user_id TEXT NOT NULL,
  moderator_discord_user_id TEXT,
  moderator_name_at_event TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  cleared_at TEXT,
  cleared_by TEXT,
  cleared_case_id TEXT,
  active TEXT NOT NULL DEFAULT '1',
  CONSTRAINT fk_warning_case FOREIGN KEY (case_id) REFERENCES moderation_cases (id)
);

CREATE TABLE IF NOT EXISTS pc_check_cases (
  id TEXT PRIMARY KEY,
  case_ref TEXT NOT NULL UNIQUE,
  case_number INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  target_discord_user_id TEXT NOT NULL,
  steam_id64 TEXT,
  steam_name_at_event TEXT,
  requested_by TEXT,
  assigned_to TEXT,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  outcome TEXT CHECK (outcome IN ('CLEAN', 'SUSPICIOUS', 'CHEATING_CONFIRMED', 'INCONCLUSIVE')),
  channel_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  CONSTRAINT uq_pc_case_number UNIQUE (guild_id, case_number)
);

CREATE TABLE IF NOT EXISTS pc_check_notes (
  id TEXT PRIMARY KEY,
  pc_check_id TEXT NOT NULL,
  author_discord_id TEXT NOT NULL,
  author_name_at_event TEXT,
  note TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'STAFF' CHECK (visibility IN ('STAFF', 'OWNER')),
  created_at TEXT NOT NULL,
  CONSTRAINT fk_pc_note_case FOREIGN KEY (pc_check_id) REFERENCES pc_check_cases (id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('GENERAL', 'EVENT', 'MAINTENANCE', 'ROSTER', 'RULE_UPDATE', 'PUNISHMENT')),
  image_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  author_discord_id TEXT,
  author_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  archived_at TEXT,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  discord_published_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  guild_id TEXT,
  actor_discord_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS service_health (
  service TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  detail_json TEXT
);
