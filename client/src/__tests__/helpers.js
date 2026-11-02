// Shared fixtures for the Vitest specs. The clock is pinned so every countdown is predictable.
export const MIN = 60 * 1000;
export const BASE = new Date('2026-11-01T10:00:00+08:00').getTime();

/** ISO timestamp `minutes` after (or before, if negative) the pinned clock. */
export const at = (minutes) => new Date(BASE + minutes * MIN).toISOString();

/** A listing as the API returns it (see server/src/utils/serialize.js). */
export function makeListing(overrides = {}) {
  return {
    id: 'l1',
    itemName: 'Butter croissants',
    description: 'Baked this morning',
    photoUrl: '/api/listings/l1/photo',
    bakery: { id: 'b1', name: 'Sunrise Bakery', thankYouCount: 0 },
    distanceKm: null,
    quantity: 12,
    quantityRemaining: 12,
    dietaryTags: [],
    allergens: [],
    pickupStart: at(-30),
    pickupEnd: at(90),
    visibleToIndividuals: true,
    priorityUntil: null,
    ...overrides,
  };
}

export const defaultFilters = () => ({ q: '', dietary: [], avoid: [], openNow: false, endingSoon: false, near: null, radiusKm: 5, sort: 'ending' });
