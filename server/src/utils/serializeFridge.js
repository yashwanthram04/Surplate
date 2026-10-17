const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

/** Public shape of a fridge. Never includes the photo bytes. */
export function toFridgeDTO(doc, { openSpoiledReports = 0 } = {}) {
  const o = plain(doc);
  const [lng, lat] = o.location.coordinates;
  return {
    id: String(o._id),
    name: o.name,
    description: o.description,
    openingHours: o.openingHours,
    address: o.address,
    postal: o.postal,
    lat,
    lng,
    distanceKm: o.distanceM != null ? round(o.distanceM / 1000, 2) : null,
    photoUrl: o.photo?.contentType ? `/api/fridges/${o._id}/photo?v=${new Date(o.updatedAt).getTime()}` : null,
    latestStatus: o.latestStatus ?? 'unknown',
    latestUpdateAt: o.latestUpdateAt ?? null,
    latestNote: o.latestNote ?? '',
    openSpoiledReports,
    createdBy: { id: String(o.createdBy), name: o.createdByName },
    createdAt: o.createdAt,
  };
}

/** Public shape of a status update. */
export function toUpdateDTO(doc) {
  const o = plain(doc);
  return {
    id: String(o._id),
    fridgeId: String(o.fridge),
    status: o.status,
    note: o.note,
    author: { id: String(o.author), name: o.authorName, role: o.authorRole },
    photoUrl: o.photo?.contentType ? `/api/fridges/${o.fridge}/updates/${o._id}/photo` : null,
    createdAt: o.createdAt,
  };
}

/** Shape of a spoiled-food report, for the suppliers it was sent to and for admins. */
export function toReportDTO(doc) {
  const o = plain(doc);
  return {
    id: String(o._id),
    fridge: { id: String(o.fridge), name: o.fridgeName },
    updateId: o.update ? String(o.update) : null,
    items: o.items,
    note: o.note,
    photoUrl: o.photo?.contentType ? `/api/fridges/alerts/${o._id}/photo` : null,
    reportedByName: o.reportedByName,
    suppliersNotified: (o.suppliers ?? []).length,
    status: o.status,
    resolution: o.resolution ?? '',
    resolvedByName: o.resolvedByName ?? '',
    resolvedAt: o.resolvedAt ?? null,
    createdAt: o.createdAt,
  };
}
