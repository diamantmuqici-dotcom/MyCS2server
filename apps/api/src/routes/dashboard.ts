import { z } from 'zod';
import { isValidSteamId64, type AccessLevel } from '@dardania/shared';
import {
  correctCaseFields,
  getActiveAccess,
  getSteamAccountDetail,
  grantAccess,
  linkSteamAccount,
  listAccessHistory,
  listActiveAccess,
  recordAuditEvent,
  revokeAccess,
  searchSteamAccounts,
} from '@dardania/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '../errors.js';
import type { AppDeps } from '../deps.js';
import type { Guards } from '../guards.js';
import { DashboardService } from '../services/dashboard.js';
import { AnnouncementService } from '../services/announcements.js';
import { PcCheckService } from '../services/pcChecks.js';
import { buildHealth } from '../services/health.js';
import {
  accessGrantSchema,
  announcementFiltersSchema,
  announcementInputSchema,
  announcementUpdateSchema,
  auditQuerySchema,
  banSearchSchema,
  caseCorrectionSchema,
  pcCheckQuerySchema,
  pcNoteSchema,
  settingsPatchSchema,
  steamLinkSchema,
  steamSearchSchema,
} from '../schemas.js';

function normalizeDateTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.999Z`;
  return value;
}

function normalizeDateFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  return value;
}

async function ensureGuildConfigured(env: AppDeps['env']): Promise<string> {
  if (!env.discord.guildId) {
    throw badRequest('DISCORD_GUILD_ID is not configured on the backend.');
  }
  return env.discord.guildId;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  guards: Guards,
): Promise<void> {
  const { db, env, steam } = deps;
  const dashboard = new DashboardService(db, env, deps.now);
  const announcements = new AnnouncementService(db, env.discord.guildId, deps.now);

  app.get('/overview', { preHandler: guards.history }, async () => dashboard.overview());

  app.get('/cases', { preHandler: guards.history }, async (request) => {
    const parsed = banSearchSchema.parse(request.query ?? {});
    return dashboard.listCases({
      ...parsed,
      dateFrom: normalizeDateFrom(parsed.dateFrom),
      dateTo: normalizeDateTo(parsed.dateTo),
    });
  });

  app.get('/cases/:ref', { preHandler: guards.history }, async (request) => {
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    return { case: await dashboard.caseDetail(ref) };
  });

  app.patch('/cases/:ref', { preHandler: guards.history }, async (request: FastifyRequest) => {
    const auth = request.auth;
    if (!auth) throw badRequest('Authentication required.');
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const payload = caseCorrectionSchema.parse(request.body ?? {});
    const existing = await dashboard.caseDetail(ref);
    const {
      correctionNote: _correctionNote,
      moderatorDiscordUserId,
      ...patch
    } = payload;
    const updated = await correctCaseFields(
      db,
      {
        caseId: existing.id,
        actorDiscordId: auth.user.id,
        patch: {
          ...patch,
          ...(moderatorDiscordUserId !== undefined
            ? {
                moderatorDiscordUserId:
                  moderatorDiscordUserId === '' ? null : moderatorDiscordUserId,
              }
            : {}),
        },
      },
      deps.now(),
    );
    if (!updated) throw notFound('Moderation case not found.');
    await recordAuditEvent(
      db,
      {
        guildId: existing.guildId,
        actorDiscordId: auth.user.id,
        actorType: 'USER',
        action: 'case.correction_reason',
        entityType: 'moderation_case',
        entityId: existing.id,
        summary: `Correction on ${existing.caseRef}: ${payload.correctionNote}`,
      },
      deps.now(),
    );
    return { case: await dashboard.caseDetail(ref) };
  });

  app.get('/bans/active', { preHandler: guards.history }, async (request) => {
    const parsed = banSearchSchema.parse(request.query ?? {});
    return dashboard.listCases({
      ...parsed,
      banStatus: 'ACTIVE',
      actionType: 'BAN',
      pageSize: Math.min(parsed.pageSize, 100),
    });
  });

  app.get('/staff', { preHandler: guards.history }, async () => ({
    items: await dashboard.staffActivity(),
  }));

  app.get('/audit-log', { preHandler: guards.history }, async (request) => {
    const parsed = auditQuerySchema.parse(request.query ?? {});
    return dashboard.auditLog(parsed);
  });

  app.get('/steam', { preHandler: guards.history }, async (request) => {
    const parsed = steamSearchSchema.parse(request.query ?? {});
    return searchSteamAccounts(db, parsed);
  });

  app.get('/steam/:steamId64', { preHandler: guards.history }, async (request) => {
    const { steamId64 } = z
      .object({ steamId64: z.string().trim() })
      .parse(request.params);
    if (!isValidSteamId64(steamId64)) throw badRequest('Invalid SteamID64.');
    const account = await getSteamAccountDetail(db, steamId64);
    if (!account) throw notFound('Steam account has not been observed yet.');
    return { account };
  });

  app.post('/steam/:steamId64/refresh', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const { steamId64 } = z.object({ steamId64: z.string().trim() }).parse(request.params);
    if (!isValidSteamId64(steamId64)) throw badRequest('Invalid SteamID64.');
    const result = await steam.refresh(steamId64, { force: true });
    await recordAuditEvent(
      db,
      {
        guildId: env.discord.guildId || null,
        actorDiscordId: auth?.user.id ?? null,
        actorType: 'USER',
        action: 'steam.refresh',
        entityType: 'steam_account',
        entityId: steamId64,
        summary: `Steam profile refresh requested for ${steamId64} (${result.status}).`,
        after: { status: result.status, error: result.error },
      },
      deps.now(),
    );
    return result;
  });

  app.post('/steam/link', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const payload = steamLinkSchema.parse(request.body ?? {});
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
      linkedBy: auth?.user.id ?? 'system',
      source: 'DASHBOARD',
      verification: payload.verification,
      now: deps.now(),
    });
    await recordAuditEvent(
      db,
      {
        guildId: env.discord.guildId || null,
        actorDiscordId: auth?.user.id ?? null,
        actorType: 'USER',
        action: 'steam.link',
        entityType: 'steam_account_link',
        entityId: steamId64,
        summary: `Steam account ${steamId64} linked to Discord user ${payload.discordUserId} (${payload.verification}).`,
        after: { steamId64, discordUserId: payload.discordUserId, verification: payload.verification },
      },
      deps.now(),
    );
    const account = await getSteamAccountDetail(db, steamId64);
    return { account };
  });

  // ---- PC checks (Owner, Co-Owner and scoped PC Checker access) -----------
  app.get('/pc-checks', { preHandler: guards.staff }, async (request) => {
    const guildId = await ensureGuildConfigured(env);
    const parsed = pcCheckQuerySchema.parse(request.query ?? {});
    const service = new PcCheckService(db, guildId, steam, deps.now);
    return service.list(parsed);
  });

  app.get('/pc-checks/:ref', { preHandler: guards.staff }, async (request) => {
    const guildId = await ensureGuildConfigured(env);
    const auth = request.auth;
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const service = new PcCheckService(db, guildId, steam, deps.now);
    return { pcCheck: await service.detail(ref, auth?.level ?? 'PC_CHECKER') };
  });

  app.patch('/pc-checks/:ref', { preHandler: guards.staff }, async (request) => {
    const guildId = await ensureGuildConfigured(env);
    const auth = request.auth;
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const payload = z
      .object({
        status: z
          .enum(['REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
          .optional(),
        outcome: z
          .enum(['CLEAN', 'SUSPICIOUS', 'CHEATING_CONFIRMED', 'INCONCLUSIVE'])
          .nullable()
          .optional(),
        assignedTo: z.string().trim().max(20).nullable().optional(),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(request.body ?? {});
    const service = new PcCheckService(db, guildId, steam, deps.now);
    const updated = await service.update(ref, payload, auth?.user.id ?? 'system');
    return { pcCheck: updated };
  });

  app.post('/pc-checks/:ref/notes', { preHandler: guards.staff }, async (request) => {
    const guildId = await ensureGuildConfigured(env);
    const auth = request.auth;
    const { ref } = z.object({ ref: z.string().min(3).max(64) }).parse(request.params);
    const payload = pcNoteSchema.parse(request.body ?? {});
    const service = new PcCheckService(db, guildId, steam, deps.now);
    const note = await service.addNote(ref, payload, {
      discordUserId: auth?.user.id ?? 'system',
      name: auth?.sessionUser.username ?? null,
      level: (auth?.level ?? 'PC_CHECKER') as AccessLevel,
    });
    return { note };
  });

  // ---- Announcements ------------------------------------------------------
  app.get('/announcements', { preHandler: guards.history }, async (request) => {
    const parsed = announcementFiltersSchema.parse(request.query ?? {});
    const result = await announcements.listAdmin(parsed);
    const names = await announcements.resolveAuthorNames(result.items);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        authorName: item.authorName ?? (item.authorDiscordId ? names.get(item.authorDiscordId) : null) ?? null,
      })),
    };
  });

  app.post('/announcements', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const payload = announcementInputSchema.parse(request.body ?? {});
    const created = await announcements.create(payload, {
      discordUserId: auth?.user.id ?? 'system',
      name: auth?.sessionUser.username ?? null,
    });
    return { announcement: created };
  });

  app.patch('/announcements/:id', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = announcementUpdateSchema.parse(request.body ?? {});
    return {
      announcement: await announcements.update(id, payload, auth?.user.id ?? 'system'),
    };
  });

  app.post('/announcements/:id/publish', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return announcements.publish(id, auth?.user.id ?? 'system');
  });

  app.post('/announcements/:id/archive', { preHandler: guards.history }, async (request) => {
    const auth = request.auth;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { announcement: await announcements.archive(id, auth?.user.id ?? 'system') };
  });

  // ---- Settings (Owner only for writes) ----------------------------------
  app.get('/settings', { preHandler: guards.history }, async () => ({
    settings: await dashboard.settings(),
  }));

  app.patch('/settings', { preHandler: guards.owner }, async (request) => {
    const auth = request.auth;
    const payload = settingsPatchSchema.parse(request.body ?? {});
    const settings = await dashboard.updateSettings(payload, auth?.user.id ?? 'system');
    return { settings };
  });

  // ---- Privileged access management (Owner only) -------------------------
  app.get('/access', { preHandler: guards.owner }, async (request) => {
    const guildId = await ensureGuildConfigured(env);
    const includeHistory =
      z
        .object({ history: z.enum(['0', '1']).default('0') })
        .parse(request.query ?? {}).history === '1';
    return {
      items: includeHistory ? await listAccessHistory(db, guildId) : await listActiveAccess(db, guildId),
    };
  });

  app.post('/access', { preHandler: guards.owner }, async (request) => {
    const auth = request.auth;
    const guildId = await ensureGuildConfigured(env);
    const payload = accessGrantSchema.parse(request.body ?? {});
    const previous = await getActiveAccess(db, guildId, payload.userId);
    const granted = await grantAccess(
      db,
      {
        guildId,
        userId: payload.userId,
        level: payload.level,
        grantedBy: auth?.user.id ?? 'system',
        note: payload.note ?? null,
      },
      deps.now(),
    );
    await recordAuditEvent(
      db,
      {
        guildId,
        actorDiscordId: auth?.user.id ?? null,
        actorType: 'OWNER',
        action: 'access.granted',
        entityType: 'dashboard_access',
        entityId: payload.userId,
        summary: `Dashboard access ${payload.level} granted to ${payload.userId}.`,
        before: previous ? { level: previous.level } : null,
        after: { level: granted.level, note: granted.note },
      },
      deps.now(),
    );
    return { access: granted, previous };
  });

  app.delete('/access/:userId', { preHandler: guards.owner }, async (request) => {
    const auth = request.auth;
    const guildId = await ensureGuildConfigured(env);
    const { userId } = z.object({ userId: z.string().regex(/^\d{17,20}$/) }).parse(request.params);
    if ([...env.owners, ...env.coOwners, ...env.pcCheckers].includes(userId)) {
      throw badRequest(
        'This user is allowlisted through environment configuration. Remove the ID from DASHBOARD_* variables and redeploy instead.',
      );
    }
    const previous = await getActiveAccess(db, guildId, userId);
    if (!previous) throw notFound('No active dashboard access for that user.');
    const revoked = await revokeAccess(
      db,
      { guildId, userId, revokedBy: auth?.user.id ?? 'system' },
      deps.now(),
    );
    await recordAuditEvent(
      db,
      {
        guildId,
        actorDiscordId: auth?.user.id ?? null,
        actorType: 'OWNER',
        action: 'access.revoked',
        entityType: 'dashboard_access',
        entityId: userId,
        summary: `Dashboard access revoked for ${userId} (was ${previous.level}).`,
        before: { level: previous.level },
        after: { revoked },
      },
      deps.now(),
    );
    return { revoked };
  });

  app.get('/health', { preHandler: guards.history }, async () => ({
    services: await buildHealth(db, deps.now()),
    generatedAt: deps.now(),
  }));
}
