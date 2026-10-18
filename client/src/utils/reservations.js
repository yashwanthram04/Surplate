// Mirrors the server's checks so mistakes show before submitting; the server stays the authority.
export function reservationErrors({ quantity, slotStart }, { max, slots }) {
  const e = {};
  const q = Number(quantity);
  if (quantity === '' || !Number.isInteger(q) || q < 1) e.quantity = 'Enter a whole number of at least 1.';
  else if (q > max) e.quantity = max > 0 ? `You can reserve at most ${max}.` : 'There is nothing left to reserve.';
  if (!slots.some((s) => s.value === slotStart)) e.slotStart = 'Choose a collection slot that has not ended.';
  return e;
}

export const STATUS_BADGE = { reserved: 'text-bg-primary', collected: 'text-bg-success', cancelled: 'text-bg-secondary', missed: 'text-bg-danger' };

/** "HKT 4X2": easier to read out at the counter. */
export const spacedCode = (code) => (code ? `${code.slice(0, 3)} ${code.slice(3)}` : '');
