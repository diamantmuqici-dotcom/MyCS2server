import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadBotEnv } from '@dardania/shared/env';
import { BackendClient } from './api-client.js';
import { GuildConfigStore } from './config-store.js';
import { LocalIngestOutbox } from './local-outbox.js';
import { createLogger } from './logger.js';
import type { BotContext } from './context.js';
import { commandJson } from './commands.js';
import { handleChatInput } from './handlers/index.js';
import { registerGatewayHandlers, startRuntimeJobs } from './runtime.js';
import { botInviteUrl } from './setup.js';

async function main(): Promise<void> {
  const env = loadBotEnv();
  const logger = createLogger(env.logLevel);
  const api = new BackendClient(env.apiBaseUrl, env.serviceToken);
  const outbox = new LocalIngestOutbox(
    process.env.BOT_OUTBOX_PATH ?? './data/bot-outbox.jsonl',
    api,
    (message, error) => logger.warn(message, error),
  );
  const configs = new GuildConfigStore(api);
  const ctx: BotContext = { env, api, outbox, configs, logger };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
    ],
  });

  client.once(Events.ClientReady, (ready) => {
    void (async () => {
      logger.info(`Signed in as ${ready.user.tag} (${ready.user.id})`);
      logger.info(`Invite URL: ${botInviteUrl(ready.user.id)}`);
      registerGatewayHandlers(client, ctx);
      startRuntimeJobs(client, ctx);
      try {
        if (env.guildId) {
          const guild = await ready.guilds.fetch(env.guildId);
          await guild.commands.set(commandJson());
          logger.info(`Registered guild commands in ${guild.name} (${guild.id})`);
        } else {
          await ready.application.commands.set(commandJson());
          logger.info('Registered global commands (may take up to one hour to appear).');
        }
      } catch (error) {
        logger.error('Slash command registration failed', error);
        logger.warn(
          'The bot will keep running. Fix permissions and run "npm run register-commands -w @dardania/bot".',
        );
      }
    })();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleChatInput(interaction, ctx);
  });

  client.on(Events.Error, (error) => logger.error('Discord client error', error));
  client.on(Events.Warn, (message) => logger.warn(message));

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, flushing outbox and shutting down.`);
    try {
      await outbox.flush();
    } catch (error) {
      logger.warn('Outbox flush during shutdown failed', error);
    }
    client.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await client.login(env.token);
}

main().catch((error: unknown) => {
  console.error('[fatal] Bot failed to start:', error);
  process.exit(1);
});
