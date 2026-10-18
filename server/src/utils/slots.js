// Collection slots split a listing's pickup window into equal blocks; the last one ends with the window.
// Keep in sync with client/src/utils/slots.js
export const SLOT_MINUTES = [15, 30, 60];
export const DEFAULT_SLOT_MINUTES = 30; // listings posted before slots existed

export function slotsFor({ pickupStart, pickupEnd, slotMinutes }) {
  const step = (slotMinutes || DEFAULT_SLOT_MINUTES) * 60000;
  const end = new Date(pickupEnd).getTime();
  const slots = [];
  for (let t = new Date(pickupStart).getTime(); t < end; t += step) {
    slots.push({ start: new Date(t), end: new Date(Math.min(t + step, end)) });
  }
  return slots;
}

/** The slot of `listing` that starts at `slotStart` and has not ended yet, or null. */
export function findSlot(listing, slotStart, now = new Date()) {
  if (typeof slotStart !== 'string' && !(slotStart instanceof Date)) return null;
  const at = new Date(slotStart).getTime();
  if (!Number.isFinite(at)) return null;
  return slotsFor(listing).find((s) => s.start.getTime() === at && s.end > now) ?? null;
}
