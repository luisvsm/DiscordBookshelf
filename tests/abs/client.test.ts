import { describe, it, expect, vi, afterEach } from 'vitest';
import { AbsClient } from '../../src/abs/client';

const client = new AbsClient('https://abs.example.com', 'test-token');
const clientTrailing = new AbsClient('https://abs.example.com/', 'test-token');

// ---------------------------------------------------------------------------
// Pure synchronous helpers — no fetch needed
// ---------------------------------------------------------------------------

describe('AbsClient.baseUrl', () => {
  it('strips a trailing slash', () => {
    expect(clientTrailing.baseUrl).toBe('https://abs.example.com');
  });
  it('leaves a clean URL unchanged', () => {
    expect(client.baseUrl).toBe('https://abs.example.com');
  });
});

describe('AbsClient.token', () => {
  it('returns the API token', () => {
    expect(client.token).toBe('test-token');
  });
});

describe('AbsClient.resolveTrackUrl', () => {
  it('resolves a relative URL', () => {
    expect(client.resolveTrackUrl('/audio/track.m3u8')).toBe(
      'https://abs.example.com/audio/track.m3u8?token=test-token',
    );
  });
  it('passes through an absolute URL', () => {
    expect(client.resolveTrackUrl('https://cdn.example.com/track.m3u8')).toBe(
      'https://cdn.example.com/track.m3u8?token=test-token',
    );
  });
  it('appends token with & when the URL already has query params', () => {
    expect(client.resolveTrackUrl('/audio/track.m3u8?quality=high')).toBe(
      'https://abs.example.com/audio/track.m3u8?quality=high&token=test-token',
    );
  });
});

describe('AbsClient.coverUrl', () => {
  it('builds a cover URL with auth token', () => {
    expect(client.coverUrl('item-123')).toBe(
      'https://abs.example.com/api/items/item-123/cover?token=test-token',
    );
  });
});

// ---------------------------------------------------------------------------
// Methods that call fetch
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, ok = true, contentType = 'application/json'): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(ok ? '' : String(body)),
  }));
}

describe('AbsClient.getLibraries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the libraries array', async () => {
    mockFetch({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] });
    const libs = await client.getLibraries();
    expect(libs).toHaveLength(1);
    expect(libs[0].id).toBe('lib1');
  });

  it('throws on a non-ok response', async () => {
    mockFetch('Unauthorized', false);
    await expect(client.getLibraries()).rejects.toThrow('ABS 400');
  });
});

describe('AbsClient.search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('combines books and podcasts from different libraries', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ libraries: [
          { id: 'lib1', name: 'Books', mediaType: 'book' },
          { id: 'lib2', name: 'Podcasts', mediaType: 'podcast' },
        ] }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ book: [{ libraryItem: { id: 'b1', mediaType: 'book', media: { metadata: { title: 'Book A' } } } }] }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ podcast: [{ libraryItem: { id: 'p1', mediaType: 'podcast', media: { metadata: { title: 'Pod A' } } } }] }),
      }),
    );

    const results = await client.search('test');
    expect(results.book).toHaveLength(1);
    expect(results.podcast).toHaveLength(1);
  });
});

describe('AbsClient non-JSON response handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns undefined for a plain-text response (e.g. session close)', async () => {
    mockFetch('OK', true, 'text/plain');
    await expect(client.closeSession('sess-1', 100)).resolves.toBeUndefined();
  });
});
