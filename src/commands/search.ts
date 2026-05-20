import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { AbsClient } from '../abs/client';
import { LibraryItem } from '../abs/types';
import { userCredentialStore } from '../users/UserCredentialStore';
import { Command } from './types';

export type MediaType = 'book' | 'podcast';
export interface SearchHit { libraryItem: LibraryItem; mediaType: MediaType }

/** Merge book and podcast results from a search response, up to maxTotal items. */
export function flattenResults(
  results: Awaited<ReturnType<AbsClient['search']>>,
  maxTotal = 5,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const b of results.book ?? []) {
    if (hits.length >= maxTotal) break;
    hits.push({ libraryItem: b.libraryItem, mediaType: 'book' });
  }
  for (const p of results.podcast ?? []) {
    if (hits.length >= maxTotal) break;
    hits.push({ libraryItem: p.libraryItem, mediaType: 'podcast' });
  }
  return hits;
}

const search: Command = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search your Audiobookshelf library without starting playback')
    .addStringOption((o) =>
      o.setName('query').setDescription('Title, author, or podcast name').setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const creds = userCredentialStore.get(interaction.user.id);
    if (!creds) {
      await interaction.editReply(
        "You haven't connected an Audiobookshelf server. Use `/connect` first.",
      );
      return;
    }

    const query = interaction.options.getString('query', true);
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

    const embed = new EmbedBuilder()
      .setTitle(`Search results for "${query}"`)
      .setColor(0x4f86c6)
      .setDescription(
        hits
          .map((hit, i) => {
            const meta = hit.libraryItem.media.metadata;
            const typeTag = hit.mediaType === 'podcast' ? '[Podcast]' : '[Book]';
            const creator = meta.authorName ? ` — ${meta.authorName}` : '';
            const duration = hit.libraryItem.media.duration
              ? ` (${Math.round(hit.libraryItem.media.duration / 3600)}h)`
              : '';
            return `**${i + 1}.** ${typeTag} ${meta.title}${creator}${duration}`;
          })
          .join('\n'),
      );

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};

export default search;
