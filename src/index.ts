import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { commands } from './commands';
import { MODAL_ID } from './commands/connect';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

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
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // Modal submissions (used by /connect)
  if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
    const connectCmd = commands.get('connect');
    if (!connectCmd?.handleModal) return;
    try {
      await connectCmd.handleModal(interaction);
    } catch (err) {
      console.error('Error in connect modal:', err);
      const msg = 'An error occurred while saving your credentials.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  }
});

client.login(config.discordToken).catch((err) => {
  console.error('Failed to log in:', err);
  process.exit(1);
});
