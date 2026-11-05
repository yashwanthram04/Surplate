import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { jwtSecret } from './config.js';
import { connectDb } from './db.js';
import { attachUser } from './middleware/auth.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import geocodeRoutes from './routes/geocode.js';
import listingRoutes from './routes/listings.js';
import statsRoutes from './routes/stats.js';
import needRoutes from './routes/needs.js';

import reservationRoutes from './routes/reservations.js';
import impactRoutes from './routes/impact.js';

import fridgeRoutes from './routes/fridges.js';

// >>> REVIEWS FEATURE: ADD these two imports (start)
import reviewRoutes from './routes/reviews.js';
import appealRoutes from './routes/appeals.js';
// <<< REVIEWS FEATURE (end)

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();
  // On Vercel (services mode) the platform may hand the app the path without its /api mount prefix. Put it back, so the
  // routes below work either way. Not used anywhere else.
  if (process.env.VERCEL) {
    app.use((req, _res, next) => {
      if (!/^\/api(\/|\?|$)/.test(req.url)) req.url = `/api${req.url}`;
      next();
    });
  }
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', attachUser);

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/geocode', geocodeRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/impact', impactRoutes);
  app.use('/api/fridges', fridgeRoutes);

  // >>> REVIEWS FEATURE: ADD these two lines (start)
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/appeals', appealRoutes);
  // <<< REVIEWS FEATURE (end)

  app.use('/api/needs', needRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production the built Vue app is served from the same server (index.html at the root).
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });
  return app;
}

// Default export for hosts that import this file and run the app themselves (Vercel). Locally, src/index.js starts the
// server and the tests call createApp(), so this is never used there. A function instance is reused while it is warm, so
// the database is connected once per instance and shared by every request. The one-minute "release missed pickups" timer
// does not run here (there is no always-on process), but missed pickups are also released before the board, orders and
// history are read, so what people see stays correct.
let ready = null;
let app = null;
export default async function handleRequest(req, res) {
  try {
    jwtSecret(); // a clear error in the logs if JWT_SECRET is missing
    ready ??= connectDb();
    await ready;
  } catch (err) {
    ready = null; // try again on the next request
    console.error('Could not start the API:', err);
    return res.status(500).json({ error: 'The server is not configured correctly.' });
  }
  app ??= createApp();
  return app(req, res);
}
