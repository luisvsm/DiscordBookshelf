import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { userCredentialStore } from '../users/UserCredentialStore';
import { Command } from './types';

const MODAL_ID = 'abs-connect-modal';

const connect: Command = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Connect your Audiobookshelf account to this bot'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_ID)
      .setTitle('Connect Audiobookshelf')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('server-url')
            .setLabel('Server URL')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://abs.example.com')
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('api-token')
            .setLabel('API Token')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Paste your Audiobookshelf API token')
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const serverUrl = interaction.fields.getTextInputValue('server-url').trim();
    const apiToken = interaction.fields.getTextInputValue('api-token').trim();

    const client = new AbsClient(serverUrl, apiToken);
    try {
      await client.getLibraries();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Could not connect to Audiobookshelf: ${msg}`);
      return;
    }

    userCredentialStore.set({
      discordUserId: interaction.user.id,
      absServerUrl: serverUrl,
      absApiToken: apiToken,
    });

    await interaction.editReply(
      `Connected to **${serverUrl}** successfully. Your credentials are saved.`,
    );
  },
};

export { MODAL_ID };
export default connect;
