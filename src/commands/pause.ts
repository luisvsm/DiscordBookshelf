import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pausePlayback } from '../playback/PlaybackManager';
import { replyResult } from './helpers';
import { Command } from './types';

const pause: Command = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the currently playing audiobook'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }
    const ok = await pausePlayback(interaction.guildId);
    await replyResult(interaction, ok, 'Paused.', 'Nothing is currently playing.');
  },
};

export default pause;
