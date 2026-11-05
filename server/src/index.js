import 'dotenv/config';
import { createApp } from './app.js';
import { jwtSecret } from './config.js';
import { connectDb } from './db.js';
import { seedDemoData } from './seed.js';
import { startMissedTimer } from './services/reservations.js';

jwtSecret(); // fail at startup, not at the first login, if production has no JWT_SECRET
const db = await connectDb();
if (db.usingMemory) await seedDemoData();

const app = createApp();

// On Vercel the platform runs the exported app itself: there is no always-on process to hold a port or a timer. Missed
// pickups are also released before the board, orders and history are read, so the results stay correct without it.
if (!process.env.VERCEL) {
  startMissedTimer(); // releases uncollected reservations after their grace period
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Surplate API listening on http://localhost:${port}`));
}

export default app;
