// Existing listings without priorityUntil retain their original sharing policy.
// New listings open to everyone at the end of their charity priority period.
export const hasFullAccess = (user) =>
  !!user && (user.role === 'admin' || (user.role === 'charity' && user.verification?.status === 'approved'));

export function visibilityFilter(user, now = new Date()) {
  if (hasFullAccess(user)) return {};
  const choices = [
    { priorityUntil: { $lte: now } },
    { priorityUntil: null, visibleToIndividuals: true },
  ];
  if (user?.role === 'bakery') choices.push({ bakery: user._id });
  return { $and: [{ $or: choices }] };
}
export const canView = (listing, user, now = new Date()) =>
  hasFullAccess(user) || (!!user && listing.bakery.equals(user._id)) ||
  (listing.priorityUntil ? listing.priorityUntil <= now : listing.visibleToIndividuals === true);
