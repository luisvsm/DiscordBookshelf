export interface UserCredentials {
  discordUserId: string;
  absServerUrl: string;
  absApiToken: string;
}

export interface MediaMetadata {
  title: string;
  authorName?: string;
  description?: string;
  duration?: number;
}

export interface LibraryItem {
  id: string;
  mediaType: string;
  media: {
    metadata: MediaMetadata;
    coverPath?: string;
    duration?: number;
    chapters?: Chapter[];
  };
}

export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
}

export interface PlaySession {
  id: string;
  libraryItemId: string;
  currentTime: number;
  duration: number;
  audioTracks: AudioTrack[];
  coverPath?: string;
  mediaMetadata: MediaMetadata;
  mediaType: string;
}

export interface SearchResult {
  book?: Array<{ libraryItem: LibraryItem }>;
  podcast?: Array<{ libraryItem: LibraryItem }>;
}

export interface Library {
  id: string;
  name: string;
  mediaType: string;
}

export interface LibraryItemInProgress extends LibraryItem {
  progressLastUpdate: number;
}

export interface ItemsInProgressResponse {
  libraryItems: LibraryItemInProgress[];
}
