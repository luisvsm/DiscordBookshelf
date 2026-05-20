import { describe, it, expect, afterEach } from 'vitest';
import { getCurrentPosition, guildSessionStore } from '../../src/playback/GuildSessionStore';
import type { GuildSession } from '../../src/playback/GuildSessionStore';

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
    itemAuthor: 'Author',
    audioTracks: [],
    trackIndex: 0,
    segmentStartPosition: 100,
    segmentStartedAt: Date.now(),
    startedByUserId: 'u1',
    absClient: {} as GuildSession['absClient'],
    status: 'playing',
    syncTimer: {} as GuildSession['syncTimer'],
    ...overrides,
  };
}

describe('getCurrentPosition', () => {
  it('returns segmentStartPosition when paused', () => {
    const session = makeSession({ status: 'paused', segmentStartPosition: 250 });
    expect(getCurrentPosition(session)).toBe(250);
  });

  it('returns an advanced position when playing', () => {
    const now = Date.now();
    const session = makeSession({
      status: 'playing',
      segmentStartPosition: 100,
      segmentStartedAt: now - 10_000,
    });
    // Allow ±1s for test execution time
    expect(getCurrentPosition(session)).toBeCloseTo(110, 0);
  });
});

describe('guildSessionStore', () => {
  afterEach(() => {
    guildSessionStore.delete('g1');
  });

  it('returns undefined for an unknown guild', () => {
    expect(guildSessionStore.get('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a session', () => {
    const session = makeSession();
    guildSessionStore.set(session);
    expect(guildSessionStore.get('g1')).toBe(session);
  });

  it('overwrites an existing session', () => {
    const s1 = makeSession({ itemTitle: 'Book 1' });
    const s2 = makeSession({ itemTitle: 'Book 2' });
    guildSessionStore.set(s1);
    guildSessionStore.set(s2);
    expect(guildSessionStore.get('g1')?.itemTitle).toBe('Book 2');
  });

  it('deletes a session', () => {
    guildSessionStore.set(makeSession());
    guildSessionStore.delete('g1');
    expect(guildSessionStore.get('g1')).toBeUndefined();
  });
});
