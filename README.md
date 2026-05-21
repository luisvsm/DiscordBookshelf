# DiscordBookshelf

A Discord bot that streams audiobooks and podcasts from your [Audiobookshelf](https://www.audiobookshelf.org/) server into a Discord voice channel. Each Discord user connects their own ABS account — no shared bot credentials required.

---

## Prerequisites

- **Node.js 24+** — [nodejs.org](https://nodejs.org)
- **An Audiobookshelf server** — self-hosted; see [Audiobookshelf docs](https://www.audiobookshelf.org/docs)
- **A Discord bot** — created at the [Discord Developer Portal](https://discord.com/developers/applications)
- **FFmpeg** — bundled automatically via `ffmpeg-static`; no manual install needed

---

## Quick Start

```bash
git clone https://github.com/your-username/DiscordBookshelf.git
cd DiscordBookshelf
npm install
cp .env.example .env        # then edit .env with your tokens
npm run deploy              # register slash commands with Discord
npm start                   # start the bot
```

---

## Creating a Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name, then open the **Bot** tab.
3. Click **Reset Token**, copy the token — this is your `DISCORD_TOKEN`.
4. Copy the **Application ID** from the **General Information** tab — this is your `DISCORD_CLIENT_ID`.
5. Under **Privileged Gateway Intents**, no special intents are required (the bot only uses `Guilds` and `GuildVoiceStates`).
6. To invite the bot to your server, go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Connect`, `Speak`, `Send Messages`, `Read Message History`
   - Open the generated URL and select your server.

---

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
GUILD_ID=                        # optional — see below
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application ID from the Discord Developer Portal |
| `GUILD_ID` | No | Server ID for dev mode — makes slash commands appear instantly in one server instead of waiting up to 1 hour for global propagation |

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

## Running the Bot

**Production (compiled):**
```bash
npm run build   # compile TypeScript → dist/
npm start       # run dist/index.js
```

**Development (no build step):**
```bash
npm run dev     # run src/index.ts directly with tsx
```

The bot is ready when you see `Logged in as YourBotName#1234` in the console.

---

## Per-User Setup

Each person who wants to use the bot in Discord must register their own Audiobookshelf credentials:

1. In Discord, run `/connect`.
2. A private modal appears — enter your **ABS Server URL** (e.g. `https://abs.example.com`) and your **API Token**.
3. To find your API token: in Audiobookshelf, go to **Settings → Users**, click your user, and copy the API token.
4. The bot validates the credentials immediately and confirms success.

To remove your credentials later, run `/disconnect`.

---

## Commands Reference

| Command | Description |
|---|---|
| `/connect [password]` | Register your ABS server URL and API token. Provide a `password` to encrypt them at rest. |
| `/disconnect` | Remove your stored credentials from the bot. |
| `/unlock [password]` | After a bot restart, re-enter your encryption password so the bot can access your credentials. |
| `/play <query> [at]` | Search your library and start playback. Optionally start at a specific time (`1:23:45` or `+90`). |
| `/pause` | Pause the current audiobook or podcast. |
| `/resume` | Resume playback. If the bot isn't active, shows a menu of your in-progress titles. |
| `/stop` | Stop playback, save progress to ABS, and disconnect from the voice channel. |
| `/seek <time>` | Jump to a position: `1:23:45`, `5400` (seconds), `+30` (forward), or `-60` (backward). |
| `/search <query>` | Search your library and display results without starting playback. |
| `/nowplaying` | Show an embed with the current title, chapter, progress, and cover art. |

**Usage tips:**
- You must be in a voice channel before using `/play` or `/resume`.
- When `/play` or `/resume` returns multiple results, a dropdown menu appears — you have 30 seconds to select.
- Playback automatically pauses when you leave the voice channel and resumes (with a 5-second rewind) when you rejoin.

---

## Optional: Credential Encryption

By default, your ABS server URL and API token are stored as plaintext in `data/users.json`. You can encrypt them with a password:

```
/connect password:mysecretpassword
```

Your credentials are encrypted with AES-256-GCM using a key derived from your password via scrypt. The password is never written to disk.

After a bot restart, run `/unlock` (or `/unlock password:mysecretpassword`) before using any playback commands — the password is cached in memory until the next restart.

---

## Development

```bash
npm run dev        # run without building (uses tsx)
npm test           # run unit tests once
npm run test:watch # run tests in watch mode
npm run build      # compile TypeScript to dist/
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
