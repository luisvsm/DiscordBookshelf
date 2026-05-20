import {
  ItemsInProgressResponse,
  LibraryItemInProgress,
  Library,
  PlaySession,
  SearchResult,
} from './types';

export class AbsClient {
  constructor(
    private readonly serverUrl: string,
    private readonly apiToken: string,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.serverUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ABS ${res.status}: ${body || res.statusText}`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return undefined as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  async getLibraries(): Promise<Library[]> {
    return (await this.request<{ libraries: Library[] }>('/api/libraries')).libraries;
  }

  async search(query: string): Promise<SearchResult> {
    const libraries = await this.getLibraries();
    const results: SearchResult = {};

    for (const library of libraries) {
      const result = await this.request<SearchResult>(
        `/api/libraries/${library.id}/search?q=${encodeURIComponent(query)}`,
      );
      if (result.book) (results.book ??= []).push(...result.book);
      if (result.podcast) (results.podcast ??= []).push(...result.podcast);
    }

    return results;
  }

  async openPlaySession(itemId: string, startTime?: number, episodeId?: string): Promise<PlaySession> {
    return this.request<PlaySession>(`/api/items/${itemId}/play`, {
      method: 'POST',
      body: JSON.stringify({
        deviceInfo: { clientName: 'DiscordBookshelf', deviceId: 'discord-bot' },
        ...(startTime !== undefined ? { startTime } : {}),
        ...(episodeId !== undefined ? { episodeId } : {}),
      }),
    });
  }

  async getItemsInProgress(): Promise<LibraryItemInProgress[]> {
    const data = await this.request<ItemsInProgressResponse>('/api/me/items-in-progress');
    return data.libraryItems;
  }

  async syncSession(sessionId: string, currentTime: number, timeListened = 30): Promise<void> {
    await this.request(`/api/session/${sessionId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ currentTime, timeListened }),
    });
  }

  async closeSession(sessionId: string, currentTime: number): Promise<void> {
    await this.request(`/api/session/${sessionId}/close`, {
      method: 'POST',
      body: JSON.stringify({ currentTime }),
    });
  }

  /** Resolve a relative contentUrl to a full URL with the auth token appended. */
  resolveTrackUrl(contentUrl: string): string {
    const base = contentUrl.startsWith('http')
      ? contentUrl
      : `${this.serverUrl.replace(/\/$/, '')}${contentUrl}`;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}token=${this.apiToken}`;
  }

  coverUrl(libraryItemId: string): string {
    return `${this.serverUrl.replace(/\/$/, '')}/api/items/${libraryItemId}/cover?token=${this.apiToken}`;
  }

  get token(): string {
    return this.apiToken;
  }

  get baseUrl(): string {
    return this.serverUrl.replace(/\/$/, '');
  }
}
