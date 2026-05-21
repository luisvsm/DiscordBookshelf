import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getGitVersion } from '../version';
import { Command } from './types';

const versionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show the current bot version'),

  async execute(interaction) {
    const version = getGitVersion() ?? 'unknown (untagged build)';
    await interaction.reply({ content: `DiscordBookshelf \`${version}\``, flags: MessageFlags.Ephemeral });
  },
};

export default versionCommand;
