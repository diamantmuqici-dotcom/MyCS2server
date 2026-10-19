/**
 * Steam identity helpers. The SteamID64 is the only stable identifier — a
 * display name is never used to identify an account.
 */
export const STEAM_ID64_BASE = 76561197960265728n;
/** base + 0xFFFFFFFF (max 32-bit account id) */
export const STEAM_ID64_MAX = 76561202255233023n;

const STEAM_ID64_PATTERN = /^\d{17}$/;

export function isValidSteamId64(value: string): boolean {
  if (!STEAM_ID64_PATTERN.test(value)) return false;
  const numeric = BigInt(value);
  return numeric >= STEAM_ID64_BASE && numeric <= STEAM_ID64_MAX;
}

export function normalizeSteamId64(value: string): string | null {
  const trimmed = value.trim();
  return isValidSteamId64(trimmed) ? trimmed : null;
}

export function steamProfileUrl(steamId64: string): string {
  return `https://steamcommunity.com/profiles/${steamId64}`;
}

export function steamVanityUrl(vanity: string): string {
  return `https://steamcommunity.com/id/${encodeURIComponent(vanity)}`;
}

export type SteamIdentifier =
  | { kind: 'steamid64'; steamId64: string }
  | { kind: 'vanity'; vanity: string }
  | { kind: 'invalid'; input: string };

/**
 * Accepts a bare SteamID64, a /profiles/<id64> URL, or a /id/<vanity> URL.
 * Vanity names require the Steam Web API to resolve and are never treated as
 * verified identities on their own.
 */
export function parseSteamInput(input: string): SteamIdentifier {
  const raw = input.trim();
  if (!raw) return { kind: 'invalid', input: raw };

  const direct = normalizeSteamId64(raw);
  if (direct) return { kind: 'steamid64', steamId64: direct };

  let url: URL | null = null;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return { kind: 'invalid', input: raw };
  }
  if (url.hostname !== 'steamcommunity.com' && url.hostname !== 'www.steamcommunity.com') {
    return { kind: 'invalid', input: raw };
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'profiles' && segments[1]) {
    const id = normalizeSteamId64(segments[1]);
    return id ? { kind: 'steamid64', steamId64: id } : { kind: 'invalid', input: raw };
  }
  if (segments[0] === 'id' && segments[1]) {
    return { kind: 'vanity', vanity: decodeURIComponent(segments[1]) };
  }
  return { kind: 'invalid', input: raw };
}

export function isSteamCommunityUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      (url.hostname === 'steamcommunity.com' || url.hostname === 'www.steamcommunity.com')
    );
  } catch {
    return false;
  }
}
