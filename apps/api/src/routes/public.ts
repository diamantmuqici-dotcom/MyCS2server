import { z } from 'zod';
import {
  ANNOUNCEMENT_CATEGORIES,
  BRAND,
  RULES_VERSION,
  type PublicConfigDto,
  type PublicServerStateDto,
  type PublicStatusDto,
} from '@dardania/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../deps.js';
import { AnnouncementService } from '../services/announcements.js';
import { buildPublicStatus, APP_VERSION } from '../services/health.js';
import { checkServer } from '../services/a2s.js';

const announcementQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export async function registerPublicRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { env, db } = deps;
  const announcements = new AnnouncementService(db, env.discord.guildId, deps.now);

  app.get('/health', async (_request, reply) => {
    try {
      await db.get('SELECT 1 AS ok');
      return { status: 'ok', version: APP_VERSION, time: deps.now() };
    } catch {
      return reply
        .code(503)
        .send({ status: 'unavailable', version: APP_VERSION, time: deps.now() });
    }
  });

  app.get('/config', async (): Promise<PublicConfigDto> => {
    const preview = await announcements.listPublic({ pageSize: 3 });
    return {
      brandName: BRAND.name,
      discordInviteUrl: env.publicConfig.discordInviteUrl || null,
      supportUrl: env.publicConfig.supportUrl || null,
      contactEmail: env.publicConfig.contactEmail || null,
      steamGroupUrl: env.publicConfig.steamGroupUrl || null,
      servers: env.publicConfig.servers,
      team: env.publicConfig.team,
      announcements: preview.items,
      rulesVersion: RULES_VERSION,
    };
  });

  app.get('/announcements', async (request) => {
    const parsed = announcementQuerySchema.parse(request.query ?? {});
    return announcements.listPublic(parsed);
  });

  app.get('/announcements/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string().min(1).max(120) }).parse(request.params);
    return { announcement: await announcements.publicBySlug(slug) };
  });

  app.get('/status', async (): Promise<PublicStatusDto> => buildPublicStatus(db, deps.now()));

  app.get('/servers', async (): Promise<{ servers: PublicServerStateDto[]; checkedAt: string }> => {
    const targets = env.publicConfig.servers;
    const servers = await Promise.all(
      targets.map((target) => checkServer(target, { now: deps.now })),
    );
    return { servers, checkedAt: deps.now() };
  });
}
