import type { GuildSettingsDto } from '@dardania/shared';
import type { BackendClient } from './api-client.js';

const TTL_MS = 60_000;

export class GuildConfigStore {
  private readonly cache = new Map<string, { at: number; config: GuildSettingsDto }>();

  constructor(private readonly api: BackendClient) {}

  async get(guildId: string): Promise<GuildSettingsDto | null> {
    const cached = this.cache.get(guildId);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
    try {
      const result = await this.api.getGuildConfig(guildId);
      this.cache.set(guildId, { at: Date.now(), config: result.config });
      return result.config;
    } catch {
      return cached?.config ?? null;
    }
  }

  invalidate(guildId: string): void {
    this.cache.delete(guildId);
  }
}

export function channelIdFor(config: GuildSettingsDto | null, key: string): string | null {
  return config?.channels?.[key] ?? null;
}

export function roleIdFor(config: GuildSettingsDto | null, key: string): string | null {
  return config?.roles?.[key] ?? null;
}
