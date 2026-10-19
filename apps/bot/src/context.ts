import type { BotEnv } from '@dardania/shared';
import type { BackendClient } from './api-client.js';
import type { GuildConfigStore } from './config-store.js';
import type { LocalIngestOutbox } from './local-outbox.js';
import type { Logger } from './logger.js';

export interface BotContext {
  env: BotEnv;
  api: BackendClient;
  outbox: LocalIngestOutbox;
  configs: GuildConfigStore;
  logger: Logger;
}
