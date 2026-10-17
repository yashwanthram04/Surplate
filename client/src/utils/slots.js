import { formatDay, formatTime } from './time';

// Mirrors server/src/utils/slots.js: the pickup window split into equal slots, the last one ending with the window.
export const SLOT_MINUTES = [15, 30, 60];

export function slotsFor({ pickupStart, pickupEnd, slotMinutes }) {
  const step = (slotMinutes || 30) * 60000;
  const end = new Date(pickupEnd).getTime();
  const slots = [];
  for (let t = new Date(pickupStart).getTime(); t < end; t += step) slots.push({ start: t, end: Math.min(t + step, end) });
  return slots;
}
/** Slots that have not ended yet, with a label for a <select>. */
export function openSlots(listing, now = Date.now()) {
  return slotsFor(listing).filter((s) => s.end > now).map((s) => ({
    value: new Date(s.start).toISOString(),
    label: `${formatSlot(s.start, s.end)}${s.start <= now ? ' (now)' : ''}`,
  }));
}
/** "Today 6:00 pm – 6:30 pm" */
export const formatSlot = (start, end) => `${formatDay(start)} ${formatTime(start)} – ${formatTime(end)}`;
