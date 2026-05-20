import { GuildTextBasedChannel, SlashCommandBuilder } from 'discord.js';
import { pausePlayback } from '../playback/PlaybackManager';
import { scheduleReplyDeletion } from '../utils';
import { Command } from './types';

const pause: Command = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the currently playing audiobook'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }
    const ok = await pausePlayback(interaction.guildId);
    if (ok) {
      await interaction.deleteReply();
      await (interaction.channel as GuildTextBasedChannel).send('Paused.');
    } else {
      await interaction.editReply('Nothing is currently playing.');
      scheduleReplyDeletion(interaction);
    }
  },
};

export default pause;
