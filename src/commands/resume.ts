import { GuildTextBasedChannel, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guildSessionStore } from '../playback/GuildSessionStore';
import { resumePlayback } from '../playback/PlaybackManager';
import { beginPlayback, buildNowPlayingEmbed, callAbs, replyResult, requireAbsClient, showSelectMenu } from './helpers';
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
      if (ok) {
        await interaction.deleteReply();
        await (interaction.channel as GuildTextBasedChannel).send({
          embeds: [buildNowPlayingEmbed(guildSessionStore.get(interaction.guildId)!)],
        });
      } else {
        await replyResult(interaction, false, '', 'Already playing — use `/pause` first.');
      }
      return;
    }

    // Case 2: no active session — look up the user's ABS in-progress items.
    const absClient = await requireAbsClient(interaction);
    if (!absClient) return;

    const booksInProgress = await callAbs(interaction, () => absClient.getItemsInProgress());
    if (!booksInProgress) return;

    if (booksInProgress.length === 0) {
      await interaction.editReply('No in-progress titles found. Use `/play` to start something.');
      return;
    }

    if (booksInProgress.length === 1) {
      const item = booksInProgress[0];
      try {
        await beginPlayback(absClient, item, interaction, undefined, item.recentEpisode?.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred while starting playback.';
        await interaction.editReply(msg);
      }
      return;
    }

    await showSelectMenu(interaction, {
      customId: 'resume-item-select',
      prompt: 'Which title would you like to resume?',
      items: booksInProgress,
      toOption: (item) => ({
        label: item.media.metadata.title.slice(0, 100),
        description: item.recentEpisode
          ? `[Podcast] ${item.recentEpisode.title.slice(0, 90)}`
          : `[Book] ${(item.media.metadata.authorName ?? 'Unknown').slice(0, 90)}`,
        value: item.id,
      }),
      onSelect: (item) => beginPlayback(absClient, item, interaction, undefined, item.recentEpisode?.id),
    });
  },
};

export default resume;
