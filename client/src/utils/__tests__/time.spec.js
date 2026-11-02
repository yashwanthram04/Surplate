import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime, formatDay, formatRemaining, formatTime, formatWindow, fromLocalInput, minutesFromNow, toLocalInput } from '../time';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Built from local-time parts so the tests give the same answer in any time zone.
const local = (h, m = 0, dayOffset = 0) => new Date(2026, 10, 1 + dayOffset, h, m);
// Times use a non-breaking space (so "6:00 pm" never wraps); the specs compare against plain text.
const plain = (s) => s.replace(/ /g, ' ');

describe('formatRemaining', () => {
  it('shows 0:00 once the time has run out', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-5000)).toBe('0:00');
  });

  it('counts down in m:ss during the last ten minutes', () => {
    expect(formatRemaining(9 * MIN + 42 * 1000)).toBe('9:42');
    expect(formatRemaining(5 * 1000)).toBe('0:05');
  });

  it('switches to whole minutes from ten minutes up to an hour', () => {
    expect(formatRemaining(10 * MIN)).toBe('10m');
    expect(formatRemaining(45 * MIN)).toBe('45m');
  });

  it('shows hours and zero-padded minutes under a day', () => {
    expect(formatRemaining(HOUR)).toBe('1h 00m');
    expect(formatRemaining(HOUR + 23 * MIN)).toBe('1h 23m');
  });

  it('shows days and hours from 24 hours up', () => {
    expect(formatRemaining(49 * HOUR)).toBe('2d 1h');
  });
});

describe('formatDay', () => {
  const now = local(9);

  it('says Today and Tomorrow for the next two days', () => {
    expect(formatDay(local(18), now)).toBe('Today');
    expect(formatDay(local(8, 0, 1), now)).toBe('Tomorrow');
  });

  it('falls back to a short date further out', () => {
    expect(formatDay(local(12, 0, 3), now)).toMatch(/Wed/); // 4 Nov 2026
  });
});

describe('formatTime', () => {
  it('shows a lower-case 12-hour clock', () => {
    expect(plain(formatTime(local(18, 5)))).toBe('6:05 pm');
    expect(plain(formatTime(local(9, 30)))).toBe('9:30 am');
  });

  it('uses a non-breaking space so the time never wraps onto two lines', () => {
    expect(formatTime(local(18, 5))).toContain(' ');
  });
});

describe('formatWindow', () => {
  it('writes the day once when the window ends the same day', () => {
    const text = plain(formatWindow(local(18), local(20, 30)));
    expect(text).toContain('6:00 pm');
    expect(text).toContain('8:30 pm');
    expect(text).toContain('–');
  });

  it('names the second day when the window crosses midnight', () => {
    const text = plain(formatWindow(local(22), local(1, 0, 1)));
    expect(text).toContain('10:00 pm');
    expect(text).toContain('1:00 am');
    // the end part carries its own day label, so it is more than just a time
    expect(text.split('–')[1].trim()).not.toBe('1:00 am');
  });
});

describe('formatDateTime', () => {
  it('joins the day label and the time', () => {
    const now = new Date();
    const later = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0);
    expect(formatDateTime(later)).toBe(`Today ${formatTime(later)}`);
  });
});

describe('datetime-local helpers', () => {
  it('formats a date for the input at minute precision, zero-padded', () => {
    expect(toLocalInput(local(9, 5))).toBe('2026-11-01T09:05');
  });

  it('round-trips through the input value', () => {
    const original = local(14, 45);
    expect(fromLocalInput(toLocalInput(original))).toBe(original.toISOString());
  });

  it('returns an empty string for blank or invalid input', () => {
    expect(fromLocalInput('')).toBe('');
    expect(fromLocalInput('not a date')).toBe('');
  });
});

describe('minutesFromNow', () => {
  afterEach(() => vi.useRealTimers());

  it('adds the minutes to the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    expect(minutesFromNow(30).toISOString()).toBe('2026-11-01T10:30:00.000Z');
  });
});
