import { SlashCommandBuilder } from 'discord.js';
import { guildSessionStore } from '../playback/GuildSessionStore';
import { buildNowPlayingEmbed } from './helpers';
import { Command } from './types';

const nowplaying: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing audiobook'),

  async execute(interaction) {
    await interaction.deferReply();
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    const session = guildSessionStore.get(interaction.guildId);
    if (!session) {
      await interaction.editReply('Nothing is currently playing.');
      return;
    }

    await interaction.editReply({ embeds: [buildNowPlayingEmbed(session)] });
  },
};

export default nowplaying;
