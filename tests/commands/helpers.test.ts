import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/users/UserCredentialStore', () => ({
  userCredentialStore: { get: vi.fn() },
}));

vi.mock('../../src/playback/GuildSessionStore', () => ({
  guildSessionStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  getCurrentPosition: vi.fn(),
}));

vi.mock('../../src/playback/PlaybackManager', () => ({
  startPlayback: vi.fn(),
}));

vi.mock('../../src/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils')>();
  return { ...mod, scheduleReplyDeletion: vi.fn() };
});

import { userCredentialStore } from '../../src/users/UserCredentialStore';
import { getCurrentPosition } from '../../src/playback/GuildSessionStore';
import { scheduleReplyDeletion } from '../../src/utils';
import { AbsClient } from '../../src/abs/client';
import {
  buildNowPlayingEmbed,
  requireAbsClient,
  callAbs,
  replyResult,
} from '../../src/commands/helpers';
import type { GuildSession } from '../../src/playback/GuildSessionStore';
import type { AudioTrack } from '../../src/abs/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTracks(): AudioTrack[] {
  return [
    { index: 0, startOffset: 0, duration: 300, title: 'Chapter 1', contentUrl: '/c1.mp3' },
    { index: 1, startOffset: 300, duration: 600, title: 'Chapter 2', contentUrl: '/c2.mp3' },
  ];
}

function makeSession(overrides: Partial<GuildSession> = {}): GuildSession {
  return {
    guildId: 'g1',
    voiceChannelId: 'vc1',
    textChannel: {} as GuildSession['textChannel'],
    connection: {} as GuildSession['connection'],
    player: {} as GuildSession['player'],
    absSessionId: 'abs1',
    itemID: 'item1',
    itemTitle: 'Test Book',
    itemAuthor: 'Great Author',
    audioTracks: makeTracks(),
    trackIndex: 0,
    segmentStartPosition: 0,
    segmentStartedAt: Date.now(),
    startedByUserId: 'u1',
    absClient: {
      coverUrl: (id: string) => `http://server/items/${id}/cover`,
    } as unknown as GuildSession['absClient'],
    status: 'playing',
    syncTimer: {} as GuildSession['syncTimer'],
    pausedForEmpty: false,
    emptyChannelTimer: null,
    ...overrides,
  };
}

function makeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'u1' },
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    channel: {
      send: vi.fn().mockResolvedValue(undefined),
      createMessageComponentCollector: vi.fn().mockReturnValue(null),
    },
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildNowPlayingEmbed
// ---------------------------------------------------------------------------

describe('buildNowPlayingEmbed', () => {
  it('sets the title from itemTitle', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession());
    expect(embed.data.title).toBe('Test Book');
  });

  it('uses green color when playing', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ status: 'playing' }));
    expect(embed.data.color).toBe(0x57f287);
  });

  it('uses orange color when paused', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ status: 'paused' }));
    expect(embed.data.color).toBe(0xfaa61a);
  });

  it('sets the thumbnail from absClient.coverUrl', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession());
    expect(embed.data.thumbnail?.url).toBe('http://server/items/item1/cover');
  });

  it('shows Author field with itemAuthor', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession());
    const field = embed.data.fields?.find((f) => f.name === 'Author');
    expect(field?.value).toBe('Great Author');
  });

  it('shows playing status in the Status field', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ status: 'playing' }));
    const field = embed.data.fields?.find((f) => f.name === 'Status');
    expect(field?.value).toContain('Playing');
  });

  it('shows paused status in the Status field', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ status: 'paused' }));
    const field = embed.data.fields?.find((f) => f.name === 'Status');
    expect(field?.value).toContain('Paused');
  });

  it('shows the current track title in the Track field', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ trackIndex: 0 }));
    const field = embed.data.fields?.find((f) => f.name === 'Track');
    expect(field?.value).toBe('Chapter 1');
  });

  it('falls back to "Track N" when the track has no title', () => {
    const tracks: AudioTrack[] = [
      { index: 0, startOffset: 0, duration: 300, title: '', contentUrl: '/c1.mp3' },
    ];
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession({ audioTracks: tracks, trackIndex: 0 }));
    const field = embed.data.fields?.find((f) => f.name === 'Track');
    expect(field?.value).toBe('Track 1');
  });

  it('calculates 0% progress when at the start', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(0);
    const embed = buildNowPlayingEmbed(makeSession());
    const field = embed.data.fields?.find((f) => f.name === 'Progress');
    expect(field?.value).toContain('0%');
    expect(field?.value).toContain('░'.repeat(20));
  });

  it('calculates 100% progress when at the end', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(900); // total duration = 300 + 600
    const embed = buildNowPlayingEmbed(makeSession());
    const field = embed.data.fields?.find((f) => f.name === 'Progress');
    expect(field?.value).toContain('100%');
    expect(field?.value).toContain('█'.repeat(20));
  });

  it('calculates 50% progress at the midpoint', () => {
    vi.mocked(getCurrentPosition).mockReturnValue(450); // 450 / 900 = 50%
    const embed = buildNowPlayingEmbed(makeSession());
    const field = embed.data.fields?.find((f) => f.name === 'Progress');
    expect(field?.value).toContain('50%');
    expect(field?.value).toContain('█'.repeat(10));
    expect(field?.value).toContain('░'.repeat(10));
  });
});

// ---------------------------------------------------------------------------
// requireAbsClient
// ---------------------------------------------------------------------------

describe('requireAbsClient', () => {
  it('returns null and replies when the user has no credentials', async () => {
    vi.mocked(userCredentialStore.get).mockReturnValue(undefined);
    const interaction = makeInteraction();

    const result = await requireAbsClient(interaction);

    expect(result).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('/connect'),
    );
  });

  it('returns null and replies when credentials are locked', async () => {
    vi.mocked(userCredentialStore.get).mockReturnValue('locked');
    const interaction = makeInteraction();

    const result = await requireAbsClient(interaction);

    expect(result).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('/unlock'),
    );
  });

  it('returns an AbsClient and does not reply when credentials are valid', async () => {
    vi.mocked(userCredentialStore.get).mockReturnValue({
      discordUserId: 'u1',
      absServerUrl: 'http://abs.example.com',
      absApiToken: 'token123',
    });
    const interaction = makeInteraction();

    const result = await requireAbsClient(interaction);

    expect(result).toBeInstanceOf(AbsClient);
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// callAbs
// ---------------------------------------------------------------------------

describe('callAbs', () => {
  it('returns the result on success', async () => {
    const interaction = makeInteraction();
    const result = await callAbs(interaction, async () => 'data');
    expect(result).toBe('data');
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('returns null and replies with the error message when an Error is thrown', async () => {
    const interaction = makeInteraction();
    const result = await callAbs(interaction, async () => {
      throw new Error('network fail');
    });
    expect(result).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('network fail'),
    );
  });

  it('returns null and replies with a string conversion when a non-Error is thrown', async () => {
    const interaction = makeInteraction();
    const result = await callAbs(interaction, async () => {
      throw 'timeout';
    });
    expect(result).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('timeout'),
    );
  });
});

// ---------------------------------------------------------------------------
// replyResult
// ---------------------------------------------------------------------------

describe('replyResult', () => {
  it('deletes the ephemeral reply and posts success message publicly on success', async () => {
    const interaction = makeInteraction();
    await replyResult(interaction, true, 'Well done!', 'Oops');

    expect(interaction.deleteReply).toHaveBeenCalledOnce();
    expect(interaction.channel.send).toHaveBeenCalledWith('Well done!');
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('edits the reply with the failure message and schedules deletion on failure', async () => {
    const interaction = makeInteraction();
    await replyResult(interaction, false, 'Well done!', 'Oops');

    expect(interaction.editReply).toHaveBeenCalledWith('Oops');
    expect(vi.mocked(scheduleReplyDeletion)).toHaveBeenCalledWith(interaction);
    expect(interaction.deleteReply).not.toHaveBeenCalled();
  });
});
