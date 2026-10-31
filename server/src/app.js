import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
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
