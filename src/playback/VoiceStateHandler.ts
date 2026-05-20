import { VoiceState } from 'discord.js';
import { getCurrentPosition, guildSessionStore } from './GuildSessionStore';
import { seekPlayback, stopPlayback } from './PlaybackManager';

const EMPTY_TIMEOUT_MS = 10_000;
const REJOIN_REWIND_SECONDS = 5;

export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  if (newState.member?.user.bot) return;

  const guildId = oldState.guild.id;
  const session = guildSessionStore.get(guildId);
  if (!session) return;

  const inBotChannel = (id: string | null) => id === session.voiceChannelId;
  const leftBot = inBotChannel(oldState.channelId) && !inBotChannel(newState.channelId);
  const joinedBot = !inBotChannel(oldState.channelId) && inBotChannel(newState.channelId);
  if (!leftBot && !joinedBot) return;

  const voiceChannel = newState.guild.channels.cache.get(session.voiceChannelId);
  if (!voiceChannel?.isVoiceBased()) return;
  const humanCount = voiceChannel.members.filter((m) => !m.user.bot).size;

  if (humanCount === 0) {
    if (session.emptyChannelTimer) clearTimeout(session.emptyChannelTimer);

    if (session.status === 'playing') {
      const pos = getCurrentPosition(session);
      session.player.pause();
      guildSessionStore.set({ ...session, status: 'paused', segmentStartPosition: pos, pausedForEmpty: true });
    }

    const timer = setTimeout(() => {
      const s = guildSessionStore.get(guildId);
      if (!s) return;
      s.textChannel.send('Left the voice channel — no listeners for 10 seconds.').catch(() => {});
      void stopPlayback(guildId);
    }, EMPTY_TIMEOUT_MS);

    const s = guildSessionStore.get(guildId)!;
    guildSessionStore.set({ ...s, emptyChannelTimer: timer });
  } else if (joinedBot) {
    const s = guildSessionStore.get(guildId);
    if (!s?.emptyChannelTimer) return;
    clearTimeout(s.emptyChannelTimer);

    if (s.pausedForEmpty) {
      const resumePos = Math.max(0, s.segmentStartPosition - REJOIN_REWIND_SECONDS);
      guildSessionStore.set({ ...s, emptyChannelTimer: null, pausedForEmpty: false });
      void seekPlayback(guildId, resumePos);
    } else {
      guildSessionStore.set({ ...s, emptyChannelTimer: null });
    }
  }
}
