// Who may see which listings.
//
//  - A listing is either shared with individuals (visibleToIndividuals: true) or kept for charities.
//  - Verified charities and admins see every listing.
//  - Everyone else (guests, individuals, charities still waiting for verification, other bakeries)
//    sees only the listings that were shared with individuals.
//  - A bakery can always see its own listings.

export const hasFullAccess = (user) =>
  !!user && (user.role === 'admin' || (user.role === 'charity' && user.verification?.status === 'approved'));

/** Mongo filter to merge into any query for listings the viewer is allowed to see on the board. */
export function visibilityFilter(user) {
  if (hasFullAccess(user)) return {};
  // a bakery also sees its own listings (including charity-only ones) next to the shared ones
  if (user?.role === 'bakery') return { $and: [{ $or: [{ visibleToIndividuals: true }, { bakery: user._id }] }] };
  return { visibleToIndividuals: true };
}

/** Can this viewer open this one listing? (404 it if not, so hidden listings don't leak.) */
export const canView = (listing, user) =>
  listing.visibleToIndividuals === true || hasFullAccess(user) || (!!user && listing.bakery.equals(user._id));
