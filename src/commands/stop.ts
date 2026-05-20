import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { stopPlayback } from '../playback/PlaybackManager';
import { replyResult } from './helpers';
import { Command } from './types';

const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, save progress, and disconnect from the voice channel'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }
    const ok = await stopPlayback(interaction.guildId);
    await replyResult(interaction, ok, 'Stopped and disconnected.', 'Nothing is playing.');
  },
};

export default stop;
