import { GuildTextBasedChannel, SlashCommandBuilder } from 'discord.js';
import { seekPlayback } from '../playback/PlaybackManager';
import { guildSessionStore, getCurrentPosition } from '../playback/GuildSessionStore';
import { parseSeekInput, formatDuration, scheduleReplyDeletion } from '../utils';
import { Command } from './types';

const seek: Command = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current audiobook')
    .addStringOption((o) =>
      o
        .setName('timestamp')
        .setDescription('Position: 1:30:00, 90:00, 5400, or relative +30 / -60')
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    const raw = interaction.options.getString('timestamp', true);
    const parsed = parseSeekInput(raw);
    if (parsed === null) {
      await interaction.editReply(
        `Invalid input: \`${raw}\`. Use H:MM:SS, MM:SS, seconds, or +N / -N for relative seek.`,
      );
      scheduleReplyDeletion(interaction);
      return;
    }

    let targetSeconds: number;

    if (parsed.type === 'relative') {
      const session = guildSessionStore.get(interaction.guildId);
      if (!session) {
        await interaction.editReply('Nothing is currently playing.');
        scheduleReplyDeletion(interaction);
        return;
      }
      const current = getCurrentPosition(session);
      targetSeconds = Math.max(0, current + parsed.delta);
    } else {
      targetSeconds = parsed.seconds;
    }

    const ok = await seekPlayback(interaction.guildId, targetSeconds);
    if (ok) {
      await interaction.deleteReply();
      await (interaction.channel as GuildTextBasedChannel).send(
        `Seeked to \`${formatDuration(targetSeconds)}\`.`,
      );
    } else {
      await interaction.editReply('Nothing is currently playing.');
      scheduleReplyDeletion(interaction);
    }
  },
};

export default seek;
