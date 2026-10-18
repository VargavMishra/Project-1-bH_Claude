# ProfileSync

One user profile, synchronized between a **website** and an **Android app**, backed by a
single **REST API** and a hosted **PostgreSQL** database with managed **authentication**.

Built as a production-style demonstration for integrating with a React Native app that
renders a website inside a WebView.

```
Desktop browser ─┐                      ┌───────── Supabase ─────────┐
                 ├──> Website (Render) ──┤ Auth · PostgreSQL · Storage │
Android APK ─────┘    (React + Vite)     └─────────────▲──────────────┘
 (WebView of the        │ REST + JWT                   │
  same website)         └──────────> API (Render) ─────┘
                                     Node.js + Express
```

## Project status

| Stage | Scope                                  | Status                                                   |
| ----- | -------------------------------------- | -------------------------------------------------------- |
| 1     | Architecture and technology choices    | ✅ Done — [`docs/architecture.md`](docs/architecture.md) |
| 2     | Repository, tooling, CI, skeleton apps | ✅ Done — CI green on GitHub                             |
| 3     | Supabase schema, RLS, triggers         | ✅ Done — applied to dev, 35 integration tests pass      |
| 4     | Authentication + profile API           | Planned                                                  |
| 5     | Website: sign-in, profile editor       | Planned                                                  |
| 6     | Expo WebView app + APK                 | Planned                                                  |
| 7     | Two-way synchronization                | Planned                                                  |
| 8     | Tests, OpenAPI, security checks        | Planned                                                  |
| 9     | Deployment (Render + Supabase prod)    | Planned                                                  |
| 10    | APK release + live demo                | Planned                                                  |
| 11    | Review, integration plan for S's app   | Planned                                                  |

**Repository:** https://github.com/VargavMishra/Project-1-bH_Claude

**Live URLs:** none yet — they are added here only after a deployment has been verified.

## Repository layout

| Path                                     | What it is                                                   |
| ---------------------------------------- | ------------------------------------------------------------ |
| [`apps/api`](apps/api)                   | Express + TypeScript REST API                                |
| [`apps/web`](apps/web)                   | React + Vite website (also shown inside the app)             |
| [`apps/mobile`](apps/mobile)             | Expo app: WebView shell → Android APK (separate lock file)   |
| [`packages/shared`](packages/shared)     | Zod schemas + types shared by web and API (the API contract) |
| [`docs`](docs)                           | Architecture, decisions, guides                              |
| [`.github/workflows`](.github/workflows) | CI pipeline                                                  |

## Prerequisites

- **Node.js 24 LTS** (see `.nvmrc`) and npm 11+
- **Git**
- For the mobile app: an [Expo](https://expo.dev) account (free) for cloud APK builds
- For later stages: [Supabase](https://supabase.com) and [Render](https://render.com) accounts

## Getting started

```bash
npm install
```

```bash
cd apps/mobile && npm install
```

Copy the environment templates (placeholders only — fill in your own values; never commit them):

| Template                   | Copy to               |
| -------------------------- | --------------------- |
| `apps/api/.env.example`    | `apps/api/.env`       |
| `apps/web/.env.example`    | `apps/web/.env.local` |
| `apps/mobile/.env.example` | `apps/mobile/.env`    |

Run the API and website in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open http://localhost:5173 — the page should say **Connected** with the API version.

## Quality checks

Run everything CI runs, in the same order:

```bash
npm run check
```

| Script                                    | What it does                                  |
| ----------------------------------------- | --------------------------------------------- |
| `npm run format:check` / `npm run format` | Check / apply Prettier formatting             |
| `npm run lint`                            | ESLint (including type-aware async-bug rules) |
| `npm run typecheck`                       | TypeScript across shared, API and web         |
| `npm test`                                | Vitest unit and HTTP tests                    |
| `npm run build`                           | Production builds of shared, API and web      |
| `cd apps/mobile && npm run typecheck`     | TypeScript for the mobile shell               |

## Documentation

- [Architecture](docs/architecture.md) — components, data flow, key decisions (ADRs)
- [Tech stack explained](docs/tech-stack-explanation.md) — what each tool does and why
- [Contributing / development guide](CONTRIBUTING.md) — branches, commits, PRs, releases
- [Database design](docs/database-design.md) — schema, constraints, RLS, triggers, storage, migrations
- [Troubleshooting](docs/troubleshooting.md) — problems already hit and how they were fixed

Further guides (authentication, API, deployment, synchronization,
integration with S's app, demo script, learning guide) are written as their stages land.

## Security

- No secrets in Git: only `.env.example` files with placeholders are tracked.
- The browser and app never connect to PostgreSQL; they call the API with a user JWT.
- The API derives the user from the verified token, never from client-supplied IDs.
- Row-level security in Postgres enforces ownership a second time.

See the security model in [`docs/architecture.md`](docs/architecture.md#7-security-model-at-a-glance).
