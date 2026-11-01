import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillTrend, chartPoints } from '../src/utils/impact.js';

test('fills quiet days and months with zeros and keeps real totals', () => {
  const rows = [{ date: '2026-01-31', collectedKg: 2 }, { date: '2026-02-02', collectedKg: 3 }];
  const daily = fillTrend(rows, 'day');
  assert.deepEqual(daily.map((r) => r.collectedKg), [2, 0, 3]);
  const monthly = fillTrend([{ date: '2025-12', collectedKg: 1 }, { date: '2026-02', collectedKg: 4 }], 'month');
  assert.deepEqual(monthly.map((r) => r.date), ['2025-12', '2026-01', '2026-02']);
  assert.equal(monthly[1].collections, 0);
  assert.equal(fillTrend(rows, 'day', '2026-01-30', '2026-02-03').length, 5);
  assert.deepEqual(fillTrend([], 'day'), []);
});

test('chart coordinates remain finite for empty, zero, single-point and large values', () => {
  for (const rows of [[], [{ collectedKg: 0 }], [{ collectedKg: 5000 }, { collectedKg: 1 }]]) {
    for (const point of chartPoints(rows, 'collectedKg')) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.y >= 52 && point.y <= 222);
    }
  }
  assert.equal(chartPoints([{ collectedKg: 1 }], 'collectedKg')[0].x, 380);
  const mobile = chartPoints([{ collectedKg: 0 }, { collectedKg: 1 }], 'collectedKg', 320);
  assert.deepEqual(mobile.map((p) => p.x), [52, 268]);
});
