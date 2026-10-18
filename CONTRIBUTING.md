# Development guide

How we change this codebase. The goal is that `main` is always deployable.

## 1. Workflow: branch → pull request → review → merge

```bash
git switch main
git pull
git switch -c feat/profile-api
```

```bash
npm run check
```

```bash
git push -u origin feat/profile-api
```

Then open a pull request on GitHub. CI must be green and the PR template checklist complete
before merging. Prefer **squash merge** so each PR becomes one clear commit on `main`.

Branch name prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `test/`, `refactor/`, `ci/`.

> The very first commits (Stage 1–2 bootstrap) went directly to `main` because there was
> no remote or CI yet. From Stage 3 on, every change goes through a PR.

## 2. Commit messages (Conventional Commits)

```
<type>(<scope>): <what changed, imperative, lower case>

<optional body: why, and anything a reviewer must know>
```

Examples: `feat(api): add PATCH /api/v1/profile/me`, `fix(web): refetch profile on focus`,
`chore(db): add profiles migration`. Types: `feat`, `fix`, `docs`, `test`, `refactor`,
`chore`, `ci`, `build`. One logical change per commit.

## 3. What CI checks, and why

| Check                            | Catches                                                       | Run locally                    |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| Prettier                         | Inconsistent formatting that hides real changes in diffs      | `npm run format:check`         |
| ESLint                           | Likely bugs: un-awaited promises, unused code, hook misuse    | `npm run lint`                 |
| TypeScript                       | Contract mismatches between web, shared and API               | `npm run typecheck`            |
| Vitest                           | Behaviour regressions                                         | `npm test`                     |
| Build                            | Code that type-checks but fails to bundle/compile             | `npm run build`                |
| npm audit                        | Known-vulnerable production dependencies                      | `npm audit --omit=dev`         |
| Mobile: tsc, expo-doctor, export | Broken shell code, SDK-incompatible packages, bundling errors | see `.github/workflows/ci.yml` |

**Branch protection (set once on GitHub):** Settings → Branches → add rule for `main` →
require a pull request, require status checks `Web, API & shared` and `Mobile shell` to pass,
block force pushes.

## 4. Adding dependencies

- Root workspaces: `npm install <pkg> -w @profilesync/api` (or `@profilesync/web`, `@profilesync/shared`).
- Mobile: `cd apps/mobile` then `npx expo install <pkg>` — this picks the version compatible
  with the Expo SDK. Do not use plain `npm install` there.
- Commit the updated `package-lock.json` in the same commit.

## 5. Environments and configuration

| Environment       | Website            | API                    | Supabase project                        |
| ----------------- | ------------------ | ---------------------- | --------------------------------------- |
| Local development | `localhost:5173`   | `localhost:4000`       | `profilesync-dev`                       |
| Automated tests   | —                  | in-process (Supertest) | `profilesync-dev` (isolated test users) |
| Production        | Render static site | Render web service     | `profilesync-prod`                      |

Configuration comes only from environment variables, validated at startup
(`apps/api/src/config/env.ts`, `apps/web/src/config.ts`). Secrets live in `.env` files locally
(git-ignored) and in the Render / EAS dashboards in production.

## 6. Database changes

- Every schema change is a **new** file in `supabase/migrations/` (never edit an applied one).
- Apply to `profilesync-dev` first, test, then production. Full procedure, including rollback,
  in `docs/database-design.md` (Stage 3).

## 7. Release process

1. Merge to `main` with CI green.
2. **Website and API** deploy automatically from `main` on Render (Stage 9). Confirm with
   `GET /api/health` — the `version` field shows the deployed commit SHA.
3. **APK** (only when the shell itself changed, or the website URL changed):
   - bump `version` in `apps/mobile/app.json`;
   - build with EAS (`preview` profile, APK output) — Stage 6;
   - tag the commit `mobile-vX.Y.Z` and attach the APK to a GitHub Release with notes.
4. Record what was released in the GitHub Release notes.

Website-only changes do **not** need a new APK: the app loads the live website.
