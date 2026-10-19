import { Events, type Client, type GuildBan } from 'discord.js';
import type { BotContext } from './context.js';
import { findAuditEntry } from './audit.js';
import { baseEmbed } from './embeds.js';
import { resolveTextChannel } from './handlers/shared.js';
import type { DeliveryItem } from './api-client.js';
import { BRAND, formatUtc } from '@dardania/shared';
import type { ModerationCaseDto } from '@dardania/shared';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function guildAllowed(ctx: BotContext, guildId: string): boolean {
  return ctx.env.allowedGuildIds.length === 0 || ctx.env.allowedGuildIds.includes(guildId);
}

async function recentCaseExists(
  ctx: BotContext,
  guildId: string,
  targetId: string,
  actionType: 'BAN' | 'UNBAN',
): Promise<boolean> {
  try {
    const result = await ctx.api.listCases({
      guildId,
      targetDiscordId: targetId,
      actionType,
      pageSize: 3,
      sort: 'occurred_at_desc',
    });
    const cutoff = Date.now() - 120_000;
    return result.items.some((item) => new Date(item.occurredAt).getTime() >= cutoff);
  } catch {
    return false;
  }
}

/**
 * Gateway listeners record bans/unbans performed outside this bot (dashboard
 * actions, other bots, manual Discord actions) and attribute them from the
 * audit log. Actions executed by this bot are recorded by the command path and
 * are skipped here.
 */
export function registerGatewayHandlers(client: Client, ctx: BotContext): void {
  client.on(Events.GuildBanAdd, (ban: GuildBan) => {
    void handleBanAdd(ban, ctx).catch((error) =>
      ctx.logger.error('Failed to process GuildBanAdd', error),
    );
  });
  client.on(Events.GuildBanRemove, (ban: GuildBan) => {
    void handleBanRemove(ban, ctx).catch((error) =>
      ctx.logger.error('Failed to process GuildBanRemove', error),
    );
  });
}

async function handleBanAdd(ban: GuildBan, ctx: BotContext): Promise<void> {
  const guild = ban.guild;
  if (!guildAllowed(ctx, guild.id)) return;
  if (await recentCaseExists(ctx, guild.id, ban.user.id, 'BAN')) return;
  const audit = await findAuditEntry(guild, 'ban', ban.user.id, {
    attempts: 5,
    windowMs: 30_000,
  });
  if (audit?.executorId === guild.client.user.id) {
    // Our own command path owns the record (durable local outbox).
    return;
  }
  if (await recentCaseExists(ctx, guild.id, ban.user.id, 'BAN')) return;
  const verified = Boolean(audit?.executorId && !audit.executorIsBot);
  const payload = {
    guildId: guild.id,
    guildName: guild.name,
    actionType: 'BAN',
    target: { id: ban.user.id, username: ban.user.username, globalName: ban.user.globalName },
    moderator:
      verified && audit ? { id: audit.executorId as string, name: audit.executorName } : null,
    reason: ban.reason ?? null,
    occurredAt: new Date().toISOString(),
    source: 'GATEWAY_AUDIT_LOG' as const,
    dedupeKey: audit
      ? `ban:audit:${guild.id}:${audit.entryId}`
      : `ban:gateway:${guild.id}:${ban.user.id}:${Date.now()}`,
    auditEntryId: audit?.entryId ?? null,
    attributionStatus: verified ? ('VERIFIED' as const) : ('UNKNOWN' as const),
    attributionEvidence: {
      gatewayEvent: 'GuildBanAdd',
      auditEntryId: audit?.entryId ?? null,
      auditExecutorId: audit?.executorId ?? null,
      auditExecutorIsBot: audit?.executorIsBot ?? null,
    },
  };
  await ctx.outbox.record(payload);
}

async function handleBanRemove(ban: GuildBan, ctx: BotContext): Promise<void> {
  const guild = ban.guild;
  if (!guildAllowed(ctx, guild.id)) return;
  if (await recentCaseExists(ctx, guild.id, ban.user.id, 'UNBAN')) return;
  const audit = await findAuditEntry(guild, 'unban', ban.user.id, {
    attempts: 5,
    windowMs: 30_000,
  });
  if (audit?.executorId === guild.client.user.id) return;
  if (await recentCaseExists(ctx, guild.id, ban.user.id, 'UNBAN')) return;
  const verified = Boolean(audit?.executorId && !audit.executorIsBot);
  await ctx.outbox.record({
    guildId: guild.id,
    guildName: guild.name,
    actionType: 'UNBAN',
    target: { id: ban.user.id, username: ban.user.username, globalName: ban.user.globalName },
    moderator:
      verified && audit ? { id: audit.executorId as string, name: audit.executorName } : null,
    reason: ban.reason ?? null,
    occurredAt: new Date().toISOString(),
    source: 'GATEWAY_AUDIT_LOG',
    dedupeKey: audit
      ? `unban:audit:${guild.id}:${audit.entryId}`
      : `unban:gateway:${guild.id}:${ban.user.id}:${Date.now()}`,
    auditEntryId: audit?.entryId ?? null,
    attributionStatus: verified ? 'VERIFIED' : 'UNKNOWN',
    attributionEvidence: {
      gatewayEvent: 'GuildBanRemove',
      auditEntryId: audit?.entryId ?? null,
      auditExecutorId: audit?.executorId ?? null,
    },
  });
}

/** Re-checks audit logs for cases that were recorded without a verified actor. */
export async function reconcileAttribution(client: Client, ctx: BotContext): Promise<void> {
  if (!client.isReady()) return;
  for (const guild of client.guilds.cache.values()) {
    if (!guildAllowed(ctx, guild.id)) continue;
    let cases: ModerationCaseDto[] = [];
    try {
      cases = await ctx.api.unattributedCases(guild.id, 180);
    } catch {
      continue;
    }
    for (const moderationCase of cases) {
      if (moderationCase.actionType !== 'BAN' && moderationCase.actionType !== 'UNBAN') continue;
      const action = moderationCase.actionType === 'BAN' ? 'ban' : 'unban';
      const audit = await findAuditEntry(guild, action, moderationCase.target.discordUserId, {
        attempts: 1,
        near: moderationCase.occurredAt,
        toleranceMs: 5 * 60 * 1000,
      });
      if (!audit?.executorId || audit.executorIsBot) continue;
      try {
        await ctx.api.updateAttribution(moderationCase.id, {
          moderatorDiscordUserId: audit.executorId,
          moderatorName: audit.executorName,
          attributionStatus: 'VERIFIED',
          auditEntryId: audit.entryId,
          evidence: {
            reconciledAt: new Date().toISOString(),
            auditEntryId: audit.entryId,
            auditExecutorId: audit.executorId,
            auditExecutorIsBot: audit.executorIsBot,
          },
        });
        ctx.logger.info(
          `Attribution reconciled for ${moderationCase.caseRef} → ${audit.executorName ?? audit.executorId}`,
        );
      } catch (error) {
        ctx.logger.warn(`Attribution update failed for ${moderationCase.caseRef}`, error);
      }
      await sleep(250);
    }
  }
}

export function startRuntimeJobs(client: Client, ctx: BotContext): void {
  const heartbeat = async (): Promise<void> => {
    if (!client.isReady()) return;
    try {
      await ctx.api.heartbeat('operational', {
        guilds: client.guilds.cache.size,
        pingMs: client.ws.ping,
        uptimeSeconds: Math.round(process.uptime()),
        queuedEvents: ctx.outbox.size,
      });
    } catch (error) {
      ctx.logger.debug('Heartbeat failed', error);
    }
  };
  void heartbeat();
  setInterval(() => void heartbeat(), 30_000).unref();

  const flush = async (): Promise<void> => {
    try {
      await ctx.outbox.flush();
    } catch (error) {
      ctx.logger.warn('Local outbox flush failed', error);
    }
  };
  void flush();
  setInterval(() => void flush(), 30_000).unref();

  const deliveries = async (): Promise<void> => {
    let items: DeliveryItem[] = [];
    try {
      items = await ctx.api.listDeliveries(10);
    } catch (error) {
      ctx.logger.debug('No deliveries fetched', error);
      return;
    }
    for (const item of items) {
      try {
        await deliver(client, ctx, item);
      } catch (error) {
        ctx.logger.warn(`Delivery ${item.id} failed`, error);
        await ctx.api
          .reportDelivery(item.id, {
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 900) : 'delivery failed',
          })
          .catch(() => undefined);
      }
    }
  };
  setInterval(() => void deliveries(), 5_000).unref();

  const reconcile = async (): Promise<void> => {
    try {
      await reconcileAttribution(client, ctx);
    } catch (error) {
      ctx.logger.warn('Attribution reconciliation failed', error);
    }
  };
  setTimeout(() => void reconcile(), 60_000).unref();
  setInterval(() => void reconcile(), 180_000).unref();
}

export async function deliver(
  client: Client,
  ctx: BotContext,
  delivery: DeliveryItem,
): Promise<void> {
  const payload = delivery.payload;
  const guildId = typeof payload.guildId === 'string' ? payload.guildId : '';
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild ${guildId || '(missing)'} is not available to the bot.`);
  const config = await ctx.configs.get(guildId);
  const fallbackKey = delivery.topic === 'DISCORD_ANNOUNCEMENT' ? 'announcements' : 'modLogs';
  const channelKey = typeof payload.channelKey === 'string' ? payload.channelKey : fallbackKey;
  const channelId = config?.channels?.[channelKey] ?? null;
  const channel = await resolveTextChannel(guild, channelId);
  if (!channel) {
    throw new Error(
      `Channel "${channelKey}" is not configured. Run /setup-server or map it in the dashboard settings.`,
    );
  }

  const embed =
    delivery.topic === 'DISCORD_ANNOUNCEMENT' ? announcementEmbed(payload, ctx) : logEmbed(payload);

  const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  await ctx.api.reportDelivery(delivery.id, {
    ok: true,
    announcementId: typeof payload.announcementId === 'string' ? payload.announcementId : null,
    discordMessageId: message.id,
    discordChannelId: channel.id,
  });
}

function announcementEmbed(payload: Record<string, unknown>, ctx: BotContext) {
  const title = typeof payload.title === 'string' ? payload.title : 'Announcement';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const category = typeof payload.category === 'string' ? payload.category : 'GENERAL';
  const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl : null;
  const publishedAt = typeof payload.publishedAt === 'string' ? payload.publishedAt : undefined;
  const url =
    typeof payload.url === 'string' && ctx.env.webBaseUrl
      ? `${ctx.env.webBaseUrl}${payload.url}`
      : null;
  const embed = baseEmbed(title, body.slice(0, 4096))
    .addFields({ name: 'Category', value: category.replace('_', ' '), inline: true })
    .addFields({
      name: 'Published',
      value: formatUtc(publishedAt ?? new Date().toISOString()),
      inline: true,
    });
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) embed.setImage(imageUrl);
  if (url) embed.setURL(url);
  embed.setFooter({ text: `${BRAND.name} • announcement` });
  return embed;
}

function logEmbed(payload: Record<string, unknown>) {
  const actionType = typeof payload.actionType === 'string' ? payload.actionType : 'LOG';
  const target =
    typeof payload.targetDiscordUserId === 'string' ? payload.targetDiscordUserId : 'unknown';
  const moderator =
    typeof payload.moderatorDiscordUserId === 'string'
      ? `<@${payload.moderatorDiscordUserId}>`
      : 'Unknown (unverified)';
  const embed = baseEmbed(
    `${actionType.replace(/_/g, ' ')} • ${typeof payload.caseRef === 'string' ? payload.caseRef : ''}`,
    typeof payload.reason === 'string' ? payload.reason : 'No reason recorded.',
  ).addFields(
    { name: 'Target', value: `<@${target}>`, inline: true },
    { name: 'Moderator', value: moderator, inline: true },
    {
      name: 'Attribution',
      value: typeof payload.attributionStatus === 'string' ? payload.attributionStatus : 'UNKNOWN',
      inline: true,
    },
    {
      name: 'When',
      value:
        typeof payload.occurredAt === 'string'
          ? formatUtc(payload.occurredAt)
          : formatUtc(new Date().toISOString()),
      inline: true,
    },
  );
  if (typeof payload.steamId64 === 'string') {
    embed.addFields({
      name: 'Steam',
      value: `[\`${payload.steamId64}\`](https://steamcommunity.com/profiles/${payload.steamId64})\n${
        typeof payload.steamNameAtEvent === 'string'
          ? `Name at event: **${payload.steamNameAtEvent}**`
          : ''
      }`,
    });
  }
  if (typeof payload.outcome === 'string') {
    embed.addFields({ name: 'Outcome', value: payload.outcome, inline: true });
  }
  embed.setColor(actionType === 'BAN' ? 0xff5c7a : actionType === 'UNBAN' ? 0x3ddc97 : 0x075bff);
  return embed;
}
