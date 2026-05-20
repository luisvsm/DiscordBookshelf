import { describe, it, expect } from 'vitest';
import { flattenResults } from '../../src/commands/search';
import type { LibraryItem } from '../../src/abs/types';

function makeItem(id: string, title: string): LibraryItem {
  return { id, mediaType: 'book', media: { metadata: { title } } };
}

describe('flattenResults', () => {
  it('returns an empty array for empty results', () => {
    expect(flattenResults({})).toEqual([]);
  });

  it('returns books with the correct media type', () => {
    const hits = flattenResults({ book: [{ libraryItem: makeItem('1', 'Book A') }] });
    expect(hits).toHaveLength(1);
    expect(hits[0].mediaType).toBe('book');
    expect(hits[0].libraryItem.id).toBe('1');
  });

  it('returns podcasts with the correct media type', () => {
    const hits = flattenResults({ podcast: [{ libraryItem: makeItem('1', 'Pod A') }] });
    expect(hits).toHaveLength(1);
    expect(hits[0].mediaType).toBe('podcast');
  });

  it('returns books before podcasts', () => {
    const hits = flattenResults({
      book: [{ libraryItem: makeItem('b1', 'Book') }],
      podcast: [{ libraryItem: makeItem('p1', 'Pod') }],
    });
    expect(hits[0].mediaType).toBe('book');
    expect(hits[1].mediaType).toBe('podcast');
  });

  it('caps the total at maxTotal (default 5)', () => {
    const books = Array.from({ length: 6 }, (_, i) => ({ libraryItem: makeItem(`b${i}`, `Book ${i}`) }));
    expect(flattenResults({ book: books })).toHaveLength(5);
  });

  it('respects a custom maxTotal', () => {
    const books = Array.from({ length: 10 }, (_, i) => ({ libraryItem: makeItem(`b${i}`, `Book ${i}`) }));
    expect(flattenResults({ book: books }, 3)).toHaveLength(3);
  });

  it('fills remaining slots with podcasts when fewer books exist', () => {
    const books = [{ libraryItem: makeItem('b1', 'Book') }];
    const podcasts = Array.from({ length: 4 }, (_, i) => ({ libraryItem: makeItem(`p${i}`, `Pod ${i}`) }));
    const hits = flattenResults({ book: books, podcast: podcasts }, 4);
    expect(hits).toHaveLength(4);
    expect(hits.filter(h => h.mediaType === 'book')).toHaveLength(1);
    expect(hits.filter(h => h.mediaType === 'podcast')).toHaveLength(3);
  });
});
