import { Router } from 'express';
import User from '../models/User.js';

const router = Router();

// STAND-IN for login (see middleware/auth.js): lists the seeded accounts the
// navbar's "Acting as" switcher can pick from. Remove when real auth exists.
router.get('/users', async (_req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  res.json({ users: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role })) });
});

export default router;
