import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './db.js';
import { seedDemoData } from './seed.js';

const db = await connectDb();
if (db.usingMemory) await seedDemoData();

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => console.log(`Surplate API listening on http://localhost:${port}`));
