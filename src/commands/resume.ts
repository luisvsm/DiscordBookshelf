import {
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  GuildTextBasedChannel,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { PlaySession, LibraryItemInProgress} from '../abs/types';
import { guildSessionStore } from '../playback/GuildSessionStore';
import { resumePlayback, startPlayback } from '../playback/PlaybackManager';
import { userCredentialStore } from '../users/UserCredentialStore';
import { scheduleReplyDeletion } from '../utils';
import { Command } from './types';

async function beginPlayback(
  absClient: AbsClient,
  item: LibraryItemInProgress,
  interaction: Parameters<Command['execute']>[0],
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
    content: `Starting **${item.media.metadata.title}**…`,
    components: [],
  });

  await startPlayback({
    voiceChannel,
    textChannel: interaction.channel as GuildTextBasedChannel,
    userId: interaction.user.id,
    itemID: item.id,
    itemTitle: item.media.metadata.title,
    absClient,
  });

  const authorStr = item.media.metadata.authorName ? ` by ${item.media.metadata.authorName}` : '';
  await interaction.deleteReply();
  await (interaction.channel as GuildTextBasedChannel).send(`Now playing **${item.media.metadata.title}**${authorStr}.`);
}

const resume: Command = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume a paused or previously played audiobook'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    // Case 1: active session in this guild — just unpause it.
    const session = guildSessionStore.get(interaction.guildId);
    if (session) {
      const ok = await resumePlayback(interaction.guildId);
      if (ok) {
        await interaction.deleteReply();
        await (interaction.channel as GuildTextBasedChannel).send('Resumed.');
      } else {
        await interaction.editReply('Already playing — use `/pause` first.');
        scheduleReplyDeletion(interaction);
      }
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
        booksInProgress.map((bookInProgress) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(bookInProgress.media.metadata.title.slice(0, 100))
            .setDescription(
              `[${bookInProgress.mediaType === 'podcast' ? 'Podcast' : 'Book'}] ${(bookInProgress.media.metadata.authorName ?? 'Unknown').slice(0, 90)}`,
            )
            .setValue(bookInProgress.id),
        ),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({ content: 'Which title would you like to resume?', components: [row] });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.customId === 'resume-item-select' && i.user.id === interaction.user.id,
      time: 30_000,
      max: 1,
    });

    collector?.on('collect', async (selectInteraction) => {
      await selectInteraction.deferUpdate();
      const selectedId = selectInteraction.values[0];
      const selectedItem = booksInProgress.find((book) => book.id === selectedId);
      if (!selectedItem) return;
      try {
        await beginPlayback(absClient, selectedItem, interaction);
      } catch (err) {
        console.log(err);
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
