import type { ChatInputCommandInteraction } from 'discord.js';
import { formatUtc, nowIso } from '@dardania/shared';
import { baseEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import type { BotContext } from '../context.js';
import { UserFacingError } from '../permissions.js';
import {
  deferEphemeral,
  replyWithEmbeds,
  requireGuild,
  requireModerator,
  showError,
  truncate,
} from './shared.js';

export async function handleSteamLink(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    await requireModerator(interaction, ctx);
    const user = interaction.options.getUser('user', true);
    const input = interaction.options.getString('steam', true).trim();
    const verification = (interaction.options.getString('verification') ?? 'UNVERIFIED') as
      'VERIFIED' | 'UNVERIFIED';

    const resolved = await ctx.api.resolveSteam(input);
    if (!resolved.steamId64) {
      throw new UserFacingError(
        resolved.error ??
          'That Steam profile could not be resolved. A vanity URL needs a configured Steam Web API key; a SteamID64 or /profiles/ URL always works.',
      );
    }
    const confirmed = await confirmAction(interaction, {
      title: 'Link Steam identity',
      description:
        `Link Steam account \`${resolved.steamId64}\` to **${user.tag}** (\`${user.id}\`)?\n\n` +
        `**Verification:** ${verification}\n\n` +
        'The link becomes evidence for future moderation cases. Past cases keep the Steam snapshot they were recorded with.',
      confirmLabel: 'Link account',
      danger: false,
    });
    if (!confirmed) return;

    const account = await ctx.api.linkSteam({
      steamId64: resolved.steamId64,
      discordUserId: user.id,
      guildId: guild.id,
      actorDiscordId: interaction.user.id,
      verification,
    });
    await replyWithEmbeds(
      interaction,
      baseEmbed(
        'Steam account linked',
        `<@${user.id}> is now linked to \`${resolved.steamId64}\`.`,
      ).addFields(
        {
          name: 'Current Steam name',
          value: account?.currentDisplayName ?? 'Unavailable',
          inline: true,
        },
        { name: 'Verification', value: verification, inline: true },
        { name: 'Profile', value: `https://steamcommunity.com/profiles/${resolved.steamId64}` },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleSteamProfile(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const input = interaction.options.getString('steam', true).trim();
    const resolved = await ctx.api.resolveSteam(input);
    if (!resolved.steamId64) {
      throw new UserFacingError(resolved.error ?? 'That Steam profile could not be resolved.');
    }
    const account = await ctx.api.getSteam(resolved.steamId64, true).catch(() => null);
    const snapshot = await ctx.api.getSteam(resolved.steamId64).catch(() => null);
    const current = account ?? snapshot;
    if (!current) {
      throw new UserFacingError(
        `Steam account ${resolved.steamId64} is not tracked yet. Steam may be unreachable or the profile is private.`,
      );
    }
    const embed = baseEmbed(
      `Steam profile · ${resolved.steamId64}`,
      `SteamID64 is the identity. Display names are timestamped observations and are never used as an identifier.`,
    ).addFields(
      { name: 'Current name', value: current.currentDisplayName ?? 'Unavailable', inline: true },
      { name: 'Profile status', value: current.profileStatus, inline: true },
      {
        name: 'Linked Discord',
        value: current.linkedDiscordUserIds.length
          ? current.linkedDiscordUserIds.map((id) => `<@${id}>`).join(', ')
          : 'Not linked',
        inline: true,
      },
      { name: 'Moderation cases', value: String(current.moderationCaseCount), inline: true },
      {
        name: 'Last checked',
        value: current.lastCheckedAt ? formatUtc(current.lastCheckedAt) : 'Never',
        inline: true,
      },
    );
    if (current.nameHistory.length > 0) {
      embed.addFields({
        name: 'Observed name history',
        value: truncate(
          current.nameHistory
            .slice(0, 8)
            .map(
              (row) =>
                `**${row.displayName}** · first seen ${formatUtc(row.firstObservedAt)}` +
                (row.previousDisplayName ? ` · previously ${row.previousDisplayName}` : ''),
            )
            .join('\n'),
          1024,
        ),
      });
    }
    if (account && snapshot && account.currentDisplayName !== snapshot.currentDisplayName) {
      embed.addFields({
        name: 'Refresh note',
        value:
          'The live Steam refresh returned a different name than the cached observation. Both observations are retained.',
      });
    }
    await replyWithEmbeds(interaction, embed);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export const steamTimestamp = nowIso;
