import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'de_session';
export const CSRF_COOKIE = 'de_csrf';
export const OAUTH_STATE_COOKIE = 'de_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'de_oauth_verifier';

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Session ids are stored hashed so a database leak cannot replay sessions. */
export function hashSessionToken(token: string): string {
  return sha256(token);
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256(ip).slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Only same-site absolute paths are accepted as post-login redirects. */
export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/dashboard';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/dashboard';
  }
  if (trimmed.length > 200) return '/dashboard';
  return trimmed;
}
