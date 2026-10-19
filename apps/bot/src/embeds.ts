import { EmbedBuilder } from 'discord.js';
import { BRAND, BRAND_COLOR_DISCORD, formatUtc, type ModerationCaseDto, type PcCheckDto } from '@dardania/shared';

export function baseEmbed(title?: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(BRAND_COLOR_DISCORD);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  embed.setFooter({ text: `${BRAND.name} • ${BRAND.game}` });
  embed.setTimestamp(new Date());
  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return baseEmbed('Action not completed', message).setColor(0xff5c7a);
}

export function successEmbed(title: string, description: string): EmbedBuilder {
  return baseEmbed(title, description).setColor(0x3ddc97);
}

export function caseEmbed(moderationCase: ModerationCaseDto): EmbedBuilder {
  const embed = baseEmbed(
    `${moderationCase.caseRef} • ${moderationCase.actionType}`,
    moderationCase.reason ?? 'No reason recorded.',
  );
  embed.addFields(
    {
      name: 'Target (Discord)',
      value: `<@${moderationCase.target.discordUserId}>\n\`${moderationCase.target.discordUserId}\``,
      inline: true,
    },
    {
      name: 'Moderator',
      value: moderationCase.moderator.discordUserId
        ? `<@${moderationCase.moderator.discordUserId}>\n\`${moderationCase.moderator.discordUserId}\``
        : 'Unknown — not verified',
      inline: true,
    },
    {
      name: 'Status',
      value: `${moderationCase.status}${moderationCase.banStatus ? ` / ban ${moderationCase.banStatus}` : ''}`,
      inline: true,
    },
    { name: 'Occurred', value: formatUtc(moderationCase.occurredAt), inline: true },
    {
      name: 'Steam name at event',
      value: moderationCase.steamAtEvent.name
        ? `**${moderationCase.steamAtEvent.name}**\n${moderationCase.steamAtEvent.nameSource ?? ''}`
        : 'Not observed at the time of the action',
      inline: true,
    },
    {
      name: 'Current observed Steam name',
      value: moderationCase.steamCurrent?.displayName
        ? `**${moderationCase.steamCurrent.displayName}**`
        : 'Current name unavailable',
      inline: true,
    },
    {
      name: 'Steam profile',
      value: moderationCase.steamAtEvent.steamId64
        ? `[\`${moderationCase.steamAtEvent.steamId64}\`](${moderationCase.steamAtEvent.profileUrl})`
        : 'No verified Steam match',
      inline: false,
    },
    {
      name: 'Attribution',
      value: `${moderationCase.attributionStatus} • source ${moderationCase.source}`,
      inline: true,
    },
  );
  return embed;
}

export function pcCheckEmbed(pcCheck: PcCheckDto): EmbedBuilder {
  const embed = baseEmbed(`PC check ${pcCheck.caseRef}`, pcCheck.reason ?? 'No reason recorded.');
  embed.addFields(
    { name: 'Status', value: pcCheck.status, inline: true },
    { name: 'Outcome', value: pcCheck.outcome ?? 'Pending', inline: true },
    { name: 'Target', value: `<@${pcCheck.targetDiscordUserId}>`, inline: true },
    { name: 'Requested by', value: pcCheck.requestedBy ? `<@${pcCheck.requestedBy}>` : 'Unknown', inline: true },
    { name: 'Assigned to', value: pcCheck.assignedTo ? `<@${pcCheck.assignedTo}>` : 'Unassigned', inline: true },
    {
      name: 'Steam',
      value: pcCheck.steamId64
        ? `[Profile](https://steamcommunity.com/profiles/${pcCheck.steamId64})\n${pcCheck.steamNameAtEvent ?? 'Name not recorded'}`
        : 'No Steam account linked',
      inline: false,
    },
  );
  return embed;
}
