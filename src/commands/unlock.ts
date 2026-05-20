import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { userCredentialStore } from '../users/UserCredentialStore';
import { Command } from './types';

export const UNLOCK_MODAL_ID = 'abs-unlock-modal';

const unlock: Command = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Enter your password to decrypt your stored Audiobookshelf credentials'),

  async execute(interaction) {
    const userId = interaction.user.id;

    if (!userCredentialStore.isEncrypted(userId)) {
      await interaction.reply({
        content: userCredentialStore.get(userId) === undefined
          ? "You haven't connected yet. Use `/connect` first."
          : 'Your credentials are not encrypted — no password needed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(UNLOCK_MODAL_ID)
      .setTitle('Unlock Credentials')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Password')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('password')
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
      );

    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const password = interaction.fields.getTextInputValue('password');
    const ok = userCredentialStore.unlockWithPassword(interaction.user.id, password);
    await interaction.editReply(
      ok
        ? 'Credentials unlocked. Your password will be remembered until the bot restarts.'
        : 'Incorrect password.',
    );
  },
};

export default unlock;
