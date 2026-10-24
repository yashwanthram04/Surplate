import { toListingDTO } from './serialize.js';

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

export function toPledgeDTO(doc) {
    const o = plain(doc);
    return {
        id: String(o._id),
        needId: String(o.need),
        needTitle: o.needTitle,
        charity: { id: String(o.charity), name: o.charityName },
        bakery: { id: String(o.bakery), name: o.bakeryName },
        quantity: o.quantity,
        status: o.status,
        createdAt: o.createdAt,
        withdrawnAt: o.withdrawnAt ?? null,
    };
}

/** Pass { pledges } to include the active pledges (only for the charity that owns it). */
export function toNeedDTO(doc, { pledges, now = new Date() } = {}) {
    const o = plain(doc);
    const remaining = Math.max(0, o.quantityTarget - o.quantityPledged);

    const result = {
        id: String(o._id),
        charity: { id: String(o.charity), name: o.charityName },
        title: o.title,
        description: o.description,
        quantityTarget: o.quantityTarget,
        quantityPledged: o.quantityPledged,
        quantityRemaining: remaining,
        percent: Math.min(100, Math.round((o.quantityPledged / o.quantityTarget) * 100)),
        neededBy: o.neededBy,
        dietaryTags: o.dietaryTags,
        status: o.status,
        phase: o.status !== 'open'
            ? o.status
            : new Date(o.neededBy) <= now
                ? 'overdue'
                : 'open',
        createdAt: o.createdAt,
        fulfilledAt: o.fulfilledAt ?? null,
    };
    if (pledges) {
        result.pledges = pledges.map(toPledgeDTO);
    }
    return result;
}


export function toOfferDTO(doc) {
    const o = plain(doc);
    const populated = o.listing && o.listing.itemName;
    return {
        id: String(o._id),
        listingId: String(populated ? o.listing._id : o.listing),
        itemName: o.itemName,
        bakeryName: o.bakeryName,
        charity: { id: String(o.charity), name: o.charityName },
        rank: o.rank,
        status: o.status,
        quantityOffered: o.quantityOffered ?? null,
        quantityAccepted: o.quantityAccepted,
        reservationId: o.reservation ? String(o.reservation) : null,
        offeredAt: o.offeredAt ?? null,
        expiresAt: o.expiresAt ?? null, // the page counts down to this
        respondedAt: o.respondedAt ?? null,
        listing: o.status === 'pending' && populated ? toListingDTO(o.listing) : null,
    };
}