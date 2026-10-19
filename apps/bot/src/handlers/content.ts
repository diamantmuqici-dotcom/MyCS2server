import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import {
  BRAND,
  BRAND_COLOR_DISCORD,
  RULES,
  RULES_UPDATED_AT,
  RULES_VERSION,
  formatUtc,
  nowIso,
  type AnnouncementCategory,
} from '@dardania/shared';
import { baseEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import type { BotContext } from '../context.js';
import { UserFacingError } from '../permissions.js';
import {
  deferEphemeral,
  loadConfig,
  missingChannelMessage,
  replyWithEmbeds,
  requireGuild,
  resolveTextChannel,
  showError,
  truncate,
} from './shared.js';

function rulesHeaderEmbed(): EmbedBuilder {
  return baseEmbed(
    `${BRAND.name} • Community rules v${RULES_VERSION}`,
    `Last reviewed ${formatUtc(RULES_UPDATED_AT).split(' ')[0]}. The same rules are published on the website ` +
      `in English and Albanian. Every punishment carries a case reference; appeals must quote it.\n\n` +
      'Rregullat janë të njëjta në faqen zyrtare. Çdo dënim ka një referencë rasti; apelimet duhet ta citojnë atë.',
  ).setColor(BRAND_COLOR_DISCORD);
}

function rulesSectionEmbed(index: number, section: (typeof RULES)[number]): EmbedBuilder {
  const english = section.items.map((item) => `• ${item.en}`).join('\n');
  const albanian = section.items.map((item) => `• ${item.sq}`).join('\n');
  return new EmbedBuilder()
    .setColor(BRAND_COLOR_DISCORD)
    .setTitle(`${String(index + 1).padStart(2, '0')} · ${section.title.en}`)
    .addFields(
      { name: 'English', value: truncate(english, 1024) },
      { name: 'Shqip', value: truncate(albanian, 1024) },
    );
}

export async function handlePostRules(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const config = await loadConfig(ctx, guild.id);
    const channelId = config?.channels?.rules ?? null;
    const channel = await resolveTextChannel(guild, channelId);
    if (!channel) throw new UserFacingError(missingChannelMessage('rules'));

    const confirmed = await confirmAction(interaction, {
      title: 'Publish the community rules',
      description:
        `Post rules v${RULES_VERSION} (${RULES.length} bilingual sections) in <#${channel.id}>?\n\n` +
        'This appends a new rules message. It does not delete or edit earlier posts.',
      confirmLabel: 'Publish rules',
      danger: false,
    });
    if (!confirmed) return;

    const embeds: EmbedBuilder[] = [rulesHeaderEmbed(), ...RULES.map((section, index) => rulesSectionEmbed(index, section))];
    const messages = [] as { id: string }[];
    for (let index = 0; index < embeds.length; index += 10) {
      const chunk = embeds.slice(index, index + 10);
      const message = await channel.send({ embeds: chunk });
      messages.push({ id: message.id });
    }
    ctx.logger.info(`Published rules v${RULES_VERSION} in guild ${guild.id}`, {
      channelId: channel.id,
      messages: messages.length,
    });
    await replyWithEmbeds(
      interaction,
      baseEmbed('Rules published', `Posted **${embeds.length}** embeds in <#${channel.id}>.`)
        .addFields(
          { name: 'Version', value: RULES_VERSION, inline: true },
          { name: 'Website', value: 'The website renders the same source text, so the two cannot drift apart.' },
        ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handleAnnounce(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const config = await loadConfig(ctx, guild.id);
    const title = interaction.options.getString('title', true).trim();
    const message = interaction.options.getString('message', true).trim();
    const category = (interaction.options.getString('category') ?? 'GENERAL') as AnnouncementCategory;
    const image = interaction.options.getString('image')?.trim() || null;
    if (image && !/^https?:\/\/\S+$/i.test(image)) {
      throw new UserFacingError('image must be a full http(s) URL.');
    }
    const channel = await resolveTextChannel(guild, config?.channels?.announcements ?? null);
    if (!channel) throw new UserFacingError(missingChannelMessage('announcements'));

    const preview = baseEmbed(title, message)
      .setColor(BRAND_COLOR_DISCORD)
      .addFields(
        { name: 'Category', value: category.replace('_', ' '), inline: true },
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Author', value: `<@${interaction.user.id}>`, inline: true },
      );
    if (image) preview.setImage(image);
    const confirmed = await confirmAction(interaction, {
      title: 'Publish this announcement?',
      description: `The message will be posted in <#${channel.id}> and recorded on the public website.`,
      confirmLabel: 'Publish announcement',
      danger: false,
    });
    if (!confirmed) return;

    const posted = await channel.send({ embeds: [preview] });
    let websiteNote: string;
    try {
      const announcement = await ctx.api.recordAnnouncement({
        guildId: guild.id,
        title,
        body: message,
        category,
        imageUrl: image,
        authorDiscordId: interaction.user.id,
        authorName: interaction.user.username,
        discordMessageId: posted.id,
        discordChannelId: channel.id,
      });
      websiteNote = ctx.env.webBaseUrl
        ? `Published on the website: ${ctx.env.webBaseUrl}/announcements/${announcement.slug}`
        : `Published on the website as "${announcement.slug}".`;
      if (ctx.env.webBaseUrl) {
        const enriched = EmbedBuilder.from(posted.embeds[0]!).setURL(
          `${ctx.env.webBaseUrl}/announcements/${announcement.slug}`,
        );
        await posted.edit({ embeds: [enriched] }).catch(() => undefined);
      }
    } catch (error) {
      ctx.logger.error('Announcement posted to Discord but the backend record failed', error);
      websiteNote =
        'The Discord post exists, but the backend record failed — it is NOT listed on the website yet. Retry with /announce once the API is reachable; duplicates are avoided by the site slug only after a successful record.';
      await posted
        .edit({
          embeds: [
            EmbedBuilder.from(posted.embeds[0]!).setFooter({
              text: 'Website record pending — backend unavailable',
            }),
          ],
        })
        .catch(() => undefined);
    }

    await replyWithEmbeds(
      interaction,
      baseEmbed('Announcement processed', websiteNote).addFields(
        { name: 'Discord message', value: `[Jump to message](${posted.url})` },
      ),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePostServerInfo(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const config = await loadConfig(ctx, guild.id);
    const channel = await resolveTextChannel(guild, config?.channels?.serverInformation ?? null);
    if (!channel) throw new UserFacingError(missingChannelMessage('serverInformation'));

    const confirmed = await confirmAction(interaction, {
      title: 'Post server information',
      description: `Post the current server information embed in <#${channel.id}>?`,
      confirmLabel: 'Post information',
      danger: false,
    });
    if (!confirmed) return;

    const embed = baseEmbed(
      `${BRAND.name} • ${BRAND.game}`,
      `${BRAND.description}\n\nRegion: **${BRAND.region}** · Rules: **v${RULES_VERSION}**`,
    )
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Created', value: formatUtc(guild.createdAt.toISOString()), inline: true },
        {
          name: 'Rules',
          value: config?.channels?.rules ? `<#${config.channels.rules}>` : 'Run /post-rules to publish them',
          inline: true,
        },
        {
          name: 'Dashboard',
          value: ctx.env.webBaseUrl
            ? `${ctx.env.webBaseUrl}/dashboard`
            : 'Set WEB_BASE_URL to display a clickable dashboard link.',
        },
        { name: 'Recorded at', value: formatUtc(nowIso()), inline: true },
      );
    await channel.send({ embeds: [embed] });
    await replyWithEmbeds(
      interaction,
      baseEmbed('Server information posted', `Posted in <#${channel.id}>.`),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}

export async function handlePostStaffAnnouncement(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const config = await loadConfig(ctx, guild.id);
    const title = interaction.options.getString('title', true).trim();
    const message = interaction.options.getString('message', true).trim();
    const channel: TextChannel | null = await resolveTextChannel(
      guild,
      config?.channels?.staffAnnouncements ?? null,
    );
    if (!channel) throw new UserFacingError(missingChannelMessage('staffAnnouncements'));

    const confirmed = await confirmAction(interaction, {
      title: 'Post staff announcement',
      description: `Post this internal message in <#${channel.id}>? It is **not** published to the website.`,
      confirmLabel: 'Post internally',
      danger: false,
    });
    if (!confirmed) return;

    const embed = baseEmbed(`Staff · ${title}`, message)
      .setColor(0xffc857)
      .addFields({ name: 'Author', value: `<@${interaction.user.id}>`, inline: true });
    await channel.send({ embeds: [embed] });
    await replyWithEmbeds(
      interaction,
      baseEmbed('Staff announcement posted', `Posted in <#${channel.id}>.`),
    );
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}
