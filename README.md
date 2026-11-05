# Surplate

Surplate connects bakeries and restaurants with charities and individuals who can collect surplus food before its pickup window closes. Providers publish available food, recipients find nearby listings and reserve collection slots, and bakeries confirm each handover.

Built for **IS216 Web Application Development II · Section G7 · Group 5**.

**Live application:** [surplate.vercel.app](https://surplate.vercel.app)

## Project structure

```text
Surplate/
├── client/
│   ├── src/
│   │   ├── components/   Shared UI components and forms
│   │   ├── composables/  Reusable Vue behaviour and animation
│   │   ├── stores/       Shared state (Pinia)
│   │   ├── utils/        Formatting, validation and chart helpers
│   │   ├── views/        Application pages
│   │   ├── router.js     Page routes and access checks
│   │   └── api.js        API client
│   └── test/            Standalone utility tests
├── server/
│   ├── src/
│   │   ├── models/       MongoDB schemas (Mongoose)
│   │   ├── routes/       API endpoints
│   │   ├── services/     Business logic and shared workflows
│   │   ├── middleware/   Authentication and role checks
│   │   ├── utils/        Validation and policy helpers
│   │   ├── app.js        Express app setup
│   │   ├── index.js      Server entry point
│   │   └── seed.js       Demo data
│   ├── test/            Backend tests
│   └── .env.example     Environment template
├── e2e/                 Playwright browser tests and testing guide
├── package.json         Commands for the whole project
└── playwright.config.js Browser test configuration
```

Client unit and component tests also live beside the source in `__tests__/` folders.

## Documentation map

| Looking for | Start here |
|---|---|
| Run the app | [Local setup](#local-setup) and [demo accounts](#demo-accounts) |
| Understand the app | [Features](#features) and [technology and architecture](#technology-and-architecture) |
| Configure MongoDB | [Configuration and persistent storage](#configuration-and-persistent-storage), [environment template](server/.env.example) |
| Run tests | [Testing](#testing) and the [E2E guide](e2e/README.md) |
| Build or troubleshoot | [Production build](#production-build) and [useful commands and common issues](#useful-commands-and-common-issues) |
| Understand business rules | [Key implementation rules](#key-implementation-rules) |
| Credits and submission | [AI assistance and attribution](#ai-assistance-and-attribution), [image credits](server/src/seed-assets/CREDITS.md) and [team](#team) |

## Local setup

### Prerequisites

- Node.js **24.15 or later within 24.x**, and npm (compatible with the current app and test dependencies).
- Internet access for dependency installation, map services and the initial download required by the temporary MongoDB environment.

Run these commands from the project root:

```bash
npm run install:all
npm run dev
```

Open **http://localhost:5173**. The API runs on **http://localhost:3000**.

If `MONGODB_URI` is unset or empty, the server starts a temporary in-memory MongoDB replica set and seeds demonstration accounts and listings. **This data is lost when the server restarts.** Use MongoDB Atlas for persistent data.

If you already have `server/.env`, its `MONGODB_URI` determines which database the app uses. To explicitly run with temporary demo data:

```bash
MONGODB_URI='' npm run dev
```

Use npm for the commands in this guide. Stop the app with **Ctrl+C**.

## Demo accounts

For the seeded course demonstration, all accounts below use **`demo1234`**. The login page also provides demo-account shortcuts.

| Email | Role | Demonstrates |
|---|---|---|
| `sunrise@demo.surplate.sg` | Bakery | Listings, orders, collection confirmation and donation impact |
| `hope@demo.surplate.sg` | Verified charity | Priority access, reservations and charity requests |
| `newhope@demo.surplate.sg` | Pending charity | Charity verification workflow |
| `alex@demo.surplate.sg` | Individual | Public listings, reservations and thank-you notes |
| `sam@demo.surplate.sg` | Individual | Restricted reservations and appeals |
| `admin@demo.surplate.sg` | Administrator | Charity approvals, appeals and report oversight |

The seed includes a Hope Kitchen reservation for two sourdough loaves at Sunrise Bakery, with collection code **`HKT4X2`**. Its slot starts 30 minutes after the listing opens; collection confirmation remains subject to the permitted time window.

Other examples include historical collections, thank-you notes and no-shows. Seeded history is **demonstration data**, not evidence of real-world donations.

Demo credentials are for course evaluation only. Do not seed them into a public production environment. The seed script refuses to run when `NODE_ENV=production`.

## Features

### 1. Surplus food listings, browsing and search

- Create, edit, remove and repost listings with photos, quantities, recorded unit weights, allergens, dietary tags and pickup details.
- Find food in a list or on an interactive map using OneMap address search and Leaflet.
- Filter by distance, dietary requirements, allergens, pickup availability and search text.
- Show countdowns and hide listings when their pickup windows close.
- Give verified charities an initial priority period before listings open to other recipients.

Visibility is enforced by the server for listings, details and photos, rather than only hiding content in the interface.

### 2. Reservations, collection slots and no-show handling

- Divide pickup windows into 15-, 30- or 60-minute slots.
- Reserve a whole-number quantity and an available collection slot.
- Change or cancel an eligible reservation and restore released stock once.
- Confirm collection using a six-character reservation code.
- Manage upcoming pickups and missed collections through bakery order filters.
- Release missed reservations after the configured grace period.
- Display in-app reminders, with optional browser notifications while the application is open.

Stock changes and reservations use MongoDB transactions to prevent over-reservation.

### 3. Accounts and impact dashboard

- Register, sign in and manage bakery, charity and individual profiles.
- Verify charities through an administrator approval workflow.
- Protect accounts with password hashing, signed authentication tokens in HTTP-only cookies and role-based permissions.
- Show personal and platform totals for collected kilograms, estimated meals and completed collections.
- Explore date-filtered daily or monthly trends, recipient shares, organisation contributions and the most rescued foods.
- Show current fridge conditions and open charity needs separately from completed impact.

Only reservations confirmed as **collected** contribute to completed impact. The dashboard refreshes periodically while visible and retains the last successful data if a later refresh fails.

### 4. Charity Needs Board

- Verified charities post requests with quantities, deadlines and dietary requirements.
- Bakeries pledge food towards requests and manage their pledges.
- Charities track progress and view contributing bakeries and pickup details.
- Validation prevents pledges from exceeding remaining needs or requested quantities from falling below existing pledges.
- New-request notifications appear in the app while the board is open.

### 5. Reviews, Thank-you Wall and reliability

- Recipients review completed pickups for food quality and listing accuracy.
- Public thank-you notes use nicknames; charities can write on behalf of their communities.
- Bakeries pin notes, reply and rate recipient punctuality.
- Reliability indicators use collection history and eligible ratings.
- Restricted recipients can submit an appeal for administrator review.

The Thank-you Wall includes filters, rating summaries and motion effects that respect reduced-motion preferences.

### 6. Community fridge and pantry map

- Browse public food-sharing locations without an account.
- Search and filter locations by distance and reported stock status.
- Signed-in users add locations and post stocked, low or empty updates.
- Show the latest update time and flag reports older than 24 hours as potentially outdated.
- Report spoiled food and notify relevant bakery suppliers in the app.
- Allow authorised users to resolve reports while preserving history.

Community fridge activity works independently of food listings and reservations.

## Technology and architecture

| Layer | Technologies | Purpose |
|---|---|---|
| Frontend | Vue 3, Vite, Vue Router, Pinia | Pages, routing and reactive application state |
| Styling | Bootstrap 5, Bootstrap Icons, custom CSS | Responsive layouts and shared visual styling |
| Motion | GSAP, ScrollTrigger, SplitText, Flip, Lenis | Page transitions, chart animation and scroll effects |
| Backend | Node.js, Express | REST API, validation and access control |
| Data store | MongoDB / MongoDB Atlas, Mongoose | Persistent document storage and transactional workflows |
| Maps | OneMap API, Leaflet | Address lookup, map tiles and interactive location browsing |
| Authentication | bcrypt, signed tokens, HTTP-only cookies | Password protection and authenticated sessions |
| Testing | Vitest, Vue Test Utils, node:test, Playwright | Frontend, backend and browser verification |

The Vue application calls the Express API, which accesses MongoDB through Mongoose. OneMap address requests pass through the backend geocoding route; Leaflet displays the returned coordinates and map tiles. Browser geolocation supports “use my location” when permission is granted.

## Configuration and persistent storage

For a persistent database, copy the environment template. If `server/.env` already exists, edit it instead of overwriting it:

```bash
cp server/.env.example server/.env
```

Fill in the values required by the template, including:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Connection string for a MongoDB replica set, such as Atlas |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `CHARITY_PRIORITY_MINUTES` | Initial charity-only listing period; default: 15 minutes |
| `GRAMS_PER_MEAL` | Estimated meal conversion; default: 500 grams |
| `MISSED_GRACE_MINUTES` | Grace period after a reservation slot; default: 15 minutes |

Keep `.env` and credentials out of version control. Refer to `server/.env.example` for the complete configuration supported by this checkout.

To seed a configured development database:

```bash
npm --prefix server run seed
```

Restart the development server after changing `.env`.

The seed skips initialisation when users already exist; existing shared databases are not automatically refreshed.

**Destructive demo reset:** the following command clears users, listings, reservations, reviews, recipient ratings and appeals before reseeding. Fridge data is kept. Use it only against an agreed disposable development database. Do not run it against shared data without the team's agreement.

```bash
npm --prefix server run seed:reset
```

Reservations require a **MongoDB replica set**. Atlas supports this; a standalone MongoDB server does not support the required transactions. Local development and tests start their own temporary replica set.

## Testing

Run all commands below from the project root. First install the browser for E2E tests:

```bash
npx playwright install chromium
```

Run a suite:

```bash
npm run test:unit
npm run test:api
npm run test:e2e
```

Run all three suites:

```bash
npm test
```

| Level | Tools | Coverage |
|---|---|---|
| Unit and component | Vitest, Vue Test Utils | Helpers, validation, rendered components, emitted events and reduced motion |
| Frontend integration | Vitest, Vue Test Utils | Connected components, stores, filtering, errors and refresh behaviour |
| API and database | node:test, temporary MongoDB | Authentication, permissions, visibility, transactions and impact calculations |
| End to end | Playwright | Complete browser journeys, responsive layouts and error handling |

Suites use isolated temporary databases or mocked APIs rather than shared application data. OneMap lookup is mocked in browser tests; check the live service separately during integration. Playwright starts and stops its own API on port **3100** and web app on port **5273**; you do not need to start the app first. Browser reports are written to `playwright-report/`.

Standalone client utility checks are separate from `npm test`:

```bash
node --test client/test/*.test.js
```

Useful focused checks:

```bash
npm --prefix client test -- src/views/__tests__/BrowseView.spec.js
node --test server/test/impact.test.js
npx playwright test e2e/reservations.spec.js
```

## Production build

Build the client:

```bash
npm run build
```

Configure `MONGODB_URI`, `JWT_SECRET` and the remaining deployment variables in the hosting environment, then start the application:

```bash
NODE_ENV=production npm start
```

Express serves the API and the built client from `client/dist`, with `index.html` as the entry page at the server root. The server uses the configured `PORT`.

Do not expose development demo accounts in a real production deployment. Keep OneMap attribution visible on maps.

## Useful commands and common issues

| Task | Command (from project root) |
|---|---|
| Run only the API | `npm --prefix server run dev` |
| Run only the client | `npm --prefix client run dev` |
| Watch client tests while editing | `npm --prefix client run test:watch` |
| Watch a browser test | `npx playwright test e2e/reservations.spec.js --headed` |
| Open the last browser test report | `npx playwright show-report` |

- **Database connection fails:** check `MONGODB_URI` and Atlas network access, or use `MONGODB_URI='' npm run dev` for temporary data.
- **First startup is slow:** the temporary database downloads MongoDB on its first run. Keep internet access available.
- **Port already in use:** stop the process using 3000 or 5173; E2E tests need 3100 and 5273 free.
- **Playwright cannot find Chromium:** run `npx playwright install chromium`.
- **Demo listings have expired:** restart the app when using temporary data. For a configured database, read the reset warning above before reseeding.

## Key implementation rules

### Completed impact

For each collected reservation:

```text
Kilograms = quantity × recorded grams per unit ÷ 1,000
Estimated meals = quantity × recorded grams per unit ÷ recorded grams per meal
Completed collections = one per confirmed reservation
```

The default meal factor is 500 grams. It is a product estimate, not a nutritional standard or a verified count of people fed.

Reservations snapshot measurement and organisation details to preserve history when listings are edited or removed. Platform totals count each collection once; bakery and charity breakdowns describe different sides of the same transfer and must not be added together.

Date filters use collection time in Singapore. Fridge reports and charity pledges describe current conditions or promised support and do not increase completed-impact totals.

### Reservation lifecycle

```text
reserved → collected | cancelled | missed
```

Stock is restored once when an eligible reservation is cancelled or released. Removing listings or deleting accounts cancels pending reservations transactionally while preserving completed history. Pickup times and addresses cannot change once stock has been reserved.

### Access and visibility

- New listings and reposts use a timed charity-priority period.
- Existing listings without `priorityUntil` retain their legacy visibility rule.
- Editing a listing does not restart its priority period.
- Server authentication and role checks determine who can read or change protected records.

### Notifications and limitations

- Reminders and alerts are in-app; optional browser reminders require an open application tab. There is no background push or email delivery.
- Fridge statuses are user reports and may be outdated; opening hours are descriptive text rather than a structured schedule.
- Impact accuracy depends on provider-recorded weights.
- Food rankings group recorded item names, so naming variations can split similar foods.

## AI assistance and attribution

**AI assistance:** Codex and Claude Code were used during project development. 

**Animation libraries:** [GSAP](https://gsap.com/) powers interface and scroll animations, including ScrollTrigger, SplitText and Flip. [Lenis](https://lenis.darkroom.engineering/) provides smooth scrolling.

Map services use OneMap and Leaflet. OneMap and Singapore Land Authority attribution remains visible on the maps. Demo image credits are listed in [image credits](server/src/seed-assets/CREDITS.md).

## Team

IS216 · Section G7 · Group 5

- Prajesh Dhimant Patel
- Tan Peng Lee
- Shu Ying Xuan
- Mohane Yashwanth Ram
- Teh Bo Yan
- Loke Han Shen
