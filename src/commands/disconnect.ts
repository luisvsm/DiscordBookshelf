import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { userCredentialStore } from '../users/UserCredentialStore';
import { Command } from './types';

const disconnect: Command = {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Remove your stored Audiobookshelf credentials from this bot'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = userCredentialStore.delete(interaction.user.id);
    await interaction.editReply(
      removed
        ? 'Your Audiobookshelf credentials have been removed.'
        : 'You have no credentials stored.',
    );
  },
};

export default disconnect;
