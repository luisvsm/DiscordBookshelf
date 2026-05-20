import {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { GuildTextBasedChannel, VoiceBasedChannel } from 'discord.js';
import { AbsClient } from '../abs/client';
import { AudioTrack } from '../abs/types';
import { createAudioStream } from './AudioStream';
import {
  GuildSession,
  getCurrentPosition,
  guildSessionStore,
} from './GuildSessionStore';

const SYNC_INTERVAL_MS = 30_000;

/** Find which track contains the given absolute book position. */
export function resolveTrack(
  tracks: AudioTrack[],
  positionSeconds: number,
): { track: AudioTrack; trackIndex: number; inTrackOffset: number } {
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (positionSeconds >= tracks[i].startOffset) {
      return {
        track: tracks[i],
        trackIndex: i,
        inTrackOffset: positionSeconds - tracks[i].startOffset,
      };
    }
  }
  return { track: tracks[0], trackIndex: 0, inTrackOffset: 0 };
}

function playTrack(
  guildId: string,
  track: AudioTrack,
  inTrackOffset: number,
): void {
  const session = guildSessionStore.get(guildId);
  if (!session) return;

  const url = session.absClient.resolveTrackUrl(track.contentUrl);
  const stream = createAudioStream(url, inTrackOffset);
  const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });

  stream.on('error', (err) => {
    // ERR_STREAM_PREMATURE_CLOSE is raised whenever the stream is destroyed
    // intentionally (stop, seek, or a new /play replacing the current one).
    // It is not a real error — ignore it unconditionally.
    if ((err as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE') return;

    // For any other error, only act if the session is still alive.
    if (!guildSessionStore.get(guildId)) return;

    console.error(`[${guildId}] Audio stream error:`, err);
    session.textChannel
      .send('Audio stream error — stopping playback.')
      .catch(() => {});
    void stopPlayback(guildId);
  });

  session.player.play(resource);
}

export async function startPlayback(params: {
  voiceChannel: VoiceBasedChannel;
  textChannel: GuildTextBasedChannel;
  userId: string;
  itemID: string;
  itemTitle: string;
  absClient: AbsClient;
  atSeconds?: number;
  episodeId?: string;
}): Promise<void> {
  const { voiceChannel, textChannel, userId, itemID, itemTitle, absClient, atSeconds, episodeId } = params;
  const guildId = voiceChannel.guild.id;

  // Close any existing session before starting a new one.
  const existing = guildSessionStore.get(guildId);
  if (existing) {
    await teardownSession(guildId, existing);
  }
  const playSession = await absClient.openPlaySession(itemID, atSeconds, episodeId);
  
  const startPosition = atSeconds ?? playSession.currentTime ?? 0;
  const tracks = playSession.audioTracks;

  if (!tracks || tracks.length === 0) {
    throw new Error('Audiobookshelf returned no audio tracks for this item.');
  }

  const { trackIndex, inTrackOffset } = resolveTrack(tracks, startPosition);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    connection.destroy();
    throw new Error('Could not connect to the voice channel — check that the bot has Connect and Speak permissions and try again.');
  }

  const player = createAudioPlayer();
  connection.subscribe(player);

  const syncTimer = setInterval(() => {
    const s = guildSessionStore.get(guildId);
    if (!s || s.status !== 'playing') return;
    const pos = getCurrentPosition(s);
    s.absClient.syncSession(s.absSessionId, pos).catch((err) => {
      console.warn(`[${guildId}] ABS sync failed:`, err);
    });
  }, SYNC_INTERVAL_MS);

  const session: GuildSession = {
    guildId,
    voiceChannelId: voiceChannel.id,
    textChannel,
    connection,
    player,
    absSessionId: playSession.id,
    itemID,
    itemTitle,
    itemAuthor: playSession.mediaMetadata?.authorName ?? 'Unknown',
    audioTracks: tracks,
    trackIndex,
    segmentStartPosition: startPosition,
    segmentStartedAt: Date.now(),
    startedByUserId: userId,
    absClient,
    status: 'playing',
    syncTimer,
    pausedForEmpty: false,
    emptyChannelTimer: null,
  };

  guildSessionStore.set(session);

  player.on(AudioPlayerStatus.Idle, () => {
    const s = guildSessionStore.get(guildId);
    if (!s) return; // Session was already torn down (e.g. by /stop or a seek).

    const nextIndex = s.trackIndex + 1;
    if (nextIndex >= s.audioTracks.length) {
      // Book finished — close ABS session and clean up.
      const finalPos =
        s.audioTracks[s.audioTracks.length - 1].startOffset +
        s.audioTracks[s.audioTracks.length - 1].duration;
      clearInterval(s.syncTimer);
      guildSessionStore.delete(guildId);
      s.absClient.closeSession(s.absSessionId, finalPos).catch(() => {});
      s.connection.destroy();
      s.textChannel
        .send(`Finished **${itemTitle}**.`)
        .catch(() => {});
      return;
    }

    const nextTrack = s.audioTracks[nextIndex];
    guildSessionStore.set({
      ...s,
      trackIndex: nextIndex,
      segmentStartPosition: nextTrack.startOffset,
      segmentStartedAt: Date.now(),
    });
    playTrack(guildId, nextTrack, 0);
  });

  playTrack(guildId, tracks[trackIndex], inTrackOffset);
}

export async function pausePlayback(guildId: string): Promise<boolean> {
  const session = guildSessionStore.get(guildId);
  if (!session || session.status !== 'playing') return false;

  const currentPos = getCurrentPosition(session);
  session.player.pause();
  guildSessionStore.set({
    ...session,
    status: 'paused',
    segmentStartPosition: currentPos,
  });
  return true;
}

export async function resumePlayback(guildId: string): Promise<boolean> {
  const session = guildSessionStore.get(guildId);
  if (!session || session.status !== 'paused') return false;

  session.player.unpause();
  guildSessionStore.set({
    ...session,
    status: 'playing',
    segmentStartedAt: Date.now(),
  });
  return true;
}

export async function stopPlayback(guildId: string): Promise<boolean> {
  const session = guildSessionStore.get(guildId);
  if (!session) return false;
  await teardownSession(guildId, session);
  return true;
}

export async function seekPlayback(guildId: string, targetSeconds: number): Promise<boolean> {
  const session = guildSessionStore.get(guildId);
  if (!session) return false;

  const { track, trackIndex, inTrackOffset } = resolveTrack(session.audioTracks, targetSeconds);

  guildSessionStore.set({
    ...session,
    trackIndex,
    segmentStartPosition: targetSeconds,
    segmentStartedAt: Date.now(),
    status: 'playing',
  });

  // Calling player.play() with a new resource transitions Playing→Playing,
  // bypassing Idle, so the auto-advance handler is not triggered.
  playTrack(guildId, track, inTrackOffset);
  return true;
}

async function teardownSession(guildId: string, session: GuildSession): Promise<void> {
  const pos = getCurrentPosition(session);
  clearInterval(session.syncTimer);
  if (session.emptyChannelTimer) clearTimeout(session.emptyChannelTimer);
  guildSessionStore.delete(guildId);
  session.player.stop(true);
  session.connection.destroy();
  await session.absClient.closeSession(session.absSessionId, pos).catch((err) => {
    console.warn(`[${guildId}] Failed to close ABS session:`, err);
  });
}
