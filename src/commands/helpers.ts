import { ChatInputCommandInteraction, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { AbsClient } from '../abs/client';
import { LibraryItem } from '../abs/types';
import { startPlayback } from '../playback/PlaybackManager';
import { scheduleReplyDeletion } from '../utils';

/**
 * Checks voice permissions, opens a play session, then posts "Now playing" publicly
 * and deletes the ephemeral reply. Any error from startPlayback propagates to the caller.
 */
export async function beginPlayback(
  absClient: AbsClient,
  item: LibraryItem,
  interaction: ChatInputCommandInteraction,
  atSeconds?: number,
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
  await (interaction.channel as GuildTextBasedChannel).send(
    `Now playing **${item.media.metadata.title}**${authorStr}.`,
  );
}

/**
 * On success: deletes the ephemeral reply and posts successMsg publicly.
 * On failure: edits the ephemeral reply with failMsg and schedules its deletion.
 */
export async function replyResult(
  interaction: ChatInputCommandInteraction,
  ok: boolean,
  successMsg: string,
  failMsg: string,
): Promise<void> {
  if (ok) {
    await interaction.deleteReply();
    await (interaction.channel as GuildTextBasedChannel).send(successMsg);
  } else {
    await interaction.editReply(failMsg);
    scheduleReplyDeletion(interaction);
  }
}
