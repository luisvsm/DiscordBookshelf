# DiscordBookshelf

A Discord bot that streams audiobooks and podcasts from your [Audiobookshelf](https://www.audiobookshelf.org/) server into a Discord voice channel. Each Discord user connects their own ABS account — no shared bot credentials required.

---

## Prerequisites

- **Node.js 24+** — [nodejs.org](https://nodejs.org)
- **An Audiobookshelf server** — self-hosted; see [Audiobookshelf docs](https://www.audiobookshelf.org/docs)
- **A Discord bot** — created at the [Discord Developer Portal](https://discord.com/developers/applications)
- **FFmpeg** — bundled automatically via `ffmpeg-static`; no manual install needed

---

## Features

- **Stream audiobooks and podcasts** from your Audiobookshelf library directly into a Discord voice channel
- **Per-user credentials** — each Discord user connects their own ABS account; no shared bot login
- **Smart resume** — `/resume` picks up where you left off, or shows a menu if you have multiple books in progress
- **Podcast support** — browse and play individual episodes with date and duration labels
- **Full playback control** — play, pause, resume, stop, and seek with absolute (`1:23:45`) or relative (`+30`, `-60`) timestamps
- **Progress sync** — position is synced to ABS every 30 seconds and saved on stop, so your progress is preserved across sessions
- **Auto-pause on empty channel** — pauses when everyone leaves, resumes with a 5-second rewind when someone rejoins
- **Optional credential encryption** — store your ABS token encrypted at rest with AES-256-GCM

---

## Per-User Setup

Each person who wants to use the bot in Discord must register their own Audiobookshelf credentials:

1. In Discord, run `/connect`.
2. A private modal appears — enter your **ABS Server URL** (e.g. `https://abs.example.com`) and your **API Token**.
3. To find your API token: in Audiobookshelf, go to **Settings → Users**, click your user, and copy the API token.
4. The bot validates the credentials immediately and confirms success.

To remove your credentials later, run `/disconnect`.

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application ID from the Discord Developer Portal |
| `GUILD_ID` | No | Server ID for dev mode — makes slash commands appear instantly in one server instead of waiting up to 1 hour for global propagation |
| `PASSWORD_TTL_DAYS` | No | How long decrypted passwords are cached in memory before expiring (default: `3`). Set to `-1` to never expire. |
| `REQUIRE_ENCRYPTION` | No | Require all users to set an encryption password when running `/connect` (default: `true`). Set to `false` to allow plaintext credential storage. |

To find your server's ID: enable Developer Mode in Discord (Settings → Advanced), then right-click your server and choose **Copy Server ID**.

---

## Deploying Slash Commands

Run this once (or after adding new commands):

```bash
npm run deploy
```

- If `GUILD_ID` is set: commands register instantly in that server only (good for testing).
- If `GUILD_ID` is not set: commands register globally across all servers (up to 1-hour propagation delay).

---

## Commands Reference

| Command | Description |
|---|---|
| `/connect` | Register your ABS server URL and API token. Provide a `password` to encrypt them at rest. |
| `/disconnect` | Remove your stored credentials from the bot. |
| `/unlock` | After a bot restart, re-enter your encryption password so the bot can access your credentials. |
| `/play <query> [at]` | Search your library and start playback. Optionally start at a specific time (`1:23:45` or `+90`). |
| `/pause` | Pause the current audiobook or podcast. |
| `/resume` | Resume playback. If the bot isn't active, shows a menu of your in-progress titles. |
| `/stop` | Stop playback, save progress to ABS, and disconnect from the voice channel. |
| `/seek <time>` | Jump to a position: `1:23:45`, `5400` (seconds), `+30` (forward), or `-60` (backward). |
| `/search <query>` | Search your library and display results without starting playback. |
| `/nowplaying` | Show an embed with the current title, chapter, progress, and cover art. |
| `/version` | Show the currently running bot version. |

**Usage tips:**
- You must be in a voice channel before using `/play` or `/resume`.
- When `/play` or `/resume` returns multiple results, a dropdown menu appears — you have 30 seconds to select.
- Playback automatically pauses when you leave the voice channel and resumes (with a 5-second rewind) when you rejoin.

---

## Credential Encryption

By default (`REQUIRE_ENCRYPTION=true`), every user must set a password when running `/connect`. Credentials are encrypted with AES-256-GCM using a key derived from that password via scrypt and stored in `data/users.json`.

After a bot restart, each user must run `/unlock` before using any playback commands — this re-caches their password in memory. Cached passwords expire after **3 days** (configurable via `PASSWORD_TTL_DAYS`; set to `-1` to never expire). Once expired, run `/unlock` again.

If `REQUIRE_ENCRYPTION=false` is set in `.env`, the password field becomes optional during `/connect`. Users who skip it have their server URL and API token stored as plaintext in `data/users.json` and do not need to run `/unlock`.

---

## Docker

A pre-built image is published to Docker Hub as `luisvsm/discordbookshelf`. The image is rebuilt automatically on every version tag.

```bash
docker run -d \
  --name discordbookshelf \
  -e DISCORD_TOKEN=your_token \
  -e DISCORD_CLIENT_ID=your_client_id \
  -v /your/data/path:/app/data \
  luisvsm/discordbookshelf:latest
```

The bot's version is baked into the image at build time. `/version` will report it, and the bot uses it to automatically redeploy slash commands whenever the version changes.

---

## Development

```bash
npm install        # Install required packages
npm run dev        # run without building (uses tsx)
npm test           # run unit tests once
```

**Resetting user data:** Delete `data/users.json` to remove all stored credentials.

**Logs:** The bot logs to stdout. Sync errors are non-fatal warnings; stream errors are reported both in the console and in the Discord text channel where playback was started.

---

## Project Structure

```
src/
├── index.ts                  # Bot entry point and event wiring
├── config.ts                 # Environment variable loading
├── utils.ts                  # Timestamp parsing/formatting
├── deploy-commands.ts        # Slash command registration script
├── commands/                 # One file per slash command
├── playback/                 # Voice connection, audio streaming, session state
├── abs/                      # Audiobookshelf API client and types
└── users/                    # Credential store (with optional encryption)
```

For full architecture details, see [SPEC.md](SPEC.md).
