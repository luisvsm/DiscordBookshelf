import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config';
import { commands } from './commands';
import { MODAL_ID } from './commands/connect';
import { UNLOCK_MODAL_ID } from './commands/unlock';
import { handleVoiceStateUpdate } from './playback/VoiceStateHandler';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      const msg = 'An error occurred while running that command.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    const modalHandlers: Record<string, string> = {
      [MODAL_ID]: 'connect',
      [UNLOCK_MODAL_ID]: 'unlock',
    };
    const cmdName = modalHandlers[interaction.customId];
    if (!cmdName) return;
    const cmd = commands.get(cmdName);
    if (!cmd?.handleModal) return;
    try {
      await cmd.handleModal(interaction);
    } catch (err) {
      console.error(`Error in ${cmdName} modal:`, err);
      const msg = 'An error occurred.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
});

client.login(config.discordToken).catch((err) => {
  console.error('Failed to log in:', err);
  process.exit(1);
});
