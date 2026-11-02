import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRIDGE_STATUSES, STALE_MS, STATUS_META, isStale, statusMeta, timeAgo } from '../src/utils/fridge.js';

// Unit tests for the community fridge helpers (client/src/utils/fridge.js)

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const ago = (ms) => new Date(NOW - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('the three statuses are stocked, low and empty', () => {
  assert.deepEqual(FRIDGE_STATUSES, ['stocked', 'low', 'empty']);
});

test('every status has a label, icon and glyph, so colour is never the only signal', () => {
  for (const status of [...FRIDGE_STATUSES, 'unknown']) {
    const meta = STATUS_META[status];
    assert.ok(meta.label && meta.icon && meta.glyph, `${status} is missing a label, icon or glyph`);
  }
  const all = Object.values(STATUS_META);
  assert.equal(new Set(all.map((m) => m.label)).size, all.length, 'labels are all different');
  assert.equal(new Set(all.map((m) => m.icon)).size, all.length, 'icons are all different');
  assert.equal(new Set(all.map((m) => m.glyph)).size, all.length, 'map-pin glyphs are all different');
});

test('statusMeta gives the right label, and falls back to "No updates yet" for anything unexpected', () => {
  assert.equal(statusMeta('stocked').label, 'Stocked');
  assert.equal(statusMeta('low').label, 'Running low');
  assert.equal(statusMeta('empty').label, 'Empty');
  for (const odd of ['unknown', undefined, null, '', 'full', 'STOCKED', 42]) {
    assert.equal(statusMeta(odd).label, 'No updates yet', `fallback for ${String(odd)}`);
  }
});

test('timeAgo: under a minute is "just now"', () => {
  assert.equal(timeAgo(ago(0), NOW), 'just now');
  assert.equal(timeAgo(ago(59 * SEC), NOW), 'just now');
});

test('timeAgo: minutes, rounded down', () => {
  assert.equal(timeAgo(ago(60 * SEC), NOW), '1 min ago');
  assert.equal(timeAgo(ago(5 * MIN + 59 * SEC), NOW), '5 min ago');
  assert.equal(timeAgo(ago(59 * MIN + 59 * SEC), NOW), '59 min ago');
});

test('timeAgo: hours, rounded down', () => {
  assert.equal(timeAgo(ago(60 * MIN), NOW), '1 h ago');
  assert.equal(timeAgo(ago(75 * MIN), NOW), '1 h ago');
  assert.equal(timeAgo(ago(23 * HOUR + 59 * MIN), NOW), '23 h ago');
});

test('timeAgo: days, with "1 day" in the singular', () => {
  assert.equal(timeAgo(ago(24 * HOUR), NOW), '1 day ago');
  assert.equal(timeAgo(ago(47 * HOUR), NOW), '1 day ago');
  assert.equal(timeAgo(ago(48 * HOUR), NOW), '2 days ago');
  assert.equal(timeAgo(ago(10 * DAY), NOW), '10 days ago');
});

test('timeAgo: a time slightly in the future (a clock a few seconds out of step) reads "just now", never negative', () => {
  assert.equal(timeAgo(new Date(NOW + 30 * SEC), NOW), 'just now');
  assert.equal(timeAgo(new Date(NOW + 3 * HOUR), NOW), 'just now');
});

test('timeAgo accepts ISO strings, as sent by the API', () => {
  assert.equal(timeAgo(ago(5 * MIN).toISOString(), NOW), '5 min ago');
  assert.equal(timeAgo(ago(3 * HOUR).toISOString(), NOW), '3 h ago');
});

test('timeAgo uses the current time when none is given', () => {
  assert.equal(timeAgo(new Date()), 'just now');
  assert.equal(timeAgo(new Date(Date.now() - 2 * HOUR - MIN)), '2 h ago');
});

test('isStale: a status is out of date once it is more than 24 hours old', () => {
  assert.equal(STALE_MS, DAY);
  assert.equal(isStale(ago(1 * MIN), NOW), false);
  assert.equal(isStale(ago(23 * HOUR), NOW), false);
  assert.equal(isStale(ago(24 * HOUR), NOW), false); // exactly 24 hours is still fresh
  assert.equal(isStale(ago(24 * HOUR + 1), NOW), true); // one millisecond over
  assert.equal(isStale(ago(30 * HOUR).toISOString(), NOW), true);
});

test('isStale: a fridge nobody has reported on counts as stale', () => {
  for (const none of [null, undefined, '']) assert.equal(isStale(none, NOW), true);
});

test('isStale uses the current time when none is given', () => {
  assert.equal(isStale(new Date()), false);
  assert.equal(isStale(new Date(Date.now() - 2 * DAY)), true);
});
