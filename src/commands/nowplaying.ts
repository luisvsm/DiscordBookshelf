import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getCurrentPosition, guildSessionStore } from '../playback/GuildSessionStore';
import { formatDuration } from '../utils';
import { Command } from './types';

const nowplaying: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing audiobook'),

  async execute(interaction) {
    await interaction.deferReply();
    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    const session = guildSessionStore.get(interaction.guildId);
    if (!session) {
      await interaction.editReply('Nothing is currently playing.');
      return;
    }

    const currentPos = getCurrentPosition(session);
    const currentTrack = session.audioTracks[session.trackIndex];
    const totalDuration = session.audioTracks.reduce((sum, t) => sum + t.duration, 0);
    const progressPct = totalDuration > 0 ? Math.round((currentPos / totalDuration) * 100) : 0;
    const progressBar = buildProgressBar(progressPct);

    const embed = new EmbedBuilder()
      .setTitle(session.itemTitle)
      .setColor(session.status === 'playing' ? 0x57f287 : 0xfaa61a)
      .setThumbnail(session.absClient.coverUrl(session.itemID))
      .addFields(
        { name: 'Author', value: session.itemAuthor, inline: true },
        { name: 'Status', value: session.status === 'playing' ? '▶ Playing' : '⏸ Paused', inline: true },
        { name: 'Track', value: currentTrack.title || `Track ${session.trackIndex + 1}`, inline: true },
        {
          name: 'Progress',
          value: `${formatDuration(currentPos)} / ${formatDuration(totalDuration)}\n${progressBar} ${progressPct}%`,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 5);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

export default nowplaying;
