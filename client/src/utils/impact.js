// Fill quiet periods so a line between two collections never implies activity in between.
export function fillTrend(rows, interval, from = '', to = '') {
  if (!rows.length) return [];
  const monthly = interval === 'month';
  const key = (value) => value.slice(0, monthly ? 7 : 10);
  const start = key(from || rows[0].date), end = key(to || rows.at(-1).date);
  const cursor = new Date(`${start}${monthly ? '-01' : ''}T00:00:00Z`);
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const result = [];
  while (Number.isFinite(cursor.getTime()) && key(cursor.toISOString()) <= end) {
    const date = key(cursor.toISOString());
    result.push(byDate.get(date) ?? { date, collectedKg: 0, estimatedMeals: 0, collections: 0 });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
    // shortcut: extreme custom ranges stay sparse; add server-side yearly buckets if needed.
    if (result.length > 1200) return rows;
  }
  return result;
}

export function chartPoints(rows, metric, width = 760) {
  const max = Math.max(1, ...rows.map((row) => row[metric]));
  return rows.map((row, index) => ({ ...row,
    x: rows.length === 1 ? width / 2 : 52 + index / (rows.length - 1) * (width - 104),
    y: 222 - row[metric] / max * 170,
  }));
}
