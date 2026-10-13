import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';
import { DEMO_PASSWORD, seedDemoData } from '../src/seed.js';

/**
 * Boots the API on a random port against a private in-memory MongoDB seeded with the demo data.
 * (forceMemory: tests reset the data, so they must never connect to a database named in .env.)
 */
export async function boot() {
  const db = await connectDb({ forceMemory: true });
  await seedDemoData({ reset: true });
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}/api`;

  const cookieFrom = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  /** Logs in and returns the value for a `Cookie` header on later requests. */
  async function login(email, password = DEMO_PASSWORD) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Could not log in as ${email}: ${res.status}`);
    return cookieFrom(res);
  }

  /** fetch against the API. `as` is a cookie string from login(); `json` sends a JSON body. */
  const call = (path, { as, json, ...init } = {}) =>
    fetch(base + path, {
      ...init,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(as ? { cookie: as } : {}), ...init.headers },
    });

  return {
    base,
    call,
    login,
    cookieFrom,
    async close() {
      server.close();
      await db.close();
    },
  };
}
