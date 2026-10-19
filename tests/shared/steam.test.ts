import { describe, expect, it } from 'vitest';
import {
  STEAM_ID64_BASE,
  STEAM_ID64_MAX,
  formatUtc,
  isSteamCommunityUrl,
  isValidSteamId64,
  normalizeSteamId64,
  parseSteamInput,
  steamProfileUrl,
  steamVanityUrl,
} from '@dardania/shared';

describe('Steam identity helpers', () => {
  it('accepts SteamID64 values inside the individual account range', () => {
    expect(isValidSteamId64(STEAM_ID64_BASE.toString())).toBe(true);
    expect(isValidSteamId64(STEAM_ID64_MAX.toString())).toBe(true);
    expect(isValidSteamId64('76561197960265729')).toBe(true);
  });

  it('rejects out-of-range and malformed identifiers', () => {
    expect(isValidSteamId64('76561197960265727')).toBe(false);
    expect(isValidSteamId64('76561202255233024')).toBe(false);
    expect(isValidSteamId64('not-a-steamid')).toBe(false);
    expect(isValidSteamId64('7656119796026572')).toBe(false);
    expect(normalizeSteamId64('  76561197960265729  ')).toBe('76561197960265729');
    expect(normalizeSteamId64('7656119796026572')).toBeNull();
  });

  it('parses bare IDs, profile URLs and vanity URLs without inventing identities', () => {
    expect(parseSteamInput('76561197960265729')).toEqual({
      kind: 'steamid64',
      steamId64: '76561197960265729',
    });
    expect(parseSteamInput('https://steamcommunity.com/profiles/76561197960265729/')).toEqual({
      kind: 'steamid64',
      steamId64: '76561197960265729',
    });
    expect(parseSteamInput('steamcommunity.com/id/SomePlayer')).toEqual({
      kind: 'vanity',
      vanity: 'SomePlayer',
    });
    expect(parseSteamInput('https://example.com/profiles/76561197960265729').kind).toBe('invalid');
    expect(parseSteamInput('').kind).toBe('invalid');
  });

  it('builds canonical profile URLs and validates community links', () => {
    expect(steamProfileUrl('76561197960265729')).toBe(
      'https://steamcommunity.com/profiles/76561197960265729',
    );
    expect(steamVanityUrl('a b')).toBe('https://steamcommunity.com/id/a%20b');
    expect(isSteamCommunityUrl('https://steamcommunity.com/profiles/76561197960265729')).toBe(true);
    expect(isSteamCommunityUrl('https://notsteam.example/profiles/1')).toBe(false);
    expect(isSteamCommunityUrl('not a url')).toBe(false);
  });

  it('formats UTC timestamps without pretending to know a local timezone', () => {
    expect(formatUtc('2026-10-19T06:00:00.000Z')).toBe('2026-10-19 06:00:00 UTC');
    expect(formatUtc(null)).toBe('—');
  });
});
