import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { config } from './config';

export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.guildId)
    : Routes.applicationCommands(config.discordClientId);
  const scope = config.guildId ? `guild ${config.guildId}` : 'global';
  console.log(`Registering ${body.length} commands (${scope})…`);
  await rest.put(route, { body });
  console.log('Commands registered successfully.');
}
