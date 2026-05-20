import {
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  GuildTextBasedChannel,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { LibraryItem } from '../abs/types';
import { startPlayback } from '../playback/PlaybackManager';
import { parseTimestamp, scheduleReplyDeletion } from '../utils';
import { userCredentialStore } from '../users/UserCredentialStore';
import { flattenResults } from './search';
import { Command } from './types';

async function beginPlayback(
  absClient: AbsClient,
  item: LibraryItem,
  interaction: Parameters<Command['execute']>[0],
  atSeconds: number | undefined,
): Promise<void> {
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.editReply('You must be in a voice channel to play audio.');
    return;
  }

  const botMember = interaction.guild?.members.me;
  const perms = voiceChannel.permissionsFor(botMember ?? interaction.client.user);
  if (!perms?.has(['Connect', 'Speak'])) {
    await interaction.editReply('I need **Connect** and **Speak** permissions in your voice channel.');
    return;
  }

  await interaction.editReply({
    content: `Starting **${item.media.metadata.title}**${atSeconds !== undefined ? ` at ${atSeconds}s` : ''}…`,
    components: [],
  });

  await startPlayback({
    voiceChannel,
    textChannel: interaction.channel as GuildTextBasedChannel,
    userId: interaction.user.id,
    itemID: item.id,
    itemTitle: item.media.metadata.title,
    absClient,
    atSeconds,
  });

  const authorStr = item.media.metadata.authorName ? ` by ${item.media.metadata.authorName}` : '';
  await interaction.deleteReply();
  await (interaction.channel as GuildTextBasedChannel).send(`Now playing **${item.media.metadata.title}**${authorStr}.`);
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
      filter: (i) =>
        i.customId === 'play-item-select' && i.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector?.on('collect', async (selectInteraction) => {
      await selectInteraction.deferUpdate();
      const selectedId = selectInteraction.values[0];
      const selectedItem = hits.find((h) => h.libraryItem.id === selectedId)?.libraryItem;
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
