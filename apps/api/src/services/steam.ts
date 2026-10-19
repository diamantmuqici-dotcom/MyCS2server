import { z } from 'zod';
import {
  isSteamCommunityUrl,
  isValidSteamId64,
  nowIso,
  parseSteamInput,
  steamProfileUrl,
  type SteamAccountDto,
  type SteamCurrent,
} from '@dardania/shared';
import {
  ensureSteamAccount,
  getSteamAccountDetail,
  getSteamAccountRow,
  getSteamNameAt,
  markSteamRefreshFailure,
  observeSteamProfile,
  type Db,
} from '@dardania/db';

const playerSchema = z.object({
  steamid: z.string(),
  personaname: z.string(),
  avatarfull: z.string().optional(),
  profileurl: z.string().optional(),
  communityvisibilitystate: z.number().optional(),
});

const summaryResponseSchema = z.object({
  response: z.object({
    players: z.array(playerSchema),
  }),
});

const vanityResponseSchema = z.object({
  response: z.object({
    success: z.number(),
    steamid: z.string().optional(),
    message: z.string().optional(),
  }),
});

export class SteamApiError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

interface PlayerSummary {
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  profileStatus: 'PUBLIC' | 'PRIVATE' | 'UNKNOWN';
}

export interface SteamRefreshResult {
  status: 'OK' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'NOT_FOUND';
  account: SteamAccountDto | null;
  error: string | null;
  checkedAt: string;
}

export interface SteamSnapshot {
  steamId64: string;
  nameAtEvent: string | null;
  profileUrl: string;
  nameSource: string | null;
  currentName: string | null;
}

function profileStatusFromVisibility(
  visibility: number | undefined,
): PlayerSummary['profileStatus'] {
  if (visibility === 3) return 'PUBLIC';
  if (visibility === 1) return 'PRIVATE';
  return 'UNKNOWN';
}

export class SteamService {
  private readonly cache = new Map<string, { at: number; summary: PlayerSummary }>();

  constructor(
    private readonly db: Db,
    private readonly options: { apiKey: string; cacheTtlSeconds: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.options.apiKey.length > 0;
  }

  private get apiKey(): string {
    return this.options.apiKey;
  }

  private async fetchSummary(
    steamId64: string,
    options: { force?: boolean } = {},
  ): Promise<PlayerSummary> {
    const cached = this.cache.get(steamId64);
    if (!options.force && cached && Date.now() - cached.at < this.options.cacheTtlSeconds * 1000) {
      return cached.summary;
    }
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('steamids', steamId64);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new SteamApiError('Steam Web API is unreachable (network timeout).');
    }
    if (response.status === 403 || response.status === 401) {
      throw new SteamApiError('Steam Web API rejected the configured API key.', false);
    }
    if (response.status === 429) {
      throw new SteamApiError('Steam Web API rate limit reached. Try again later.');
    }
    if (!response.ok) {
      throw new SteamApiError(`Steam Web API responded with HTTP ${response.status}.`);
    }
    const parsed = summaryResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new SteamApiError('Unexpected response from the Steam Web API.', false);
    }
    const player = parsed.data.response.players[0];
    if (!player || player.steamid !== steamId64) {
      throw new SteamApiError('Steam profile is unavailable or private.', false);
    }
    const summary: PlayerSummary = {
      steamId64: player.steamid,
      displayName: player.personaname,
      avatarUrl: player.avatarfull ?? null,
      profileUrl: player.profileurl ?? steamProfileUrl(player.steamid),
      profileStatus: profileStatusFromVisibility(player.communityvisibilitystate),
    };
    this.cache.set(steamId64, { at: Date.now(), summary });
    return summary;
  }

  async resolveVanity(vanity: string): Promise<string | null> {
    if (!this.enabled) return null;
    const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('vanityurl', vanity);
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      const parsed = vanityResponseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.response.success !== 1) return null;
      const steamId64 = parsed.data.response.steamid;
      return steamId64 && isValidSteamId64(steamId64) ? steamId64 : null;
    } catch {
      return null;
    }
  }

  /** Resolves a SteamID64 from a bare id or a steamcommunity profile URL. */
  async resolveInput(
    input: string,
  ): Promise<{ steamId64: string | null; error: string | null; requiresVanityLookup: boolean }> {
    const parsed = parseSteamInput(input);
    if (parsed.kind === 'steamid64')
      return { steamId64: parsed.steamId64, error: null, requiresVanityLookup: false };
    if (parsed.kind === 'vanity') {
      const resolved = await this.resolveVanity(parsed.vanity);
      return {
        steamId64: resolved,
        error: resolved
          ? null
          : 'Vanity Steam URLs can only be resolved with a configured Steam Web API key. Use the numeric SteamID64 instead.',
        requiresVanityLookup: true,
      };
    }
    return {
      steamId64: null,
      error: 'Enter a SteamID64 (17 digits) or a steamcommunity.com/profiles/<SteamID64> URL.',
      requiresVanityLookup: false,
    };
  }

  /**
   * Refreshes current public profile data. Failures never erase existing
   * history and never touch historical case snapshots.
   */
  async refresh(steamId64: string, options: { force?: boolean } = {}): Promise<SteamRefreshResult> {
    const checkedAt = nowIso();
    await ensureSteamAccount(this.db, { steamId64, now: checkedAt });
    if (!isValidSteamId64(steamId64)) {
      return {
        status: 'NOT_FOUND',
        account: await getSteamAccountDetail(this.db, steamId64),
        error: 'Invalid SteamID64.',
        checkedAt,
      };
    }
    if (!this.enabled) {
      return {
        status: 'NOT_CONFIGURED',
        account: await getSteamAccountDetail(this.db, steamId64),
        error:
          'STEAM_API_KEY is not configured on the backend; current profile data cannot be refreshed.',
        checkedAt,
      };
    }
    try {
      const summary = await this.fetchSummary(steamId64, options);
      await observeSteamProfile(this.db, {
        steamId64,
        displayName: summary.displayName,
        avatarUrl: summary.avatarUrl,
        profileStatus: summary.profileStatus,
        source: 'STEAM_WEB_API',
        checkedAt,
      });
      return {
        status: 'OK',
        account: await getSteamAccountDetail(this.db, steamId64),
        error: null,
        checkedAt,
      };
    } catch (error) {
      const message = error instanceof SteamApiError ? error.message : 'Steam refresh failed.';
      await markSteamRefreshFailure(this.db, { steamId64, error: message, now: checkedAt });
      return {
        status: 'UNAVAILABLE',
        account: await getSteamAccountDetail(this.db, steamId64),
        error: message,
        checkedAt,
      };
    }
  }

  /**
   * Builds the immutable Steam fields stored on a moderation case.
   *
   * The name is only filled when this system observed the account at (or close
   * to) the moment of the action. Old backfilled actions get `null` instead of
   * a fabricated current name.
   */
  async snapshotForEvent(steamId64: string, occurredAt: string): Promise<SteamSnapshot> {
    const now = nowIso();
    await ensureSteamAccount(this.db, { steamId64, now });
    let account = await getSteamAccountRow(this.db, steamId64);
    if (!account?.current_display_name && this.enabled) {
      await this.refresh(steamId64);
      account = await getSteamAccountRow(this.db, steamId64);
    }
    let nameAtEvent = await getSteamNameAt(this.db, steamId64, occurredAt);
    let nameSource = nameAtEvent ? 'OBSERVED_AT_EVENT' : null;
    const drift = Math.abs(Date.now() - new Date(occurredAt).getTime());
    if (!nameAtEvent && drift <= 15 * 60 * 1000 && account?.current_display_name) {
      nameAtEvent = account.current_display_name;
      nameSource = 'OBSERVED_AT_RECORD_TIME';
    }
    return {
      steamId64,
      nameAtEvent,
      profileUrl: steamProfileUrl(steamId64),
      nameSource,
      currentName: account?.current_display_name ?? null,
    };
  }

  toCurrent(
    steamId64: string | null,
    account: {
      current_display_name: string | null;
      last_checked_at: string | null;
      profile_status: string;
    } | null,
  ): SteamCurrent | null {
    if (!steamId64) return null;
    return {
      steamId64,
      displayName: account?.current_display_name ?? null,
      profileUrl: steamProfileUrl(steamId64),
      profileStatus: (account?.profile_status as SteamCurrent['profileStatus']) ?? 'UNKNOWN',
      lastCheckedAt: account?.last_checked_at ?? null,
    };
  }

  /** Accepts a stored/entered Steam profile URL and returns the id when trusted. */
  extractSteamIdFromUrl(value: string): string | null {
    if (!isSteamCommunityUrl(value)) return null;
    const parsed = parseSteamInput(value);
    return parsed.kind === 'steamid64' ? parsed.steamId64 : null;
  }
}
