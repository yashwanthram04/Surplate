import 'dotenv/config';
import { createApp } from './app.js';
import { jwtSecret } from './config.js';
import { connectDb } from './db.js';
import { seedDemoData } from './seed.js';

jwtSecret(); // fail at startup, not at the first login, if production has no JWT_SECRET
const db = await connectDb();
if (db.usingMemory) await seedDemoData();

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => console.log(`Surplate API listening on http://localhost:${port}`));
