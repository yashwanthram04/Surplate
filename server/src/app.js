import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { attachUser } from './middleware/auth.js';
import demoRoutes from './routes/demo.js';
import geocodeRoutes from './routes/geocode.js';
import listingRoutes from './routes/listings.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', attachUser);

  app.use('/api/demo', demoRoutes);
  app.use('/api/geocode', geocodeRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production the built Vue app is served from the same server (index.html at the root).
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });
  return app;
}
