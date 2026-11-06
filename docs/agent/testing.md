# Testing Reference

Read this before writing or running tests. The core rules are summarized in `CLAUDE.md`.

## No mocks, prove it works

No feature is complete until tested against real running code. Not mocked. Not stubbed. Actually running.

- **API acceptance tests:** real HTTP requests against the running Next.js dev server connected to a real Postgres database. Seed test data, make the request, assert on actual database state afterward.
- **UI acceptance tests:** Playwright against the full running stack. The browser clicks real buttons, fills real forms, submits, and verifies the result on screen AND in the database.
- **DB acceptance tests:** `*.dbtest.ts`, run with `npx vitest run --config vitest.db.config.ts` (serial, real database via `vitest.db.setup.ts`). Kept out of `npm run test:unit` so the pure unit suite never needs a database.
- **Unit tests** are allowed only for pure functions with no dependencies to mock, co-located as `*.test.ts` next to source (`npm run test:unit`).

Explicitly banned: tests where every dependency is mocked; frontend component tests that mock the API client; "integration" tests on in-memory databases; suites that test mock wiring instead of behavior; any test that would still pass if the feature were deleted.

## Running E2E locally or in a worktree

`.env.local` is gitignored and does not follow a `git worktree`: a fresh worktree has no `POSTGRES_URL`. Copy it in before running Playwright there, e.g. `cp /path/to/main/checkout/.env.local .`. `e2e/global-setup.ts` (`lib/e2e-preflight.ts`) fails the whole run fast with that exact fix if you forget, rather than letting specs silently pass or skip against a broken environment. Set `POSTGRES_DRIVER=pg` for a local Postgres; the live Neon database (the default `.env.local` target) works either way.

Run targeted, chromium-only specs, never the full suite: `POSTGRES_URL` points at the live database and the transfer quota is real.

## State-forced hub projects

Some specs run against dedicated dev servers pinned to a forced `NFL_STATE_OVERRIDE` instead of the shared default server, via extra Playwright projects declared in `playwright.config.ts` (see its `STATE_FORCED` pattern for the current list):

- `hub-preseason`: `e2e/hub-preseason.spec.ts` (`NFL_STATE_OVERRIDE=pre:1`).
- `hub-in-season`: `e2e/hub-between-weeks.spec.ts` and `e2e/book-hub.spec.ts` (`NFL_STATE_OVERRIDE=regular:next:force`).
- `hub-post-week`: `e2e/hub-post-week.spec.ts` (`NFL_STATE_OVERRIDE=regular:next:recap`, the post-week recap leading the between-weeks hub).

Run them with `npx playwright test e2e/hub-preseason.spec.ts --project=hub-preseason` (etc.).

- The `next` week token resolves per request to the earliest week whose matchups are all still `scheduled` (`lib/queries/nfl-state.ts`), so the pinned servers track the live season instead of drifting when a hard-coded week goes final.
- `:recap` holds the recap window open on any weekday, but the recap still needs every prior-week matchup complete, so run the post-week project between weeks (not Thursday night through Monday night).
- Every extra dev server needs its `NEXT_DIST_DIR` listed in `.gitignore` and `eslint.config.mjs`: Tailwind v4 scans every non-ignored file for class candidates, and an un-ignored dist dir feeds it garbled bytes from compiled chunks, which surfaces as a "Parsing CSS source code failed" 500 on every page.
- They must be `next dev`, not `next build && next start`: the hub pages declare `revalidate = 3600`, so their HTML is prerendered at build time with whatever env the build saw, and a start-time override would be ignored until that ISR entry expired. `next dev` re-renders per request, so the override takes effect immediately, still against the real Postgres.

## Adversarial review protocol

After tests are written and run, a separate agent reviews with extreme prejudice:

1. Do the tests actually exercise the acceptance criteria, line by line?
2. Could these tests pass if the feature was deleted? (If yes, they are worthless.)
3. Are there mocks hiding anywhere? (If yes, reject.)
4. Do the tests prove data actually persisted/changed/flowed through the real system?
