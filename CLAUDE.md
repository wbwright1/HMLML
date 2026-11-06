# Project Guidelines

## Project Overview
Harambe Memorial League Memorial League (HMLML): a public Next.js site that is the permanent home of a 12-team dynasty fantasy football league (history carried forward from a 10-team predecessor). It is a trash talk arsenal disguised as a league history archive: history, stats, drafts, power rankings, The Book (a league sportsbook), and near-live matchup scoring, in a confident, snarky voice. All league data syncs from the Sleeper API. Pages are public; members sign in with claim codes (`lib/auth.ts`, session cookie) to post smack and make picks, and the commish has a console at `/commish`.

The double "Memorial League" is intentional. Use "HMLML" in code, nav branding, and UI.

## Tech Stack
- Next.js 16 (App Router), TypeScript strict, Turbopack in dev
- Vercel Postgres (Neon) via Drizzle ORM 0.45.x; Zod (with drizzle-zod) validates every Sleeper response
- Tailwind CSS v4; shadcn/ui primitives copied into `components/ui/`
- Vercel hosting (hobby tier), Vercel crons
- Playwright for E2E, Vitest for unit and DB tests
- Fonts via next/font: Instrument Serif (italic display), Geist (UI/body), JetBrains Mono (every numeral)

## Commands
- `npm run dev`, `npm run build`, `npm run lint` (ESLint 9 flat config `eslint.config.mjs`; `next lint` no longer exists; warnings do not fail it, errors do; `docs/**` is excluded)
- `npx tsc --noEmit` for type checking
- `npm run test:unit` (Vitest, `*.test.ts`); `npx vitest run --config vitest.db.config.ts` for `*.dbtest.ts` against the real DB
- `npx playwright test <spec> --project=chromium` for E2E; run targeted specs only (see Testing)
- `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` (drizzle-kit)
- One-off backfills, reprices, and seeds live in `scripts/`

## Writing Style
- Never use em-dashes in output. Use commas, semicolons, colons, parentheses, or separate sentences.

## Reference Docs (read on demand)
- `docs/agent/rendering-and-caching.md`: before adding a page, a client component, a page query, or anything that revalidates.
- `docs/agent/design-system.md`: before UI work (tokens, typography, cards, FranchiseLogo sizing, nav, hub states, animation).
- `docs/agent/testing.md`: before writing or running tests (worktree env, state-forced hub projects).
- `_bmad-output/planning-artifacts/`: original PRD, architecture, UX spec, epics (historical; the code wins where they differ).

## Project Structure
```
app/                 Routes (App Router); app/page.tsx is the seasonal hub
  api/               sync-daily, sync-hourly, generate-content, live-scores, session, book/*, search, revalidate, backfill-*, legacy-*
  book/              The Book: Board, Futures, Tracking, Props
  claim/, commish/   Member sign-in and commish console (dynamic, authenticated)
components/          Shared UI; hub/ (one component per hub state), nav/, book/, ui/ (shadcn)
lib/
  db/                Drizzle schema, migrations, connection
  sleeper.ts         The only Sleeper API client (one Zod-validated function per endpoint)
  sync/              Sync logic (daily, hourly, book lines/futures, legacy import)
  book/              Pure odds engines (pricing.ts, futures.ts) + shared shapes/copy
  queries/           DB query modules by domain
  content.ts         Centralized snarky labels and copy
e2e/                 Playwright specs
scripts/             One-off maintenance scripts
_agents/, _work/     Agent personas/pipeline and its working directory
```

## Architecture Invariants
- **RSC by default.** Never put `"use client"` on a page or layout. Client code is limited to small leaf islands for interactivity, live data, or per-member session state inside cached HTML. Book pick islands are never the authority: every pick is re-enforced by a server action. Details in `docs/agent/rendering-and-caching.md`.
- **Sync-driven ISR.** Public pages export `revalidate = 3600` and refresh when a sync calls `revalidateSite()` (`lib/revalidate.ts`), not per request. Pages whose `searchParams` drive a query stay dynamic and cache at the query layer with `cachedQuery()` (`lib/cache.ts`) instead.
- **`revalidatePath` does not clear `unstable_cache`.** That is why `revalidateSite()` also calls `revalidateTag(LEAGUE_DATA_TAG)`. When `cachedQuery`'s `JsonSafe<T>` constraint rejects a `Map`, `Set`, or `Date` return, write an explicit adapter; never cast past it.
- **DB errors must throw at request time.** Every page data-fetch catch calls `rethrowUnlessTolerable(e)` (`lib/db-guard.ts`), never a bare `catch {}`, or ISR caches a hollow page until the next sync. Only genuinely optional data (avatars, rivalry flags, lineups, live asides) may fall back to an empty state.
- **Never read `cookies()`/`headers()` in a layout or anything a layout renders.** It silently opts every route out of ISR. Session chrome is a client island fed by `/api/session`. A page's revalidate window is capped by the shortest `next: { revalidate }` fetch in its render.
- **Builds tolerate a DB outage on purpose** (a failed build would block the fix deploy); `.github/workflows/post-deploy-revalidate.yml` re-revalidates after each production deploy.
- **Current week comes from `resolveCurrentWeek()`** (`lib/queries/matchups.ts`), never `max(matchups.week)`: the full schedule is pre-synced.
- **No page triggers a live Sleeper call**; everything is served from Postgres. Sole exception: the players-page trending rail (1-hour fetch cache through `lib/sleeper.ts`).
- Correctness over performance (12 users). Schema is forward-compatible; code builds only what is needed now.

## Sync
- Three tiers: daily cron (players, settings), hourly cron (transactions, rosters), and a client 30s poller hitting `/api/live-scores` during game windows.
- Every sync endpoint: verify the Vercel `CRON_SECRET` header; call Sleeper only via `lib/sleeper.ts`; Zod-validate; write in a transaction (atomic per data type, so a failed transaction sync cannot corrupt rosters); log to `sync_log` (status, row counts, duration, errors); on success or partial success call `revalidateSite()` and never let a revalidation failure fail the sync; return an HTTP status.
- Each data type tracks its own last-successful-sync timestamp.
- The hourly sync throttles in the offseason (`shouldSkipHourlySync`, `lib/sync/hourly.ts`): under 6 hours since the last success logs a `skipped` row and returns 200. It throttles rather than stops because dynasty trades happen year-round; the cron stays hourly.

## Domain Rules
- **Franchise identity:** the `roster_id -> user_id -> franchise` mapping is versioned per season and used almost everywhere. Franchise identity (name, branding) persists across ownership changes; franchise pages attribute the owner per season.
- **Legacy chaining:** Sleeper's `previous_league_id` chains seasons; sync traverses it for history. Transactions require iterating all weeks of all seasons. Pre-Sleeper seasons come from the legacy import.
- **Sleeper discipline:** `lib/sleeper.ts` is the ONLY code that touches the API. Stay under 1,000 calls/minute across all jobs. The ~5MB players endpoint is fetched once daily, never on demand. Store `user_id` as the stable identifier; resolve display names at render time.

## Conventions
- DB: tables `snake_case` plural; columns `snake_case`; FKs `{table_singular}_id`; indexes `idx_{table}_{columns}`. Drizzle table variables `camelCase`.
- Code: files `kebab-case`; components and types `PascalCase`; functions/variables `camelCase`; constants `UPPER_SNAKE_CASE`.
- API: route paths `kebab-case`, query params `camelCase`. Responses are `{ data: T, syncedAt: string }` or `{ error: { message: string, code: string } }`; ISO 8601 dates, `camelCase` fields, explicit `null` (never `undefined`), Sleeper IDs as strings.
- Drizzle for all DB access; no raw SQL outside migrations.
- No `utils/` or `helpers/` grab-bags; put logic in `lib/` with descriptive filenames.

## Design Non-Negotiables
Full reference: `docs/agent/design-system.md`. Tokens live in `app/globals.css`.
- Dark-only "Command Center" theme: warm charcoal canvas, single gold accent. Use the tokens, never shadcn default colors, and install no other UI library.
- No red/purple pairings anywhere (a league member has red/purple color blindness). Negative is warm rust `--accent-warm`, never red; positive is sage green.
- Never convey information by color alone: every win/loss/up/down/live signal carries a W/L letter, a number beside the arrow, or a "LIVE" label.
- Body text meets WCAG AA 4.5:1. `--text-muted` (~3.2:1) is decorative, disabled, or 24px+ only, never body copy.
- Every numeral (scores, records, stats, ranks) is JetBrains Mono tabular; the only exception is a numeral inside a serif display sentence.
- Every franchise identity renders through `FranchiseLogo` (`components/franchise-logo.tsx`): never hand-roll an initials chip, never derive codes with `.slice()`, and never put it inside a `<p>` (it renders a `div` and breaks hydration).
- Snarky labels come from `lib/content.ts`, not hardcoded strings. Errors read calm ("We're showing the last available data"), never "Oops!"
- The nav stays at five items [Hub, Teams, Records, Drafts, The Book]; The Book took the Players slot. Do not add a pill without removing one.
- Cards over tables on mobile; no horizontal-scroll tables as the primary mobile pattern. Curate per view rather than dumping data.
- No page transitions, scroll-triggered animation, or spinners on server-rendered pages; motion is for live data, and `prefers-reduced-motion` neutralizes it.

## Testing
Full reference: `docs/agent/testing.md`.
- No mocks. Features are proven against the running stack and real Postgres: Playwright for UI, real HTTP for APIs, `*.dbtest.ts` for DB logic. Unit tests only for pure functions, co-located as `*.test.ts`. A test that would pass with the feature deleted is worthless.
- `POSTGRES_URL` points at the live Neon DB and the transfer quota is real: run targeted chromium-only specs, never the full suite.
- A fresh worktree has no `.env.local`; copy it from the main checkout before running E2E.

## Before Calling a Task Done
1. `npm run lint` and `npx tsc --noEmit` pass.
2. Behavior is tested against real running code, unit tests co-located, E2E in `e2e/`.
3. New pages follow the ISR and `rethrowUnlessTolerable` rules; new sync endpoints follow the sync pattern and log to `sync_log`.
