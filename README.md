# Surplate

Bakeries post leftover food; charities and individuals find it on a map and collect it before the pickup window closes.
IS216 group project, Group 5 (section G7).

**Stack:** Vue 3 (Vite, vue-router, Pinia) · Bootstrap 5 · Express · MongoDB (Mongoose) · OneMap API + Leaflet

## What is built so far: Surplate Food Listing, Browsing & Searching

| Capability | Where |
|---|---|
| Listing form with validation: photo, item, quantity, allergen + dietary tags, best-before, pickup window | `client/src/views/ListingFormView.vue`, `server/src/utils/validate.js` |
| Address to coordinates with the **OneMap search API** (type-ahead), shown on a **Leaflet** map | `client/src/components/AddressSearch.vue`, `server/src/routes/geocode.js`, `ListingMap.vue` |
| "My listings": view, edit, remove, one-click **Re-post** | `client/src/views/MyListingsView.vue` |
| Listings **expire automatically** when the pickup window closes (they leave the board; the record is kept) | `server/src/routes/listings.js` (query), `BrowseView.vue` (live) |
| Filters: distance, dietary tags, avoid-allergens, open now, ending soon, text search, sort. Results update **without a page reload** | `ListingFilters.vue`, `BrowseView.vue` |
| **Countdown ring** on every listing | `client/src/components/CountdownRing.vue` |
| Listing detail page with a link on to the reservation form | `client/src/views/ListingDetailView.vue` |

## Run it locally

Requires Node 20+.

```bash
npm run install:all      # root + server + client dependencies
npm run dev              # API on :3000, web app on :5173 (open http://localhost:5173)
```

With no configuration the API starts a **temporary in-memory MongoDB** and seeds it with demo accounts and listings,
so it works straight away. The data is lost on restart.

To use the team's shared MongoDB Atlas database instead:

```bash
cp server/.env.example server/.env     # then paste the Atlas connection string into MONGODB_URI
npm --prefix server run seed           # seeds demo users + listings (skips if users already exist)
npm --prefix server run seed:reset     # wipes users + listings first. Do this before a demo to refresh the times
```

### Demo accounts (stand-in for login)

The Accounts feature isn't merged yet, so the navbar has a **Demo account** menu that switches between seeded users
(3 bakeries, a charity, an individual). Only bakery accounts can post and manage listings.
Replace with real auth: `server/src/middleware/auth.js` (`attachUser`) and `client/src/stores/session.js`.
The listing routes only depend on `req.user`.

## Tests

```bash
npm run test:api         # API tests (node:test): validation, ownership, expiry, filters, edit, re-post
npm run test:e2e         # Playwright E2E in Chromium (first time: npx playwright install chromium)
npm test                 # both
```

E2E tests start their own API (port 3100, in-memory database, freshly seeded) and web server (port 5273),
so they never touch shared data and are repeatable. The OneMap lookup is mocked in the browser tests and
exercised for real by hand. Reports: `playwright-report/`.

## Production build

```bash
npm run build            # client -> client/dist
MONGODB_URI=... npm start    # Express serves the API and the built app (index.html at the root) on $PORT
```

## Hooks for the other features

- **Reservations:** the detail page's *Reserve* button goes to `/listings/:id/reserve` (placeholder view). Only ever change
  `Listing.quantityRemaining`, atomically: `findOneAndUpdate({ _id, quantityRemaining: { $gte: n } }, { $inc: { quantityRemaining: -n } })`.
  Editing a listing already keeps `quantityRemaining` consistent with what is reserved. Removing a listing has a `TODO` to cancel its reservations.
- **Cascade / Charity board:** listings are plain documents with a `bakery`, `dietaryTags`, `allergens`, `location` (GeoJSON, 2dsphere indexed) and a pickup window, which is what ranking by distance and dietary match needs.
- **Impact dashboard:** listings are never hard-deleted or expired in the database. "Expired" is derived from `pickupEnd`.

## Credits and AI usage

- Libraries: Vue, vue-router, Pinia, Axios, Bootstrap, Bootstrap Icons, Leaflet, Express, Mongoose, Multer, Playwright (all free / open source).
- Data and tiles: [OneMap](https://www.onemap.gov.sg/) search API and map tiles © Singapore Land Authority.
- **AI/LLM disclosure (required by the course):** the code for this feature (listing form, API routes, filters, map, countdown ring, tests, this README)
  was generated with Claude (Anthropic) and then reviewed and run by the team. Update this section to say exactly which parts you wrote yourselves
  and which relied on AI before submission.
