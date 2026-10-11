const pad = (n) => String(n).padStart(2, '0');

/** "1h 23m" / "45m" / "9:42" (m:ss in the last 10 minutes) / "2d 3h" */
export function formatRemaining(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m >= 10) return `${m}m`;
  return `${m}:${pad(s)}`;
}

const dayFmt = new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
const sameDay = (a, b) => a.toDateString() === b.toDateString();

export function formatDay(d, now = new Date()) {
  const date = new Date(d);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  return dayFmt.format(date);
}
export const formatTime = (d) => timeFmt.format(new Date(d)).replace(/\s/g, ' ').toLowerCase();

/** "Today 6:00 pm – 8:30 pm" */
export function formatWindow(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const endPart = sameDay(s, e) ? formatTime(e) : `${formatDay(e)} ${formatTime(e)}`;
  return `${formatDay(s)} ${formatTime(s)} – ${endPart}`;
}
export const formatDateTime = (d) => `${formatDay(d)} ${formatTime(d)}`;

/** Date -> value for <input type="datetime-local"> (local time, minute precision). */
export function toLocalInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
/** <input type="datetime-local"> value -> ISO string (or '' when empty/invalid). */
export function fromLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
export const minutesFromNow = (min) => new Date(Date.now() + min * 60 * 1000);
