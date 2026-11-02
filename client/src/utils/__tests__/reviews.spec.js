/* Unit tests for utils/reviews.js: the plain functions behind the thank-you form and the Thank-you Wall.
   No components, no API: each function gets an input and we check what comes back, including the edge cases
   (empty values, exact limits, one character over). */
import { describe, expect, it } from 'vitest';
import { LIMITS, defaultNickname, initialOf, noteLook, reviewErrors, scoreTone, tickerItems, timeAgo } from '../reviews';

const valid = (extra = {}) => ({ foodRating: 5, accuracyRating: 4, note: 'Thank you!', nickname: '', onBehalf: false, onBehalfOf: '', peopleServed: '', ...extra });

describe('reviewErrors: checks the thank-you form before it is sent', () => {
  it('accepts a complete form', () => {
    expect(reviewErrors(valid())).toEqual({});
  });

  it('asks for both star ratings and a note when the form is empty', () => {
    const errors = reviewErrors(valid({ foodRating: 0, accuracyRating: 0, note: '' }));
    expect(Object.keys(errors).sort()).toEqual(['accuracyRating', 'foodRating', 'note']);
  });

  it('needs at least 3 characters of note, ignoring spaces around it', () => {
    expect(reviewErrors(valid({ note: '  ok  ' })).note).toContain('at least 3');
    expect(reviewErrors(valid({ note: 'Yum' })).note).toBeUndefined();
  });

  it('allows exactly the maximum note length but not one character more', () => {
    expect(reviewErrors(valid({ note: 'x'.repeat(LIMITS.noteMax) })).note).toBeUndefined();
    expect(reviewErrors(valid({ note: 'x'.repeat(LIMITS.noteMax + 1) })).note).toContain(`${LIMITS.noteMax}`);
  });

  it('lets the nickname be left blank, but checks its length when given', () => {
    expect(reviewErrors(valid({ nickname: '' })).nickname).toBeUndefined();
    expect(reviewErrors(valid({ nickname: 'A' })).nickname).toBeTruthy();
    expect(reviewErrors(valid({ nickname: 'x'.repeat(LIMITS.nicknameMax + 1) })).nickname).toBeTruthy();
    expect(reviewErrors(valid({ nickname: 'Al' })).nickname).toBeUndefined();
  });

  it('checks the people-served number only for charities thanking on behalf of others', () => {
    const behalf = { onBehalf: true, onBehalfOf: 'our seniors' };
    expect(reviewErrors(valid({ ...behalf, peopleServed: 0 }), { isCharity: true }).peopleServed).toContain('whole number');
    expect(reviewErrors(valid({ ...behalf, peopleServed: 2.5 }), { isCharity: true }).peopleServed).toBeTruthy();
    expect(reviewErrors(valid({ ...behalf, peopleServed: 40 }), { isCharity: true })).toEqual({});
    expect(reviewErrors(valid({ ...behalf, peopleServed: '' }), { isCharity: true })).toEqual({}); // optional
    expect(reviewErrors(valid({ ...behalf, peopleServed: 0 }), { isCharity: false })).toEqual({}); // not shown to individuals
  });
});

describe('scoreTone: the colour of a reliability score', () => {
  it('is "new" when there is no score yet', () => {
    expect(scoreTone(null)).toBe('new');
    expect(scoreTone(undefined)).toBe('new');
  });

  it('is green from 80, amber from 50, red below 50 (checked at each boundary)', () => {
    expect(scoreTone(100)).toBe('good');
    expect(scoreTone(80)).toBe('good');
    expect(scoreTone(79)).toBe('warn');
    expect(scoreTone(50)).toBe('warn');
    expect(scoreTone(49)).toBe('bad');
    expect(scoreTone(0)).toBe('bad');
  });
});

describe('noteLook: the colour and tilt of a sticky note', () => {
  it('always gives the same look for the same note, so the wall never jumps on re-render', () => {
    expect(noteLook('65f0c0ffee')).toEqual(noteLook('65f0c0ffee'));
  });

  it('stays within the six paper colours and a gentle tilt', () => {
    for (const id of ['a', 'b', 'note-1', '65f0c0ffee', 'zzzzzzzz', '']) {
      const { tone, tilt } = noteLook(id);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(6);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(1.4);
    }
  });

  it('gives each note a sway of 0.7 to 1.15, to the left or the right', () => {
    const sways = ['a', 'b', 'note-1', '65f0c0ffee', 'zzzzzzzz', 'n2', 'n3', 'n4'].map((id) => noteLook(id).sway);
    for (const s of sways) {
      expect(Math.abs(s)).toBeGreaterThanOrEqual(0.7);
      expect(Math.abs(s)).toBeLessThanOrEqual(1.15 + 1e-9);
    }
    expect(sways.some((s) => s > 0) && sways.some((s) => s < 0)).toBe(true); // not all lean the same way
  });

  it('gives different notes different looks', () => {
    const looks = new Set(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'].map((id) => JSON.stringify(noteLook(id))));
    expect(looks.size).toBeGreaterThan(1);
  });
});

describe('timeAgo: when a note was written', () => {
  const now = new Date('2026-11-02T12:00:00+08:00').getTime();
  const ago = (seconds) => new Date(now - seconds * 1000).toISOString();

  it('says "just now" for the first minute (and for clocks slightly ahead)', () => {
    expect(timeAgo(ago(0), now)).toBe('just now');
    expect(timeAgo(ago(59), now)).toBe('just now');
    expect(timeAgo(ago(-30), now)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(timeAgo(ago(60), now)).toBe('1 min ago');
    expect(timeAgo(ago(12 * 60), now)).toBe('12 min ago');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3 h ago');
    expect(timeAgo(ago(2 * 86400), now)).toBe('2 d ago');
  });

  it('shows the date for anything a week or older', () => {
    expect(timeAgo('2026-10-01T09:00:00+08:00', now)).toBe('1 Oct 2026');
  });
});

describe('defaultNickname: the name shown when the author leaves it blank', () => {
  it('shortens a person to first name and last initial', () => {
    expect(defaultNickname({ name: 'Alex Tan', role: 'individual' })).toBe('Alex T.');
    expect(defaultNickname({ name: '  Mary   Ann  lim ', role: 'individual' })).toBe('Mary L.');
  });

  it('keeps a single name as it is', () => {
    expect(defaultNickname({ name: 'Sam', role: 'individual' })).toBe('Sam');
  });

  it('keeps a charity’s full name, cut to the nickname limit', () => {
    expect(defaultNickname({ name: 'Hope Kitchen', role: 'charity' })).toBe('Hope Kitchen');
    expect(defaultNickname({ name: 'The Very Long Community Food Bank', role: 'charity' })).toHaveLength(LIMITS.nicknameMax);
  });
});

describe('initialOf: the letter in a note’s avatar', () => {
  it('is the first letter, in capitals', () => {
    expect(initialOf('casey')).toBe('C');
    expect(initialOf('  zoe')).toBe('Z');
  });

  it('falls back to "?" when there is no name', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf(null)).toBe('?');
  });
});

describe('tickerItems: the quotes in the ticker under the wall', () => {
  const note = (id, text, extra = {}) => ({ id, note: text, nickname: `Person ${id}`, foodRating: 5, ...extra });

  it('gives one quote per note, with who wrote it and their food rating', () => {
    const items = tickerItems([note('a', 'Thanks!', { foodRating: 4 })], { min: 1 });
    expect(items).toEqual([{ id: 'a', text: 'Thanks!', nickname: 'Person a', stars: 4, repeat: false }]);
  });

  it('cuts long notes with an ellipsis, keeping the whole quote within the limit', () => {
    const [item] = tickerItems([note('a', 'x'.repeat(100))], { min: 1, length: 70 });
    expect(item.text).toHaveLength(70);
    expect(item.text.endsWith('…')).toBe(true);
    expect(tickerItems([note('b', 'y'.repeat(70))], { min: 1, length: 70 })[0].text).toBe('y'.repeat(70)); // exactly at the limit: untouched
  });

  it('repeats a short list until it is long enough to fill the strip, marking the repeats', () => {
    const items = tickerItems([note('a', 'One'), note('b', 'Two'), note('c', 'Three')], { min: 8 });
    expect(items).toHaveLength(8);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b']);
    expect(items.filter((i) => !i.repeat)).toHaveLength(3); // screen readers meet each quote once
  });

  it('uses at most `max` different notes, in the order given (pinned first on the wall)', () => {
    const many = Array.from({ length: 20 }, (_, i) => note(`n${i}`, `Note ${i}`));
    const items = tickerItems(many, { max: 12 });
    expect(items).toHaveLength(12);
    expect(items[0].id).toBe('n0');
    expect(items.every((i) => !i.repeat)).toBe(true);
  });

  it('skips notes with no text and copes with an empty wall', () => {
    expect(tickerItems([note('a', '')])).toEqual([]);
    expect(tickerItems([])).toEqual([]);
  });
});
