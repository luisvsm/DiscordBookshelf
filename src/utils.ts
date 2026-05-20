/** Parse "H:MM:SS", "M:SS", or plain seconds into a total-seconds number. Returns null on bad input. */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

export type SeekInput =
  | { type: 'absolute'; seconds: number }
  | { type: 'relative'; delta: number };

/**
 * Parse a seek expression:
 *   "+30"  / "-60"  → relative offset in seconds
 *   "1:30:00" / "90:00" / "5400" → absolute position
 * Returns null on bad input.
 */
export function parseSeekInput(raw: string): SeekInput | null {
  const trimmed = raw.trim();
  const rel = trimmed.match(/^([+-])(\d+(?:\.\d+)?)$/);
  if (rel) {
    const delta = parseFloat(rel[1] + rel[2]);
    return { type: 'relative', delta };
  }
  const seconds = parseTimestamp(trimmed);
  if (seconds === null) return null;
  return { type: 'absolute', seconds };
}

/** Delete an interaction reply after a delay. Silently ignores errors (e.g. already deleted). */
export function scheduleReplyDeletion(
  interaction: { deleteReply(): Promise<unknown> },
  delayMs = 5000,
): void {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delayMs);
}

/** Format total seconds as H:MM:SS (or M:SS when under an hour). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}
