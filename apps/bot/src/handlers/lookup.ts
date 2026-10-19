import type { ChatInputCommandInteraction, Message, TextChannel } from 'discord.js';
import {
  BRAND,
  formatUtc,
  nowIso,
  type ModerationCaseDetail,
  type ModerationCaseDto,
  type Paginated,
} from '@dardania/shared';
import { baseEmbed, caseEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import type { BotContext } from '../context.js';
import {
  deferEphemeral,
  recordEvent,
  requireGuild,
  requireModerator,
  replyWithEmbeds,
  showError,
  truncate,
} from './shared.js';
import { UserFacingError } from '../permissions.js';

const PAGE_SIZE = 8;

function caseLine(item: ModerationCaseDto): string {
  const target = item.target.usernameAtEvent ?? item.target.discordUserId;
  const moderator = item.moderator.nameAtEvent ?? 'Unattributed';
  return `**${item.caseRef}** · ${item.actionType} · ${truncate(target, 32)} · ${moderator} · ${formatUtc(item.occurredAt)}`;
}

function casesEmbed(
  title: string,
  result: Paginated<ModerationCaseDto>,
  note?: string,
): ReturnType<typeof baseEmbed> {
  const embed = baseEmbed(
    title,
    result.items.length === 0
      ? 'No moderation records matched. Nothing is invented when the history is empty.'
      : note ?? `${result.total} record(s) found. Historical identity snapshots are shown as recorded.`,
  );
  for (const item of result.items) {
    embed.addFields({
      name: `${item.caseRef} • ${item.actionType}`,
      value:
        `${caseLine(item)}\n` +
        `Ban status: ${item.banStatus ?? 'n/a'} · Status: ${item.status}\n` +
        (item.steamAtEvent.name ? `Steam at event: **${item.steamAtEvent.name}**\n` : '') +
        (item.reason ? `Reason: ${truncate(item.reason, 180)}` : 'No reason recorded.'),
    });
  }
  embed.setFooter({ text: `${BRAND.name} • page ${result.page}/${Math.max(result.totalPages, 1)} • ${result.total} total` });
  return embed;
}

export async function handleModlog(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const count = interaction.options.getInteger('count') ?? 10;
    const result = await ctx.api.listCases({ guildId: guild.id, pageSize: count });
    await replyWithEmbeds(interaction, casesEmbed('Moderation log', result, `The ${result.items.length} most recent case(s).`));
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleCase(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const reference = interaction.options.getString('reference', true).trim();
    const detail = await ctx.api.getCase(guild.id, reference);
    const embed = caseEmbed(detail);
    if (detail.events.length > 0) {
      embed.addFields({
        name: 'Timeline',
        value: truncate(
          detail.events
            .map((event) => `${event.kind} · ${formatUtc(event.occurredAt)} · ${event.moderator.nameAtEvent ?? 'unattributed'}`)
            .join('\n'),
          1024,
        ),
      });
    }
    if (detail.relatedCases.length > 0) {
      embed.addFields({
        name: 'Related cases',
        value: detail.relatedCases.map((relation) => `${relation.caseRef} (${relation.actionType}, ${relation.status})`).join('\n'),
      });
    }
    if (detail.auditTrail.length > 0) {
      embed.addFields({
        name: 'Latest audit entry',
        value: truncate(detail.auditTrail[0]!.summary, 1024),
      });
    }
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleWarnings(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const user = interaction.options.getUser('user', true);
    const result = await ctx.api.getWarnings(guild.id, user.id);
    const embed = baseEmbed(
      `Warnings for ${user.tag}`,
      result.warnings.length === 0
        ? 'No active warnings are recorded.'
        : `${result.warnings.length} active warning(s). Warnings are never deleted; clearing them marks the records as cleared.`,
    );
    for (const [index, warning] of result.warnings.slice(0, 10).entries()) {
      embed.addFields({
        name: `Warning ${index + 1} · ${warning.id.slice(0, 8)}`,
        value:
          `${truncate(warning.reason ?? 'No reason recorded', 300)}\n` +
          `By ${warning.moderator_name_at_event ?? warning.moderator_discord_user_id ?? 'unknown'} · ${formatUtc(warning.created_at)}`,
      });
    }
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleClearWarnings(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();
    const result = await ctx.api.getWarnings(guild.id, user.id);
    if (result.warnings.length === 0) {
      throw new UserFacingError('That member has no active warnings to clear.');
    }
    const confirmed = await confirmAction(interaction, {
      title: 'Confirm clearing warnings',
      description:
        `Clear **${result.warnings.length}** active warning(s) for **${user.tag}**?\n\n**Reason:** ${reason}\n\n` +
        'The warnings stay in the permanent history; they are marked as cleared, not deleted.',
      confirmLabel: 'Clear warnings',
    });
    if (!confirmed) return;

    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'WARN_CLEAR',
      target: { id: user.id, username: user.username, globalName: user.globalName ?? null },
      moderator: { id: actor.id, name: actor.user.username },
      reason,
      occurredAt: nowIso(),
      source: 'BOT_COMMAND',
      dedupeKey: `warn-clear:cmd:${interaction.id}`,
      attributionStatus: 'VERIFIED',
      attributionEvidence: { command: 'clear-warnings', interactionId: interaction.id },
      metadata: { clearedWarningIds: result.warnings.map((warning) => warning.id) },
    });

    await replyWithEmbeds(
      interaction,
      baseEmbed('Warnings cleared', `Cleared ${result.warnings.length} warning(s) for <@${user.id}>.`).addFields(
        { name: 'Reason', value: reason },
        { name: 'Record', value: outcome.queued ? 'Queued locally and will be retried.' : 'Recorded in the case history.' },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleBans(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'case') {
      const reference = interaction.options.getString('reference', true).trim();
      const detail: ModerationCaseDetail = await ctx.api.getCase(guild.id, reference);
      await replyWithEmbeds(interaction, caseEmbed(detail));
      return;
    }
    const page = interaction.options.getInteger('page') ?? 1;
    if (sub === 'admin') {
      const moderator = interaction.options.getUser('moderator', true);
      const result = await ctx.api.listCases({
        guildId: guild.id,
        moderatorDiscordId: moderator.id,
        actionType: 'BAN',
        page,
        pageSize: PAGE_SIZE,
      });
      await replyWithEmbeds(
        interaction,
        casesEmbed(
          `Bans by ${moderator.tag}`,
          result,
          result.total === 0
            ? 'No ban actions are attributed to that moderator. Unattributed bans are not shown here.'
            : `${result.total} ban action(s) attributed to **${moderator.tag}**. Bans whose moderator could not be confirmed are excluded instead of guessed.`,
        ),
      );
      return;
    }
    if (sub === 'user') {
      const user = interaction.options.getUser('user');
      const rawId = interaction.options.getString('user-id');
      const targetId = user?.id ?? rawId?.trim();
      if (!targetId) throw new UserFacingError('Provide either user or user-id.');
      if (!/^\d{17,20}$/.test(targetId)) throw new UserFacingError('user-id must be a numeric Discord snowflake.');
      const [cases, warnings] = await Promise.all([
        ctx.api.listCases({ guildId: guild.id, targetDiscordId: targetId, page, pageSize: PAGE_SIZE }),
        ctx.api.getWarnings(guild.id, targetId).catch(() => ({ warnings: [] })),
      ]);
      const embed = casesEmbed(`History for ${user?.tag ?? targetId}`, cases);
      const activeBans = cases.items.filter((item) => item.banStatus === 'ACTIVE');
      embed.addFields(
        { name: 'Active bans (this page)', value: activeBans.length ? activeBans.map((item) => item.caseRef).join(', ') : 'None on this page' },
        { name: 'Active warnings', value: String(warnings.warnings.length) },
      );
      await replyWithEmbeds(interaction, embed);
      return;
    }
    if (sub === 'steam') {
      const input = interaction.options.getString('steam', true).trim();
      const resolved = await ctx.api.resolveSteam(input);
      if (!resolved.steamId64) {
        throw new UserFacingError(resolved.error ?? 'That Steam profile could not be resolved.');
      }
      const account = await ctx.api.getSteam(resolved.steamId64).catch(() => null);
      const result = await ctx.api.listCases({
        guildId: guild.id,
        steamId64: resolved.steamId64,
        page,
        pageSize: PAGE_SIZE,
      });
      const embed = casesEmbed(`Steam history for ${resolved.steamId64}`, result);
      embed.addFields({
        name: 'Current Steam profile',
        value: account
          ? `**${account.currentDisplayName ?? 'name unavailable'}** · ${account.profileStatus}\n${account.profileUrl}`
          : 'The account has not been observed by the tracker yet.',
      });
      await replyWithEmbeds(interaction, embed);
      return;
    }
    throw new UserFacingError('Unknown /bans subcommand.');
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleUserinfo(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const user = interaction.options.getUser('user', true);
    const member = await guild.members.fetch(user.id).catch(() => null);
    const [cases, warnings, steam] = await Promise.all([
      ctx.api.listCases({ guildId: guild.id, targetDiscordId: user.id, pageSize: 5 }),
      ctx.api.getWarnings(guild.id, user.id).catch(() => ({ warnings: [] })),
      ctx.api.searchSteam(user.id).catch(() => null),
    ]);
    const linked = steam?.items[0] ?? null;
    const embed = baseEmbed(`User information · ${user.tag}`);
    embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
    embed.addFields(
      { name: 'Discord', value: `<@${user.id}>\n\`${user.id}\``, inline: true },
      { name: 'Account created', value: formatUtc(user.createdAt.toISOString()), inline: true },
      {
        name: 'Joined server',
        value: member ? formatUtc(member.joinedAt?.toISOString() ?? '') : 'Not a member',
        inline: true,
      },
      {
        name: 'Roles',
        value: member
          ? truncate(
              member.roles.cache
                .filter((role) => role.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .map((role) => role.name)
                .join(', ') || 'None',
              1024,
            )
          : 'Not a member',
      },
      { name: 'Active warnings', value: String(warnings.warnings.length), inline: true },
      {
        name: 'Steam account (linked)',
        value: linked
          ? `\`${linked.steamId64}\` · ${linked.currentDisplayName ?? 'name unavailable'}\n${linked.profileUrl}`
          : 'No linked Steam account recorded',
        inline: true,
      },
      {
        name: 'Recent moderation',
        value:
          cases.items.length === 0
            ? 'No moderation records.'
            : truncate(cases.items.map((item) => `${item.caseRef} · ${item.actionType} · ${item.status}`).join('\n'), 1024),
      },
    );
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleServerinfo(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    await guild.fetch();
    const embed = baseEmbed(guild.name, guild.description ?? 'Dardania | Elite community server.');
    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }) as string);
    embed.addFields(
      { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Members', value: String(guild.memberCount), inline: true },
      { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (tier ${guild.premiumTier})`, inline: true },
      { name: 'Created', value: formatUtc(guild.createdAt.toISOString()), inline: true },
      { name: 'Server ID', value: `\`${guild.id}\`` },
    );
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleStaffHelp(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const config = await ctx.configs.get(guild.id);
    const embed = baseEmbed(
      'Staff reference',
      'All moderation actions are recorded as cases. The website dashboard is restricted to an explicit Owner / Co-Owner Discord user-ID allowlist — Discord roles never grant dashboard access.',
    );
    embed.addFields(
      {
        name: 'Moderation',
        value: '`/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/clear-warnings` `/purge`',
      },
      { name: 'Lookup', value: '`/modlog` `/case` `/bans admin|user|steam|case` `/userinfo` `/serverinfo`' },
      { name: 'PC checks', value: '`/pc-check request|assign|status|note|close|history`' },
      { name: 'Steam', value: '`/steam link|profile`' },
      {
        name: 'Dashboard',
        value: ctx.env.webBaseUrl
          ? `${ctx.env.webBaseUrl}/dashboard`
          : 'The dashboard runs on the backend origin at /dashboard. Set WEB_BASE_URL to show a clickable link here.',
      },
      {
        name: 'Setup state',
        value: config?.features.setupCompleted
          ? 'Server structure has been set up.'
          : 'Run `/setup-server` to preview and create the roles, categories and channels.',
        inline: false,
      },
    );
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePurge(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const actor = await requireModerator(interaction, ctx);
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isThread()) {
      throw new UserFacingError('Purge can only be used in a regular text channel.');
    }
    const targetChannel = channel as TextChannel;
    const confirmed = await confirmAction(interaction, {
      title: 'Confirm purge',
      description:
        `Delete up to **${amount}** recent message(s) in <#${targetChannel.id}>` +
        (user ? ` sent by **${user.tag}**` : '') +
        '?\n\nDiscord only allows bulk deletion of messages newer than 14 days. The purge is recorded as a moderation case.',
      confirmLabel: 'Delete messages',
    });
    if (!confirmed) return;

    let deleted = 0;
    if (user) {
      const fetched = await targetChannel.messages.fetch({ limit: 100 });
      const matches = fetched
        .filter((message: Message) => message.author.id === user.id)
        .first(amount);
      const result = await targetChannel.bulkDelete(matches, true);
      deleted = result.size;
    } else {
      const result = await targetChannel.bulkDelete(amount, true);
      deleted = result.size;
    }

    const outcome = await recordEvent(ctx, {
      guildId: guild.id,
      guildName: guild.name,
      actionType: 'PURGE',
      target: user
        ? { id: user.id, username: user.username, globalName: user.globalName ?? null }
        : { id: guild.id, username: `${guild.name} channel purge`, globalName: channel.id },
      moderator: { id: actor.id, name: actor.user.username },
      reason: `Purged ${deleted} message(s) in #${targetChannel.name}`,
      occurredAt: nowIso(),
      source: 'BOT_COMMAND',
      dedupeKey: `purge:cmd:${interaction.id}`,
      attributionStatus: 'VERIFIED',
      attributionEvidence: { command: 'purge', interactionId: interaction.id, channelId: targetChannel.id },
      metadata: { channelId: targetChannel.id, requested: amount, deleted, filteredByUserId: user?.id ?? null },
    });

    await replyWithEmbeds(
      interaction,
      baseEmbed('Purge complete', `Deleted **${deleted}** message(s) in <#${targetChannel.id}>.`).addFields({
        name: 'Record',
        value: outcome.queued ? 'Queued locally and will be retried.' : 'Recorded in the moderation case history.',
      }),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}
