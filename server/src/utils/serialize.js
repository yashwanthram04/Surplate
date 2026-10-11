const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Public shape of a listing. Never includes the photo bytes. */
export function toListingDTO(doc, now = new Date()) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const [lng, lat] = o.location.coordinates;
  return {
    id: String(o._id),
    bakery: { id: String(o.bakery), name: o.bakeryName },
    itemName: o.itemName,
    description: o.description,
    quantity: o.quantity,
    quantityRemaining: o.quantityRemaining,
    dietaryTags: o.dietaryTags,
    allergens: o.allergens,
    bestBefore: o.bestBefore,
    pickupStart: o.pickupStart,
    pickupEnd: o.pickupEnd,
    // upcoming: not open yet, open: collectable now, ended: pickup window closed
    phase: now < o.pickupStart ? 'upcoming' : now <= o.pickupEnd ? 'open' : 'ended',
    address: o.address,
    postal: o.postal,
    lat,
    lng,
    distanceKm: o.distanceM != null ? round(o.distanceM / 1000, 2) : null,
    photoUrl: o.photo?.contentType ? `/api/listings/${o._id}/photo?v=${new Date(o.updatedAt).getTime()}` : null,
    createdAt: o.createdAt,
  };
}
