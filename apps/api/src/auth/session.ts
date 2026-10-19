import { addHours, nowIso, type AccessLevel, type ApiEnv, type SessionUserDto } from '@dardania/shared';
import {
  createSession,
  getActiveSession,
  revokeSession,
  touchSession,
  type Db,
} from '@dardania/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors.js';
import { resolveAccess, toSessionUser } from './access.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  hashIp,
  hashSessionToken,
  newToken,
  safeEqual,
} from './tokens.js';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieOptions(env: ApiEnv): {
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  domain?: string;
  maxAge: number;
} {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
    maxAge: env.sessionTtlHours * 3600,
  };
}

function csrfCookieOptions(env: ApiEnv): {
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  domain?: string;
  maxAge: number;
} {
  return {
    ...sessionCookieOptions(env),
    httpOnly: false,
  };
}

export function clearSessionCookies(reply: FastifyReply, env: ApiEnv): void {
  const base = { path: '/', ...(env.cookieDomain ? { domain: env.cookieDomain } : {}) };
  reply.clearCookie(SESSION_COOKIE, base);
  reply.clearCookie(CSRF_COOKIE, base);
}

export interface EstablishedSession {
  sessionUser: SessionUserDto;
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
}

export async function establishSession(
  input: {
    db: Db;
    env: ApiEnv;
    user: {
      id: string;
      username: string;
      global_name: string | null;
      avatar_hash: string | null;
    };
    accessLevel: AccessLevel;
    loginSource: SessionUserDto['source'];
    request: FastifyRequest;
    now?: string;
  },
): Promise<EstablishedSession> {
  const now = input.now ?? nowIso();
  const sessionToken = newToken();
  const csrfToken = newToken();
  const expiresAt = addHours(now, input.env.sessionTtlHours);
  const userAgent = input.request.headers['user-agent']?.slice(0, 300) ?? null;
  await createSession(
    input.db,
    {
      id: hashSessionToken(sessionToken),
      userId: input.user.id,
      csrfToken,
      expiresAt,
      ipHash: hashIp(input.request.ip),
      userAgent,
      loginSource: input.loginSource,
    },
    now,
  );
  return {
    sessionToken,
    csrfToken,
    expiresAt,
    sessionUser: toSessionUser({
      discordUserId: input.user.id,
      username: input.user.username,
      displayName: input.user.global_name,
      avatarHash: input.user.avatar_hash,
      accessLevel: input.accessLevel,
      guildId: input.env.discord.guildId,
      source: input.loginSource,
      sessionExpiresAt: expiresAt,
      csrfToken,
    }),
  };
}

export function setSessionCookies(
  reply: FastifyReply,
  env: ApiEnv,
  session: EstablishedSession,
): void {
  reply.setCookie(SESSION_COOKIE, session.sessionToken, sessionCookieOptions(env));
  reply.setCookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions(env));
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Loads the session, re-checks access on every request and enforces CSRF for
 * state-changing methods. Access is never trusted from the browser.
 */
export async function authenticateRequest(
  db: Db,
  env: ApiEnv,
  request: FastifyRequest,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const sessionId = hashSessionToken(token);
  const now = nowIso();
  const found = await getActiveSession(db, sessionId, now);
  if (!found) throw unauthorized('Your session has expired. Sign in again.');

  // Re-resolve access on every call: revoking a grant takes effect immediately.
  const access = await resolveAccess(db, env, found.user.id);
  if (!access) throw forbidden('This account is not authorised for the dashboard.');

  if (STATE_CHANGING.has(request.method)) {
    const headerToken = request.headers['x-csrf-token'];
    const provided = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    if (!provided || !safeEqual(provided, found.session.csrf_token)) {
      throw forbidden('Missing or invalid CSRF token.');
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      throw forbidden('Cross-site state-changing requests are not allowed.');
    }
  }

  if (new Date(now).getTime() - new Date(found.session.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(db, sessionId, now);
  }

  request.auth = {
    level: access.level,
    session: found.session,
    user: found.user,
    csrfToken: found.session.csrf_token,
    sessionUser: toSessionUser({
      discordUserId: found.user.id,
      username: found.user.username,
      displayName: found.user.global_name,
      avatarHash: found.user.avatar_hash,
      accessLevel: access.level,
      guildId: env.discord.guildId,
      source: found.session.login_source ?? 'oauth',
      sessionExpiresAt: found.session.expires_at,
      csrfToken: found.session.csrf_token,
    }),
  };
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await revokeSession(db, sessionId, nowIso());
}
