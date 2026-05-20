import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { Readable } from 'stream';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const staticPath: string | null = require('ffmpeg-static') as string | null;

// Use the bundled binary if it exists on disk, otherwise fall back to system ffmpeg.
// The static binary may be missing when the project is inside OneDrive (Files On-Demand).
const FFMPEG_BIN = staticPath && existsSync(staticPath) ? staticPath : 'ffmpeg';

/**
 * Opens a URL through ffmpeg and returns a stdout Readable streaming OggOpus at 48kHz/stereo.
 * seekSeconds is the absolute offset within the file to start from.
 */
export function createAudioStream(url: string, seekSeconds: number): Readable {

  const args = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-ss', String(Math.max(0, Math.floor(seekSeconds))),
    '-i', url,
    '-c:a', 'libopus',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '128k',
    '-vbr', 'on',
    '-application', 'audio',
    '-f', 'ogg',
    '-loglevel', 'quiet',
    'pipe:1',
  ];

  const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'ignore'] });

  proc.on('error', (err) => {
    proc.stdout.destroy(err);
  });

  return proc.stdout as Readable;
}
