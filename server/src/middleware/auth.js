import jwt from 'jsonwebtoken';
import { isProd, jwtSecret } from '../config.js';
import User from '../models/User.js';

export const COOKIE = 'sp_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' };

/** Signs a login token for the user and stores it in an httpOnly cookie (not readable from page JavaScript). */
export function issueToken(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, jwtSecret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: MAX_AGE_MS });
}
export const clearToken = (res) => res.clearCookie(COOKIE, cookieOptions);

/** Sets req.user from the login cookie, if there is a valid one. Never rejects: guests just have no req.user. */
export async function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { sub } = jwt.verify(token, jwtSecret());
      req.user = await User.findById(sub); // null when the account has since been deleted
    } catch {
      /* expired or tampered token: treat as signed out */
    }
  }
  next();
}

export function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to do that.' });
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in to do that.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Your account type cannot do that.' });
  next();
};

export const requireBakery = requireRole('bakery');
export const requireAdmin = requireRole('admin');
