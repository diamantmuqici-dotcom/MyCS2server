import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type TextChannel,
  type EmbedBuilder,
} from 'discord.js';
import type { GuildSettingsDto } from '@dardania/shared';
import { UserFacingError, assertModerator, isPcStaffMember } from '../permissions.js';
import { errorEmbed } from '../embeds.js';
import type { BotContext } from '../context.js';
import type { IngestResult, ModerationEventPayload } from '../api-client.js';

export async function deferEphemeral(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

export function requireGuild(interaction: ChatInputCommandInteraction): Guild {
  if (!interaction.guild) {
    throw new UserFacingError('This command can only be used inside the Dardania | Elite server.');
  }
  return interaction.guild;
}

export async function loadConfig(
  ctx: BotContext,
  guildId: string,
): Promise<GuildSettingsDto | null> {
  return ctx.configs.get(guildId);
}

export async function requireModerator(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  pcStaff = false,
): Promise<GuildMember> {
  const guild = requireGuild(interaction);
  const config = await loadConfig(ctx, guild.id);
  const member = (interaction.member as GuildMember | null) ?? null;
  if (!member) throw new UserFacingError('Could not resolve your server membership.');
  if (pcStaff) {
    if (!isPcStaffMember(member, config)) {
      throw new UserFacingError(
        'PC checks require a configured staff or PC Checker role. Ask an Owner to run /setup-server or assign the role.',
      );
    }
    return member;
  }
  return assertModerator(interaction, config);
}

export async function requireBotMember(guild: Guild): Promise<GuildMember> {
  return guild.members.me ?? (await guild.members.fetchMe());
}

/** Discord shows the reason in the audit log; include the case-owning staff member. */
export function auditReason(reason: string, actor: GuildMember): string {
  return `${reason} | ${actor.user.username} (${actor.id}) via Dardania | Elite`;
}

export interface RecordOutcome {
  queued: boolean;
  result: IngestResult | null;
}

export async function recordEvent(
  ctx: BotContext,
  payload: ModerationEventPayload,
): Promise<RecordOutcome> {
  return ctx.outbox.record(payload);
}

export function recordedSummary(outcome: RecordOutcome): string {
  if (outcome.result) {
    return `Case **${outcome.result.caseRef}** recorded on the website.`;
  }
  if (outcome.queued) {
    return (
      'The backend is unreachable right now, so the record was written to the bot’s durable local ' +
      'outbox and will be retried automatically. It is **not** lost.'
    );
  }
  return 'The record was not confirmed by the backend.';
}

export function steamSummary(outcome: RecordOutcome): string {
  if (outcome.result?.steamNameAtEvent) {
    const idPart = outcome.result.steamId64 ? ` (${outcome.result.steamId64})` : '';
    return `Steam name at event: **${outcome.result.steamNameAtEvent}**${idPart}`;
  }
  return 'No Steam account was linked for this member at the time of the action, so no Steam name was guessed or attached.';
}

export async function showError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  ctx: BotContext,
): Promise<void> {
  if (error instanceof UserFacingError) {
    await safeReply(interaction, error.message);
    return;
  }
  ctx.logger.error('Command handler failed', error);
  await safeReply(
    interaction,
    'Something went wrong while processing this command. The failure was logged; no silent changes were made.',
  );
}

export async function safeReply(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], components: [] };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch {
    /* The interaction may have expired — nothing else we can do. */
  }
}

export async function replyWithEmbeds(
  interaction: ChatInputCommandInteraction,
  embeds: EmbedBuilder | EmbedBuilder[],
): Promise<void> {
  const payload = { embeds: Array.isArray(embeds) ? embeds : [embeds] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

export async function resolveTextChannel(
  guild: Guild,
  channelId: string | null | undefined,
): Promise<TextChannel | null> {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  if (!channel.isTextBased() || channel.isThread()) return null;
  return channel as TextChannel;
}

export function truncate(value: string, max = 1024): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function missingChannelMessage(key: string): string {
  return (
    `The #${key} channel is not configured for this server. Run /setup-server or ask an Owner to set ` +
    'the channel in the dashboard (Settings → Channels).'
  );
}
