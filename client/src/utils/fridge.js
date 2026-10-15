// Shared bits for the Community Fridge feature. Keep the status list in sync with server/src/models/Fridge.js

export const FRIDGE_STATUSES = ['stocked', 'low', 'empty'];

// Every status has an icon and a glyph as well as a colour, so it never relies on colour alone.
export const STATUS_META = {
  stocked: { label: 'Stocked', icon: 'bi-check-circle-fill', glyph: '✓' },
  low: { label: 'Running low', icon: 'bi-exclamation-circle-fill', glyph: '!' },
  empty: { label: 'Empty', icon: 'bi-x-circle-fill', glyph: '✕' },
  unknown: { label: 'No updates yet', icon: 'bi-question-circle-fill', glyph: '?' },
};
export const statusMeta = (status) => STATUS_META[status] ?? STATUS_META.unknown;

export const KIND_LABELS = { fridge: 'Community fridge', pantry: 'Community pantry' };

/** A status older than this is shown with a "may be out of date" hint. */
export const STALE_MS = 24 * 60 * 60 * 1000;
export const isStale = (date, nowMs = Date.now()) => !date || nowMs - new Date(date).getTime() > STALE_MS;

/** "just now" / "5 min ago" / "3 h ago" / "2 days ago". Pass the shared clock (`now` from useNow) so it ticks. */
export function timeAgo(date, nowMs = Date.now()) {
  const minutes = Math.floor(Math.max(0, nowMs - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
