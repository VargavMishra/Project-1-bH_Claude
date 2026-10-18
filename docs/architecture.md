# Architecture

> **Status:** Stage 1 (architecture confirmed). Sections marked _(planned)_ describe
> code that later stages implement; they are updated as each stage lands.

## 1. What we are building, in one paragraph

**ProfileSync** is one website and one backend, used by two clients. The
**website** (React) runs in a desktop browser and inside an **Android app** that is
little more than a full-screen WebView pointing at the same deployed website.
Both clients talk to a single **REST API** (Node.js + Express), which verifies who
the user is, checks what they are allowed to do, validates input, and reads/writes
a single **PostgreSQL database** (hosted by Supabase). Sign-in is handled by
**Supabase Auth**; images go to **Supabase Storage**. Because there is exactly one
database and one API, "synchronization" between website and app is simply "both
clients read the same row".

## 2. System diagram

```mermaid
flowchart LR
  subgraph Clients
    B["Desktop browser<br/>(website)"]
    subgraph APK["Android APK (Expo)"]
      WV["WebView<br/>(same website)"]
      NB["Native shell<br/>(deep links, system browser for OAuth)"]
    end
  end

  subgraph Render
    WEB["Static site<br/>React + Vite build<br/>HTTPS + CDN"]
    API["Web service<br/>Node.js + Express API<br/>HTTPS"]
  end

  subgraph Supabase
    AUTH["Supabase Auth<br/>(email, Google, phone OTP)"]
    PG[("PostgreSQL<br/>profiles, audit log<br/>RLS + triggers")]
    ST[("Storage<br/>avatars bucket")]
  end

  B -- "GET html/js/css" --> WEB
  WV -- "GET html/js/css" --> WEB
  B -- "sign in (supabase-js)" --> AUTH
  WV -- "sign in (supabase-js)" --> AUTH
  NB -. "Google OAuth in system browser" .-> AUTH
  B -- "REST + Bearer JWT" --> API
  WV -- "REST + Bearer JWT" --> API
  API -- "verify JWT via JWKS" --> AUTH
  API -- "queries as the user (RLS applies)" --> PG
  API -- "upload/sign URLs as the user" --> ST
```

Plain-text version (for terminals):

```
 Desktop browser ─┐                       ┌──────── Supabase ────────┐
                  ├── HTML/JS ──> Render static site              │
 APK WebView ─────┤                                                │
                  ├── sign-in ─────────────────> Auth (issues JWT) │
                  └── REST + JWT ──> Render API ──> PostgreSQL     │
                                         │     └──> Storage        │
                                         └── verifies JWT (JWKS)   │
                                                └──────────────────┘
```

## 3. Components and their responsibilities

| Component       | Lives in              | Owns                                                                                                                                             | Must NOT do                                                            |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Website         | `apps/web`            | UI, forms, client-side validation for UX, holding the user's session (via supabase-js), calling the API                                          | Talk to PostgreSQL directly; decide authorization; hold any secret key |
| Mobile shell    | `apps/mobile`         | Loading the deployed website in a WebView, back-button handling, opening OAuth in the system browser, receiving the deep-link callback           | Contain business logic or its own data; depend on a dev server         |
| Shared contract | `packages/shared`     | Zod schemas + TypeScript types for the profile and API envelopes, used by **both** web and API                                                   | Contain runtime side effects                                           |
| API             | `apps/api`            | Token verification, authorization/ownership, validation, business rules, DB + storage access, error format, logging, health checks, OpenAPI docs | Trust a user ID sent by the client; log tokens or personal data        |
| Database        | `supabase/migrations` | Durable data, constraints, `updated_at` trigger, audit trigger, row-level security (RLS)                                                         | — (it is the last line of defence)                                     |
| Auth provider   | Supabase Auth         | Passwords, OTP delivery, OAuth protocol, issuing/refreshing JWTs                                                                                 | —                                                                      |

## 4. Request lifecycle (the "happy path")

Example: the user edits their bio in the Android app and taps **Save**.

1. The website (running in the WebView) already holds a session from supabase-js:
   an **access token** (a short-lived JWT, ~1 hour) and a **refresh token**.
2. The form is validated locally with the shared Zod schema (fast feedback only —
   the server validates again because clients can be bypassed).
3. The website sends:
   ```http
   PATCH /api/v1/profile/me HTTPS
   Authorization: Bearer eyJhbGciOiJFUzI1NiIs...
   Content-Type: application/json

   {"bio":"Edited from my phone"}
   ```
4. API middleware chain: request ID → security headers → CORS check → rate limit
   → JSON body parse (size-limited) → **auth middleware**.
5. The auth middleware verifies the JWT signature against Supabase's public keys
   (JWKS), and checks `exp`, `iss` and `aud`. The user's ID is taken from the
   token's `sub` claim — **never** from the request body or URL.
6. The controller validates the body with the shared Zod schema, then calls the
   profile service with `(userId, changes)`.
7. The service calls the repository, which runs the UPDATE **as that user**
   (the user's JWT is forwarded to Supabase, so RLS applies: even if the API had
   a bug, Postgres would refuse to update someone else's row).
8. Inside the same database transaction, triggers fire: `updated_at` is set to
   `now()`, and an audit row is written.
9. The API returns `200` with the updated profile in a consistent envelope.
   It logs a structured `profile.updated` event (user ID + changed field names,
   not the values).
10. Later, the desktop website refetches `GET /api/v1/profile/me` (on window
    focus, on a polling interval, or via a refresh button) and shows the new bio.

## 5. Key architectural decisions

Each decision lists the alternatives we rejected and why, so it can be revisited
deliberately rather than accidentally.

### ADR-1: Monorepo with npm workspaces

- **Decision:** one Git repository: `apps/web`, `apps/api`, `packages/shared` are
  npm workspaces; `apps/mobile` sits in the same repo but has its **own**
  `package.json` lock file and is _not_ a workspace.
- **Why:** one PR can change the API, its contract, and the website together, and
  CI checks them together. The shared Zod schema makes "same profile schema and API
  contract" a compile-time guarantee instead of a convention.
- **Why mobile is separate:** Expo pins exact React / React Native versions. If it
  shared hoisted `node_modules` with the website, two copies of React could be
  resolved and break the app in confusing ways. The mobile shell imports nothing
  from the other packages, so isolating it costs nothing.
- **Alternatives:** separate repos (harder to keep contract in sync), pnpm/Turborepo/Nx
  (more tooling to learn; worth it at ~5+ packages, not at 3).

### ADR-2: The mobile app is a WebView shell around the deployed website

- **Decision:** the APK loads the production website URL (configured at build time).
- **Why:** this matches S's intended product. One UI codebase, instant updates
  (redeploying the website updates the app without a new APK).
- **Trade-offs:** WebView apps feel less native, need network to work, and some
  identity providers (notably **Google**) refuse to complete OAuth inside an embedded
  WebView. See ADR-6.

### ADR-3: Backend owns authorization; database enforces it again (defence in depth)

- **Decision:** clients never talk to PostgreSQL. The API verifies the JWT and derives
  `userId` from it. The API then queries Supabase **with the user's own JWT**, so
  Postgres row-level security policies (`auth.uid() = id`) apply too.
- **Why:** two independent locks. A bug in an API ownership check cannot leak or
  overwrite another user's profile, because the database rejects it as well.
  Bonus: the API does not need the Supabase **secret (service-role) key** or the
  database password for normal operations, so a leaked API environment is less
  catastrophic.
- **Alternative:** connect with a privileged DB role (Prisma/`pg`) and rely only on
  API checks. Simpler queries and transactions, but one bug = data breach, and the
  API must hold the most powerful credential in the system.

### ADR-4: SQL migrations (Supabase CLI) instead of Prisma

- **Decision:** schema lives in versioned SQL files under `supabase/migrations/`,
  applied with the Supabase CLI. Data access goes through a small repository module
  in the API (`*.repository.ts`) using `@supabase/supabase-js`.
- **Why:** the most important parts of this schema — RLS policies, triggers, storage
  policies, references to `auth.users` — are PostgreSQL features that Prisma cannot
  express in its schema language; we would write raw SQL migrations anyway, and keep
  two sources of truth. With one table, Prisma's type-safe query builder adds little.
- **When to revisit:** many tables with complex joins, or a move away from Supabase.
  The repository layer means only `*.repository.ts` files would change.

### ADR-5: Transactions live in the database

- **Decision:** multi-step writes that must succeed or fail together run inside one
  PostgreSQL transaction: either a single statement plus its triggers (e.g. profile
  UPDATE + audit INSERT — atomic by definition), or a Postgres function called via RPC.
- **Why:** PostgREST (which supabase-js talks to) runs each request in its own
  transaction; a function lets several statements share it without exposing a raw
  database connection to the API.

### ADR-6: OAuth inside the APK uses the system browser + deep link

- **Problem:** Google blocks OAuth sign-in from embedded WebViews
  (`Error 403: disallowed_useragent`).
- **Decision (planned, Stage 6):** when the website detects it is running inside the
  app, "Continue with Google" asks the native shell to open the provider URL in the
  system browser (Chrome Custom Tab). Supabase redirects back to
  `profilesync://auth-callback?code=…`; the shell hands the code to the WebView, and
  the website exchanges it for a session using the **PKCE** verifier it stored
  earlier. A stolen code is useless without that verifier.
- Email/password and phone OTP do not redirect, so they work directly in the WebView.

### ADR-7: Synchronization = single source of truth + explicit refetch

- **Decision:** no client keeps its own copy of profile data as truth. Clients refetch
  on page load, on window focus/app resume, after a save, and on a modest polling
  interval while the profile page is open.
- **Why:** simplest mechanism that is always correct. Real-time push (Supabase
  Realtime or WebSockets) can be added later as a "please refetch" signal without
  changing the data model. See `docs/synchronization.md` (Stage 7).

### ADR-8: Hosting on Render (web + API) and Supabase (DB, auth, storage)

- **Why:** free tiers, HTTPS by default, Git-push deploys, minimal ops. One platform
  for both Node services keeps deployment docs short.
- **Known limits:** Render's free web service sleeps when idle (first request after
  idle is slow); Supabase's free project pauses after a period of inactivity and has
  no downloadable backups. Exact current numbers and mitigations are in
  `docs/deployment.md` (Stage 9). Warm both up before a live demo.

### ADR-9: Two Supabase projects: development and production

- **Decision:** `profilesync-dev` (also used by integration tests) and
  `profilesync-prod` (demo data only). Separate URLs, keys and users.
- **Why:** tests and experiments never touch production data; migrations are tried on
  dev first.

## 6. Repository layout

```
.
├── apps/
│   ├── api/          Express + TypeScript REST API     (npm workspace)
│   ├── web/          React + Vite website              (npm workspace)
│   └── mobile/       Expo WebView shell → APK          (standalone package)
├── packages/
│   └── shared/       Zod schemas + types shared by web and api
├── supabase/
│   ├── migrations/   Versioned SQL: tables, RLS, triggers, storage policies
│   └── config.toml   Supabase CLI project config
├── docs/             Architecture, decisions, guides, demo script
├── .github/workflows CI (format, lint, typecheck, test, build)
└── package.json      Workspace root + shared dev tooling
```

API internal layering (planned, Stage 4):

```
routes  →  controller  →  service  →  repository  →  Supabase (Postgres/Storage)
 (URL)     (HTTP in/out)   (rules)     (queries)
              ↑ middleware: requestId, auth, rate limit, error handler
```

- **Routes** map URL + method to a controller.
- **Controllers** are thin: parse/validate input, call one service function, shape the
  HTTP response. No database calls.
- **Services** hold business rules (e.g. "creating a second profile is a conflict").
  No `req`/`res` — so they are reusable and easy to unit test.
- **Repositories** are the only code that knows table/column names.

## 7. Security model at a glance

| Term              | Question it answers                                  | Where it is enforced here                                       |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Authentication    | _Who are you?_                                       | Supabase Auth issues a signed JWT; API verifies it              |
| Authorization     | _Are you allowed to do this?_                        | API: you may only act on `/profile/me` = your own `sub`         |
| API permissions   | _Which operations does the API expose at all?_       | Only the routes we define; no generic "update any row" endpoint |
| Database security | _Even if the API is wrong, can this row be touched?_ | RLS policies + constraints in PostgreSQL                        |

## 8. What changes when integrating S's real app

Summary (full guide in `docs/integration-with-friend-app.md`, Stage 11): S's
React Native app keeps its UI; it either keeps a WebView pointed at S's website
(which then calls this API) or calls this API directly with `fetch`. In both cases
the contract is: obtain a Supabase session, send `Authorization: Bearer <access token>`,
use the shared schema. Add S's website origin to the API's CORS allow-list and to
Supabase's redirect URLs.
