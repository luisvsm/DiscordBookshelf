import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { PodcastEpisode } from '../abs/types';
import { parseTimestamp } from '../utils';
import { flattenResults, SearchHit } from './search';
import { beginPlayback, callAbs, requireAbsClient, showSelectMenu } from './helpers';
import { Command } from './types';
import { AbsClient } from '../abs/client';
import { ChatInputCommandInteraction } from 'discord.js';

async function playHit(
  hit: SearchHit,
  absClient: AbsClient,
  interaction: ChatInputCommandInteraction,
  atSeconds?: number,
): Promise<void> {
  if (hit.mediaType !== 'podcast') {
    await beginPlayback(absClient, hit.libraryItem, interaction, atSeconds);
    return;
  }

  const fullItem = await callAbs(interaction, () => absClient.getItem(hit.libraryItem.id));
  if (!fullItem) return;

  const episodes = (fullItem.media.episodes ?? [])
    .slice()
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, 25);

  if (episodes.length === 0) {
    await interaction.editReply({ content: 'No episodes found for this podcast.', components: [] });
    return;
  }

  await showSelectMenu<PodcastEpisode>(interaction, {
    customId: 'play-episode-select',
    prompt: `Select an episode of **${hit.libraryItem.media.metadata.title}**:`,
    items: episodes,
    toOption: (ep) => ({
      label: ep.title.slice(0, 100),
      description: ep.publishedAt
        ? new Date(ep.publishedAt).toLocaleDateString()
        : ep.duration
          ? `${Math.round(ep.duration / 60)} min`
          : 'No date',
      value: ep.id,
    }),
    onSelect: (ep) => beginPlayback(absClient, fullItem, interaction, atSeconds, ep.id),
  });
}

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

    const absClient = await requireAbsClient(interaction);
    if (!absClient) return;

    const results = await callAbs(interaction, () => absClient.search(query));
    if (!results) return;

    const hits = flattenResults(results);
    if (hits.length === 0) {
      await interaction.editReply(`No results found for \`${query}\`.`);
      return;
    }

    if (hits.length === 1) {
      await playHit(hits[0], absClient, interaction, atSeconds);
      return;
    }

    await showSelectMenu(interaction, {
      customId: 'play-item-select',
      prompt: 'Select a title to play:',
      items: hits,
      toOption: (hit) => ({
        label: hit.libraryItem.media.metadata.title.slice(0, 100),
        description: `[${hit.mediaType === 'podcast' ? 'Podcast' : 'Book'}] ${(hit.libraryItem.media.metadata.authorName ?? 'Unknown').slice(0, 90)}`,
        value: hit.libraryItem.id,
      }),
      onSelect: (hit) => playHit(hit, absClient, interaction, atSeconds),
    });
  },
};

export default play;
