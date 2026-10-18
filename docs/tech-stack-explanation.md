# Tech stack explained

For each technology: **what it does**, **why we chose it here**, **alternatives**,
and **limitations to know about**. Versions are what the repo uses as of October 2026;
check `package.json` files for exact versions.

---

## Language and runtime

### TypeScript (pinned to 6.0.x)

- **What:** JavaScript plus static types, checked at build time and erased at runtime.
- **Why:** the same `Profile` type flows from the database row → API → website.
  Renaming a field breaks the build in every place that uses it, instead of failing
  in production.
- **Why 6.0 rather than 7.0:** TypeScript 7 (the native Go rewrite) is out, but
  `typescript-eslint` (our linter's TypeScript integration) supports only
  `<6.1` at the time of writing. We stay on 6.0 until the linter catches up — a typical
  real-world reason to not take the newest major version on day one.
- **Alternatives:** plain JavaScript (faster to start, more runtime bugs), JSDoc types.

### Node.js 24 LTS

- **What:** runs JavaScript outside the browser — here, the API server and all build tools.
- **Why:** one language across web, API and tooling. LTS = long-term support with
  security fixes; `.nvmrc` and `engines` pin the major version so local, CI and Render
  all match.
- **Alternatives:** Deno, Bun (faster, but less mature hosting/tooling support), Go/Python
  backends (would split the team across languages).

---

## Website

### React 19

- **What:** a UI library. You describe what the screen should look like for a given
  state; React updates the DOM when state changes.
- **Why:** S's app is React Native — same mental model (components, props, hooks), and
  the most widely documented UI library.
- **Alternatives:** Vue, Svelte, Angular.

### Vite

- **What:** dev server with instant reload, and a production bundler that outputs static
  `index.html` + hashed JS/CSS files.
- **Why:** the output is static files, so it can be hosted on any CDN for free; no server
  rendering needed for an authenticated profile app.
- **Alternatives:** Next.js (server rendering, routing, API routes — more than we need and
  needs a Node host), Create React App (deprecated).
- **Limitation:** a static SPA needs a "rewrite all paths to `/index.html`" rule on the
  host so deep links like `/profile` work after refresh.

### Styling

- Plain CSS with CSS custom properties and a mobile-first layout. No CSS framework, to
  keep the learning surface small. Tailwind would be a reasonable alternative.

---

## Mobile

### Expo (SDK 58) + React Native

- **What:** React Native renders native Android/iOS UI from React code. Expo is a toolkit
  and cloud build service on top of it.
- **Why:** **EAS Build** compiles a signed APK in the cloud — no Android Studio, Java or
  Android SDK needed on this Windows machine. Expo also manages the signing keystore.
- **Alternatives:** bare React Native CLI (needs local Android toolchain), Capacitor
  (designed specifically for wrapping websites — a strong alternative, but S already uses
  React Native), a Trusted Web Activity (TWA; full Chrome instead of WebView, good for PWAs).
- **Limitation:** EAS free tier has a monthly build quota and a slower queue.

### react-native-webview

- **What:** a native component that embeds the system WebView (Chromium-based on Android).
- **Why:** this _is_ the product design: show the website inside the app.
- **Limitation:** WebView storage (localStorage, cookies) belongs to the app, separate from
  Chrome — so you sign in separately in the app. Google OAuth must leave the WebView.

---

## Backend

### Express 5

- **What:** a minimal HTTP framework: routes, middleware, request/response objects.
- **Why:** the most common Node framework, huge ecosystem, easy to read. Express 5 forwards
  errors thrown in `async` handlers to the error middleware automatically (Express 4 did not).
- **Alternatives:** Fastify (faster, schema-first), NestJS (opinionated, heavier),
  Hono (tiny, edge-friendly).

### Zod 4

- **What:** declares a schema once and gives you both a runtime validator and a TypeScript type.
- **Why:** the same schema validates the form in the browser **and** the request body on
  the server; it also generates JSON Schema for the OpenAPI docs.
- **Alternatives:** Yup, Valibot, Joi, class-validator.

### pino (+ pino-http)

- **What:** fast structured (JSON) logger.
- **Why:** Render shows stdout logs; JSON lines are searchable, and pino's `redact` option
  removes `Authorization` headers before anything is written.

### helmet, cors, express-rate-limit

- **helmet:** sets security headers (e.g. `X-Content-Type-Options`, removes `X-Powered-By`).
- **cors:** tells browsers which website origins may call the API. CORS protects users'
  browsers, not the server — it is **not** authentication.
- **express-rate-limit:** limits requests per client per time window to blunt brute force
  and abuse.

### jose

- **What:** standards-compliant JWT/JWKS library.
- **Why:** verifies Supabase access tokens locally using Supabase's published public keys,
  without a network call to Supabase on every request (keys are cached).

---

## Data, auth and storage: Supabase

### Supabase PostgreSQL

- **What:** a real, managed PostgreSQL database, plus an auto-generated REST layer
  (PostgREST) that enforces row-level security.
- **Why:** relational integrity (constraints, foreign keys, transactions), genuine triggers,
  and RLS — the database can refuse unauthorized writes itself.
- **Alternatives:** Firebase (NoSQL, no SQL triggers/constraints in the same sense), Neon /
  RDS + separate auth service, MongoDB Atlas.

### Supabase Auth

- **What:** a managed identity service: email/password, OTP via SMS, OAuth (Google, …),
  sessions and refresh tokens.
- **Why:** we must not write password hashing, OTP delivery or OAuth flows ourselves.
  Tokens are standard JWTs any backend can verify.
- **Limitations:** phone OTP needs a paid SMS provider (Twilio etc.) for real numbers;
  Supabase offers fixed **test phone numbers** for demos. SMS to Indian numbers also
  requires DLT registration with the provider.

### Supabase Storage

- **What:** S3-style object storage with access policies written in SQL.
- **Why:** images do not belong in database rows. We store the file in a bucket and its
  **path** in the `profiles` table; access is controlled by storage policies and short-lived
  signed URLs.

### Supabase CLI

- **What:** creates and applies SQL migrations, links to hosted projects.
- **Why:** schema changes are code — reviewed in PRs and replayable on a fresh project.

---

## Quality tooling

| Tool                           | What it checks                                                    | Why it matters                                                     |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Prettier**                   | Formatting (quotes, spacing, line length)                         | Diffs show real changes, not style noise; ends formatting debates  |
| **ESLint + typescript-eslint** | Likely bugs: unused vars, un-awaited promises, React hook misuse  | Catches mistakes the type checker allows                           |
| **tsc --noEmit**               | Types across the whole program                                    | Contract mismatches between web, shared and API fail before deploy |
| **Vitest**                     | Unit + integration tests (fast, Vite-native, Jest-compatible API) | Proves behaviour; prevents regressions                             |
| **Supertest**                  | Sends real HTTP requests to the Express app in-process            | Tests middleware + routing + error format together, without a port |
| **React Testing Library**      | Renders components and interacts like a user                      | Tests behaviour, not implementation details                        |
| **GitHub Actions**             | Runs all of the above on every push / PR                          | Defective code is blocked before it merges or deploys              |
| **npm audit**                  | Known vulnerabilities in dependencies                             | Early warning; reviewed, not blindly auto-fixed                    |

---

## Hosting

| Service            | Used for                        | Free-tier caveat (details in `docs/deployment.md`)                                 |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| Render static site | Website                         | CDN-served; build minutes limited                                                  |
| Render web service | API                             | Sleeps when idle → slow first request; monthly instance-hour cap                   |
| Supabase           | DB, auth, storage               | Project pauses after inactivity; size limits; no downloadable backups on free plan |
| Expo EAS Build     | Building the APK                | Monthly build quota, slower queue                                                  |
| GitHub Releases    | Distributing the APK over HTTPS | 2 GB per file limit; public if repo is public                                      |

**Why not one host for everything?** Supabase gives us auth + Postgres + storage + RLS in
one product, which would otherwise be three services to secure and connect. Render runs our
own code. Fewer moving parts = fewer things to break during a demo.
