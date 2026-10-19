import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js';
import { addSeconds, nowIso, type ActionType } from '@dardania/shared';
import { UserFacingError, hierarchyProblem } from '../permissions.js';
import { successEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import { findAuditEntry } from '../audit.js';
import { formatUtc } from '@dardania/shared';
import type { BotContext } from '../context.js';
import type { ModerationEventPayload } from '../api-client.js';
import {
  auditReason,
  recordEvent,
  recordedSummary,
  requireBotMember,
  requireGuild,
  requireModerator,
  steamSummary,
  showError,
  deferEphemeral,
  replyWithEmbeds,
} from './shared.js';

interface Attribution {
  status: 'VERIFIED' | 'PARTIAL';
  evidence: Record<string, unknown>;
}

async function attribute(
  guild: Guild,
  action: 'ban' | 'unban' | 'kick',
  targetId: string,
  actorId: string,
  actorName: string,
  interactionId: string,
): Promise<Attribution> {
  const match = await findAuditEntry(guild, action, targetId, { near: nowIso() });
  const evidence: Record<string, unknown> = {
    command: action,
    interactionId,
    actorDiscordId: actorId,
    actorName,
    auditEntryId: match?.entryId ?? null,
    auditExecutorId: match?.executorId ?? null,
    auditExecutorName: match?.executorName ?? null,
  };
  if (!match) {
    return {
      status: 'VERIFIED',
      evidence: {
        ...evidence,
        auditNote:
          'No audit entry matched; attribution relies on the verified command interaction.',
      },
    };
  }
  const selfOrBot = !match.executorId || match.executorId === actorId || match.executorIsBot;
  return { status: selfOrBot ? 'VERIFIED' : 'PARTIAL', evidence };
}

function targetPayload(user: User, member: GuildMember | null): ModerationEventPayload['target'] {
  return {
    id: user.id,
    username: user.username,
    globalName: member?.displayName ?? user.globalName ?? null,
  };
}

export async function handleBan(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const steamInput = interaction.options.getString('steam')?.trim() || undefined;
    const deleteDays = interaction.options.getInteger('delete-messages') ?? 0;

    if (user.bot) throw new UserFacingError('Bots cannot be banned through this command.');
    const targetMember = await guild.members.fetch(user.id).catch(() => null);
    const botMember = await requireBotMember(guild);
    const problem = hierarchyProblem(guild, actor, targetMember, botMember, 'ban');
    if (problem) throw new UserFacingError(problem);
    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
      throw new UserFacingError('The bot is missing the Ban Members permission.');
    }

    const confirmed = await confirmAction(interaction, {
      title: 'Confirm ban',
      description:
        `Ban **${user.tag}** (\`${user.id}\`) from **${guild.name}**?\n\n` +
        `**Reason:** ${reason}\n` +
        (deleteDays > 0 ? `**Message cleanup:** ${deleteDays} day(s)\n` : '') +
        (steamInput ? `**Steam input:** ${steamInput}\n` : '') +
        '\nThis applies a real Discord ban and creates a permanent moderation case.',
      confirmLabel: 'Ban member',
    });
    if (!confirmed) return;

    try {
      await guild.bans.create(user.id, {
        reason: auditReason(reason, actor),
        deleteMessageSeconds: deleteDays * 86_400,
      });
    } catch (error) {
      throw new UserFacingError(
        `Discord rejected the ban: ${(error as Error).message}. The member may already be banned or the ID is invalid.`,
      );
    }

    const attribution = await attribute(
      guild,
      'ban',
      user.id,
      actor.id,
      actor.user.username,
      interaction.id,
    );
    const occurredAt = nowIso();
    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'BAN',
      target: targetPayload(user, targetMember),
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt,
      source: 'BOT_COMMAND',
      dedupeKey: `ban:cmd:${interaction.id}`,
      auditEntryId: (attribution.evidence.auditEntryId as string | null) ?? null,
      attributionStatus: attribution.status,
      attributionEvidence: attribution.evidence,
      steamInput,
      banStatus: 'ACTIVE',
      metadata: { deleteMessageDays: deleteDays },
    });

    const embed = successEmbed(
      'Member banned',
      `<@${user.id}> was banned from **${guild.name}**.`,
    ).addFields(
      { name: 'Reason', value: reason, inline: false },
      { name: 'Moderator', value: `<@${actor.id}>`, inline: true },
      { name: 'Occurred', value: formatUtc(occurredAt), inline: true },
      { name: 'Record', value: recordedSummary(outcome), inline: false },
      { name: 'Steam identity', value: steamSummary(outcome), inline: false },
    );
    if (attribution.status === 'PARTIAL') {
      embed.addFields({
        name: 'Attribution note',
        value:
          'The Discord audit log shows a different executor for this ban. The case was recorded with PARTIAL attribution rather than a guess.',
      });
    }
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

async function resolveUnbanTarget(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<string> {
  const user = interaction.options.getUser('user');
  const rawId = interaction.options.getString('user-id')?.trim() || null;
  const steam = interaction.options.getString('steam')?.trim() || null;
  const supplied = [user ? 'user' : null, rawId ? 'user-id' : null, steam ? 'steam' : null].filter(
    Boolean,
  );
  if (supplied.length === 0) {
    throw new UserFacingError('Provide exactly one of: user, user-id or steam.');
  }
  if (supplied.length > 1) {
    throw new UserFacingError(
      'Provide only one of user, user-id or steam so the target is unambiguous.',
    );
  }
  if (user) return user.id;
  if (rawId) {
    if (!/^\d{17,20}$/.test(rawId))
      throw new UserFacingError('user-id must be a numeric Discord snowflake.');
    return rawId;
  }
  const resolved = await ctx.api.resolveSteam(steam!);
  if (!resolved.steamId64) {
    throw new UserFacingError(resolved.error ?? 'That Steam profile could not be resolved.');
  }
  const account = await ctx.api.getSteam(resolved.steamId64);
  const linked = account?.linkedDiscordUserIds ?? [];
  if (linked.length === 0) {
    throw new UserFacingError(
      `Steam account ${resolved.steamId64} has no linked Discord user. Use /steam link first, or unban by user/user-id.`,
    );
  }
  if (linked.length > 1) {
    throw new UserFacingError(
      `Steam account ${resolved.steamId64} is linked to multiple Discord users (${linked.join(', ')}). Unban by user-id instead.`,
    );
  }
  return linked[0]!;
}

export async function handleUnban(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const reason = interaction.options.getString('reason', true).trim();
    const targetId = await resolveUnbanTarget(interaction, ctx);
    const steamInput = interaction.options.getString('steam')?.trim() || undefined;

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    const activeCases = await ctx.api.listCases({
      guildId: guild.id,
      targetDiscordId: targetId,
      actionType: 'BAN',
      banStatus: 'ACTIVE',
      pageSize: 3,
    });
    const activeCase = activeCases.items[0] ?? null;
    const botMember = await requireBotMember(guild);
    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
      throw new UserFacingError('The bot is missing the Ban Members permission.');
    }

    const confirmed = await confirmAction(interaction, {
      title: 'Confirm unban',
      description:
        `Lift the Discord ban for **${targetUser?.tag ?? targetId}** (\`${targetId}\`)?\n\n` +
        `**Reason:** ${reason}\n` +
        (activeCase
          ? `**Linked ban case:** ${activeCase.caseRef} (recorded ${formatUtc(activeCase.occurredAt)})\n`
          : '**No active ban case is recorded** for this user. The unban will still be recorded and flagged for review.\n') +
        '\nThe original ban record is never deleted. An UNBAN record is added and linked to it.',
      confirmLabel: 'Lift ban',
      danger: false,
    });
    if (!confirmed) return;

    try {
      await guild.bans.remove(targetId, auditReason(reason, actor));
    } catch (error) {
      throw new UserFacingError(
        `Discord rejected the unban: ${(error as Error).message}. The user may not be banned.`,
      );
    }

    const attribution = await attribute(
      guild,
      'unban',
      targetId,
      actor.id,
      actor.user.username,
      interaction.id,
    );
    const occurredAt = nowIso();
    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'UNBAN',
      target: targetUser
        ? targetPayload(targetUser, null)
        : { id: targetId, username: undefined, globalName: null },
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt,
      source: 'BOT_COMMAND',
      dedupeKey: `unban:cmd:${interaction.id}`,
      auditEntryId: (attribution.evidence.auditEntryId as string | null) ?? null,
      attributionStatus: attribution.status,
      attributionEvidence: attribution.evidence,
      steamInput,
      banStatus: 'LIFTED',
      metadata: { priorCaseRef: activeCase?.caseRef ?? null, priorCaseFound: Boolean(activeCase) },
    });

    await replyWithEmbeds(
      interaction,
      successEmbed('Ban lifted', `<@${targetId}> can rejoin **${guild.name}**.`).addFields(
        { name: 'Reason', value: reason, inline: false },
        { name: 'Moderator', value: `<@${actor.id}>`, inline: true },
        { name: 'Record', value: recordedSummary(outcome), inline: false },
        {
          name: 'Historical accuracy',
          value:
            'The original ban remains in the history. This unban is a new linked record, not an edit.',
          inline: false,
        },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleKick(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new UserFacingError('That user is not a member of this server.');
    const botMember = await requireBotMember(guild);
    const problem = hierarchyProblem(guild, actor, member, botMember, 'kick');
    if (problem) throw new UserFacingError(problem);

    const confirmed = await confirmAction(interaction, {
      title: 'Confirm kick',
      description: `Kick **${user.tag}** (\`${user.id}\`)?\n\n**Reason:** ${reason}\n\nThis is a real Discord kick and is recorded in the moderation history.`,
      confirmLabel: 'Kick member',
    });
    if (!confirmed) return;

    await member.kick(auditReason(reason, actor));
    const attribution = await attribute(
      guild,
      'kick',
      user.id,
      actor.id,
      actor.user.username,
      interaction.id,
    );
    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'KICK',
      target: targetPayload(user, member),
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt: nowIso(),
      source: 'BOT_COMMAND',
      dedupeKey: `kick:cmd:${interaction.id}`,
      auditEntryId: (attribution.evidence.auditEntryId as string | null) ?? null,
      attributionStatus: attribution.status,
      attributionEvidence: attribution.evidence,
    });
    await replyWithEmbeds(
      interaction,
      successEmbed('Member kicked', `**${user.tag}** was removed from the server.`).addFields(
        { name: 'Reason', value: reason, inline: false },
        { name: 'Record', value: recordedSummary(outcome), inline: false },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

async function handleTimeoutAction(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
  mode: 'timeout' | 'untimeout',
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const minutes = mode === 'timeout' ? interaction.options.getInteger('minutes', true) : 0;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new UserFacingError('That user is not a member of this server.');
    const botMember = await requireBotMember(guild);
    const problem = hierarchyProblem(guild, actor, member, botMember, 'timeout');
    if (problem) throw new UserFacingError(problem);

    const confirmed = await confirmAction(interaction, {
      title: mode === 'timeout' ? 'Confirm timeout' : 'Confirm timeout removal',
      description:
        mode === 'timeout'
          ? `Time out **${user.tag}** for **${minutes} minute(s)**?\n\n**Reason:** ${reason}`
          : `Remove the timeout from **${user.tag}**?\n\n**Reason:** ${reason}`,
      confirmLabel: mode === 'timeout' ? 'Apply timeout' : 'Remove timeout',
      danger: mode === 'timeout',
    });
    if (!confirmed) return;

    await member.timeout(mode === 'timeout' ? minutes * 60_000 : null, auditReason(reason, actor));
    const occurredAt = nowIso();
    const actionType: ActionType = mode === 'timeout' ? 'TIMEOUT' : 'UNTIMEOUT';
    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType,
      target: targetPayload(user, member),
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt,
      source: 'BOT_COMMAND',
      dedupeKey: `${mode}:cmd:${interaction.id}`,
      attributionStatus: 'VERIFIED',
      attributionEvidence: { command: mode, interactionId: interaction.id },
      expiresAt: mode === 'timeout' ? addSeconds(occurredAt, minutes * 60) : null,
      metadata: mode === 'timeout' ? { minutes } : {},
    });

    await replyWithEmbeds(
      interaction,
      successEmbed(
        mode === 'timeout' ? 'Timeout applied' : 'Timeout removed',
        mode === 'timeout'
          ? `<@${user.id}> cannot speak for ${minutes} minute(s).`
          : `<@${user.id}> can speak again.`,
      ).addFields(
        { name: 'Reason', value: reason, inline: false },
        {
          name: 'Expires',
          value:
            mode === 'timeout' ? formatUtc(addSeconds(occurredAt, minutes * 60)) : 'Not applicable',
          inline: true,
        },
        { name: 'Record', value: recordedSummary(outcome), inline: false },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export const handleTimeout = (
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> => handleTimeoutAction(interaction, ctx, 'timeout');

export const handleUntimeout = (
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> => handleTimeoutAction(interaction, ctx, 'untimeout');

export async function handleWarn(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    if (user.bot) throw new UserFacingError('Bots cannot receive warnings.');
    const member = await guild.members.fetch(user.id).catch(() => null);

    const confirmed = await confirmAction(interaction, {
      title: 'Confirm warning',
      description: `Record a formal warning for **${user.tag}**?\n\n**Reason:** ${reason}\n\nThe warning appears in the member's moderation history and counts toward escalation.`,
      confirmLabel: 'Record warning',
      danger: false,
    });
    if (!confirmed) return;

    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'WARN',
      target: targetPayload(user, member),
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt: nowIso(),
      source: 'BOT_COMMAND',
      dedupeKey: `warn:cmd:${interaction.id}`,
      attributionStatus: 'VERIFIED',
      attributionEvidence: { command: 'warn', interactionId: interaction.id },
    });

    const warnings = await ctx.api.getWarnings(guild.id, user.id).catch(() => null);
    const activeCount = warnings?.warnings.length ?? null;

    await replyWithEmbeds(
      interaction,
      successEmbed('Warning recorded', `<@${user.id}> received a formal warning.`).addFields(
        { name: 'Reason', value: reason, inline: false },
        {
          name: 'Active warnings',
          value: activeCount === null ? 'Unavailable' : String(activeCount),
          inline: true,
        },
        { name: 'Record', value: recordedSummary(outcome), inline: false },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}
