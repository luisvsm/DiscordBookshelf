import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  GuildMember,
  GuildTextBasedChannel,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { AbsClient } from '../abs/client';
import { LibraryItem } from '../abs/types';
import { startPlayback } from '../playback/PlaybackManager';
import { userCredentialStore } from '../users/UserCredentialStore';
import { scheduleReplyDeletion } from '../utils';

/** Returns an AbsClient for the user, or null (and replies with an error) if not connected. */
export async function requireAbsClient(
  interaction: ChatInputCommandInteraction,
): Promise<AbsClient | null> {
  const creds = userCredentialStore.get(interaction.user.id);
  if (!creds) {
    await interaction.editReply(
      "You haven't connected an Audiobookshelf server. Use `/connect` first.",
    );
    return null;
  }
  return new AbsClient(creds.absServerUrl, creds.absApiToken);
}

/** Calls an ABS API function, returning the result or null (and replying with an error) on failure. */
export async function callAbs<T>(
  interaction: ChatInputCommandInteraction,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`Could not reach your Audiobookshelf server: ${msg}`);
    return null;
  }
}

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

/**
 * Shows a single-choice select menu, waits for a selection, and calls onSelect with the
 * chosen item. Handles timeout and errors internally.
 */
export async function showSelectMenu<T>(
  interaction: ChatInputCommandInteraction,
  params: {
    customId: string;
    prompt: string;
    items: T[];
    toOption: (item: T) => { label: string; description: string; value: string };
    onSelect: (item: T) => Promise<void>;
  },
): Promise<void> {
  const { customId, prompt, items, toOption, onSelect } = params;

  const itemsByValue = new Map(items.map((item) => [toOption(item).value, item]));

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Choose a title')
    .addOptions(
      items.map((item) => {
        const { label, description, value } = toOption(item);
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(description)
          .setValue(value);
      }),
    );

  await interaction.editReply({
    content: prompt,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });

  const collector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === customId && i.user.id === interaction.user.id,
    time: 30_000,
    max: 1,
  });

  collector?.on('collect', async (selectInteraction) => {
    await selectInteraction.deferUpdate();
    const selected = itemsByValue.get(selectInteraction.values[0]);
    if (!selected) return;
    try {
      await onSelect(selected);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred.';
      await interaction.editReply({ content: msg, components: [] }).catch(() => {});
    }
  });

  collector?.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: 'Selection timed out.', components: [] }).catch(() => {});
      scheduleReplyDeletion(interaction);
    }
  });
}
