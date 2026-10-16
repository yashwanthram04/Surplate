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
| `sam@demo.surplate.sg` | Individual with three missed pickups: **blocked** by the reliability check |
| `admin@demo.surplate.sg` | Admin |

The seed also gives Hope Kitchen an open order for 2 sourdough loaves at Sunrise Bakery in the slot starting 30 minutes after
the listing opens, with reservation code **`HKT4X2`**. Log in as Sunrise Bakery and open **Orders** to confirm it.

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

- **Collection slots:** the bakery chooses a slot length (15, 30 or 60 minutes) on the listing form, and the pickup window is split into slots of that length (the last one ends with the window). Listings posted before this change use 30 minutes.
- `/listings/:id/reserve`: charities and individuals choose a whole quantity and a slot that has not ended. Both are checked in the form and again on the server. The stock decrement, the reliability check and the reservation are written in one MongoDB transaction, so the listing can't be oversold. The reservation form and the board refresh stock every 15 seconds.
- Each reservation gets a 6-character **reservation code** (no 0/O/1/I/L), unique among the bakery's open orders.
- `/reservations` (**My reservations**): recipients see their codes and history, can **change** the quantity or slot until the slot ends, and can cancel an open reservation (stock is restored once). Bakeries see their order history here.
- `/orders` (bakery **Orders**): staff type in the customer's code to find the order and confirm the collection; the server rejects a confirmation without the matching code. Filters: **To collect** (open orders grouped by slot), **Due soon** (released automatically within 30 minutes, with a countdown) and **No-shows** (missed in the last 7 days, released by staff or automatically), each with a count.
- **Statuses:** `reserved` → `collected` | `cancelled` | `missed`. A reservation not collected within **15 minutes** after its slot ends (`MISSED_GRACE_MINUTES`) becomes `missed` and its food goes back on the listing. The server releases them every minute and before the board, orders or history are read. Staff can **release a no-show** sooner once its slot has started. Older `expired` records are shown as `missed`.
- **Reminders:** a banner appears in the app when a slot starts within 30 minutes (per reservation for recipients, per slot for bakery staff), with an optional browser notification while Surplate is open in a tab. There is no email or push: nothing is sent when the app is closed.
- **Reliability score** = collected ÷ (collected + missed) over the recipient's last 10 finished pickups in the past 30 days. Below 80%: one open reservation at a time. Below 50% with at least 3 misses: no new reservations. Misses stop counting after 30 days, so blocked accounts recover. The score is shown on the reservation form and My reservations.
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
| `POST /api/reservations` | Charity/individual; JSON `{ listingId, quantity, slotStart }` (`slotStart` is the ISO start of a slot that has not ended); refused with 403 when the reliability score does not allow it |
| `PATCH /api/reservations/:id` | Owning recipient, until the slot ends; JSON `{ quantity?, slotStart? }` |
| `GET /api/reservations/reliability` | Charity/individual; score, counts, level (`good`/`limited`/`blocked`) and the rules |
| `GET /api/reservations/upcoming` | Bakery/recipient; open reservations whose slot starts within 30 minutes or is under way (reminders) |
| `GET /api/reservations/orders?view=open\|due\|missed` | Bakery; open orders (earliest slot first), those released within 30 minutes, or no-shows from the last 7 days (newest first); includes a count for each view |
| `GET /api/reservations/lookup?code=` | Bakery; the reservation at this bakery with that code (spaces/dashes and case ignored) |
| `GET /api/reservations/mine?page=1` | Own recipient history or bakery collections; 20 per page |
| `POST /api/reservations/:id/cancel` | Owning recipient or bakery; open reservations only |
| `POST /api/reservations/:id/collect` | Owning bakery; JSON `{ code }`; from the start of the pickup window until the grace period ends; repeated collection is rejected |
| `POST /api/reservations/:id/release` | Owning bakery; once the slot has started; marks it `missed` and returns the food to the listing |
| `GET /api/impact?from=YYYY-MM-DD&to=YYYY-MM-DD` | Logged-in accounts; own totals plus platform and organisation aggregates; no individual recipient details in platform results |
| `GET /api/stats` | Existing board inventory figures, kept separate from completed impact |

**Database requirement:** use a MongoDB replica set (including Atlas) for transactions. Local development and tests start their own temporary one-member replica set automatically. A standalone MongoDB server does not support these transactional workflows.

## Hooks for the other features

- `req.user`, `requireLogin`, `requireRole(...)` provide server authentication; `useSession()` mirrors it in Vue.
- `canView(listing, user, now)` and `visibilityFilter(user, now)` centralise charity priority and legacy listing visibility.
- `Reservation` is the source of completed impact; do not infer rescued food from `quantity - quantityRemaining` or listing status.
