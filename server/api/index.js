// Vercel entry point for the API (the Express app as one serverless function).
// Local development and the tests still use src/index.js; this file is only used on Vercel.
//
// A function instance is reused while it is warm, so the database connection is opened once per instance and shared.
// The "release missed pickups" timer from src/index.js does not run here (there is no always-on process). The server
// also releases missed pickups before the board, orders and history are read, so the results stay correct.
import { createApp } from '../src/app.js';
import { jwtSecret } from '../src/config.js';
import { connectDb } from '../src/db.js';

const app = createApp();
let ready = null;

export default async function handler(req, res) {
  try {
    jwtSecret(); // fails with a clear message if JWT_SECRET is missing
    ready ??= connectDb();
    await ready;
  } catch (err) {
    ready = null; // try again on the next request
    console.error('Could not start the API:', err);
    return res.status(500).json({ error: 'The server is not configured correctly.' });
  }
  return app(req, res);
}
