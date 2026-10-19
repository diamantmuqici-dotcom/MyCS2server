import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
} from 'discord.js';
import type { GuildSettingsDto } from '@dardania/shared';

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export const STAFF_ROLE_KEYS = [
  'owner',
  'coOwner',
  'administrator',
  'headModerator',
  'moderator',
] as const;

export const PC_STAFF_ROLE_KEYS = [...STAFF_ROLE_KEYS, 'pcChecker'] as const;

export function hasConfiguredRole(
  member: GuildMember,
  config: GuildSettingsDto | null,
  keys: readonly string[],
): boolean {
  if (!config) return false;
  return keys.some((key) => {
    const roleId = config.roles?.[key];
    return Boolean(roleId && member.roles.cache.has(roleId));
  });
}

export function isStaffMember(
  member: GuildMember,
  config: GuildSettingsDto | null,
): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  ) {
    return true;
  }
  return hasConfiguredRole(member, config, STAFF_ROLE_KEYS);
}

export function isPcStaffMember(
  member: GuildMember,
  config: GuildSettingsDto | null,
): boolean {
  if (isStaffMember(member, config)) return true;
  return hasConfiguredRole(member, config, PC_STAFF_ROLE_KEYS);
}

function requiredPermission(interaction: ChatInputCommandInteraction): boolean {
  // Each command already declares default member permissions; this is the
  // server-side enforcement point and never trusts the client.
  const command = interaction.commandName;
  const permissions = interaction.memberPermissions;
  if (!permissions) return false;
  switch (command) {
    case 'setup-server':
      return permissions.has(PermissionFlagsBits.ManageGuild);
    case 'ban':
    case 'unban':
    case 'kick':
      return (
        permissions.has(PermissionFlagsBits.BanMembers) ||
        permissions.has(PermissionFlagsBits.KickMembers) ||
        permissions.has(PermissionFlagsBits.ModerateMembers)
      );
    case 'timeout':
    case 'untimeout':
      return permissions.has(PermissionFlagsBits.ModerateMembers);
    case 'purge':
      return permissions.has(PermissionFlagsBits.ManageMessages);
    case 'warn':
    case 'clear-warnings':
      return permissions.has(PermissionFlagsBits.ModerateMembers);
    default:
      return true;
  }
}

export async function assertModerator(
  interaction: ChatInputCommandInteraction,
  config: GuildSettingsDto | null,
): Promise<GuildMember> {
  const guild = interaction.guild;
  if (!guild) throw new UserFacingError('This command can only be used inside a server.');
  const member = interaction.member as GuildMember | null;
  if (!member) throw new UserFacingError('Could not resolve your server membership.');
  if (!requiredPermission(interaction) && !isStaffMember(member, config)) {
    throw new UserFacingError(
      'You need Discord moderation permissions or a configured staff role to use this command.',
    );
  }
  if (!requiredPermission(interaction) && !isStaffMember(member, config)) {
    throw new UserFacingError('Staff access required.');
  }
  return member;
}

export function hierarchyProblem(
  guild: Guild,
  actor: GuildMember,
  target: GuildMember | null,
  bot: GuildMember,
  action: 'ban' | 'kick' | 'timeout' | 'warn',
): string | null {
  if (target) {
    if (target.id === guild.ownerId) {
      return 'You cannot take action against the server owner.';
    }
    if (target.id === actor.id) {
      return 'You cannot take action against yourself.';
    }
    if (
      target.id === guild.members.me?.id ||
      target.user.bot && target.id === bot.id
    ) {
      return 'You cannot take action against the bot itself.';
    }
    const actorIsOwner = guild.ownerId === actor.id;
    if (!actorIsOwner && target.roles.highest.position >= actor.roles.highest.position) {
      return 'That member has an equal or higher role than you. Discord role hierarchy blocks this action.';
    }
    if (bot.roles.highest.position <= target.roles.highest.position) {
      return 'The bot’s role is not above that member’s highest role. Move the bot role higher.';
    }
  }
  const permissionByAction = {
    ban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    warn: PermissionFlagsBits.ModerateMembers,
  } as const;
  const required = permissionByAction[action];
  if (action !== 'warn' && !bot.permissions.has(required)) {
    return `The bot is missing the ${required === PermissionFlagsBits.BanMembers ? 'Ban Members' : required === PermissionFlagsBits.KickMembers ? 'Kick Members' : 'Moderate Members'} permission.`;
  }
  return null;
}

export function canUseSetup(
  guild: Guild,
  member: GuildMember,
  config: GuildSettingsDto | null,
  ownerIds: string[],
  coOwnerIds: string[],
): boolean {
  if (guild.ownerId === member.id) return true;
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return false;
  if (ownerIds.includes(member.id) || coOwnerIds.includes(member.id)) return true;
  return hasConfiguredRole(member, config, ['owner', 'coOwner']);
}
