import { GuildTextBasedChannel, SlashCommandBuilder } from 'discord.js';
import { stopPlayback } from '../playback/PlaybackManager';
import { scheduleReplyDeletion } from '../utils';
import { Command } from './types';

const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, save progress, and disconnect from the voice channel'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }
    const ok = await stopPlayback(interaction.guildId);
    if (ok) {
      await interaction.deleteReply();
      await (interaction.channel as GuildTextBasedChannel).send('Stopped and disconnected.');
    } else {
      await interaction.editReply('Nothing is playing.');
      scheduleReplyDeletion(interaction);
    }
  },
};

export default stop;
