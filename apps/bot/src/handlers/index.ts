import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { UserFacingError } from '../permissions.js';
import { safeReply } from './shared.js';
import {
  handleBan,
  handleKick,
  handleTimeout,
  handleUnban,
  handleUntimeout,
  handleWarn,
} from './moderation.js';
import {
  handleBans,
  handleCase,
  handleClearWarnings,
  handleModlog,
  handlePurge,
  handleServerinfo,
  handleStaffHelp,
  handleUserinfo,
  handleWarnings,
} from './lookup.js';
import {
  handleAnnounce,
  handlePostRules,
  handlePostServerInfo,
  handlePostStaffAnnouncement,
} from './content.js';
import { handleSetup } from './setup.js';
import {
  handlePcAssign,
  handlePcClose,
  handlePcHistory,
  handlePcNote,
  handlePcRequest,
  handlePcStatus,
} from './pc.js';
import { handleSteamLink, handleSteamProfile } from './steam.js';

type Handler = (interaction: ChatInputCommandInteraction, ctx: BotContext) => Promise<void>;

const ROUTES: Record<string, Handler> = {
  'setup-server': handleSetup,
  'post-rules': handlePostRules,
  announce: handleAnnounce,
  'post-server-info': handlePostServerInfo,
  'post-staff-announcement': handlePostStaffAnnouncement,
  ban: handleBan,
  unban: handleUnban,
  kick: handleKick,
  timeout: handleTimeout,
  untimeout: handleUntimeout,
  warn: handleWarn,
  warnings: handleWarnings,
  'clear-warnings': handleClearWarnings,
  purge: handlePurge,
  modlog: handleModlog,
  case: handleCase,
  userinfo: handleUserinfo,
  serverinfo: handleServerinfo,
  'staff-help': handleStaffHelp,
  bans: handleBans,
  'pc-check': handlePcRequest,
  'pc-check:assign': handlePcAssign,
  'pc-check:status': handlePcStatus,
  'pc-check:note': handlePcNote,
  'pc-check:close': handlePcClose,
  'pc-check:history': handlePcHistory,
  steam: handleSteamProfile,
  'steam:link': handleSteamLink,
  'steam:profile': handleSteamProfile,
};

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand(false);
  const route = subcommand
    ? (ROUTES[`${interaction.commandName}:${subcommand}`] ?? ROUTES[interaction.commandName])
    : ROUTES[interaction.commandName];

  if (!route) {
    await safeReply(
      interaction,
      `The command \`/${interaction.commandName}\` is not implemented by this bot build. Run /staff-help for the supported list.`,
    );
    return;
  }

  try {
    await route(interaction, ctx);
  } catch (error) {
    if (error instanceof UserFacingError) {
      await safeReply(interaction, error.message);
      return;
    }
    ctx.logger.error(`Unhandled error in /${interaction.commandName}`, error);
    await safeReply(
      interaction,
      'The command failed unexpectedly. The error was logged; check the bot log before retrying.',
    );
  }
}
