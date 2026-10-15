import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { clearToken, issueToken, requireLogin } from '../middleware/auth.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import { toUserDTO } from '../utils/serialize.js';
import { parseAccountFields, parseRegistration, passwordProblem } from '../utils/validateUser.js';

import { cancelOpen, transaction } from '../services/reservations.js';

const router = Router();
const ROUNDS = 10;
// Compared against when the email is unknown, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', ROUNDS);

const invalid = (res, fields, status = 422) => res.status(status).json({ error: 'Please fix the highlighted fields.', fields });

// ---- brute-force protection: 5 wrong passwords for one email from one address locks it for 10 minutes ----
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const failures = new Map(); // "ip|email" -> { count, lockedUntil }
const failKey = (req, email) => `${req.ip}|${email}`;

// POST /api/auth/register – signs the new user in straight away.
router.post('/register', async (req, res) => {
  const { value, errors } = parseRegistration(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);

  const passwordHash = await bcrypt.hash(req.body.password, ROUNDS);
  let user;
  try {
    user = await User.create({
      ...value,
      passwordHash,
      // Charities must be checked by an admin before they get charity access; nobody else needs checking.
      verification: { status: value.role === 'charity' ? 'pending' : 'not_required' },
    });
  } catch (err) {
    if (err.code === 11000) return invalid(res, { email: 'An account with this email already exists. Try logging in.' }, 409);
    throw err;
  }
  issueToken(res, user);
  res.status(201).json({ user: toUserDTO(user) });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const key = failKey(req, email);

  const state = failures.get(key);
  if (state?.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait a few minutes and try again.' });
  }

  const user = email ? await User.findOne({ email }).select('+passwordHash') : null;
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    const count = (state?.count ?? 0) + 1;
    if (failures.size > 5000) failures.clear();
    failures.set(key, count >= MAX_FAILS ? { count: 0, lockedUntil: Date.now() + LOCK_MS } : { count, lockedUntil: 0 });
    return res.status(401).json({ error: 'Incorrect email or password.' }); // same message for both, on purpose
  }
  failures.delete(key);
  issueToken(res, user);
  res.json({ user: toUserDTO(user) });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  clearToken(res);
  res.status(204).end();
});

// GET /api/auth/me – who am I? (user: null for guests, so the page can ask without an error)
router.get('/me', (req, res) => {
  res.json({ user: req.user ? toUserDTO(req.user) : null });
});

// PUT /api/auth/me – edit my details; optionally change my password (needs the current one).
router.put('/me', requireLogin, async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  const { value, errors } = parseAccountFields(req.body, user.role);

  const changingPassword = typeof req.body?.newPassword === 'string' && req.body.newPassword !== '';
  if (changingPassword) {
    if (!(await bcrypt.compare(String(req.body.currentPassword ?? ''), user.passwordHash))) errors.currentPassword = 'Your current password is not correct.';
    const problem = passwordProblem(req.body.newPassword);
    if (problem) errors.newPassword = problem;
  }
  if (Object.keys(errors).length) return invalid(res, errors);

  // A changed registration number has to be checked again.
  if (user.role === 'charity' && value.registrationNo !== user.registrationNo) {
    user.verification = { status: 'pending', note: '' };
  }
  user.set(value);
  if (changingPassword) user.passwordHash = await bcrypt.hash(req.body.newPassword, ROUNDS);
  await user.save();
  res.json({ user: toUserDTO(user) });
});

// DELETE /api/auth/me – delete my account (needs my password). A bakery's listings come off the board.
// Completed reservation snapshots are retained after account deletion.
router.delete('/me', requireLogin, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot be deleted here.' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(String(req.body?.password ?? ''), user.passwordHash))) {
    return invalid(res, { password: 'That password is not correct.' });
  }
  await transaction(async (session) => {
    await User.deleteOne({ _id: user._id }, { session });
    if (user.role === 'bakery') await Listing.updateMany({ bakery: user._id, status: 'active' }, { status: 'removed' }, { session });
    await cancelOpen(user.role === 'bakery' ? { bakery: user._id } : { recipient: user._id }, session);
  });
  clearToken(res);
  res.status(204).end();
});

export default router;
