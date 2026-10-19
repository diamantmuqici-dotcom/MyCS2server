import { z } from 'zod';
import {
  ANNOUNCEMENT_CATEGORIES,
  RULES_VERSION,
  isValidSteamId64,
  type ApiEnv,
} from '@dardania/shared';
import {
  completeDelivery,
  getCaseDetail,
  getGuild,
  listUnattributedCases,
  updateCaseAttribution,
  getGuildConfiguration,
  getSteamAccountDetail,
  getSteamLinksForAccount,
  linkSteamAccount,
  listCases,
  listDueDeliveries,
  listPcCheckNotes,
  markAnnouncementDelivered,
  mergeGuildConfiguration,
  recordAuditEvent,
  recordExternallyPublishedAnnouncement,
  recordServiceHealth,
  searchSteamAccounts,
  upsertGuild,
} from '@dardania/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '../errors.js';
import type { AppDeps } from '../deps.js';
import { ModerationService } from '../services/moderation.js';
import { PcCheckService } from '../services/pcChecks.js';
import { buildHealth } from '../services/health.js';
import { safeEqual } from '../auth/tokens.js';
import {
  announcementInputSchema,
  deliveryResultSchema,
  discordIdSchema,
  heartbeatSchema,
  internalCaseQuerySchema,
  moderationEventSchema,
  pcCheckCreateSchema,
  pcCheckQuerySchema,
  pcCheckUpdateSchema,
  pcNoteSchema,
  steamLinkSchema,
} from '../schemas.js';

function assertGuildAllowed(env: ApiEnv, guildId: string): void {
  if (env.discord.allowedGuildIds.length === 0) return;
  if (!env.discord.allowedGuildIds.includes(guildId)) {
    throw badRequest('Guild is not authorised for this deployment.');
  }
}

function requireServiceAuth(env: ApiEnv) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.serviceToken) {
      return reply.code(503).send({
        error: 'service_auth_not_configured',
        message: 'SERVICE_TOKEN is not configured on the backend; internal endpoints are closed.',
      });
    }
    const header = request.headers['x-service-token'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided || !safeEqual(provided, env.serviceToken)) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid service token.' });
    }
  };
}

const guildQuerySchema = z.object({
  guildId: discordIdSchema,
  refresh: z.enum(['0', '1']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const steamParamsSchema = z.object({ steamId64: z.string().trim().min(17).max(17) });
const userParamsSchema = z.object({ userId: discordIdSchema });

export async function registerInternalRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { env, db, steam } = deps;
  const moderation = new ModerationService(db, env, steam, deps.now);

  app.addHook('preHandler', requireServiceAuth(env));

  app.get('/health', async () => ({
    ok: true,
    services: await buildHealth(db, deps.now()),
    time: deps.now(),
  }));

  app.post('/heartbeat', async (request) => {
    const payload = heartbeatSchema.parse(request.body ?? {});
    await recordServiceHealth(
      db,
      payload.service,
      payload.status,
      (payload.detail as Record<string, unknown> | null) ?? null,
      deps.now(),
    );
    return { ok: true };
  });

  app.post('/moderation-events', async (request) => {
    const payload = moderationEventSchema.parse(request.body ?? {});
    const result = await moderation.ingest(payload);
    return result;
  });

  app.get('/bans', async (request) => {
    const parsed = internalCaseQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, parsed.guildId);
    const result = await listCases(db, {
      ...parsed,
      dateTo:
        parsed.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateTo)
          ? `${parsed.dateTo}T23:59:59.999Z`
          : parsed.dateTo,
      dateFrom:
        parsed.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateFrom)
          ? `${parsed.dateFrom}T00:00:00.000Z`
          : parsed.dateFrom,
    });
    return result;
  });

  app.get('/cases/unattributed', async (request) => {
    const { guildId, minutes } = z
      .object({
        guildId: discordIdSchema,
        minutes: z.coerce.number().int().min(1).max(1440).default(90),
      })
      .parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    return { items: await listUnattributedCases(db, guildId, since, 100) };
  });

  app.post('/cases/:id/attribution', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        guildId: discordIdSchema,
        moderatorDiscordUserId: discordIdSchema.nullable(),
        moderatorName: z.string().trim().max(120).nullable(),
        attributionStatus: z.enum(['VERIFIED', 'PARTIAL', 'UNKNOWN']),
        auditEntryId: z.string().trim().max(64).nullable(),
        evidence: z.record(z.string(), z.unknown()),
      })
      .parse(request.body ?? {});
    assertGuildAllowed(env, payload.guildId);
    const updated = await updateCaseAttribution(
      db,
      {
        caseId: id,
        guildId: payload.guildId,
        moderatorDiscordUserId: payload.moderatorDiscordUserId,
        moderatorName: payload.moderatorName,
        attributionStatus: payload.attributionStatus,
        auditEntryId: payload.auditEntryId,
        evidence: payload.evidence,
      },
      deps.now(),
    );
    if (!updated) throw notFound('Case not found.');
    return { case: updated };
  });

  app.get('/cases/:ref', async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const detail = await getCaseDetail(db, guildId, ref);
    if (!detail) throw notFound('Case not found.');
    return { case: detail };
  });

  app.get('/warnings/:userId', async (request) => {
    const { userId } = userParamsSchema.parse(request.params);
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const rows = await db.all<{
      id: string;
      reason: string | null;
      created_at: string;
      moderator_discord_user_id: string | null;
      moderator_name_at_event: string | null;
      case_id: string;
    }>(
      `SELECT id, reason, created_at, moderator_discord_user_id, moderator_name_at_event, case_id
       FROM warnings WHERE guild_id = ? AND target_discord_user_id = ? AND active = '1'
       ORDER BY created_at ASC`,
      [guildId, userId],
    );
    return { userId, warnings: rows };
  });

  app.get('/steam', async (request) => {
    const parsed = z
      .object({
        q: z.string().trim().max(200).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(request.query ?? {});
    return searchSteamAccounts(db, parsed);
  });

  app.get('/steam/resolve', async (request) => {
    const { input } = z
      .object({ input: z.string().trim().min(1).max(200) })
      .parse(request.query ?? {});
    const resolved = await steam.resolveInput(input);
    return resolved;
  });

  app.get('/steam/:steamId64', async (request) => {
    const { steamId64 } = steamParamsSchema.parse(request.params);
    if (!isValidSteamId64(steamId64)) throw badRequest('Invalid SteamID64.');
    const { refresh } = guildQuerySchema.partial().parse(request.query ?? {});
    if (refresh === '1') {
      return steam.refresh(steamId64, { force: true });
    }
    const account = await getSteamAccountDetail(db, steamId64);
    if (!account) throw notFound('Steam account has not been observed yet.');
    return { account, links: await getSteamLinksForAccount(db, steamId64) };
  });

  app.post('/steam/link', async (request) => {
    const payload = steamLinkSchema
      .extend({ guildId: discordIdSchema.optional(), actorDiscordId: discordIdSchema.optional() })
      .parse(request.body ?? {});
    if (payload.guildId) assertGuildAllowed(env, payload.guildId);
    let steamId64 = payload.steamId64 ?? null;
    if (!steamId64 && payload.steamInput) {
      const resolved = await steam.resolveInput(payload.steamInput);
      steamId64 = resolved.steamId64;
      if (!steamId64) throw badRequest(resolved.error ?? 'Steam profile could not be resolved.');
    }
    if (!steamId64) throw badRequest('A valid SteamID64 is required.');
    await linkSteamAccount(db, {
      steamId64,
      discordUserId: payload.discordUserId,
      linkedBy: payload.actorDiscordId ?? 'bot',
      source: 'DISCORD_COMMAND',
      verification: payload.verification,
      now: deps.now(),
    });
    await recordAuditEvent(
      db,
      {
        guildId: payload.guildId ?? env.discord.guildId ?? null,
        actorDiscordId: payload.actorDiscordId ?? null,
        actorType: payload.actorDiscordId ? 'USER' : 'BOT',
        action: 'steam.link',
        entityType: 'steam_account_link',
        entityId: steamId64,
        summary: `Steam account ${steamId64} linked to ${payload.discordUserId} via Discord.`,
        after: { verification: payload.verification },
      },
      deps.now(),
    );
    return { account: await getSteamAccountDetail(db, steamId64) };
  });

  // ---- PC checks ---------------------------------------------------------
  app.get('/pc-checks', async (request) => {
    const parsed = pcCheckQuerySchema.parse(request.query ?? {});
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    return service.list(parsed);
  });

  app.post('/pc-checks', async (request) => {
    const payload = pcCheckCreateSchema.parse(request.body ?? {});
    const guildId = payload.guildId ?? env.discord.guildId;
    if (!guildId) throw badRequest('guildId is required.');
    assertGuildAllowed(env, guildId);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    return service.create(payload, payload.requestedBy ?? 'system');
  });

  app.get('/pc-checks/:ref', async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    const pcCheck = await service.detail(ref, 'PC_CHECKER');
    return { pcCheck };
  });

  app.patch('/pc-checks/:ref', async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const { guildId, actorDiscordId, ...patch } = pcCheckUpdateSchema
      .extend({ guildId: discordIdSchema, actorDiscordId: discordIdSchema.optional() })
      .parse(request.body ?? {});
    assertGuildAllowed(env, guildId);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    return { pcCheck: await service.update(ref, patch, actorDiscordId ?? 'system') };
  });

  app.post('/pc-checks/:ref/notes', async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const parsed = pcNoteSchema
      .extend({
        guildId: discordIdSchema,
        actorDiscordId: discordIdSchema,
        actorName: z.string().trim().max(120).nullish(),
      })
      .parse(request.body ?? {});
    assertGuildAllowed(env, parsed.guildId);
    const service = new PcCheckService(db, parsed.guildId, steam, deps.now);
    const note = await service.addNote(
      ref,
      { note: parsed.note, visibility: 'STAFF' },
      {
        discordUserId: parsed.actorDiscordId,
        name: parsed.actorName ?? null,
        // Owner-only notes are only created from the authenticated dashboard.
        level: 'PC_CHECKER',
      },
    );
    return { note };
  });

  app.get('/pc-checks/:ref/notes', async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    const pcCheck = await service.detail(ref, 'PC_CHECKER');
    const notes = await listPcCheckNotes(db, pcCheck.id, { includeOwnerOnly: false });
    return { notes };
  });

  // ---- Announcements published from Discord ------------------------------
  app.post('/announcements/record', async (request) => {
    const parsed = announcementInputSchema
      .extend({
        guildId: discordIdSchema,
        authorDiscordId: discordIdSchema,
        authorName: z.string().trim().max(120).nullish(),
        discordMessageId: z.string().trim().min(1).max(64),
        discordChannelId: z.string().trim().min(1).max(64),
      })
      .parse(request.body ?? {});
    assertGuildAllowed(env, parsed.guildId);
    const existingGuild = await getGuild(db, parsed.guildId);
    await upsertGuild(
      db,
      { id: parsed.guildId, name: existingGuild?.name ?? 'Discord server' },
      deps.now(),
    );
    const announcement = await recordExternallyPublishedAnnouncement(
      db,
      {
        guildId: parsed.guildId,
        title: parsed.title,
        body: parsed.body,
        category: parsed.category,
        imageUrl: parsed.imageUrl ?? null,
        authorDiscordId: parsed.authorDiscordId,
        authorName: parsed.authorName ?? null,
        discordMessageId: parsed.discordMessageId,
        discordChannelId: parsed.discordChannelId,
      },
      deps.now(),
    );
    await recordAuditEvent(
      db,
      {
        guildId: parsed.guildId,
        actorDiscordId: parsed.authorDiscordId,
        actorType: 'USER',
        action: 'announcement.posted_from_discord',
        entityType: 'announcement',
        entityId: announcement.id,
        summary: `Announcement "${announcement.title}" posted from Discord.`,
      },
      deps.now(),
    );
    return { announcement };
  });

  // ---- Discord delivery outbox (polled by the bot) -----------------------
  app.get('/discord-deliveries', async (request) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .parse((request.query as { limit?: string } | undefined)?.limit ?? 10);
    return { deliveries: await listDueDeliveries(db, deps.now(), limit) };
  });

  app.post('/discord-deliveries/:id/result', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = deliveryResultSchema.parse(request.body ?? {});
    const result = await completeDelivery(
      db,
      { id, ok: payload.ok, error: payload.error ?? null },
      deps.now(),
    );
    if (
      payload.ok &&
      payload.announcementId &&
      payload.discordMessageId &&
      payload.discordChannelId
    ) {
      await markAnnouncementDelivered(
        db,
        payload.announcementId,
        {
          discordMessageId: payload.discordMessageId,
          discordChannelId: payload.discordChannelId,
        },
        deps.now(),
      );
      await recordAuditEvent(
        db,
        {
          guildId: env.discord.guildId || null,
          actorType: 'BOT',
          action: 'announcement.published_to_discord',
          entityType: 'announcement',
          entityId: payload.announcementId,
          summary: 'Announcement delivered to Discord.',
          after: { discordMessageId: payload.discordMessageId },
        },
        deps.now(),
      );
    }
    return result;
  });

  // ---- Guild configuration (used by /setup-server) -----------------------
  app.get('/guild-config', async (request) => {
    const { guildId } = guildQuerySchema.parse(request.query ?? {});
    assertGuildAllowed(env, guildId);
    const [guild, configuration] = await Promise.all([
      getGuild(db, guildId),
      getGuildConfiguration(db, guildId),
    ]);
    return {
      guild: guild ?? null,
      config: configuration.config,
      updatedAt: configuration.updatedAt,
      updatedBy: configuration.updatedBy,
    };
  });

  app.post('/guild-config', async (request) => {
    const parsed = z
      .object({
        guildId: discordIdSchema,
        guildName: z.string().trim().max(120).optional(),
        actorDiscordId: discordIdSchema,
        complete: z.boolean().default(false),
        config: z.object({
          roles: z.record(z.string().max(64), z.string().max(20).nullable()).optional(),
          channels: z.record(z.string().max(64), z.string().max(20).nullable()).optional(),
          features: z.record(z.string().max(64), z.boolean()).optional(),
        }),
      })
      .parse(request.body ?? {});
    assertGuildAllowed(env, parsed.guildId);
    const existingGuild = await getGuild(db, parsed.guildId);
    await upsertGuild(
      db,
      {
        id: parsed.guildId,
        name: parsed.guildName ?? existingGuild?.name ?? 'Discord server',
      },
      deps.now(),
    );
    const merged = await mergeGuildConfiguration(
      db,
      parsed.guildId,
      {
        ...parsed.config,
        ...(parsed.complete ? { setupCompletedAt: deps.now() } : {}),
      },
      parsed.actorDiscordId,
      deps.now(),
    );
    await recordAuditEvent(
      db,
      {
        guildId: parsed.guildId,
        actorDiscordId: parsed.actorDiscordId,
        actorType: 'USER',
        action: parsed.complete ? 'setup.completed' : 'setup.updated',
        entityType: 'guild_configuration',
        entityId: parsed.guildId,
        summary: parsed.complete
          ? 'Server setup completed from Discord.'
          : 'Server configuration updated from Discord.',
        after: merged,
      },
      deps.now(),
    );
    return { config: merged };
  });

  app.get('/rules', async () => ({ version: RULES_VERSION }));

  app.get('/announcement-categories', async () => ({ categories: ANNOUNCEMENT_CATEGORIES }));
}
