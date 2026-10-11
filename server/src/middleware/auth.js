import mongoose from 'mongoose';
import User from '../models/User.js';

// ---------------------------------------------------------------------------
// STAND-IN AUTH. Real registration/login (JWT + role-based access) belongs to the
// Accounts feature. Until it lands, the client sends the id of a seeded demo user
// in the `x-user-id` header. Replace `attachUser` with JWT verification and keep
// `requireBakery` as is: the listing routes only depend on `req.user`.
// ---------------------------------------------------------------------------
export async function attachUser(req, _res, next) {
  const id = req.get('x-user-id');
  if (id && mongoose.isValidObjectId(id)) {
    req.user = await User.findById(id);
  }
  next();
}

export function requireBakery(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in as a bakery to do that.' });
  if (req.user.role !== 'bakery') return res.status(403).json({ error: 'Only bakery accounts can manage listings.' });
  next();
}
