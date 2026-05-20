import {
  LabelBuilder,
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
    .setDescription('Connect an Audiobookshelf account to this bot — use a low-privilege account, not your admin account'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_ID)
      .setTitle('Connect Audiobookshelf')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Server URL')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('server-url')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('https://abs.example.com')
              .setRequired(true),
          ),
        new LabelBuilder()
          .setLabel('API Key')
          .setDescription('Don\'t share admin keys. Use least privilege: https://www.audiobookshelf.org/guides/api-keys/')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('api-token')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Paste your Audiobookshelf API Key')
              .setRequired(true),
          ),
        new LabelBuilder()
          .setLabel('Encryption Password (optional)')
          .setDescription('If set, your server URL and API key will be encrypted at rest. Leave blank to store in plaintext.')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('password')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Leave blank for no encryption')
              .setRequired(false),
          ),
      );

    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const serverUrl = interaction.fields.getTextInputValue('server-url').trim();
    const apiToken = interaction.fields.getTextInputValue('api-token').trim();
    const password = interaction.fields.getTextInputValue('password').trim() || undefined;

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
    }, password);

    await interaction.editReply(
      password
        ? `Connected to **${serverUrl}** successfully. Your credentials are encrypted and saved.`
        : `Connected to **${serverUrl}** successfully. Your credentials are saved.`,
    );
  },
};

export { MODAL_ID };
export default connect;
