import { spawn } from 'child_process';
import { Readable } from 'stream';

const FFMPEG_BIN = 'ffmpeg';
console.log(`[AudioStream] Using ffmpeg binary: ${FFMPEG_BIN}`);

/** Opens a URL through ffmpeg and returns a stdout Readable streaming OggOpus at 48kHz/stereo. */
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
    '-loglevel', 'warning',
    'pipe:1',
  ];

  const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.on('error', (err) => {
    proc.stdout.destroy(err);
  });

  proc.on('close', (code, signal) => {
    // If ffmpeg exited with a failure code and was not killed intentionally (which
    // would have destroyed stdout first), propagate the failure as a stream error so
    // the playback error handler fires instead of the Idle handler treating the empty
    // stream as "book finished".
    if (code !== 0 && code !== null && !proc.stdout.destroyed) {
      proc.stdout.destroy(new Error(`ffmpeg exited with code ${code} — check ABS server reachability`));
    }
  });

  return proc.stdout as Readable;
}
