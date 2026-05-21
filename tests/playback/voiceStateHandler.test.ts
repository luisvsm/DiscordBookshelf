import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/playback/PlaybackManager', () => ({
  seekPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}));

vi.mock('../../src/playback/GuildSessionStore', () => ({
  guildSessionStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  getCurrentPosition: vi.fn().mockReturnValue(100),
}));

import { handleVoiceStateUpdate } from '../../src/playback/VoiceStateHandler';
import { guildSessionStore, getCurrentPosition } from '../../src/playback/GuildSessionStore';
import { seekPlayback, stopPlayback } from '../../src/playback/PlaybackManager';
import type { GuildSession } from '../../src/playback/GuildSessionStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer() {
  return { pause: vi.fn(), unpause: vi.fn(), play: vi.fn(), on: vi.fn(), stop: vi.fn() };
}

function makeSession(overrides: Partial<GuildSession> = {}): GuildSession {
  return {
    guildId: 'g1',
    voiceChannelId: 'vc1',
    textChannel: { send: vi.fn().mockResolvedValue(undefined) } as unknown as GuildSession['textChannel'],
    connection: {} as GuildSession['connection'],
    player: makePlayer() as unknown as GuildSession['player'],
    absSessionId: 'abs1',
    itemID: 'item1',
    itemTitle: 'Test Book',
    itemAuthor: 'Author',
    audioTracks: [],
    trackIndex: 0,
    segmentStartPosition: 100,
    segmentStartedAt: Date.now(),
    startedByUserId: 'u1',
    absClient: {} as GuildSession['absClient'],
    status: 'playing',
    syncTimer: {} as GuildSession['syncTimer'],
    pausedForEmpty: false,
    emptyChannelTimer: null,
    ...overrides,
  };
}

/**
 * Build a minimal VoiceState-like object.
 * `humanCount` controls how many non-bot members `members.filter()` reports for
 * the bot's voice channel ('vc1'), regardless of `channelId`.
 */
function makeVoiceState({
  channelId = null as string | null,
  bot = false,
  humanCount = 1,
} = {}) {
  return {
    member: { user: { bot } },
    channelId,
    guild: {
      id: 'g1',
      channels: {
        cache: {
          get: (id: string) =>
            id === 'vc1'
              ? {
                  isVoiceBased: () => true,
                  members: { filter: () => ({ size: humanCount }) },
                }
              : undefined,
        },
      },
    },
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(guildSessionStore.get).mockReset();
  vi.mocked(guildSessionStore.set).mockReset();
  vi.mocked(seekPlayback).mockReset();
  vi.mocked(stopPlayback).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleVoiceStateUpdate', () => {
  it('ignores voice state updates from bots', () => {
    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1', bot: true }),
      makeVoiceState({ channelId: null, bot: true }),
    );
    expect(guildSessionStore.get).not.toHaveBeenCalled();
  });

  it('does nothing when there is no active session for the guild', () => {
    vi.mocked(guildSessionStore.get).mockReturnValue(undefined);
    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1' }),
      makeVoiceState({ channelId: null }),
    );
    expect(stopPlayback).not.toHaveBeenCalled();
    expect(seekPlayback).not.toHaveBeenCalled();
  });

  it('ignores changes that do not involve the bot voice channel', () => {
    vi.mocked(guildSessionStore.get).mockReturnValue(makeSession());
    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'other1' }),
      makeVoiceState({ channelId: 'other2' }),
    );
    expect(guildSessionStore.set).not.toHaveBeenCalled();
    expect(stopPlayback).not.toHaveBeenCalled();
  });

  it('pauses the player and marks pausedForEmpty when the last human leaves while playing', () => {
    const player = makePlayer();
    const session = makeSession({ player: player as unknown as GuildSession['player'], status: 'playing' });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);
    vi.mocked(getCurrentPosition).mockReturnValue(150);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1', humanCount: 0 }),
      makeVoiceState({ channelId: null, humanCount: 0 }),
    );

    expect(player.pause).toHaveBeenCalledOnce();
    expect(guildSessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paused', segmentStartPosition: 150, pausedForEmpty: true }),
    );
  });

  it('does not call player.pause when already paused and the channel becomes empty', () => {
    const player = makePlayer();
    const session = makeSession({ player: player as unknown as GuildSession['player'], status: 'paused' });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1', humanCount: 0 }),
      makeVoiceState({ channelId: null, humanCount: 0 }),
    );

    expect(player.pause).not.toHaveBeenCalled();
  });

  it('does nothing when a human leaves but others remain in the channel', () => {
    vi.mocked(guildSessionStore.get).mockReturnValue(makeSession({ status: 'playing' }));

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1', humanCount: 1 }),
      makeVoiceState({ channelId: null, humanCount: 1 }),
    );

    expect(guildSessionStore.set).not.toHaveBeenCalled();
    expect(stopPlayback).not.toHaveBeenCalled();
  });

  it('stops playback after the 10-second empty-channel timeout', async () => {
    const session = makeSession({ status: 'paused' });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'vc1', humanCount: 0 }),
      makeVoiceState({ channelId: null, humanCount: 0 }),
    );

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(stopPlayback).toHaveBeenCalledWith('g1');
  });

  it('seeks back with a 5-second rewind when a human rejoins after pausedForEmpty', () => {
    const timer = setTimeout(() => {}, 100_000);
    const session = makeSession({
      status: 'paused',
      pausedForEmpty: true,
      segmentStartPosition: 200,
      emptyChannelTimer: timer,
    });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'other', humanCount: 1 }),
      makeVoiceState({ channelId: 'vc1', humanCount: 1 }),
    );

    expect(seekPlayback).toHaveBeenCalledWith('g1', 195); // 200 - 5
    expect(guildSessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ emptyChannelTimer: null, pausedForEmpty: false }),
    );
  });

  it('clamps the rewind position to 0 when segmentStartPosition is less than 5 seconds', () => {
    const timer = setTimeout(() => {}, 100_000);
    const session = makeSession({
      status: 'paused',
      pausedForEmpty: true,
      segmentStartPosition: 3,
      emptyChannelTimer: timer,
    });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'other', humanCount: 1 }),
      makeVoiceState({ channelId: 'vc1', humanCount: 1 }),
    );

    expect(seekPlayback).toHaveBeenCalledWith('g1', 0);
  });

  it('cancels the timer without seeking when a human rejoins and pausedForEmpty is false', () => {
    const timer = setTimeout(() => {}, 100_000);
    const session = makeSession({
      status: 'playing',
      pausedForEmpty: false,
      emptyChannelTimer: timer,
    });
    vi.mocked(guildSessionStore.get).mockReturnValue(session);

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'other', humanCount: 1 }),
      makeVoiceState({ channelId: 'vc1', humanCount: 1 }),
    );

    expect(seekPlayback).not.toHaveBeenCalled();
    expect(guildSessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ emptyChannelTimer: null }),
    );
  });

  it('does nothing when a human joins but there is no pending empty-channel timer', () => {
    vi.mocked(guildSessionStore.get).mockReturnValue(makeSession({ emptyChannelTimer: null }));

    handleVoiceStateUpdate(
      makeVoiceState({ channelId: 'other', humanCount: 1 }),
      makeVoiceState({ channelId: 'vc1', humanCount: 1 }),
    );

    expect(seekPlayback).not.toHaveBeenCalled();
    expect(guildSessionStore.set).not.toHaveBeenCalled();
  });
});
