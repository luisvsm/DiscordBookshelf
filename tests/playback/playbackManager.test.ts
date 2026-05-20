import { describe, it, expect, vi, afterEach } from 'vitest';

// Mocks must be declared before the imports they intercept.
vi.mock('../../src/playback/AudioStream', () => ({
  createAudioStream: vi.fn(() => ({ on: vi.fn() })),
}));

vi.mock('@discordjs/voice', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@discordjs/voice')>();
  return { ...mod, createAudioResource: vi.fn(() => ({})) };
});

import { guildSessionStore } from '../../src/playback/GuildSessionStore';
import {
  pausePlayback,
  resolveTrack,
  resumePlayback,
  seekPlayback,
} from '../../src/playback/PlaybackManager';
import type { GuildSession } from '../../src/playback/GuildSessionStore';
import type { AudioTrack } from '../../src/abs/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer() {
  return { pause: vi.fn(), unpause: vi.fn(), play: vi.fn(), on: vi.fn(), stop: vi.fn() };
}

function makeTracks(): AudioTrack[] {
  return [
    { index: 0, startOffset: 0,   duration: 300, title: 'Track 1', contentUrl: '/t1.m4a' },
    { index: 1, startOffset: 300, duration: 600, title: 'Track 2', contentUrl: '/t2.m4a' },
    { index: 2, startOffset: 900, duration: 300, title: 'Track 3', contentUrl: '/t3.m4a' },
  ];
}

function makeSession(overrides: Partial<GuildSession> = {}): GuildSession {
  return {
    guildId: 'g1',
    voiceChannelId: 'vc1',
    textChannel: {} as GuildSession['textChannel'],
    connection: {} as GuildSession['connection'],
    player: makePlayer() as unknown as GuildSession['player'],
    absSessionId: 'abs1',
    itemID: 'item1',
    itemTitle: 'Test Book',
    itemAuthor: 'Author',
    audioTracks: makeTracks(),
    trackIndex: 0,
    segmentStartPosition: 0,
    segmentStartedAt: Date.now(),
    startedByUserId: 'u1',
    absClient: { resolveTrackUrl: (url: string) => url } as GuildSession['absClient'],
    status: 'playing',
    syncTimer: {} as GuildSession['syncTimer'],
    ...overrides,
  };
}

afterEach(() => {
  guildSessionStore.delete('g1');
});

// ---------------------------------------------------------------------------
// resolveTrack
// ---------------------------------------------------------------------------

describe('resolveTrack', () => {
  const tracks = makeTracks();

  it('resolves position 0 to the first track', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, 0);
    expect(trackIndex).toBe(0);
    expect(inTrackOffset).toBe(0);
  });

  it('resolves a mid-track position', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, 150);
    expect(trackIndex).toBe(0);
    expect(inTrackOffset).toBe(150);
  });

  it('resolves the exact boundary of the second track', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, 300);
    expect(trackIndex).toBe(1);
    expect(inTrackOffset).toBe(0);
  });

  it('resolves a position within the second track', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, 450);
    expect(trackIndex).toBe(1);
    expect(inTrackOffset).toBe(150);
  });

  it('resolves a position in the last track', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, 1000);
    expect(trackIndex).toBe(2);
    expect(inTrackOffset).toBe(100);
  });

  it('falls back to the first track for a position before all tracks', () => {
    const { trackIndex, inTrackOffset } = resolveTrack(tracks, -10);
    expect(trackIndex).toBe(0);
    expect(inTrackOffset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pausePlayback
// ---------------------------------------------------------------------------

describe('pausePlayback', () => {
  it('returns false when there is no active session', async () => {
    expect(await pausePlayback('g1')).toBe(false);
  });

  it('returns false when the session is already paused', async () => {
    guildSessionStore.set(makeSession({ status: 'paused' }));
    expect(await pausePlayback('g1')).toBe(false);
  });

  it('pauses the player and marks the session as paused', async () => {
    const player = makePlayer();
    guildSessionStore.set(makeSession({ player: player as unknown as GuildSession['player'], status: 'playing' }));

    expect(await pausePlayback('g1')).toBe(true);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(guildSessionStore.get('g1')?.status).toBe('paused');
  });
});

// ---------------------------------------------------------------------------
// resumePlayback
// ---------------------------------------------------------------------------

describe('resumePlayback', () => {
  it('returns false when there is no active session', async () => {
    expect(await resumePlayback('g1')).toBe(false);
  });

  it('returns false when the session is already playing', async () => {
    guildSessionStore.set(makeSession({ status: 'playing' }));
    expect(await resumePlayback('g1')).toBe(false);
  });

  it('unpauses the player and marks the session as playing', async () => {
    const player = makePlayer();
    guildSessionStore.set(makeSession({ player: player as unknown as GuildSession['player'], status: 'paused' }));

    expect(await resumePlayback('g1')).toBe(true);
    expect(player.unpause).toHaveBeenCalledOnce();
    expect(guildSessionStore.get('g1')?.status).toBe('playing');
  });
});

// ---------------------------------------------------------------------------
// seekPlayback
// ---------------------------------------------------------------------------

describe('seekPlayback', () => {
  it('returns false when there is no active session', async () => {
    expect(await seekPlayback('g1', 100)).toBe(false);
  });

  it('updates the session store with the new position and track', async () => {
    const player = makePlayer();
    guildSessionStore.set(makeSession({ player: player as unknown as GuildSession['player'] }));

    const ok = await seekPlayback('g1', 350);

    expect(ok).toBe(true);
    const session = guildSessionStore.get('g1');
    expect(session?.trackIndex).toBe(1);
    expect(session?.segmentStartPosition).toBe(350);
    expect(session?.status).toBe('playing');
    expect(player.play).toHaveBeenCalledOnce();
  });
});
