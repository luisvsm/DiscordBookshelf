import {
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { LibraryItemInProgress } from '../abs/types';
import { guildSessionStore } from '../playback/GuildSessionStore';
import { resumePlayback } from '../playback/PlaybackManager';
import { userCredentialStore } from '../users/UserCredentialStore';
import { scheduleReplyDeletion } from '../utils';
import { beginPlayback, replyResult } from './helpers';
import { Command } from './types';

const resume: Command = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume a paused or previously played audiobook'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    // Case 1: active session in this guild — just unpause it.
    const session = guildSessionStore.get(interaction.guildId);
    if (session) {
      const ok = await resumePlayback(interaction.guildId);
      await replyResult(interaction, ok, 'Resumed.', 'Already playing — use `/pause` first.');
      return;
    }

    // Case 2: no active session — look up the user's ABS in-progress items.
    const creds = userCredentialStore.get(interaction.user.id);
    if (!creds) {
      await interaction.editReply(
        "You haven't connected an Audiobookshelf server. Use `/connect` first.",
      );
      return;
    }

    const absClient = new AbsClient(creds.absServerUrl, creds.absApiToken);

    let booksInProgress: LibraryItemInProgress[];
    try {
      booksInProgress = await absClient.getItemsInProgress();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Could not reach your Audiobookshelf server: ${msg}`);
      return;
    }

    if (booksInProgress.length === 0) {
      await interaction.editReply('No in-progress titles found. Use `/play` to start something.');
      return;
    }

    // Single result — resume it immediately.
    if (booksInProgress.length === 1) {
      try {
        await beginPlayback(absClient, booksInProgress[0], interaction);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred while starting playback.';
        await interaction.editReply(msg);
      }
      return;
    }

    // Multiple results — show a select menu.
    const select = new StringSelectMenuBuilder()
      .setCustomId('resume-item-select')
      .setPlaceholder('Choose a title')
      .addOptions(
        booksInProgress.map((item) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(item.media.metadata.title.slice(0, 100))
            .setDescription(
              `[${item.mediaType === 'podcast' ? 'Podcast' : 'Book'}] ${(item.media.metadata.authorName ?? 'Unknown').slice(0, 90)}`,
            )
            .setValue(item.id),
        ),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({ content: 'Which title would you like to resume?', components: [row] });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === 'resume-item-select' && i.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector?.on('collect', async (selectInteraction) => {
      await selectInteraction.deferUpdate();
      const selectedItem = booksInProgress.find((item) => item.id === selectInteraction.values[0]);
      if (!selectedItem) return;
      try {
        await beginPlayback(absClient, selectedItem, interaction);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred while starting playback.';
        await interaction.editReply({ content: msg, components: [] }).catch(() => {});
      }
    });

    collector?.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({ content: 'Selection timed out.', components: [] }).catch(() => {});
        scheduleReplyDeletion(interaction);
      }
    });
  },
};

export default resume;
