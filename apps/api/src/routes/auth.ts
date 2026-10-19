import { z } from 'zod';
import { nowIso, type ApiEnv, type SessionUserDto } from '@dardania/shared';
import { recordAuditEvent, upsertUser } from '@dardania/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, forbidden, serviceUnavailable } from '../errors.js';
import type { AppDeps } from '../deps.js';
import { resolveAccess } from '../auth/access.js';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  hashIp,
  hashSessionToken,
  newToken,
  safeEqual,
  sanitizeRedirect,
} from '../auth/tokens.js';
import {
  clearSessionCookies,
  destroySession,
  establishSession,
  setSessionCookies,
} from '../auth/session.js';
import { createPkcePair, DiscordOAuthError } from '../auth/discord.js';
import { devLoginSchema } from '../schemas.js';
import type { Guards } from '../guards.js';

const REDIRECT_COOKIE = 'de_oauth_redirect';

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function oauthCookieOptions(env: ApiEnv) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.cookieSecure,
    maxAge: 600,
  };
}

function redirectWithError(reply: FastifyReply, code: string): FastifyReply {
  return reply.code(302).redirect(`/dashboard?error=${encodeURIComponent(code)}`);
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  guards: Guards,
): Promise<void> {
  const { env, db, oauth } = deps;

  app.get('/config', async () => ({
    discordOAuthEnabled: oauth.configured,
    devLoginEnabled: env.allowDevLogin && !env.isProduction,
    accessLevels: ['OWNER', 'CO_OWNER'],
  }));

  app.get(
    '/discord/login',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!oauth.configured) {
        throw serviceUnavailable(
          'Discord OAuth2 is not configured. Set DISCORD_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET and DISCORD_OAUTH_REDIRECT_URI.',
        );
      }
      const query = z
        .object({ redirect: z.string().max(200).optional() })
        .parse(request.query ?? {});
      const state = newToken(24);
      const { verifier, challenge } = createPkcePair();
      const redirect = sanitizeRedirect(query.redirect);
      reply.setCookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions(env));
      reply.setCookie(OAUTH_VERIFIER_COOKIE, verifier, oauthCookieOptions(env));
      reply.setCookie(REDIRECT_COOKIE, encodeURIComponent(redirect), oauthCookieOptions(env));
      return reply.redirect(oauth.buildAuthorizeUrl({ state, codeChallenge: challenge }));
    },
  );

  app.get(
    '/discord/callback',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!oauth.configured) throw serviceUnavailable('Discord OAuth2 is not configured.');
      const query = callbackQuerySchema.parse(request.query ?? {});
      if (query.error) {
        return redirectWithError(reply, query.error);
      }
      if (!query.code || !query.state) throw badRequest('Missing OAuth code or state.');

      const expectedState = request.cookies[OAUTH_STATE_COOKIE];
      const verifier = request.cookies[OAUTH_VERIFIER_COOKIE];
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
      reply.clearCookie(OAUTH_VERIFIER_COOKIE, { path: '/' });
      reply.clearCookie(REDIRECT_COOKIE, { path: '/' });

      if (!expectedState || !verifier) {
        throw badRequest('The OAuth state cookie is missing or expired. Start the login again.');
      }
      if (!safeEqual(query.state, expectedState)) {
        throw badRequest('OAuth state validation failed. Start the login again.');
      }
      const rawRedirect = request.cookies[REDIRECT_COOKIE];
      const redirect = sanitizeRedirect(
        rawRedirect ? safeDecodeURIComponent(rawRedirect) : '/dashboard',
      );

      let identity;
      try {
        const accessToken = await oauth.exchangeCode(query.code, verifier);
        identity = await oauth.fetchIdentity(accessToken);
      } catch (error) {
        if (error instanceof DiscordOAuthError) {
          await recordAuditEvent(
            db,
            {
              actorType: 'SYSTEM',
              action: 'auth.oauth_error',
              summary: error.message,
              ipHash: hashIp(request.ip),
              userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
            },
            nowIso(),
          );
          return reply.code(error.statusCode).send({
            error: 'oauth_failed',
            message: error.message,
          });
        }
        throw error;
      }

      const user = await upsertUser(
        db,
        {
          id: identity.id,
          username: identity.username,
          globalName: identity.globalName,
          avatarHash: identity.avatarHash,
          isBot: identity.bot,
        },
        nowIso(),
      );
      const access = await resolveAccess(db, env, identity.id);
      if (!access) {
        await recordAuditEvent(
          db,
          {
            guildId: env.discord.guildId || null,
            actorDiscordId: identity.id,
            actorType: 'USER',
            action: 'auth.login_denied',
            entityType: 'user',
            entityId: identity.id,
            summary: `Dashboard login denied for ${identity.username} (${identity.id}) — no access grant.`,
            ipHash: hashIp(request.ip),
            userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
          },
          nowIso(),
        );
        return redirectWithError(reply, 'no_access');
      }

      const session = await establishSession({
        db,
        env,
        user,
        accessLevel: access.level,
        loginSource: 'oauth',
        request,
      });
      setSessionCookies(reply, env, session);
      await recordAuditEvent(
        db,
        {
          guildId: env.discord.guildId || null,
          actorDiscordId: identity.id,
          actorType: 'USER',
          action: 'auth.login',
          entityType: 'session',
          entityId: hashSessionToken(session.sessionToken).slice(0, 16),
          summary: `${identity.username} signed in to the dashboard with ${access.level} access.`,
          after: { level: access.level, accessSource: access.source },
          ipHash: hashIp(request.ip),
          userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
        },
        nowIso(),
      );
      return reply.redirect(redirect);
    },
  );

  app.post(
    '/dev-login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.allowDevLogin || env.isProduction) {
        throw forbidden('Development login is disabled.');
      }
      const parsed = devLoginSchema.parse(request.body ?? {});
      const candidate =
        parsed.discordUserId ?? env.owners[0] ?? env.coOwners[0] ?? env.pcCheckers[0] ?? null;
      if (!candidate) {
        throw badRequest(
          'No allowlisted Discord ID is configured. Set DASHBOARD_OWNER_DISCORD_IDS in .env.',
        );
      }
      const access = await resolveAccess(db, env, candidate);
      if (!access) throw forbidden('That Discord ID is not on the dashboard allowlist.');
      const user = await upsertUser(
        db,
        {
          id: candidate,
          username: `dev-${candidate.slice(-4)}`,
          globalName: 'Local development account',
        },
        nowIso(),
      );
      const session = await establishSession({
        db,
        env,
        user,
        accessLevel: access.level,
        loginSource: 'dev',
        request,
      });
      setSessionCookies(reply, env, session);
      await recordAuditEvent(
        db,
        {
          guildId: env.discord.guildId || null,
          actorDiscordId: candidate,
          actorType: 'SYSTEM',
          action: 'auth.dev_login',
          summary: `Development login used for ${candidate} (${access.level}).`,
          ipHash: hashIp(request.ip),
        },
        nowIso(),
      );
      return reply.send({ sessionUser: session.sessionUser });
    },
  );

  app.get(
    '/me',
    { preHandler: guards.authenticate },
    async (request: FastifyRequest) => {
      const auth = request.auth;
      if (!auth) throw forbidden();
      const sessionUser: SessionUserDto = auth.sessionUser;
      return { sessionUser };
    },
  );

  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies['de_session'];
    if (token) {
      const sessionId = hashSessionToken(token);
      await destroySession(db, sessionId);
      const auth = request.auth;
      await recordAuditEvent(
        db,
        {
          guildId: env.discord.guildId || null,
          actorDiscordId: auth?.user.id ?? null,
          actorType: auth ? 'USER' : 'SYSTEM',
          action: 'auth.logout',
          summary: 'Dashboard session ended.',
          ipHash: hashIp(request.ip),
        },
        nowIso(),
      );
    }
    clearSessionCookies(reply, env);
    return reply.code(204).send();
  });

  // Exposed for the dashboard shell so it can show session expiry warnings.
  app.get('/session-policy', async () => ({
    ttlHours: env.sessionTtlHours,
    cookieSecure: env.cookieSecure,
  }));
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '/dashboard';
  }
}
