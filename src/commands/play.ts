import {
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { parseTimestamp, scheduleReplyDeletion } from '../utils';
import { userCredentialStore } from '../users/UserCredentialStore';
import { flattenResults } from './search';
import { beginPlayback } from './helpers';
import { Command } from './types';

const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Search your Audiobookshelf library and start playing a book or podcast')
    .addStringOption((o) =>
      o.setName('query').setDescription('Title, author, or podcast name').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('at')
        .setDescription('Start at a specific time, e.g. 1:30:00 or 5400')
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId || !interaction.channel?.isTextBased()) {
      await interaction.editReply('This command can only be used in a server text channel.');
      return;
    }

    const creds = userCredentialStore.get(interaction.user.id);
    if (!creds) {
      await interaction.editReply("You haven't connected an Audiobookshelf server. Use `/connect` first.");
      return;
    }

    const query = interaction.options.getString('query', true);
    const atRaw = interaction.options.getString('at');
    let atSeconds: number | undefined;
    if (atRaw) {
      const parsed = parseTimestamp(atRaw);
      if (parsed === null) {
        await interaction.editReply(`Invalid timestamp: \`${atRaw}\`. Use H:MM:SS, MM:SS, or seconds.`);
        return;
      }
      atSeconds = parsed;
    }

    const absClient = new AbsClient(creds.absServerUrl, creds.absApiToken);

    let results;
    try {
      results = await absClient.search(query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(`Could not reach your Audiobookshelf server: ${msg}`);
      return;
    }

    const hits = flattenResults(results);
    if (hits.length === 0) {
      await interaction.editReply(`No results found for \`${query}\`.`);
      return;
    }

    if (hits.length === 1) {
      await beginPlayback(absClient, hits[0].libraryItem, interaction, atSeconds);
      return;
    }

    // Multiple results — show a select menu.
    const select = new StringSelectMenuBuilder()
      .setCustomId('play-item-select')
      .setPlaceholder('Choose a title')
      .addOptions(
        hits.map((hit) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(hit.libraryItem.media.metadata.title.slice(0, 100))
            .setDescription(
              `[${hit.mediaType === 'podcast' ? 'Podcast' : 'Book'}] ${(hit.libraryItem.media.metadata.authorName ?? 'Unknown').slice(0, 90)}`,
            )
            .setValue(hit.libraryItem.id),
        ),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({ content: 'Select a title to play:', components: [row] });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === 'play-item-select' && i.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector?.on('collect', async (selectInteraction) => {
      await selectInteraction.deferUpdate();
      const selectedItem = hits.find((h) => h.libraryItem.id === selectInteraction.values[0])?.libraryItem;
      if (!selectedItem) return;
      try {
        await beginPlayback(absClient, selectedItem, interaction, atSeconds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred while starting playback.';
        await interaction.editReply({ content: msg, components: [] }).catch(() => {});
      }
    });

    collector?.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({ content: 'Selection timed out.', components: [] });
        scheduleReplyDeletion(interaction);
      }
    });
  },
};

export default play;
