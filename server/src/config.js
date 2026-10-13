export const isProd = process.env.NODE_ENV === 'production';

/** Secret used to sign login tokens. Must be set in production; a fixed dev value is used locally. */
export function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProd) throw new Error('JWT_SECRET must be set in production.');
  return 'surplate-dev-secret-not-for-production';
}
