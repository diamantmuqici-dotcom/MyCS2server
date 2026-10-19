-- Indexes for the query paths used by the dashboard, the bot and reconciliation.

CREATE INDEX IF NOT EXISTS idx_cases_guild_occurred
  ON moderation_cases (guild_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_target
  ON moderation_cases (guild_id, target_discord_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_moderator
  ON moderation_cases (guild_id, moderator_discord_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_action_status
  ON moderation_cases (guild_id, action_type, status);
CREATE INDEX IF NOT EXISTS idx_cases_steam
  ON moderation_cases (steam_id64, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_occurred
  ON moderation_cases (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ban_events_target
  ON ban_events (guild_id, target_discord_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_unban_events_target
  ON unban_events (guild_id, target_discord_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_steam_name_history_account
  ON steam_name_history (steam_id64, first_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_steam_accounts_name
  ON steam_accounts (current_display_name);
CREATE INDEX IF NOT EXISTS idx_steam_links_discord
  ON steam_account_links (discord_user_id, unlinked_at);
CREATE INDEX IF NOT EXISTS idx_steam_links_account
  ON steam_account_links (steam_id64);

CREATE INDEX IF NOT EXISTS idx_pc_checks_status
  ON pc_check_cases (guild_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pc_checks_target
  ON pc_check_cases (guild_id, target_discord_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pc_check_notes_case
  ON pc_check_notes (pc_check_id, created_at);

CREATE INDEX IF NOT EXISTS idx_announcements_status
  ON announcements (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_guild
  ON announcements (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_created
  ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_events (actor_discord_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_user
  ON dashboard_access (guild_id, user_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON integration_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_warnings_active
  ON warnings (guild_id, target_discord_user_id, active);
CREATE INDEX IF NOT EXISTS idx_service_health_seen
  ON service_health (last_seen_at DESC);
