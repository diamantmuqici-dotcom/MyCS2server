import type { ChatInputCommandInteraction } from 'discord.js';
import {
  formatUtc,
  nowIso,
  type PcCheckOutcome,
  type PcCheckStatus,
} from '@dardania/shared';
import { baseEmbed, pcCheckEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import type { BotContext } from '../context.js';
import { UserFacingError } from '../permissions.js';
import {
  deferEphemeral,
  loadConfig,
  replyWithEmbeds,
  requireGuild,
  requireModerator,
  resolveTextChannel,
  showError,
  truncate,
} from './shared.js';

async function pcConfig(interaction: ChatInputCommandInteraction, ctx: BotContext) {
  const guild = requireGuild(interaction);
  const config = await loadConfig(ctx, guild.id);
  return { guild, config };
}

export async function handlePcRequest(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild, config } = await pcConfig(interaction, ctx);
    const actor = await requireModerator(interaction, ctx, true);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const steam = interaction.options.getString('steam')?.trim() || null;
    if (user.bot) throw new UserFacingError('Bots cannot be PC-check targets.');

    const confirmed = await confirmAction(interaction, {
      title: 'Open a PC-check case',
      description:
        `Open a documented PC-check case for **${user.tag}** (\`${user.id}\`)?\n\n**Reason:** ${reason}\n\n` +
        (steam ? `**Steam:** ${steam}\n\n` : '') +
        'The member must consent to the check. Explain the reason and the scope before asking them to join.',
      confirmLabel: 'Create case',
      danger: false,
    });
    if (!confirmed) return;

    const channelId = config?.channels?.pcCheckRequests ?? null;
    const created = await ctx.api.createPcCheck({
      guildId: guild.id,
      targetDiscordUserId: user.id,
      steamInput: steam,
      requestedBy: actor.id,
      reason,
      channelId,
    });

    const channel = await resolveTextChannel(guild, channelId);
    if (channel) {
      const embed = pcCheckEmbed(created).addFields({
        name: 'Next steps',
        value: 'A PC Checker must claim this case. Notes and the final outcome are stored on the case, not only in chat.',
      });
      await channel.send({ embeds: [embed] }).catch((error: unknown) => {
        ctx.logger.warn('Could not post PC-check case embed', error);
      });
    }

    await replyWithEmbeds(
      interaction,
      baseEmbed('PC-check case created', `Case **${created.caseRef}** opened for <@${user.id}>.`)
        .addFields(
          { name: 'Status', value: created.status, inline: true },
          { name: 'Steam snapshot', value: created.steamNameAtEvent ?? 'No Steam account recorded', inline: true },
          { name: 'Dashboard', value: `/dashboard/pc-checks/${created.caseRef}` },
        ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePcAssign(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild } = await pcConfig(interaction, ctx);
    await requireModerator(interaction, ctx, true);
    const reference = interaction.options.getString('case', true).trim();
    const staff = interaction.options.getUser('staff', true);
    const existing = await ctx.api.getPcCheck(guild.id, reference);
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new UserFacingError(`Case ${existing.caseRef} is already ${existing.status.toLowerCase()} and cannot be reassigned.`);
    }
    const updated = await ctx.api.updatePcCheck(existing.caseRef, {
      guildId: guild.id,
      actorDiscordId: interaction.user.id,
      assignedTo: staff.id,
      status: 'ASSIGNED',
    });
    await replyWithEmbeds(
      interaction,
      pcCheckEmbed(updated).addFields({ name: 'Assigned', value: `<@${staff.id}>` }),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePcStatus(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild } = await pcConfig(interaction, ctx);
    await requireModerator(interaction, ctx, true);
    const reference = interaction.options.getString('case', true).trim();
    const status = interaction.options.getString('status', true) as PcCheckStatus;
    const outcome = interaction.options.getString('outcome') as PcCheckOutcome | null;
    const updated = await ctx.api.updatePcCheck(reference, {
      guildId: guild.id,
      actorDiscordId: interaction.user.id,
      status,
      ...(outcome ? { outcome } : {}),
    });
    await replyWithEmbeds(interaction, pcCheckEmbed(updated));
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePcNote(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild } = await pcConfig(interaction, ctx);
    await requireModerator(interaction, ctx, true);
    const reference = interaction.options.getString('case', true).trim();
    const note = interaction.options.getString('note', true).trim();
    const existing = await ctx.api.getPcCheck(guild.id, reference);
    await ctx.api.addPcNote(existing.caseRef, {
      guildId: guild.id,
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      note,
    });
    await replyWithEmbeds(
      interaction,
      baseEmbed('Note added', `The note was added to **${existing.caseRef}** and is visible in the dashboard.`).addFields({
        name: 'Note',
        value: truncate(note, 1000),
      }),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePcClose(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild } = await pcConfig(interaction, ctx);
    await requireModerator(interaction, ctx, true);
    const reference = interaction.options.getString('case', true).trim();
    const outcome = interaction.options.getString('outcome', true) as PcCheckOutcome;
    const note = interaction.options.getString('note')?.trim() || null;
    const existing = await ctx.api.getPcCheck(guild.id, reference);
    if (existing.status === 'COMPLETED') throw new UserFacingError('That case is already completed.');

    const confirmed = await confirmAction(interaction, {
      title: 'Close PC-check case',
      description:
        `Close **${existing.caseRef}** with outcome **${outcome.replace('_', ' ').toLowerCase()}**?\n\n` +
        (note ? `**Closing note:** ${note}\n\n` : '') +
        'Closing is final for this case. Further findings should be recorded as a new case.',
      confirmLabel: 'Close case',
      danger: outcome === 'CHEATING_CONFIRMED',
    });
    if (!confirmed) return;

    if (note) {
      await ctx.api.addPcNote(existing.caseRef, {
        guildId: guild.id,
        actorDiscordId: interaction.user.id,
        actorName: interaction.user.username,
        note: `Closing note (${outcome}): ${note}`,
      });
    }
    const updated = await ctx.api.updatePcCheck(existing.caseRef, {
      guildId: guild.id,
      actorDiscordId: interaction.user.id,
      status: 'COMPLETED',
      outcome,
    });
    await replyWithEmbeds(
      interaction,
      pcCheckEmbed(updated).addFields({
        name: 'Closed',
        value: formatUtc(updated.closedAt ?? nowIso()),
      }),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePcHistory(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const { guild } = await pcConfig(interaction, ctx);
    await requireModerator(interaction, ctx, true);
    const user = interaction.options.getUser('user');
    const page = interaction.options.getInteger('page') ?? 1;
    const result = await ctx.api.listPcChecks({
      guildId: guild.id,
      targetDiscordUserId: user?.id,
      page,
      pageSize: 8,
    });
    const embed = baseEmbed(
      user ? `PC-check history for ${user.tag}` : 'PC-check cases',
      result.items.length === 0
        ? 'No PC-check cases matched.'
        : `${result.total} case(s). Page ${result.page}/${result.totalPages}.`,
    );
    for (const item of result.items) {
      embed.addFields({
        name: `${item.caseRef} • ${item.status}`,
        value:
          `Target: <@${item.targetDiscordUserId}>\n` +
          `Outcome: ${item.outcome ?? 'pending'} · Assigned: ${item.assignedTo ? `<@${item.assignedTo}>` : 'unassigned'}\n` +
          `Created: ${formatUtc(item.createdAt)}` +
          (item.reason ? `\nReason: ${truncate(item.reason, 160)}` : ''),
      });
    }
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}
