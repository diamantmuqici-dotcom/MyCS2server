import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type Role,
} from 'discord.js';
import type { BackendClient } from './api-client.js';
import { GuildConfigStore } from './config-store.js';

export interface PlannedRole {
  key: string;
  name: string;
  color: number;
  permissions: bigint[];
}

export const PLANNED_ROLES: PlannedRole[] = [
  { key: 'owner', name: 'Owner', color: 0xf5f8ff, permissions: [] },
  {
    key: 'coOwner',
    name: 'Co-Owner',
    color: 0x36a3ff,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    key: 'administrator',
    name: 'Administrator',
    color: 0x075bff,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    key: 'headModerator',
    name: 'Head Moderator',
    color: 0xffc857,
    permissions: [
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    key: 'moderator',
    name: 'Moderator',
    color: 0x3ddc97,
    permissions: [
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
    ],
  },
  {
    key: 'pcChecker',
    name: 'PC Checker',
    color: 0x36a3ff,
    permissions: [PermissionFlagsBits.ViewChannel],
  },
  { key: 'member', name: 'Member', color: 0xa9b8d6, permissions: [] },
];

export interface PlannedChannel {
  key: string;
  name: string;
  readOnly?: boolean;
  staffOnly?: boolean;
  log?: boolean;
}

export interface PlannedCategory {
  name: string;
  staffOnly?: boolean;
  channels: PlannedChannel[];
}

export const PLANNED_CATEGORIES: PlannedCategory[] = [
  {
    name: 'INFORMATION',
    channels: [
      { key: 'welcome', name: 'welcome', readOnly: true },
      { key: 'rules', name: 'rules', readOnly: true },
      { key: 'announcements', name: 'announcements', readOnly: true },
      { key: 'serverInformation', name: 'server-information', readOnly: true },
      { key: 'roles', name: 'roles', readOnly: true },
    ],
  },
  {
    name: 'COMMUNITY',
    channels: [
      { key: 'general', name: 'general' },
      { key: 'cs2Chat', name: 'cs2-chat' },
      { key: 'lookingForTeam', name: 'looking-for-team' },
      { key: 'steamProfiles', name: 'steam-profiles' },
    ],
  },
  {
    name: 'PC CHECKS',
    channels: [
      { key: 'pcCheck1', name: 'pc-check-1' },
      { key: 'pcCheck2', name: 'pc-check-2' },
      { key: 'pcCheck3', name: 'pc-check-3' },
    ],
  },
  {
    name: 'SUPPORT',
    channels: [
      { key: 'support', name: 'support' },
      { key: 'pcCheckRequests', name: 'pc-check-requests' },
    ],
  },
  {
    name: 'STAFF',
    staffOnly: true,
    channels: [
      { key: 'staffChat', name: 'staff-chat' },
      { key: 'staffAnnouncements', name: 'staff-announcements' },
      { key: 'staffNotes', name: 'staff-notes' },
    ],
  },
  {
    name: 'SERVER LOGS',
    staffOnly: true,
    channels: [
      { key: 'modLogs', name: 'mod-logs', log: true },
      { key: 'banLogs', name: 'ban-logs', log: true },
      { key: 'memberLogs', name: 'member-logs', log: true },
      { key: 'messageLogs', name: 'message-logs', log: true },
      { key: 'roleLogs', name: 'role-logs', log: true },
      { key: 'pcCheckLogs', name: 'pc-check-logs', log: true },
      { key: 'botLogs', name: 'bot-logs', log: true },
    ],
  },
];

export const BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ViewAuditLog,
]);

export function botInviteUrl(clientId: string): string {
  return (
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&scope=bot%20applications.commands&permissions=${BOT_PERMISSIONS.bitfield.toString()}`
  );
}

export interface SetupPreview {
  categoriesToCreate: string[];
  categoriesExisting: string[];
  channelsToCreate: string[];
  channelsExisting: string[];
  rolesToCreate: string[];
  rolesExisting: string[];
  missingBotPermissions: string[];
}

function findCategory(guild: Guild, name: string): CategoryChannel | undefined {
  return guild.channels.cache.find(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory && channel.name === name,
  );
}

function findTextChannel(guild: Guild, name: string): GuildBasedChannel | undefined {
  return guild.channels.cache.find(
    (channel) =>
      channel.name === name &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement),
  );
}

export async function previewSetup(guild: Guild): Promise<SetupPreview> {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const preview: SetupPreview = {
    categoriesToCreate: [],
    categoriesExisting: [],
    channelsToCreate: [],
    channelsExisting: [],
    rolesToCreate: [],
    rolesExisting: [],
    missingBotPermissions: [],
  };
  for (const category of PLANNED_CATEGORIES) {
    (findCategory(guild, category.name)
      ? preview.categoriesExisting
      : preview.categoriesToCreate
    ).push(category.name);
    for (const channel of category.channels) {
      (findTextChannel(guild, channel.name)
        ? preview.channelsExisting
        : preview.channelsToCreate
      ).push(`#${channel.name}`);
    }
  }
  for (const role of PLANNED_ROLES) {
    (guild.roles.cache.some((existing) => existing.name === role.name)
      ? preview.rolesExisting
      : preview.rolesToCreate
    ).push(role.name);
  }
  const me = guild.members.me;
  const required = [
    [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
    [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  ] as const;
  for (const [flag, label] of required) {
    if (!me?.permissions.has(flag)) preview.missingBotPermissions.push(label);
  }
  return preview;
}

interface ApplyResult {
  roles: Record<string, string | null>;
  channels: Record<string, string | null>;
  created: { roles: number; channels: number; categories: number };
  reused: { roles: number; channels: number; categories: number };
  errors: string[];
}

function staffRoleIds(roles: Record<string, string | null>, guild: Guild): string[] {
  const keys = ['owner', 'coOwner', 'administrator', 'headModerator', 'moderator', 'pcChecker'];
  const ids = keys
    .map((key) => roles[key])
    .filter((value): value is string => Boolean(value && guild.roles.cache.has(value)));
  return ids;
}

function buildOverwrites(
  guild: Guild,
  staffIds: string[],
  options: { staffOnly?: boolean; readOnly?: boolean; log?: boolean },
): OverwriteResolvable[] {
  const everyone = guild.roles.everyone.id;
  const overwrites: OverwriteResolvable[] = [];
  if (options.staffOnly) {
    overwrites.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
    for (const roleId of staffIds) {
      overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
    }
  }
  if (options.readOnly) {
    overwrites.push({ id: everyone, deny: [PermissionFlagsBits.SendMessages] });
    for (const roleId of staffIds) {
      overwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }
  }
  if (options.log) {
    overwrites.push({ id: everyone, deny: [PermissionFlagsBits.SendMessages] });
    for (const roleId of staffIds) {
      overwrites.push({ id: roleId, deny: [PermissionFlagsBits.SendMessages] });
    }
  }
  return overwrites;
}

/**
 * Creates missing roles, categories and channels. Never renames, re-permissions
 * or deletes existing resources — running it twice is safe.
 */
export async function applySetup(guild: Guild, actorId: string): Promise<ApplyResult> {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const result: ApplyResult = {
    roles: {},
    channels: {},
    created: { roles: 0, channels: 0, categories: 0 },
    reused: { roles: 0, channels: 0, categories: 0 },
    errors: [],
  };

  for (const planned of PLANNED_ROLES) {
    try {
      const existing: Role | undefined = guild.roles.cache.find(
        (role) => role.name === planned.name,
      );
      if (existing) {
        result.roles[planned.key] = existing.id;
        result.reused.roles += 1;
        continue;
      }
      const created = await guild.roles.create({
        name: planned.name,
        color: planned.color,
        permissions: new PermissionsBitField(planned.permissions),
        hoist: true,
        mentionable: false,
        reason: `Dardania | Elite setup by ${actorId}`,
      });
      result.roles[planned.key] = created.id;
      result.created.roles += 1;
    } catch (error) {
      result.errors.push(`Role ${planned.name}: ${(error as Error).message}`);
      result.roles[planned.key] = null;
    }
  }

  const staffIds = staffRoleIds(result.roles, guild);

  for (const categoryPlanned of PLANNED_CATEGORIES) {
    let category = findCategory(guild, categoryPlanned.name);
    try {
      if (category) {
        result.reused.categories += 1;
      } else {
        category = await guild.channels.create({
          name: categoryPlanned.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: buildOverwrites(guild, staffIds, {
            staffOnly: categoryPlanned.staffOnly,
          }),
          reason: `Dardania | Elite setup by ${actorId}`,
        });
        result.created.categories += 1;
      }
    } catch (error) {
      result.errors.push(`Category ${categoryPlanned.name}: ${(error as Error).message}`);
      continue;
    }

    for (const channelPlanned of categoryPlanned.channels) {
      try {
        const existing = findTextChannel(guild, channelPlanned.name);
        if (existing) {
          result.channels[channelPlanned.key] = existing.id;
          result.reused.channels += 1;
          continue;
        }
        const created = await guild.channels.create({
          name: channelPlanned.name,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: buildOverwrites(guild, staffIds, {
            staffOnly: categoryPlanned.staffOnly,
            readOnly: channelPlanned.readOnly,
            log: channelPlanned.log,
          }),
          reason: `Dardania | Elite setup by ${actorId}`,
        });
        result.channels[channelPlanned.key] = created.id;
        result.created.channels += 1;
      } catch (error) {
        result.errors.push(`Channel #${channelPlanned.name}: ${(error as Error).message}`);
        result.channels[channelPlanned.key] = null;
      }
    }
  }

  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  return result;
}

export async function saveSetupConfiguration(
  api: BackendClient,
  configs: GuildConfigStore,
  guild: Guild,
  actorId: string,
  applied: ApplyResult,
): Promise<void> {
  await api.saveGuildConfig({
    guildId: guild.id,
    guildName: guild.name,
    actorDiscordId: actorId,
    complete: true,
    config: {
      roles: applied.roles,
      channels: applied.channels,
      features: { setupCompleted: true },
    },
  });
  configs.invalidate(guild.id);
}
