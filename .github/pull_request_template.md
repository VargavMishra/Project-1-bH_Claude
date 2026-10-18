## What and why

<!-- What does this change do, and why is it needed? Link the issue or stage. -->

## How it was tested

- [ ] `npm run check` passes locally (format, lint, typecheck, tests, build)
- [ ] New/changed behaviour has automated tests
- [ ] Manually verified (describe where: local / dev Supabase / deployed):

## Safety checklist

- [ ] No secrets, `.env` files, tokens or real user data in the diff
- [ ] Database changes are a new migration file (existing migrations are never edited)
- [ ] API contract changes are reflected in `packages/shared` and the OpenAPI docs
- [ ] Docs updated where behaviour changed
