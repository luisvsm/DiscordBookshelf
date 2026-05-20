import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { GuildTextBasedChannel } from 'discord.js';
import { AbsClient } from '../abs/client';
import { AudioTrack } from '../abs/types';

export interface GuildSession {
  guildId: string;
  voiceChannelId: string;
  textChannel: GuildTextBasedChannel;
  connection: VoiceConnection;
  player: AudioPlayer;
  absSessionId: string;
  itemID: string;
  itemTitle: string;
  itemAuthor: string;
  audioTracks: AudioTrack[];
  trackIndex: number;
  /** Absolute book position (seconds) at the moment the current play segment started. */
  segmentStartPosition: number;
  /** Wall-clock time (Date.now()) when the current play segment started. */
  segmentStartedAt: number;
  startedByUserId: string;
  absClient: AbsClient;
  status: 'playing' | 'paused';
  syncTimer: ReturnType<typeof setInterval>;
  pausedForEmpty: boolean;
  emptyChannelTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, GuildSession>();

export function getCurrentPosition(session: GuildSession): number {
  if (session.status === 'paused') return session.segmentStartPosition;
  return session.segmentStartPosition + (Date.now() - session.segmentStartedAt) / 1000;
}

export const guildSessionStore = {
  get: (guildId: string): GuildSession | undefined => sessions.get(guildId),
  set: (session: GuildSession): void => { sessions.set(session.guildId, session); },
  delete: (guildId: string): void => { sessions.delete(guildId); },
};
