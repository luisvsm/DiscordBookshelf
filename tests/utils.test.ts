import { describe, it, expect } from 'vitest';
import { parseTimestamp, parseSeekInput, formatDuration } from '../src/utils';

describe('parseTimestamp', () => {
  it('parses H:MM:SS', () => expect(parseTimestamp('1:30:00')).toBe(5400));
  it('parses M:SS', () => expect(parseTimestamp('1:30')).toBe(90));
  it('parses plain seconds', () => expect(parseTimestamp('300')).toBe(300));
  it('parses zero', () => expect(parseTimestamp('0')).toBe(0));
  it('trims whitespace', () => expect(parseTimestamp('  90  ')).toBe(90));
  it('returns null for empty string', () => expect(parseTimestamp('')).toBeNull());
  it('returns null for NaN part', () => expect(parseTimestamp('abc')).toBeNull());
  it('returns null for negative part', () => expect(parseTimestamp('-1')).toBeNull());
  it('returns null for 4-part timestamp', () => expect(parseTimestamp('1:2:3:4')).toBeNull());
});

describe('parseSeekInput', () => {
  it('parses an absolute timestamp', () => {
    expect(parseSeekInput('1:30:00')).toEqual({ type: 'absolute', seconds: 5400 });
  });
  it('parses plain seconds as absolute', () => {
    expect(parseSeekInput('90')).toEqual({ type: 'absolute', seconds: 90 });
  });
  it('parses a positive relative offset', () => {
    expect(parseSeekInput('+30')).toEqual({ type: 'relative', delta: 30 });
  });
  it('parses a negative relative offset', () => {
    expect(parseSeekInput('-60')).toEqual({ type: 'relative', delta: -60 });
  });
  it('parses a decimal relative offset', () => {
    expect(parseSeekInput('+1.5')).toEqual({ type: 'relative', delta: 1.5 });
  });
  it('trims whitespace', () => {
    expect(parseSeekInput('  90  ')).toEqual({ type: 'absolute', seconds: 90 });
  });
  it('returns null for bad input', () => expect(parseSeekInput('bad')).toBeNull());
});

describe('formatDuration', () => {
  it('formats seconds under a minute', () => expect(formatDuration(45)).toBe('0:45'));
  it('formats minutes and seconds', () => expect(formatDuration(90)).toBe('1:30'));
  it('pads seconds with leading zero', () => expect(formatDuration(65)).toBe('1:05'));
  it('formats H:MM:SS', () => expect(formatDuration(3661)).toBe('1:01:01'));
  it('pads H:MM:SS components', () => expect(formatDuration(3600)).toBe('1:00:00'));
  it('clamps negative input to 0:00', () => expect(formatDuration(-5)).toBe('0:00'));
  it('floors fractional seconds', () => expect(formatDuration(90.9)).toBe('1:30'));
});
