# DiscordBookshelf — Bot Specification

## Overview

DiscordBookshelf is a Discord bot that connects to an Audiobookshelf server and streams audiobooks and podcasts into Discord voice channels. Users can browse their library, play content, and control playback — all from within Discord. Each user registers their own ABS server credentials; there is no bot-wide account.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24+ |
| Language | TypeScript (strict mode) |
| Discord library | discord.js v14 |
| Voice | @discordjs/voice |
| Audio pipeline | ffmpeg (via ffmpeg-static, system fallback) |
| HTTP client | Native fetch (Node.js 24 built-in) |
| Config | dotenv |
| Build | tsc / tsx for dev |
| Tests | Vitest |

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
      │         ├── /unlock    ─── UserCredentialStore (password cache)
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
      ├─── GuildSessionStore (in-memory, per guild)
      │
      └─── VoiceStateHandler (auto-pause / auto-resume)
```

### Key Components

**Bot** — Discord gateway connection, slash command registration, event dispatch.

**CommandRouter** — Maps incoming interactions to handler functions. Also handles modal submissions for `/connect` and `/unlock`.

**PlaybackManager** — One instance per guild. Owns the VoiceConnection, AudioPlayer, and current ABS play session. Syncs position to ABS every 30 seconds.

**AudioStream** — Fetches the audio file from Audiobookshelf via HTTP, pipes through ffmpeg (OggOpus 48kHz stereo), and feeds an AudioResource to the AudioPlayer. Supports seeking via ffmpeg's `-ss` flag. Falls back to system ffmpeg if the bundled binary is unavailable (e.g. OneDrive-hosted installs).

**GuildSessionStore** — In-memory Map keyed by guild ID. Stores which book/episode is playing, the active ABS session ID, current position (calculated from wall-clock elapsed time), and playback status.

**UserCredentialStore** — Persistent store (JSON file on disk) keyed by Discord user ID. Stores each user's ABS server URL and API token, optionally AES-256-GCM encrypted. Loaded at startup, written on every update.

**VoiceStateHandler** — Reacts to `VoiceStateUpdate` events from Discord:
- When all humans leave the bot's voice channel: pauses playback, starts a 10-second timer. If the channel is still empty after 10 seconds, stops and disconnects.
- When a user rejoins while the bot is paused-for-empty: cancels the timer, rewinds 5 seconds, and resumes playback.

---

## Audiobookshelf Integration

### Authentication

Each user registers their own ABS server URL and API token via `/connect`. All API requests use that user's credentials as a Bearer token. There is no bot-wide ABS account.

```
Authorization: Bearer <user's ABS_API_TOKEN>
```

Commands that require ABS access (`/play`, `/search`, `/nowplaying`, etc.) look up the invoking user's credentials first and reply ephemerally with an error if none are registered or if the credentials are encrypted and locked.

### Relevant API Endpoints

| Purpose | Endpoint |
|---|---|
| Search library | `GET /api/search?q=<query>` |
| List libraries | `GET /api/libraries` |
| Get item metadata | `GET /api/items/:id?include=chapters` |
| Start play session | `POST /api/items/:id/play` |
| Sync session progress | `POST /api/session/:sessionId/sync` |
| Close play session | `POST /api/session/:sessionId/close` |
| Get items in progress | `GET /api/me/items-in-progress` |

### ABS Session Management

ABS has a first-class concept of a "play session" that tracks position server-side. The bot uses this natively.

**Opening a session:**
1. Call `POST /api/items/:id/play` with `{ "deviceInfo": { "clientName": "DiscordBookshelf" } }`.
2. Response includes `sessionId`, `currentTime` (the user's last saved position), and an `audioTracks` array (each track has `startOffset`, `duration`, and `contentUrl`).
3. If `/play` was invoked with an explicit `at` timestamp, use that as the starting position instead of `currentTime`.

**Syncing progress during playback:**
- Every 30 seconds while playing, call `POST /api/session/:sessionId/sync` with `{ "currentTime": <seconds> }`.

**Closing a session:**
- On `/stop`, bot disconnect, or when a new book starts, call `POST /api/session/:sessionId/close` with the final `currentTime`. This writes the position to the user's permanent ABS progress record.

### Audio Streaming Strategy

1. Open a play session. Resolve the starting position (ABS `currentTime` or user-supplied `at`).
2. Determine which audio track contains the start position using each track's `startOffset` and `duration`.
3. Pipe `GET <contentUrl>` (with `Authorization` header) through ffmpeg, passing `-ss <offset>` for the intra-track seek offset.
4. ffmpeg outputs OggOpus at 48kHz stereo, fed directly into the discord.js AudioPlayer.
5. On track end, auto-advance to the next track. If no more tracks, close the session.
6. On seek, find the correct track, restart the ffmpeg process with the new offset, and continue syncing.

---

## Bot Commands

All commands are Discord slash commands registered globally (or per-guild during development). Commands that interact with ABS require the invoking user to have registered credentials via `/connect`.

### `/connect [password]`

Register or update the user's Audiobookshelf server address and API token. The entire interaction is ephemeral.

- Opens a modal asking for **Server URL** and **API Token** (inputs are not shown in the channel).
- If `password` is provided, credentials are stored encrypted with AES-256-GCM (see [Credential Encryption](#credential-encryption)).
- Validates the credentials immediately by calling `GET /api/libraries` and reports success or failure.
- Credentials are stored in `UserCredentialStore` keyed by Discord user ID and persisted to disk.
- Running `/connect` again overwrites the previous entry.

### `/disconnect`

Remove the user's stored ABS credentials. Responds ephemerally to confirm.

### `/unlock [password]`

Decrypt and cache the user's encrypted credentials for the current bot session.

- If `password` is omitted, opens a modal to enter it securely.
- On success, the password is cached in memory — credentials remain accessible until the bot restarts without needing to `/unlock` again.
- Has no effect if credentials are not encrypted.

### `/play <query> [at: HH:MM:SS]`

Search the user's Audiobookshelf library and begin playback. Matches both audiobooks and podcasts.

- If the bot is not in a voice channel, it joins the caller's current channel.
- Results from all libraries are merged (books first, then podcasts) and capped at 5. If multiple results are found, a select menu is shown labelling each as `[Book]` or `[Podcast]`.
- For podcasts, after selecting a podcast, a second select menu lists the most recent episodes with their date and duration.
- Without `at`: begins from the position stored in the user's ABS progress (`currentTime`).
- With `at`: ignores ABS progress and starts from the specified timestamp. Accepts `HH:MM:SS`, `MM:SS`, or raw seconds.
- Sends a "now playing" embed to the text channel.

### `/pause`

Pause the current audio stream. Syncs the current position to ABS.

### `/resume`

Smart resume with two behaviours:

**Bot has an active session in this guild (currently paused):** Unpauses the stream immediately.

**Bot is not in a voice channel:** Calls `GET /api/me/items-in-progress` for the invoking user.
- If one result: auto-resumes it, joining the caller's voice channel and seeking to the saved `currentTime`.
- If multiple results: shows a select menu with each title, author/podcast, and progress percentage.
- Requires the user to be in a voice channel before selecting.

### `/stop`

Stop playback, disconnect from the voice channel, and close the ABS play session (saves final position).

### `/seek <timestamp>`

Seek to a specific position. Accepts:
- Absolute: `HH:MM:SS`, `MM:SS`, or raw seconds (e.g. `3600`)
- Relative: `+<seconds>` to jump forward or `-<seconds>` to jump backward (e.g. `+30`, `-60`)

### `/search <query>`

Search the library and display results as an embed without starting playback. Returns up to 5 results, each labelled `[Book]` or `[Podcast]`.

### `/nowplaying`

Display an embed showing the current book/episode, chapter, progress bar, cover art, and playback status.

---

## Credential Encryption

Credentials can be optionally encrypted at rest using AES-256-GCM:

- **Encrypting:** Pass a `password` to `/connect`. The server URL and API token are encrypted and stored as `{ encrypted: true, salt, iv, tag, data }`.
- **Key derivation:** scrypt with a random 16-byte salt, producing a 32-byte key.
- **Unlocking:** After a bot restart, run `/unlock` to re-cache the password. Commands will reply with an "encrypted and locked" error otherwise.
- **Password cache:** Stored in memory only; cleared on bot restart. The plaintext password is never written to disk.
- **Plaintext mode:** If no password is given to `/connect`, credentials are stored as-is in `data/users.json`.

---

## Data Models

### Guild Playback Session (in-memory)

```typescript
interface GuildSession {
  guildId: string;
  voiceChannelId: string;
  textChannel: GuildTextBasedChannel;       // discord.js channel object
  connection: VoiceConnection;
  player: AudioPlayer;
  absSessionId: string;                     // ABS play session ID for sync/close
  itemID: string;
  itemTitle: string;
  itemAuthor: string;
  audioTracks: AudioTrack[];
  trackIndex: number;                       // current index into audioTracks
  segmentStartPosition: number;            // absolute book position (seconds) when segment began
  segmentStartedAt: number;               // wall-clock timestamp (Date.now()) when segment began
  startedByUserId: string;                // Discord user ID whose ABS credentials to use
  absClient: AbsClient;
  status: 'playing' | 'paused';
  syncTimer: ReturnType<typeof setInterval>;
  pausedForEmpty: boolean;
  emptyChannelTimer: ReturnType<typeof setTimeout> | null;
}
```

Current position is computed as:
- If paused: `segmentStartPosition`
- If playing: `segmentStartPosition + (Date.now() - segmentStartedAt) / 1000`

One session per guild. A new `/play` closes the existing ABS session and replaces the guild session.

### User Credentials (persisted to disk)

**Plaintext entry:**
```typescript
interface PlainEntry {
  absServerUrl: string;    // e.g. "https://abs.example.com"
  absApiToken: string;
  encrypted?: false;
}
```

**Encrypted entry:**
```typescript
interface EncryptedEntry {
  encrypted: true;
  salt: string;            // 16-byte random salt (hex)
  iv: string;              // 12-byte AES-GCM IV (hex)
  tag: string;             // 16-byte GCM auth tag (hex)
  data: string;            // AES-256-GCM ciphertext (hex) of JSON { absServerUrl, absApiToken }
}
```

Stored as `Record<discordUserId, PlainEntry | EncryptedEntry>` in `data/users.json`. Loaded at startup, written on every change. Excluded from version control.

---

## Configuration

Bot-level config via environment variables (`.env`, never committed). Per-user ABS credentials are stored separately in `data/users.json`.

```env
DISCORD_TOKEN=          # required — bot token from Discord Developer Portal
DISCORD_CLIENT_ID=      # required — application client ID
GUILD_ID=               # optional — dev guild for instant slash command registration
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| User has no registered credentials | Reply ephemerally: "You haven't connected an Audiobookshelf server. Use `/connect` first." |
| Credentials are encrypted and locked | Reply ephemerally: "Your credentials are encrypted. Use `/unlock` to enter your password first." |
| `/connect` credentials fail validation | Reply ephemerally with the HTTP status/error from ABS. Credentials are not saved. |
| User not in a voice channel | Reply ephemerally: "You must be in a voice channel." |
| Bot lacks voice permissions | Reply ephemerally listing required permissions (Connect, Speak). |
| Audiobookshelf unreachable | Reply ephemerally: "Could not reach your Audiobookshelf server: [error]" |
| No search results | Reply ephemerally: "No results found for `<query>`." |
| ABS session sync fails | Log warning, continue playback — non-fatal. |
| Stream error mid-playback | Log error, send message to text channel, stop playback. |

---

## Project Structure

```
discord-bookshelf/
├── src/
│   ├── index.ts                      # Entry point: login, event wiring
│   ├── config.ts                     # Env var loading and validation
│   ├── utils.ts                      # Timestamp parsing and formatting helpers
│   ├── deploy-commands.ts            # One-shot script to register slash commands
│   ├── commands/
│   │   ├── index.ts                  # Exports command collection
│   │   ├── types.ts                  # Command interface
│   │   ├── helpers.ts                # Shared: AbsClient setup, playback initiation, embeds
│   │   ├── connect.ts                # /connect
│   │   ├── disconnect.ts             # /disconnect
│   │   ├── unlock.ts                 # /unlock
│   │   ├── play.ts                   # /play
│   │   ├── pause.ts                  # /pause
│   │   ├── resume.ts                 # /resume
│   │   ├── stop.ts                   # /stop
│   │   ├── seek.ts                   # /seek
│   │   ├── search.ts                 # /search
│   │   └── nowplaying.ts             # /nowplaying
│   ├── playback/
│   │   ├── PlaybackManager.ts        # start/pause/resume/stop/seek logic
│   │   ├── AudioStream.ts            # ffmpeg-based audio stream creation
│   │   ├── GuildSessionStore.ts      # In-memory per-guild session state
│   │   └── VoiceStateHandler.ts      # Auto-pause/resume on channel empty/rejoin
│   ├── abs/
│   │   ├── client.ts                 # Audiobookshelf API wrapper (per-user credentials)
│   │   └── types.ts                  # API response types
│   └── users/
│       └── UserCredentialStore.ts    # Load/save/encrypt data/users.json
├── tests/
│   └── utils.test.ts                 # Unit tests for timestamp utilities
├── data/
│   └── users.json                    # Persisted user credentials (gitignored)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
└── SPEC.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.26.4",
    "@discordjs/voice": "^0.19.2",
    "ffmpeg-static": "^5.3.0",
    "dotenv": "^17.4.2",
    "libsodium-wrappers": "^0.8.4"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "tsx": "^4.22.3",
    "@types/node": "^25.9.1",
    "@types/libsodium-wrappers": "^0.7.14",
    "vitest": "^4.1.5"
  }
}
```

`libsodium-wrappers` is required by `@discordjs/voice` for voice channel encryption. HTTP requests use Node.js 24's built-in `fetch`; no separate HTTP client library is needed.

---

## Out of Scope

- Multi-user queue management / voting to skip
- Web dashboard
- Persistent guild sessions across bot restarts
- `/queue` command for sequential book playback
