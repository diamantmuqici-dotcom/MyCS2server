import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadBotEnv } from '@dardania/shared/env';
import { commandJson } from './commands.js';

/** One-shot command registration, useful after changing command definitions. */
async function main(): Promise<void> {
  const env = loadBotEnv();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(env.token);
  await new Promise<void>((resolve, reject) => {
    client.once(Events.ClientReady, () => resolve());
    client.once(Events.Error, reject);
  });
  const commands = commandJson();
  if (env.guildId) {
    const guild = await client.guilds.fetch(env.guildId);
    await guild.commands.set(commands);
    console.log(`Registered ${commands.length} commands in guild ${guild.id}`);
  } else {
    await client.application?.commands.set(commands);
    console.log(`Registered ${commands.length} global commands`);
  }
  client.destroy();
}

main().catch((error: unknown) => {
  console.error('[fatal] Command registration failed:', error);
  process.exit(1);
});
