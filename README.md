# Surplate

Bakeries post leftover food; charities and individuals find it on a map and collect it before the pickup window closes.
IS216 group project, Group 5 (section G7).

**Stack:** Vue 3 (Vite, vue-router, Pinia) · Bootstrap 5 · motion-v (animation) · Express · MongoDB (Mongoose) · OneMap API + Leaflet

## What is built so far

### Home page
Animated landing page that explains the app: hero, live numbers from the API, how it works, the problem (with a cited NEA statistic),
the newest listings, and a sign-up path for each kind of user. All motion respects the visitor's "reduce motion" setting.
`client/src/views/HomeView.vue`

### Accounts
| | Bakery / restaurant | Charity | Individual |
|---|---|---|---|
| Sign-up | instant | **needs admin verification** (registration number) | instant, no verification |
| Post and manage listings | yes | no | no |
| Sees on the board | shared listings + its own | **every listing once verified**; shared listings while pending | shared listings only |

- Register, log in/out (passwords hashed with bcrypt; login is an `httpOnly` cookie holding a signed token), view and edit your profile, change your password, delete your account.
- Five wrong passwords lock a login for ten minutes.
- An **admin** reviews charities at `/admin/charities` (approve, or reject with a reason the charity sees). A charity that changes its registration number goes back to pending.
- `server/src/routes/auth.js`, `admin.js` · `client/src/views/{Login,Register,Profile,AdminCharities}View.vue`

### Food listings
| Capability | Where |
|---|---|
| Listing form with validation: photo, item, quantity, allergen + dietary tags, best-before, pickup window | `ListingFormView.vue`, `server/src/utils/validate.js` |
| **Who can see it:** a per-listing switch, "also show it to individuals" (default off = charities only) | `ListingFormView.vue`, `server/src/utils/visibility.js` |
| Address to coordinates with the **OneMap search API** (type-ahead), shown on a **Leaflet** map | `AddressSearch.vue`, `server/src/routes/geocode.js`, `ListingMap.vue` |
| "My listings": view, edit, remove, one-click **Re-post** | `MyListingsView.vue` |
| Listings **expire automatically** when the pickup window closes (they leave the board; the record is kept) | `server/src/routes/listings.js`, `BrowseView.vue` |
| Filters: distance, dietary tags, avoid-allergens, open now, ending soon, text search, sort; results update **without a page reload** | `ListingFilters.vue`, `BrowseView.vue` |
| **Countdown ring** on every listing | `CountdownRing.vue` |
| Listing detail page with a link on to the reservation form | `ListingDetailView.vue` |

Hidden listings are hidden by the **server** (board, detail page and photo all return nothing/404), not just in the UI.

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
cp server/.env.example server/.env     # then fill in MONGODB_URI (and JWT_SECRET)
npm --prefix server run seed           # seeds demo users + listings (skips if users already exist)
npm --prefix server run seed:reset     # wipes users + listings first. Do this before a demo to refresh the times
```

### Demo accounts

Seeded by the commands above. **Every account uses the password `demo1234`.** The login page has one-click buttons for them.
These are for the course demo only: never seed them into a real deployment (the seed refuses to run with `NODE_ENV=production`).

| Email | Role |
|---|---|
| `sunrise@demo.surplate.sg` | Bakery (also `crumb@…` and `goldenloaf@demo.surplate.sg`) |
| `hope@demo.surplate.sg` | Charity, **verified** |
| `newhope@demo.surplate.sg` | Charity, **pending** (in the admin's queue) |
| `alex@demo.surplate.sg` | Individual |
| `admin@demo.surplate.sg` | Admin |

## Tests

```bash
npm run test:api         # API tests (node:test): accounts, verification, visibility, validation, ownership, expiry, filters
npm run test:e2e         # Playwright E2E in Chromium (first time: npx playwright install chromium)
npm test                 # both
```

Both suites start their **own** in-memory database with fresh demo data, so they never touch shared data (even if `server/.env`
points at Atlas) and are repeatable. E2E tests also fail on any uncaught error in the page. The OneMap lookup is mocked in the
browser tests and exercised for real by hand. Reports: `playwright-report/`.

## Production build

```bash
npm run build                                  # client -> client/dist
MONGODB_URI=... JWT_SECRET=... npm start       # Express serves the API and the built app (index.html at the root) on $PORT
```

## Hooks for the other features

- **Who is logged in:** `req.user` on the server (`middleware/auth.js`: `requireLogin`, `requireRole(...)`) and `useSession()` on the client (`isBakery`, `isVerifiedCharity`, `hasFullAccess`, …).
- **Reservations:** the detail page's *Reserve* button goes to `/listings/:id/reserve` (placeholder view, login required). Only ever change
  `Listing.quantityRemaining`, atomically: `findOneAndUpdate({ _id, quantityRemaining: { $gte: n } }, { $inc: { quantityRemaining: -n } })`,
  and check `canView(listing, req.user)` first. Removing a listing or deleting a bakery account has `TODO`s to cancel open reservations.
- **Cascade / Charity board:** listings carry a `bakery`, `dietaryTags`, `allergens`, `visibleToIndividuals`, `location` (GeoJSON, 2dsphere indexed) and a pickup window; verified charities are the users with `verification.status === 'approved'`.
- **Impact dashboard:** listings are never hard-deleted or expired in the database. "Expired" is derived from `pickupEnd`.

