import { parseJson, stringifyJson } from '../json.js';
import type { Db } from '../client.js';
import type { GuildConfigRow, GuildRow } from '../rows.js';

export interface GuildConfiguration {
  roles: Record<string, string | null>;
  channels: Record<string, string | null>;
  features: Record<string, boolean>;
  setupCompletedAt?: string | null;
  setupPreview?: Record<string, unknown> | null;
}

export const EMPTY_GUILD_CONFIG: GuildConfiguration = {
  roles: {},
  channels: {},
  features: {},
};

export interface UpsertGuildInput {
  id: string;
  name: string;
  iconHash?: string | null;
  ownerDiscordId?: string | null;
}

export async function upsertGuild(db: Db, input: UpsertGuildInput, now: string): Promise<GuildRow> {
  await db.run(
    `INSERT INTO guilds (id, name, icon_hash, owner_discord_id, joined_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       icon_hash = excluded.icon_hash,
       owner_discord_id = excluded.owner_discord_id,
       updated_at = excluded.updated_at`,
    [input.id, input.name, input.iconHash ?? null, input.ownerDiscordId ?? null, now, now],
  );
  const row = await db.get<GuildRow>('SELECT * FROM guilds WHERE id = ?', [input.id]);
  if (!row) throw new Error(`Failed to persist guild ${input.id}`);
  return row;
}

export async function getGuild(db: Db, guildId: string): Promise<GuildRow | undefined> {
  return db.get<GuildRow>('SELECT * FROM guilds WHERE id = ?', [guildId]);
}

export async function getGuildConfiguration(
  db: Db,
  guildId: string,
): Promise<{ config: GuildConfiguration; updatedAt: string | null; updatedBy: string | null }> {
  const row = await db.get<GuildConfigRow>('SELECT * FROM guild_configurations WHERE guild_id = ?', [
    guildId,
  ]);
  if (!row) return { config: { ...EMPTY_GUILD_CONFIG }, updatedAt: null, updatedBy: null };
  const parsed = parseJson<Partial<GuildConfiguration>>(row.config_json, {});
  return {
    config: {
      roles: parsed.roles ?? {},
      channels: parsed.channels ?? {},
      features: parsed.features ?? {},
      setupCompletedAt: parsed.setupCompletedAt ?? null,
      setupPreview: parsed.setupPreview ?? null,
    },
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function saveGuildConfiguration(
  db: Db,
  guildId: string,
  config: GuildConfiguration,
  updatedBy: string,
  now: string,
): Promise<void> {
  await db.run(
    `INSERT INTO guild_configurations (guild_id, config_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id) DO UPDATE SET
       config_json = excluded.config_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    [guildId, stringifyJson(config) ?? '{}', now, updatedBy],
  );
}

/** Merges a partial configuration into the stored one (never drops existing keys). */
export async function mergeGuildConfiguration(
  db: Db,
  guildId: string,
  patch: Partial<GuildConfiguration>,
  updatedBy: string,
  now: string,
): Promise<GuildConfiguration> {
  const existing = await getGuildConfiguration(db, guildId);
  const merged: GuildConfiguration = {
    roles: { ...existing.config.roles, ...(patch.roles ?? {}) },
    channels: { ...existing.config.channels, ...(patch.channels ?? {}) },
    features: { ...existing.config.features, ...(patch.features ?? {}) },
    setupCompletedAt: patch.setupCompletedAt ?? existing.config.setupCompletedAt ?? null,
    setupPreview: patch.setupPreview ?? existing.config.setupPreview ?? null,
  };
  await saveGuildConfiguration(db, guildId, merged, updatedBy, now);
  return merged;
}
