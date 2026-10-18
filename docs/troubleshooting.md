# Troubleshooting

Problems actually encountered while building this project, with cause and fix. Later stages
add sections for authentication, deployment and synchronization.

## Tooling

### ESLint reports "Unsafe call of a type that could not be resolved" on `@profilesync/shared` imports

- **Cause:** the shared package is consumed through its compiled `dist/` folder. If it has not
  been built yet, TypeScript cannot find its types and treats them as `any`/error types.
- **Fix:** `npm run build:shared`. The root `lint`, `typecheck`, `test`, `dev:*` and `build`
  scripts already do this first; it only bites when running `npx eslint` directly on a fresh
  clone (found by running `npm ci && npm run check` from a clean state).

### `typescript-eslint` warns about an unsupported TypeScript version

- **Cause:** TypeScript 7 (native rewrite) is newer than typescript-eslint supports (`<6.1`).
- **Fix:** keep `typescript` pinned to `~6.0.x` in every `package.json` until typescript-eslint
  supports 7. Check with `npm view typescript-eslint peerDependencies`.

### npm warns "packages have install scripts not yet covered by allowScripts" (esbuild)

- **Cause:** npm 11 does not run dependency install scripts until they are approved.
- **Impact:** none here: esbuild ships its platform binary as an optional dependency; the
  skipped script is only a verification step. Verified with a direct esbuild transform.
- **If ever needed:** `npm install-scripts ls`, then `npm install-scripts approve <pkg>`.

### `gh`, `node` or `npx` "is not recognized" right after installing them

- **Cause:** a program's PATH is fixed when it starts. Windows Terminal (and the Claude app's
  terminal tabs) keep the PATH from before the install, even in new windows, until every
  window of that program is closed.
- **Fix:** fully quit and reopen the terminal, or call the tool by full path:
  `& "C:\Program Files\GitHub CLI\gh.exe" …`, `& "C:\Program Files\nodejs\npx.cmd" …`.

### `npx.ps1 cannot be loaded because running scripts is disabled on this system`

- **Cause:** Windows PowerShell's default execution policy blocks `.ps1` scripts, and plain
  `npx` resolves to `npx.ps1`.
- **Fix:** use `npx.cmd` (no policy change needed), or run the command from `cmd.exe`.

### Signed in to GitHub Desktop, but `gh` / `git push` still ask for a login

- **Cause:** GitHub Desktop keeps its own credential. The GitHub CLI and command-line Git
  (Git Credential Manager) each need their own sign-in.
- **Fix:** `git credential-manager github login --browser` for Git, and
  `gh auth login --web` for the GitHub CLI. Check with `git credential-manager github list`
  and `gh auth status`.

## Supabase CLI

### `Cannot find project ref. Have you run supabase link?`

- Run `npx supabase link --project-ref <ref>` once from the repo root. The ref is in
  `npx supabase projects list`. With a recent CLI, `link` and `db push` use your
  `supabase login` token (a temporary login role); no database password is needed.

### `supabase projects api-keys` shows the secret key as `sb_secret_xxxx·····`

- That is deliberate: Supabase never returns the full secret key through the API. Copy it
  from **Dashboard → Project Settings → API Keys → Secret keys** (reveal/copy). Only the
  integration tests need it; the API never does.

## Mobile

### `No overload matches this call … props: never` on `<WebView>`

- **Cause:** `react-native-webview@14.0.1` types the class as `WebView<P = undefined>` with
  props `WebViewProps & P`; `X & undefined` is `never` in TypeScript.
- **Fix:** `apps/mobile/App.tsx` re-types the component (`TypedWebView`). Remove the cast once
  the library fixes its declaration.

### `npm audit` in `apps/mobile` reports high-severity issues

- **Cause (checked with `npm ls node-forge braces uuid`):** all come from Expo's build-time
  tooling — `@expo/cli`, `@expo/config-plugins`, Metro — which runs on the developer machine
  or EAS build servers, not inside the APK.
- **Do not** run `npm audit fix --force`: it downgrades Expo and breaks SDK compatibility.
- **Fix:** stay on the latest patch of the Expo SDK (`npx expo install --fix`) and re-check
  after each SDK upgrade. CI reports this audit without failing the build.

### Commands run from the wrong folder

- Mobile commands (`npx expo …`, `npm run typecheck` for mobile) must run inside
  `apps/mobile`. Workspace commands run from the repo root.

## API

### The server exits immediately with "Invalid environment configuration"

- **Cause:** an environment variable is missing or malformed. The message lists the variable
  names (never their values).
- **Fix:** compare your `apps/api/.env` with `apps/api/.env.example`.

### The browser shows a CORS error but `curl` works

- **Cause:** the website's origin is not in `CORS_ORIGINS`. CORS is enforced by browsers only.
- **Fix:** add the exact origin (scheme + host + port, no trailing slash), e.g.
  `CORS_ORIGINS=http://localhost:5173,https://your-site.onrender.com`, then restart the API.

### Finding the server log line for a failed request

- Every response has an `X-Request-Id` header, and error bodies include `requestId`.
  Search the API logs for that ID to find the exact request.
