# DiscordBookshelf — Bot Specification

## Overview

DiscordBookshelf is a Discord bot that connects to an Audiobookshelf server and streams audiobooks into Discord voice channels. Users can browse their library, play audiobooks, and control playback — all from within Discord.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict mode) |
| Discord library | discord.js v14 |
| Voice | @discordjs/voice |
| Audio pipeline | ffmpeg (via ffmpeg-static) |
| HTTP client | undici or node-fetch |
| Config | dotenv |
| Build | tsc / tsx for dev |

---

## Architecture

```
Discord Gateway
      │
      ▼
 Bot (discord.js)
      │
      ├─── Command Router
      │         │
      │         ├── /connect   ─── UserCredentialStore (persisted to disk)
      │         │
      │         ├── /play     ─┐
      │         ├── /pause     │
      │         ├── /resume    ├── PlaybackManager
      │         ├── /stop      │         │
      │         ├── /seek      │         └── AudioStream
      │         └── /search ───┘                  ▼
      │                               Audiobookshelf HTTP API
      │                               (per-user credentials)
      │
      └─── GuildSessionStore (in-memory, per guild)
```

### Key Components

**Bot** — Discord gateway connection, slash command registration, event dispatch.

**CommandRouter** — Maps incoming interactions to handler functions.

**PlaybackManager** — One instance per guild. Owns the VoiceConnection, AudioPlayer, and current ABS play session.

**AudioStream** — Fetches the audio file from Audiobookshelf via HTTP range requests, pipes through ffmpeg (for transcoding/seeking), and feeds an AudioResource to the AudioPlayer.

**GuildSessionStore** — In-memory Map keyed by guild ID. Stores which book/chapter is playing, the active ABS session ID, current seek position, and playback status.

**UserCredentialStore** — Persistent store (JSON file on disk) keyed by Discord user ID. Stores each user's ABS server URL and API token. Loaded at startup, written on every update.

---

## Audiobookshelf Integration

### Authentication

Each user registers their own ABS server URL and API token via `/connect`. All API requests use that user's credentials as a Bearer token. There is no bot-wide ABS account.

```
Authorization: Bearer <user's ABS_API_TOKEN>
```

Commands that require ABS access (`/play`, `/search`, `/nowplaying`, etc.) look up the invoking user's credentials first and reply ephemerally with an error if none are registered.

### Relevant API Endpoints

| Purpose | Endpoint |
|---|---|
| Search library | `GET /api/search?q=<query>` |
| List libraries | `GET /api/libraries` |
| List items in library | `GET /api/libraries/:id/items` |
| Get item metadata | `GET /api/items/:id` |
| Get item with chapters | `GET /api/items/:id?include=chapters` |
| Stream audio file | `GET /api/items/:id/file/:fileId` |
| Start play session | `POST /api/items/:id/play` |
| Sync session progress | `POST /api/session/:sessionId/sync` |
| Close play session | `POST /api/session/:sessionId/close` |
| Get user progress | `GET /api/me/progress/:libraryItemId` |

### ABS Session Management

ABS has a first-class concept of a "play session" that tracks position server-side. The bot uses this natively rather than tracking position itself.

**Opening a session:**
1. Call `POST /api/items/:id/play` with the body `{ "deviceInfo": { "clientName": "DiscordBookshelf" } }`.
2. Response includes `sessionId`, `currentTime` (the user's last known position on the ABS server), and an `audioTracks` array (each track has `startOffset`, `duration`, and `contentUrl`).
3. If `/play` was invoked with an explicit `--at` timestamp, use that as the starting position instead of `currentTime`.

**Syncing progress during playback:**
- Every 30 seconds while playing, call `POST /api/session/:sessionId/sync` with `{ "currentTime": <seconds> }` so ABS stays up to date. This is the same sync mechanism ABS mobile/web clients use.

**Closing a session:**
- On `/stop`, bot disconnect, or when a new book is started, call `POST /api/session/:sessionId/close` with the final `currentTime`. This writes the position to the user's permanent ABS progress record.

### Audio Streaming Strategy

1. Open a play session as above. Resolve the starting position (ABS `currentTime` or user-supplied `--at`).
2. Determine which audio track contains the start position using each track's `startOffset` and `duration`.
3. Pipe `GET <contentUrl>` (with `Authorization` header) through ffmpeg, passing `-ss <offset>` for the intra-track seek offset.
4. ffmpeg outputs Opus at 48kHz stereo, which feeds directly into the discord.js AudioPlayer.
5. On seek, update the local position, find the correct track, close and reopen the ffmpeg process with the new offset, and continue syncing to ABS.

---

## Bot Commands

All commands are Discord slash commands registered globally (or per-guild during development).

Commands that interact with ABS (`/play`, `/search`, `/nowplaying`) require the invoking user to have registered credentials via `/connect`. All such commands respond ephemerally if credentials are missing.

### `/connect <server_url> <api_token>`
Register or update the user's Audiobookshelf server address and API token.
- The entire interaction is ephemeral — no one else sees the token.
- The bot validates the credentials immediately by calling `GET /api/libraries` and reports success or failure.
- Credentials are stored in `UserCredentialStore` keyed by Discord user ID, persisted to disk.
- Running `/connect` again overwrites the previous entry.

### `/disconnect`
Remove the user's stored ABS credentials from the bot.
- Responds ephemerally to confirm.

### `/play <query> [at: HH:MM:SS]`
Search the user's Audiobookshelf library and begin playback. Matches both audiobooks and podcasts.
- If the bot is not in a voice channel, it joins the caller's current channel.
- Results from all libraries are merged (books first, then podcasts) and capped at 5. If multiple results are found, a select menu is shown labelling each result as `[Book]` or `[Podcast]`.
- Without `at`: begins from the position stored in the user's ABS progress (`currentTime` returned by the play session).
- With `at`: ignores ABS progress and starts from the specified timestamp. Accepts `HH:MM:SS`, `MM:SS`, or raw seconds.
- Opens an ABS play session and begins syncing progress every 30 seconds.

### `/pause`
Pause the current audio stream. Syncs the current position to ABS via session sync.

### `/resume`
Smart resume with two behaviours depending on bot state:

**Bot is active in this server (session paused):** Unpauses the current stream immediately.

**Bot is not in a voice channel:** Calls `GET /api/me/items-in-progress` to fetch all in-progress books and podcast episodes for the invoking user.
- If one result: auto-resumes it, joining the caller's voice channel and seeking to the saved `currentTime`.
- If multiple results: shows a select menu listing each title, author/podcast, timestamp, and progress percentage. User selects and the bot joins and resumes.
- Requires the user to be in a voice channel before a selection is made.

### `/stop`
Stop playback, disconnect from the voice channel, and close the ABS play session (writes final position to the user's ABS progress).

### `/seek <timestamp>`
Seek to a specific position. Accepts `HH:MM:SS` or total seconds.

### `/search <query>`
Search the library and display results as an embed without starting playback. Returns both audiobooks and podcasts, each labelled `[Book]` or `[Podcast]`.

### `/nowplaying`
Display an embed showing the current book, chapter, progress, and cover art.

### `/queue` *(stretch goal)*
Queue multiple books to play in sequence.

---

## Data Models

### Guild Playback Session (in-memory)

```typescript
interface GuildSession {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  absSessionId: string;       // ABS play session ID, used for sync/close
  item: LibraryItem;
  audioTracks: AudioTrack[];
  trackIndex: number;         // index into audioTracks array
  seekPosition: number;       // seconds from start of current track (updated every sync)
  startedByUserId: string;    // Discord user ID who started playback (whose ABS credentials to use)
  status: 'playing' | 'paused' | 'stopped';
  syncTimer: NodeJS.Timeout;  // 30s interval that calls session sync
}
```

One session per guild. A new `/play` command closes the existing ABS session and replaces the guild session.

### User Credentials (persisted to disk)

```typescript
interface UserCredentials {
  discordUserId: string;
  absServerUrl: string;   // e.g. "https://abs.example.com"
  absApiToken: string;
}
```

Stored as a JSON file (`data/users.json`). Loaded into memory at startup, written on every change. The file should be excluded from version control (`.gitignore`).

---

## Configuration

Bot-level config via environment variables (`.env`, never committed). Per-user ABS credentials are stored separately in `data/users.json`.

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
GUILD_ID=                  # optional: dev guild for fast command registration
```

There is no bot-wide ABS server URL or API token — each user supplies their own via `/connect`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| User has no registered credentials | Reply ephemerally: "You haven't connected an Audiobookshelf server. Use `/connect` first." |
| `/connect` credentials fail validation | Reply ephemerally with the HTTP status/error from ABS. Credentials are not saved. |
| User not in a voice channel | Reply ephemerally: "You must be in a voice channel." |
| Audiobookshelf unreachable | Reply ephemerally: "Could not reach your Audiobookshelf server." |
| No search results | Reply ephemerally: "No results found for `<query>`." |
| ABS session sync fails | Log warning, continue playback — non-fatal. Retry on next interval. |
| Stream drops mid-playback | Close ABS session with last known position, log error, send message to text channel, attempt one reconnect |
| Bot lacks voice permissions | Reply ephemerally with required permissions listed |

---

## Project Structure

```
discord-bookshelf/
├── src/
│   ├── index.ts              # Entry point: login, event wiring
│   ├── commands/
│   │   ├── connect.ts
│   │   ├── disconnect.ts
│   │   ├── play.ts
│   │   ├── pause.ts
│   │   ├── resume.ts
│   │   ├── stop.ts
│   │   ├── seek.ts
│   │   ├── search.ts
│   │   └── nowplaying.ts
│   ├── playback/
│   │   ├── PlaybackManager.ts
│   │   ├── AudioStream.ts
│   │   └── GuildSessionStore.ts
│   ├── abs/
│   │   ├── client.ts         # Audiobookshelf API wrapper (per-user credentials)
│   │   └── types.ts          # API response types
│   ├── users/
│   │   └── UserCredentialStore.ts  # Load/save data/users.json
│   ├── deploy-commands.ts    # One-shot script to register slash commands
│   └── config.ts             # Env var loading and validation
├── data/
│   └── users.json            # Persisted user credentials (gitignored)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── SPEC.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14",
    "@discordjs/voice": "^0.17",
    "@discordjs/opus": "^0.9",
    "ffmpeg-static": "^5",
    "dotenv": "^16"
  },
  "devDependencies": {
    "typescript": "^5",
    "tsx": "^4",
    "@types/node": "^20"
  }
}
```

`libsodium-wrappers` or `sodium-native` may be needed for voice encryption depending on platform.

---

## Out of Scope (v1)

- Multi-user queue management / voting to skip
- Web dashboard
- Persistent guild sessions across bot restarts
- Encrypted storage for user credentials (currently plaintext JSON)
