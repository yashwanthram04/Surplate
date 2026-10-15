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
| Sees on the board | public listings + its own | **every listing once verified**; public listings while pending | listings after charity priority ends |

- Register, log in/out (passwords hashed with bcrypt; login is an `httpOnly` cookie holding a signed token), view and edit your profile, change your password, delete your account.
- Five wrong passwords lock a login for ten minutes.
- An **admin** reviews charities at `/admin/charities` (approve, or reject with a reason the charity sees). A charity that changes its registration number goes back to pending.
- `server/src/routes/auth.js`, `admin.js` · `client/src/views/{Login,Register,Profile,AdminCharities}View.vue`

### Food listings
| Capability | Where |
|---|---|
| Listing form with validation: photo, item, quantity, allergen + dietary tags, best-before, pickup window | `ListingFormView.vue`, `server/src/utils/validate.js` |
| **Who can see it:** new listings have a timed charity priority period, then open to everyone; older listings retain their sharing setting | `ListingFormView.vue`, `server/src/utils/visibility.js` |
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

With no configuration the API starts a **temporary in-memory MongoDB replica set** and seeds it with demo accounts and listings,
so it works straight away. The data is lost on restart.

To use the team's shared MongoDB Atlas database instead:

```bash
cp server/.env.example server/.env     # then fill in MONGODB_URI (and JWT_SECRET)
npm --prefix server run seed           # seeds demo users + listings (skips if users already exist)
npm --prefix server run seed:reset     # wipes users, listings and reservations first. Do this before a demo to refresh the times
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

## Reservations and impact

- `/listings/:id/reserve`: charities and individuals reserve a whole quantity. Stock and history are written in one MongoDB transaction, preventing overselling and partial writes.
- `/reservations`: recipients see paginated history; bakeries see their collections and confirm handover during the recorded pickup window. Either party can cancel an open reservation; stock is restored once. Missed pickups appear as expired when read. Expired stock stays off the board because its pickup window has closed.
- `/impact`: personal and platform totals, organisation breakdowns, and inclusive date filters based on collection time in Singapore. The platform counts each collection once, regardless of its bakery/recipient breakdowns.
- New listings and reposts open to everyone after `CHARITY_PRIORITY_MINUTES` (default **15**). Verified charities can browse and reserve during priority; all other recipients wait. Board, detail, photo, stats and reservation APIs enforce the same visibility policy. Editing does not restart priority or let an old sharing flag bypass it.
- Existing listings without `priorityUntil` retain the previous `visibleToIndividuals` rule. No existing data is automatically changed. Reposting adopts the new timed policy.
- Add **grams per reservable unit/pack** in the listing form. Older records without weight must be edited before they can be reserved. Existing records without completed reservations do not contribute to impact.
- Only `collected` reservations contribute to kilograms and estimated meals. The default estimate is **500 g per meal**, configurable through `GRAMS_PER_MEAL`. This is a product assumption, not a nutritional standard. Each reservation snapshots weight, conversion, organisation names and pickup details so subsequent edits/deletions cannot rewrite historical impact.
- Pickup times/address cannot change once stock has been reserved. Removing a listing or deleting an account cancels its pending reservations in the same transaction; collected records remain.
- The demo seed contains completed, cancelled and expired reservation examples on the historical Kaya toast listing. Existing shared databases are not reseeded automatically.

### API integration

| Endpoint | Access / behavior |
|---|---|
| `POST /api/reservations` | Charity/individual; JSON `{ listingId, quantity }` |
| `GET /api/reservations/mine?page=1` | Own recipient history or bakery collections; 20 per page |
| `POST /api/reservations/:id/cancel` | Owning recipient or bakery; open reservations only |
| `POST /api/reservations/:id/collect` | Owning bakery; during pickup only; repeated collection is rejected |
| `GET /api/impact?from=YYYY-MM-DD&to=YYYY-MM-DD` | Logged-in accounts; own totals plus platform and organisation aggregates; no individual recipient details in platform results |
| `GET /api/stats` | Existing board inventory figures, kept separate from completed impact |

**Database requirement:** use a MongoDB replica set (including Atlas) for transactions. Local development and tests start their own temporary one-member replica set automatically. A standalone MongoDB server does not support these transactional workflows.

## Hooks for the other features

- `req.user`, `requireLogin`, `requireRole(...)` provide server authentication; `useSession()` mirrors it in Vue.
- `canView(listing, user, now)` and `visibilityFilter(user, now)` centralise charity priority and legacy listing visibility.
- `Reservation` is the source of completed impact; do not infer rescued food from `quantity - quantityRemaining` or listing status.
