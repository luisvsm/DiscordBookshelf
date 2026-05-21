import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config';
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
    let successMsg: string;
    if (config.passwordTtlMs === -1) {
      successMsg = 'Credentials unlocked. Your password will be remembered indefinitely.';
    } else {
      const expiryUnix = Math.floor((Date.now() + config.passwordTtlMs) / 1000);
      successMsg = `Credentials unlocked. Your password will expire <t:${expiryUnix}:R>.`;
    }
    await interaction.editReply(ok ? successMsg : 'Incorrect password.');
  },
};

export default unlock;
