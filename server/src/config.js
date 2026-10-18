export const isProd = process.env.NODE_ENV === 'production';

/** Secret used to sign login tokens. Must be set in production; a fixed dev value is used locally. */
export function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProd) throw new Error('JWT_SECRET must be set in production.');
  return 'surplate-dev-secret-not-for-production';
}

function positiveSetting(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export const priorityMinutes = () => positiveSetting('CHARITY_PRIORITY_MINUTES', 15);
export const gramsPerMeal = () => positiveSetting('GRAMS_PER_MEAL', 500);
// An uncollected reservation becomes "missed" (and its stock returns to the board) this long after its slot ends.
export const missedGraceMinutes = () => positiveSetting('MISSED_GRACE_MINUTES', 15);
