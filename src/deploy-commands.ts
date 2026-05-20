import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';

const rest = new REST().setToken(config.discordToken);

const body = [...commands.values()].map((cmd) => cmd.data.toJSON());

const route = config.guildId
  ? Routes.applicationGuildCommands(config.discordClientId, config.guildId)
  : Routes.applicationCommands(config.discordClientId);

const scope = config.guildId ? `guild ${config.guildId}` : 'global';

console.log(`Registering ${body.length} commands (${scope})…`);

rest
  .put(route, { body })
  .then(() => console.log('Commands registered successfully.'))
  .catch((err) => {
    console.error('Failed to register commands:', err);
    process.exit(1);
  });
