import type {
  AnnouncementDto,
  GuildSettingsDto,
  ModerationCaseDetail,
  ModerationCaseDto,
  Paginated,
  PcCheckDto,
  PcCheckOutcome,
  PcCheckStatus,
  PublicStatusDto,
  SteamAccountDto,
} from '@dardania/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get permanent(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500 && this.statusCode !== 429;
  }
}

export interface ModerationEventPayload {
  guildId: string;
  guildName?: string;
  actionType: string;
  target: { id: string; username?: string; globalName?: string | null };
  moderator?: { id: string; name?: string | null } | null;
  reason?: string | null;
  occurredAt: string;
  source: 'BOT_COMMAND' | 'GATEWAY_AUDIT_LOG' | 'RECONCILIATION';
  dedupeKey: string;
  auditEntryId?: string | null;
  attributionStatus: 'VERIFIED' | 'PARTIAL' | 'UNKNOWN';
  attributionEvidence?: Record<string, unknown> | null;
  steamId64?: string | null;
  steamInput?: string | null;
  channelMessageId?: string | null;
  expiresAt?: string | null;
  banStatus?: 'ACTIVE' | 'LIFTED' | 'UNKNOWN';
  metadata?: Record<string, unknown> | null;
}

export interface IngestResult {
  caseId: string;
  caseRef: string;
  actionType: string;
  duplicate: boolean;
  steamId64: string | null;
  steamNameAtEvent: string | null;
  attributionStatus: string;
  relatedCaseRef: string | null;
}

export interface DeliveryItem {
  id: string;
  topic: 'DISCORD_ANNOUNCEMENT' | 'DISCORD_LOG';
  dedupeKey: string;
  attempts: number;
  payload: Record<string, unknown>;
}

interface RequestOptions {
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Authenticated service-to-service client for the Dardania | Elite API. */
export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.baseUrl && this.serviceToken);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const retries = options.retries ?? 3;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-service-token': this.serviceToken,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
        const text = await response.text();
        const parsed: unknown = text ? JSON.parse(text) : null;
        if (!response.ok) {
          const record = parsed as { message?: string; error?: string } | null;
          throw new ApiError(
            record?.message ?? record?.error ?? `API responded with HTTP ${response.status}`,
            response.status,
            parsed,
          );
        }
        return parsed as T;
      } catch (error) {
        lastError = error;
        const permanent =
          error instanceof ApiError ? error.permanent : attempt >= retries - 1;
        if (permanent) throw error;
        await sleep(300 * Math.pow(3, attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Backend request failed');
  }

  ingest(payload: ModerationEventPayload): Promise<IngestResult> {
    return this.request('POST', '/api/internal/moderation-events', payload);
  }

  async listCases(params: Record<string, string | number | undefined>): Promise<Paginated<ModerationCaseDto>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return this.request('GET', `/api/internal/bans?${query.toString()}`);
  }

  async getCase(guildId: string, ref: string): Promise<ModerationCaseDetail> {
    const result = await this.request<{ case: ModerationCaseDetail }>(
      'GET',
      `/api/internal/cases/${encodeURIComponent(ref)}?guildId=${encodeURIComponent(guildId)}`,
    );
    return result.case;
  }

  async getWarnings(
    guildId: string,
    userId: string,
  ): Promise<{ warnings: { id: string; reason: string | null; created_at: string; moderator_discord_user_id: string | null; moderator_name_at_event: string | null }[] }> {
    return this.request(
      'GET',
      `/api/internal/warnings/${encodeURIComponent(userId)}?guildId=${encodeURIComponent(guildId)}`,
    );
  }

  async searchSteam(q: string, page = 1): Promise<Paginated<SteamAccountDto>> {
    return this.request(
      'GET',
      `/api/internal/steam?q=${encodeURIComponent(q)}&page=${page}&pageSize=10`,
    );
  }

  async getSteam(steamId64: string, refresh = false): Promise<SteamAccountDto | null> {
    const result = await this.request<{ account: SteamAccountDto }>(
      'GET',
      `/api/internal/steam/${encodeURIComponent(steamId64)}${refresh ? '?refresh=1' : ''}`,
    );
    return result.account;
  }

  async resolveSteam(input: string): Promise<{ steamId64: string | null; error: string | null }> {
    return this.request(
      'GET',
      `/api/internal/steam/resolve?input=${encodeURIComponent(input)}`,
    );
  }

  async linkSteam(payload: {
    steamId64?: string;
    steamInput?: string;
    discordUserId: string;
    guildId: string;
    actorDiscordId: string;
    verification: 'VERIFIED' | 'UNVERIFIED';
  }): Promise<SteamAccountDto | null> {
    const result = await this.request<{ account: SteamAccountDto }>(
      'POST',
      '/api/internal/steam/link',
      payload,
    );
    return result.account;
  }

  async createPcCheck(payload: Record<string, unknown>): Promise<PcCheckDto> {
    return this.request('POST', '/api/internal/pc-checks', payload);
  }

  async listPcChecks(params: Record<string, string | number | undefined>): Promise<Paginated<PcCheckDto>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return this.request('GET', `/api/internal/pc-checks?${query.toString()}`);
  }

  async getPcCheck(guildId: string, ref: string): Promise<PcCheckDto> {
    const result = await this.request<{ pcCheck: PcCheckDto }>(
      'GET',
      `/api/internal/pc-checks/${encodeURIComponent(ref)}?guildId=${encodeURIComponent(guildId)}`,
    );
    return result.pcCheck;
  }

  async updatePcCheck(
    ref: string,
    payload: {
      guildId: string;
      actorDiscordId: string;
      status?: PcCheckStatus;
      outcome?: PcCheckOutcome | null;
      assignedTo?: string | null;
      reason?: string;
    },
  ): Promise<PcCheckDto> {
    const result = await this.request<{ pcCheck: PcCheckDto }>(
      'PATCH',
      `/api/internal/pc-checks/${encodeURIComponent(ref)}`,
      payload,
    );
    return result.pcCheck;
  }

  async addPcNote(
    ref: string,
    payload: {
      guildId: string;
      actorDiscordId: string;
      actorName?: string | null;
      note: string;
    },
  ): Promise<void> {
    await this.request('POST', `/api/internal/pc-checks/${encodeURIComponent(ref)}/notes`, payload);
  }

  async getGuildConfig(guildId: string): Promise<{ config: GuildSettingsDto }> {
    return this.request('GET', `/api/internal/guild-config?guildId=${encodeURIComponent(guildId)}`);
  }

  async saveGuildConfig(payload: {
    guildId: string;
    guildName: string;
    actorDiscordId: string;
    complete: boolean;
    config: {
      roles: Record<string, string | null>;
      channels: Record<string, string | null>;
      features: Record<string, boolean>;
    };
  }): Promise<void> {
    await this.request('POST', '/api/internal/guild-config', payload);
  }

  async recordAnnouncement(payload: Record<string, unknown>): Promise<AnnouncementDto> {
    const result = await this.request<{ announcement: AnnouncementDto }>(
      'POST',
      '/api/internal/announcements/record',
      payload,
    );
    return result.announcement;
  }

  async heartbeat(status: 'operational' | 'degraded' | 'outage', detail: Record<string, unknown>): Promise<void> {
    await this.request('POST', '/api/internal/heartbeat', { service: 'bot', status, detail }, { retries: 1 });
  }

  async listDeliveries(limit = 10): Promise<DeliveryItem[]> {
    const result = await this.request<{ deliveries: DeliveryItem[] }>(
      'GET',
      `/api/internal/discord-deliveries?limit=${limit}`,
    );
    return result.deliveries;
  }

  async reportDelivery(
    id: string,
    result: {
      ok: boolean;
      error?: string | null;
      announcementId?: string | null;
      discordMessageId?: string | null;
      discordChannelId?: string | null;
    },
  ): Promise<void> {
    await this.request('POST', `/api/internal/discord-deliveries/${encodeURIComponent(id)}/result`, result);
  }

  async unattributedCases(guildId: string, minutes = 90): Promise<ModerationCaseDto[]> {
    const result = await this.request<{ items: ModerationCaseDto[] }>(
      'GET',
      `/api/internal/cases/unattributed?guildId=${encodeURIComponent(guildId)}&minutes=${minutes}`,
    );
    return result.items;
  }

  async updateAttribution(
    caseId: string,
    payload: {
      moderatorDiscordUserId: string | null;
      moderatorName: string | null;
      attributionStatus: 'VERIFIED' | 'PARTIAL' | 'UNKNOWN';
      auditEntryId: string | null;
      evidence: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.request('POST', `/api/internal/cases/${encodeURIComponent(caseId)}/attribution`, payload);
  }

  async status(): Promise<PublicStatusDto> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new ApiError('API unhealthy', response.status, null);
    return this.request('GET', '/api/status', undefined, { retries: 1 });
  }
}
