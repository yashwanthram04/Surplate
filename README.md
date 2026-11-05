# Surplate

Bakeries post leftover food; charities and individuals find it on a map and collect it before the pickup window closes.
IS216 group project, Group 5 (section G7).

**Stack:** Vue 3 (Vite, vue-router, Pinia) · Bootstrap 5 · GSAP (ScrollTrigger, SplitText) + Lenis (animation) · Express · MongoDB (Mongoose) · OneMap API + Leaflet

## What is built so far

### Home page
Scroll-driven landing page that explains the app, built from a few purposeful scenes and nothing decorative: a split-text hero with gentle mouse parallax,
a **mission statement whose words light up as you scroll**, live numbers from the API, a **pinned "how it works" scene** that plays post, find and collect as you scroll,
a dark circle that grows from a single dot to swallow the page while the 790,000-tonne figure (NEA, cited) counts with your scroll, the newest listings, and
sideways-scrolling audience cards. The rest of the app gets route cross-fades, staggered listing cards that glide into place when you filter, and countdown rings that pulse in their last ten minutes.

- Built with **GSAP + ScrollTrigger + SplitText** (all in the free GSAP package) and **Lenis** smooth scrolling. All of it lives in `client/src/composables/useHomeMotion.js`; the markup in `HomeView.vue` only carries `data-*` hooks.
- **Accessible by default:** with "reduce motion" on, or on phones, the page is the plain stacked layout (no pinning, no smooth-scroll hijacking, no looping decoration), and the animated headline keeps its real text for screen readers.
- Pinned scenes only run on wide screens; ScrollTriggers must be created top-to-bottom in page order (see the comment in `useHomeMotion.js`).
- **Everyday pages** (browse board, My listings, listing page) use a quieter set in `client/src/composables/useMotion.js`: new cards rise in one after another, a removed card shrinks away while the rest close the gap, cards that stay **glide** to their new places when a filter or sort changes the list (GSAP Flip), the listing photo eases in, and countdown rings draw themselves in. Transform and opacity only, and none of it runs for visitors who prefer reduced motion.
`client/src/views/HomeView.vue`, `client/src/home.css`

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

### Reservations and no-show handling
Charities and individuals reserve food for a collection slot; bakeries confirm the pickup with a code. Food that is not collected goes back on the board automatically.

| Capability | Where |
|---|---|
| **Choose a collection slot length** (15, 30 or 60 minutes) on the listing form; the pickup window is split into slots of that length | `ListingFormView.vue`, `server/src/utils/slots.js` |
| **Reserve food:** pick a whole quantity and a slot that has not ended (charities and individuals). Checked in the form and again on the server; stock is decremented in one MongoDB transaction, so a listing can't be oversold. Stock refreshes every 15 seconds | `ReserveView.vue`, `ReservationFields.vue`, `server/src/routes/reservations.js` |
| **Reservation code:** every reservation gets a 6-character code, unique among that bakery's open orders | `server/src/services/reservations.js` |
| **My reservations:** see your codes and history, **change** the quantity or slot until the slot ends, or **cancel** an open reservation (stock is restored once). Bakeries see their order history here | `ReservationsView.vue` |
| **Orders (bakery):** type in the customer's code to find the order and **confirm the collection**; a confirmation without the matching code is rejected. Filters: **To collect** (grouped by slot), **Due soon** (released within 30 minutes, with a countdown) and **No-shows** (missed in the last 7 days), each with a count | `OrdersView.vue` |
| **No-show handling:** a reservation not collected within **15 minutes** after its slot ends becomes `missed` and its food goes back on the listing. The server releases them every minute and before the board, orders or history are read. Staff can **release a no-show** sooner once its slot has started | `server/src/services/reservations.js`, `OrdersView.vue` |
| **Reminders:** a banner appears when a slot starts within 30 minutes (per reservation for recipients, per slot for bakery staff), with an optional browser notification while Surplate is open. No email or push | `SlotReminders.vue` |
| **Reliability check:** collected ÷ (collected + missed) over your last 10 finished pickups in the past 30 days. Below 80%: one open reservation at a time. Below 50% with at least 3 misses: no new reservations. Misses stop counting after 30 days, so blocked accounts recover. The score is shown on the reservation form and My reservations | `ReliabilityNotice.vue`, `ReliabilityPanel.vue` |

- **Statuses:** `reserved` → `collected` | `cancelled` | `missed`. Older `expired` records are shown as `missed`.
- Pickup times and address cannot change once stock has been reserved. Removing a listing or deleting an account cancels its pending reservations in the same transaction; collected records remain.
- Needs a MongoDB replica set (including Atlas) for the transactions; local development and tests start their own. Endpoints are listed under [API integration](#api-integration).
- `server/src/routes/reservations.js`, `server/src/services/reservations.js`, `server/src/utils/slots.js` · `client/src/views/{Reserve,Reservations,Orders}View.vue`
### Charity Needs Board
The Charity Needs Board allows verified charities to post food requests and bakeries to pledge surplus food directly to fulfil these needs. Charities can track their requests and view participating bakeries, while bakeries can manage their pledges.

| Capability | Where |
|---|---|
| **Post food requests:** Verified charities specify the food needed, quantity, deadline and dietary requirements, with form and server-side validation. | `NeedsForm.vue`, `NeedsView.vue`, `server/src/utils/validateNeed.js` |
| **View and track requests:** Bakeries can browse charity requests and monitor the quantity pledged, remaining quantity and fulfilment progress. | `NeedsView.vue`, `NeedsCard.vue` |
| **Edit and cancel requests:** Charities can update their requested quantities or cancel requests. Quantities cannot be reduced below existing pledges. | `NeedsView.vue`, `NeedsCard.vue` |
| **Pledge surplus food:** Bakeries can pledge food towards requests, with validation preventing contributions from exceeding the remaining quantity. | `NeedsView.vue`, `NeedsCard.vue`, `server/src/routes/needs.js` |
| **Manage pledges:** Bakeries can view, edit or withdraw their pledges. Charities can view contributing bakeries, pledged quantities and pickup details. | `MyPledges.vue`, `NeedsCard.vue` |

- **New request notifications:** Bakeries receive an in-app banner when new charity requests are detected while the board is open. The board automatically refreshes every 30 seconds.

`client/src/views/NeedsView.vue`, `NeedsForm.vue`, `NeedsCard.vue`, `MyPledges.vue` · `server/src/routes/needs.js` · `e2e/needsboard.spec.js`

### Community fridges
Public community fridges where anyone can take or leave food. This works **independently of listings and reservations**, so it covers people outside bakery pickup windows.

| Capability | Where |
|---|---|
| Interactive **Leaflet / OneMap** map of community fridges, pins coloured by status (green stocked, amber low, red empty, grey no updates yet), with a list beside it. Filters: status, search text, distance ("My location" or an address), sort. Anyone can browse without logging in | `FridgesView.vue`, `FridgeMap.vue`, `FridgeCard.vue` |
| **Add or edit a fridge** (any logged-in user; the creator or an admin can edit or remove it): name, opening hours, address (OneMap type-ahead), optional photo, notes | `FridgeFormView.vue`, `server/src/utils/validateFridge.js` |
| **Post a status update:** stocked / low / empty, with an optional note on what was dropped off and an optional photo | `FridgeStatusForm.vue`, `FridgeDetailView.vue` |
| **Latest status and "last updated" time** on every card, map popup and detail page. The fridge keeps a copy of its newest update, so the map needs no joins. A status older than 24 hours is marked "may be out of date" on the detail page. The full history is on the detail page, 10 updates at a time | `FridgeStatusBadge.vue`, `server/src/routes/fridges.js` |
| **Stale fridges:** a stocked or low fridge with no update for **48 hours** shows as "stale" ("Food may not be fresh") instead of stocked/low, and has its own map filter. An empty fridge never goes stale | `server/src/utils/serializeFridge.js`, `FridgeCard.vue` |
| **Admin checks:** admins list stale fridges under Spoiled alerts and can mark one as "being checked"; everyone sees the claim for 24 hours or until someone posts an update. When posting the update, an admin can also resolve the fridge's open spoiled reports | `SpoiledAlertsView.vue`, `FridgeDetailView.vue` |
| **Flag spoiled food and notify suppliers** | `SpoiledFlagModal.vue`, `SpoiledAlertsView.vue` |

**How suppliers are notified.** A supplier is a bakery account. Flagging one specific drop-off notifies only the bakery that posted it. A general flag notifies every bakery that posted an update on that fridge in the last 72 hours. A report nobody can be matched to (for example, the drop-off was by an individual) is still stored and shown to admins. Bakeries see a count badge on **Spoiled alerts** in the navigation bar and can read each report (with its photo) at `/spoiled-alerts` and mark it resolved with a note. Admins see every report, and their badge also counts stale fridges nobody is checking yet. The fridge page shows a warning while a report is open. Notifications are in-app only; there is no email.

- Posting an update or flagging food needs a login. Rate limits per person: 10 updates per fridge per hour and 30 across all fridges; one open spoiled report per fridge per hour and 5 reports in total per hour; 10 new fridges per day (admins exempt).
- Photos are JPEG, PNG or WebP up to 2 MB, checked by their file signature, stored in MongoDB and served with the same hardening headers as listing photos. Spoiled-report photos are visible only to the reporter, the notified bakeries and admins.
- Removing a fridge is a soft delete: its history and reports are kept, like listings. Its open spoiled reports are resolved automatically, so bakeries aren't left with alerts for a fridge that is gone.
- Opening hours are free text (for example "24 hours" or "Mon-Sat 8am-9pm"), not a structured schedule.
- `server/src/models/{Fridge,FridgeUpdate,SpoiledReport}.js`, `server/src/routes/fridges.js`, `client/src/views/Fridge*View.vue`, `client/src/utils/fridge.js`

| Endpoint | Access / behavior |
|---|---|
| `GET /api/fridges?q=&status=&lat=&lng=&radiusKm=&sort=` | Anyone; `status` is a comma list of `stocked,low,empty,unknown,stale`; `sort` is `recent`, `distance` or `name` |
| `GET /api/fridges/:id` · `GET /api/fridges/:id/photo` | Anyone |
| `POST /api/fridges` · `PUT /api/fridges/:id` · `DELETE /api/fridges/:id` | Logged in; multipart for the photo; PUT/DELETE only by the creator or an admin |
| `GET /api/fridges/:id/updates?before=<ISO date>&beforeId=<update id>` | Anyone; newest first, 10 per page; `nextBefore` / `nextBeforeId` are null on the last page |
| `GET /api/fridges/:id/updates/:updateId/photo` | Anyone, while the fridge is active |
| `POST /api/fridges/:id/updates` | Logged in; multipart `status`, `note?`, `photo?`, `resolveReports?` (admins only; returns `reportsResolved`) |
| `POST /api/fridges/:id/checking` | Admin; marks a stale fridge as being checked (409 if it isn't stale) |
| `POST /api/fridges/:id/spoiled` | Logged in; multipart `items`, `note?`, `updateId?`, `photo?`; returns `suppliersNotified` |
| `GET /api/fridges/alerts?status=open\|resolved` · `GET /api/fridges/alerts/count` | Bakery (reports sent to it) or admin (all); for admins the count also returns `reports` and `stale` separately |
| `GET /api/fridges/alerts/stale` | Admin; stale fridges, oldest update first |
| `GET /api/fridges/alerts/:reportId/photo` | The reporter, the notified bakeries or an admin |
| `POST /api/fridges/alerts/:reportId/resolve` | The notified bakery or an admin; JSON `{ resolution? }`; once only |

## Shared page styling

`SiteBanner.vue` provides the green banner, food decorations and page-specific icon;
use its `compact` prop for forms and task pages. Keep each page's title, description
and actions in its slot, with `BouncingHeading.vue` for accessible animated titles.
The floating food backdrop is mounted once in `App.vue` on interior pages. Heading
fonts and colours come from `style.css`; the existing home, fridge and Thank-you
Wall illustrations and scroll effects remain in their own components. All new
title and decoration animations honour reduced motion.

Check responsive banner layouts with `npx playwright test e2e/site-style.spec.js`.

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
npm run test:unit        # Vitest: unit, component and integration tests for the client (jsdom, no browser, ~2 s)
npm run test:api         # API tests (node:test): accounts, verification, visibility, validation, ownership, expiry, filters
npm run test:e2e         # Playwright E2E in Chromium (first time: npx playwright install chromium)
npm test                 # all three
```

| Level | Tool | Where | What it covers |
|---|---|---|---|
| Unit (functions) | Vitest | `client/src/utils/__tests__/time.spec.js` | Countdown and pickup-window formatting, datetime-local conversion |
| Unit (functions) | Vitest | `client/src/utils/__tests__/reviews.spec.js`, `wallMotion.spec.js` | Thank-you form validation (limits and edge cases), score colours, note colour/tilt/sway, ticker quotes, "time ago", default nicknames; the wall's tilt and scroll-sway maths, stamps and magnetic buttons, and that its animations stay still with reduced motion |
| Unit (functions) | node:test | `server/test/listing-rules.test.js` | Listing validation, photo checks (by magic bytes) and who may see a listing, with no database |
| Component | Vitest + Vue Test Utils | `client/src/components/__tests__/` (`CountdownRing`, `ListingCard`, `ListingFilters`, `StarRating`, `ThankYouNote` (stubbed stars), `ReliabilityGauge` (stubbed counter), `ThankYouTicker`), `components/home/__tests__/CountUp.spec.js`, `composables/__tests__/useMotion.spec.js` | One component in isolation: what it shows for each prop, what it emits, reduced motion and clean-up |
| Integration | Vitest + Vue Test Utils | `components/__tests__/ListingCardIntegration.spec.js`, `views/__tests__/BrowseView.spec.js` | Card + ring on one shared clock; the browse page with the real card and filters and a mocked API (debounce, stale responses, errors, 15 s refresh, closing windows) |
| Integration | Vitest + Vue Test Utils | `components/__tests__/ReviewModalIntegration.spec.js`, `views/__tests__/BakeryWallView.spec.js` | The thank-you form with the real star pickers, live sticky-note preview and Pinia stores (validation, posting, charity notes, server errors, editing); the Thank-you Wall with real notes and confirm dialog for a visitor, the bakery's staff (pin, reply) and a note's author (edit, delete) |
| Unit (functions) | node:test | `client/test/fridge.test.js`, `server/test/fridgeUtils.test.js` | Fridge status labels, "time ago" and out-of-date checks; fridge, update and spoiled-report validation, photo checks and serialisation, with no database |
| API | node:test | `server/test/*.test.js` | Every route end to end against an in-memory MongoDB |
| End to end | Playwright | `e2e/*.spec.js` | Full user journeys in a real browser |

Every suite starts its **own** in-memory database or mocks the API, so none touches shared data (even if `server/.env`
points at Atlas) and all are repeatable. E2E tests also fail on any uncaught error in the page. The OneMap lookup is mocked in the
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
- `/impact`: personal and platform totals, daily/monthly trend charts with metric and scope controls, recipient mix, organisation contribution bars, and the five most rescued foods. Inclusive date filters and 30/90-day presets use collection time in Singapore; the platform counts each collection once. Quiet periods are shown as zero, and a table provides the trend values. Data refreshes every minute while visible and when returning to the tab; failed refreshes retain the last response.
- Community pulse shows current fridge status counts (including stale updates) and pledge progress toward open, unexpired charity needs, independently of collection date filters. Fridge updates and pledges are not counted as confirmed food rescues. The dashboard uses native SVG and GSAP ScrollTrigger: cards reveal once as you reach them, with their bars, rings, trend lines and counters animating on entry. It honours reduced motion and cleans up requests, tweens and scroll triggers when leaving the page. Chart utility checks: `node --test client/test/impact.test.js`; API/browser coverage: `server/test/impact.test.js`, `e2e/impact.spec.js`.
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

## Reviews, Thank-you Wall and reliability

Recipients thank a bakery after a collection; bakery staff rate their customers; both sides get a reliability score; a blocked recipient can appeal.
Code that touches shared files is marked `REVIEWS FEATURE` in comments.

| Capability | Where |
|---|---|
| **Say thanks** after a collected pickup: 1–5 stars for the food and for how accurate the listing was, a short note (3–200 characters), quick-compliment chips, and a nickname shown instead of the account name. A **live preview** of the sticky note updates as you type. A floating toast (and a button on My reservations) invites it for 30 days after collection | `ReviewModal.vue`, `ReviewPrompt.vue`, `StarRating.vue`, `stores/reviews.js` |
| **Charities can thank on behalf of the people they serve** ("our Tuesday volunteers", number of people served) | `ReviewModal.vue`, `server/src/utils/validateReview.js` |
| **Thank-you Wall** at `/bakeries/:id`, public: notes on tilted sticky notes, pinned ones first, the bakery's reply, filters (all / pinned / from charities), totals, rating bars and the bakery's reliability gauge | `BakeryWallView.vue`, `ThankYouNote.vue` |
| **Staff tools on their own wall:** pin up to 3 notes, reply (or clear a reply) | `ThankYouNote.vue`, `server/src/routes/reviews.js` |
| **Running thank-you count** on every listing card and detail page, linking to the wall | `ListingCard.vue`, `server/src/services/reputation.js` |
| **Bakeries rate customers** on punctuality (1–5, optional comment) for collected pickups from the last 30 days | `RateCustomersView.vue` at `/ratings` |
| **Reliability scores** (below), shown as an animated gauge on the wall, My account, My reservations and the reservation form | `ReliabilityGauge.vue`, `ReliabilityPanel.vue`, `ReliabilityNotice.vue` |
| **Temporary block and appeals:** a blocked recipient sees when the block should lift and can appeal (20–500 characters). An admin approves (the block is lifted for 7 days, one reservation at a time) or declines with a reason the recipient sees. One open appeal at a time; 24 hours before appealing again after a decline | `AppealStatus.vue`, `AdminAppealsView.vue` at `/admin/appeals`, `server/src/routes/appeals.js` |

**How the scores are built**
- **Recipient** = 80% pickups collected (the existing no-show record: last 10 finished pickups in 30 days) + 20% punctuality as rated by bakeries (1 star = 0%, 5 stars = 100%; last 20 ratings in 90 days). Punctuality only counts once there are 3 ratings. The combined score feeds the existing reservation check (below 80%: one open reservation; below 50% with 3+ misses: blocked), so ratings and no-shows both matter. `reliabilityFor` in `server/src/services/reservations.js`.
- **Bakery** = 60% listing accuracy + 40% food rating, from recipients' notes. Needs 3 notes; until then it shows "New on Surplate". 85+ is "Excellent", 70+ "Good", otherwise "Needs attention". `bakeryReputation` in `server/src/services/reputation.js`.
- Notes show only the nickname, never the account behind them.

| Endpoint | Access / behavior |
|---|---|
| `GET /api/reviews/bakery/:id?page=` | Anyone; reputation summary and notes (12 per page), pinned first |
| `GET /api/reviews/pending` · `POST /api/reviews` | Charity/individual; JSON `{ reservationId, foodRating, accuracyRating, note, nickname?, onBehalfOf?, peopleServed? }` for a collected pickup; one note per pickup |
| `PATCH /api/reviews/:id` · `DELETE /api/reviews/:id` | The note's author; edit with the same fields and rules as posting (within 30 days; the pin and reply stay) / delete, after which the pickup can be thanked again |
| `PATCH /api/reviews/:id/pin` · `PUT /api/reviews/:id/reply` | Owning bakery; `{ pinned }` (max 3) / `{ text }` (max 140, empty clears) |
| `GET /api/reviews/to-rate` · `POST /api/reviews/rate` | Bakery; `{ reservationId, punctuality, comment? }`, once per pickup |
| `GET /api/reviews/me` | Recipient: reliability, recent ratings, latest appeal. Bakery: reputation |
| `POST /api/appeals` · `GET /api/appeals?status=` · `POST /api/appeals/:id/decision` | Blocked recipient files; admin lists and decides (`approve` / `deny` with a note) |

Demo data: Sunrise Bakery has five notes (one pinned, two replies, charity notes). Log in as **Alex** to see the "Say thanks" banner (one pickup waiting), as **Sunrise** to rate Alex, and as **Sam** (blocked) to file an appeal that **admin** can then decide.
Motion (GSAP + Lenis, `client/src/utils/wallMotion.js`, `ThankYouTicker.vue`):
- **Smooth scrolling** (Lenis, fed into ScrollTrigger) on the Thank-you Wall and Rate customers.
- **Notes sway with the scroll** like paper in a draft, each by its own amount, swinging from the tape at the top; pinned notes barely move.
- **Parallax hero:** the background blobs and floating emoji drift at different speeds as you scroll and lean after the mouse; the reliability gauge turns as the hero leaves.
- **Thank-you ticker:** recent quotes drift across under the hero, speed up and turn round with the scroll and slow down under the mouse; clicking one glides to that note and makes it glow.
- The bakery's name **writes itself in** letter by letter; the **rating bars fill** when scrolled into view.
- Notes **tilt towards the mouse** with a glint of light; an edited note **flips over**; a deleted note is **crumpled and tossed away**.
- **Magnetic** "Say thanks" and "Post to the wall" buttons; a **rubber stamp** ("Rated", "Approved", "Declined") lands on rated customers and decided appeals.
All motion respects the "reduce motion" setting.

Tests for this feature (run all of them with `npm test`, or one level at a time):

```bash
cd client
npx vitest run src/utils/__tests__/reviews.spec.js src/utils/__tests__/wallMotion.spec.js   # unit
npx vitest run src/components/__tests__/StarRating.spec.js src/components/__tests__/ThankYouNote.spec.js src/components/__tests__/ReliabilityGauge.spec.js src/components/__tests__/ThankYouTicker.spec.js   # component
npx vitest run src/components/__tests__/ReviewModalIntegration.spec.js src/views/__tests__/BakeryWallView.spec.js   # integration
cd ..
node --test server/test/reviews.test.js   # API + database
npx playwright test e2e/reviews.spec.js   # end to end
```

## Hooks for the other features

- `req.user`, `requireLogin`, `requireRole(...)` provide server authentication; `useSession()` mirrors it in Vue.
- `canView(listing, user, now)` and `visibilityFilter(user, now)` centralise charity priority and legacy listing visibility.
- `Reservation` is the source of completed impact; do not infer rescued food from `quantity - quantityRemaining` or listing status.
