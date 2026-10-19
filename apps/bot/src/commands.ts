import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { ANNOUNCEMENT_CATEGORIES, PC_CHECK_OUTCOMES, PC_CHECK_STATUSES } from '@dardania/shared';

/**
 * discord.js returns a different builder subtype after each setter, so the
 * registry only relies on the structural contract it actually needs.
 */
export interface CommandDefinition {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

const categoryChoices = ANNOUNCEMENT_CATEGORIES.map((category) => ({
  name: category.replace('_', ' ').toLowerCase(),
  value: category,
}));

const outcomeChoices = PC_CHECK_OUTCOMES.map((outcome) => ({
  name: outcome.replace('_', ' ').toLowerCase(),
  value: outcome,
}));

const pcStatusChoices = PC_CHECK_STATUSES.map((status) => ({
  name: status.replace('_', ' ').toLowerCase(),
  value: status,
}));

/**
 * Marks a command as guild-only. The builders narrow their type after every
 * option, so the cast keeps the helper usable across all builder shapes.
 */
const guildOnly = <T>(builder: T): T => {
  (builder as unknown as { setContexts(...contexts: InteractionContextType[]): void }).setContexts(
    InteractionContextType.Guild,
  );
  return builder;
};

const setup = guildOnly(
  new SlashCommandBuilder()
    .setName('setup-server')
    .setDescription('Preview and create the Dardania | Elite roles, categories and channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
);

const postRules = guildOnly(
  new SlashCommandBuilder()
    .setName('post-rules')
    .setDescription('Publish the bilingual community rules in the configured rules channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
);

const announce = guildOnly(
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publish an announcement to the website and the Discord announcements channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Announcement title (3-120 characters)')
        .setMinLength(3)
        .setMaxLength(120)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Announcement body')
        .setMinLength(10)
        .setMaxLength(4000)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Announcement category')
        .addChoices(...categoryChoices),
    )
    .addStringOption((option) =>
      option.setName('image').setDescription('Optional image URL (https)').setMaxLength(500),
    ),
);

const postServerInfo = guildOnly(
  new SlashCommandBuilder()
    .setName('post-server-info')
    .setDescription('Post the server information embed in the configured channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
);

const postStaffAnnouncement = guildOnly(
  new SlashCommandBuilder()
    .setName('post-staff-announcement')
    .setDescription('Post an internal staff announcement (not published to the website)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Short internal title')
        .setMaxLength(120)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Staff-only message')
        .setMaxLength(3000)
        .setRequired(true),
    ),
);

const ban = guildOnly(
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member, apply the Discord ban and record a moderation case')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to ban').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason (stored permanently)')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription('SteamID64 or profile URL, if known'),
    )
    .addIntegerOption((option) =>
      option
        .setName('delete-messages')
        .setDescription('Delete this many days of recent messages (0-7)')
        .setMinValue(0)
        .setMaxValue(7),
    ),
);

const unban = guildOnly(
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Lift a Discord ban and record an unban linked to the original case')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('user').setDescription('Banned Discord user'))
    .addStringOption((option) =>
      option
        .setName('user-id')
        .setDescription('Banned Discord user ID (if the user cannot be resolved)'),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription('SteamID64 or profile URL of the banned member'),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for lifting the ban')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const kick = guildOnly(
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member and record the action')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to kick').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const timeout = guildOnly(
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Time out a member and record the action')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to time out').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Duration in minutes (1-40320)')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const untimeout = guildOnly(
  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout and record the action')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to release').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const warn = guildOnly(
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Record a formal warning for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to warn').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const warnings = guildOnly(
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('List the recorded warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)),
);

const clearWarnings = guildOnly(
  new SlashCommandBuilder()
    .setName('clear-warnings')
    .setDescription('Mark warnings as cleared (the records remain in the history)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why the warnings are cleared')
        .setMinLength(3)
        .setMaxLength(500)
        .setRequired(true),
    ),
);

const purge = guildOnly(
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete recent messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Only delete messages from this user'),
    ),
);

const modlog = guildOnly(
  new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Show the most recent moderation cases')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many cases to show (1-15)')
        .setMinValue(1)
        .setMaxValue(15),
    ),
);

const caseCommand = guildOnly(
  new SlashCommandBuilder()
    .setName('case')
    .setDescription('Show a moderation case by its reference (e.g. DE-000123)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((option) =>
      option
        .setName('reference')
        .setDescription('Case reference')
        .setMinLength(3)
        .setMaxLength(32)
        .setRequired(true),
    ),
);

const userinfo = guildOnly(
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show moderation context for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)),
);

const serverinfo = guildOnly(
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show server statistics'),
);

const staffHelp = guildOnly(
  new SlashCommandBuilder()
    .setName('staff-help')
    .setDescription('Show the staff command reference and the private dashboard address'),
);

const bans = guildOnly(
  new SlashCommandBuilder()
    .setName('bans')
    .setDescription('Search recorded bans by moderator, member, Steam account or case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('admin')
        .setDescription('All recorded ban actions attributed to a moderator')
        .addUserOption((option) =>
          option.setName('moderator').setDescription('Moderator').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('All ban and unban history for a member')
        .addUserOption((option) => option.setName('user').setDescription('Member'))
        .addStringOption((option) => option.setName('user-id').setDescription('Discord user ID'))
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('steam')
        .setDescription('Moderation history linked to a Steam account')
        .addStringOption((option) =>
          option.setName('steam').setDescription('SteamID64 or profile URL').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('case')
        .setDescription('Open a case reference')
        .addStringOption((option) =>
          option.setName('reference').setDescription('e.g. DE-000123').setRequired(true),
        ),
    ),
);

const pcCheck = guildOnly(
  new SlashCommandBuilder()
    .setName('pc-check')
    .setDescription('Consent-based PC-check case work')
    .addSubcommand((sub) =>
      sub
        .setName('request')
        .setDescription('Open a PC-check case for a member')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member to check').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Concrete reason for the check')
            .setMinLength(10)
            .setMaxLength(500)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('steam').setDescription('SteamID64 or profile URL'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('assign')
        .setDescription('Assign a PC-check case to a PC Checker')
        .addStringOption((option) =>
          option.setName('case').setDescription('Case reference, e.g. PC-000123').setRequired(true),
        )
        .addUserOption((option) =>
          option.setName('staff').setDescription('PC Checker').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Update the status or outcome of a PC check')
        .addStringOption((option) =>
          option.setName('case').setDescription('Case reference').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('status')
            .setDescription('New status')
            .addChoices(...pcStatusChoices)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('outcome')
            .setDescription('Outcome (optional)')
            .addChoices(...outcomeChoices),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('note')
        .setDescription('Add a staff note to a PC-check case')
        .addStringOption((option) =>
          option.setName('case').setDescription('Case reference').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('note')
            .setDescription('Note (2-2000 characters)')
            .setMinLength(2)
            .setMaxLength(2000)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Close a PC-check case with an outcome')
        .addStringOption((option) =>
          option.setName('case').setDescription('Case reference').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('outcome')
            .setDescription('Result')
            .addChoices(...outcomeChoices)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('note').setDescription('Closing note').setMaxLength(2000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('List PC-check cases')
        .addUserOption((option) => option.setName('user').setDescription('Filter by member'))
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1),
        ),
    ),
);

const steam = guildOnly(
  new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Steam identity tracking')
    .addSubcommand((sub) =>
      sub
        .setName('link')
        .setDescription('Link a SteamID64 to a Discord member')
        .addUserOption((option) =>
          option.setName('user').setDescription('Discord member').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('steam').setDescription('SteamID64 or profile URL').setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('verification')
            .setDescription('Was the identity confirmed?')
            .addChoices(
              { name: 'verified', value: 'VERIFIED' },
              { name: 'unverified', value: 'UNVERIFIED' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('profile')
        .setDescription('Show a Steam account and its observed name history')
        .addStringOption((option) =>
          option.setName('steam').setDescription('SteamID64 or profile URL').setRequired(true),
        ),
    ),
);

export const COMMANDS: CommandDefinition[] = [
  setup,
  postRules,
  announce,
  postServerInfo,
  postStaffAnnouncement,
  ban,
  unban,
  kick,
  timeout,
  untimeout,
  warn,
  warnings,
  clearWarnings,
  purge,
  modlog,
  caseCommand,
  userinfo,
  serverinfo,
  staffHelp,
  bans,
  pcCheck,
  steam,
];

export const COMMAND_NAMES = COMMANDS.map((command) => command.name);

/** Exported for docs/tests: channel types used by the purge confirmation. */
export const PURGE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

/** REST payload registered with Discord (guild-scoped when GUILD_ID is set). */
export function commandJson(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return COMMANDS.map((command) => command.toJSON());
}
