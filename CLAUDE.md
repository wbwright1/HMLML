# Project Guidelines

## Project Overview
Harambe Memorial League Memorial League (HMLML) Website: a public-facing Next.js web app serving as the permanent home for a 12-team dynasty fantasy football league. The site is a trash talk arsenal disguised as a league history archive: it centralizes league history, performance data, draft records, power rankings, and near-live matchup scoring in one always-available destination with a confident, snarky editorial voice. All data sourced and synced automatically from the Sleeper API via a 3-tier sync pipeline. No login required (Phase 1). Carries forward history from the league's predecessor (a 10-team league).

**Note:** The abbreviation is HMLML (the double "Memorial League" is intentional). Use "HMLML" in code, nav branding, and UI.

## Tech Stack
- **Framework:** Next.js 16+ (App Router), TypeScript (strict mode)
- **Database:** Vercel Postgres (Neon-backed) via Drizzle ORM v0.45.x
- **Validation:** Zod (with drizzle-zod) for all Sleeper API response validation
- **Styling:** Tailwind CSS v4
- **UI Primitives:** shadcn/ui (Radix UI + Tailwind), copied into project, not installed as dependency
- **Hosting:** Vercel (free/hobby tier)
- **Data Source:** Sleeper API (read-only, no auth required)
- **Testing:** Playwright for E2E
- **Fonts:** three typefaces via next/font — Instrument Serif (italic) for display/titles/wordmark, Geist for all UI/body, JetBrains Mono (tabular) for every numeral
- **Build:** Turbopack (dev), Next.js production bundling

## Writing Style
- Never use em-dashes (--) in output. Use commas, semicolons, colons, parentheses, or separate sentences instead.

## Key Architecture Decisions
- Full-stack in one Next.js project; API routes handle sync endpoints, React Server Components handle all pages
- **Server components by default, small enumerated set of client islands** -- pages/layouts stay RSC; `"use client"` is limited to this list: the live score poller, the search command (⌘K / mobile dock search), the nav pills active-state, the season/franchise pickers, the player table (filter/sort), the draft countdown, the kickoff countdown, the smack composer, the commish claim-code reveal, the player-profile modal shell, the trades page deep-link scroll-focus island, the mobile nav scroll-chrome wrapper, the nav crest island, the smack composer slot, the nav live-pill island, the matchup-detail live score island, the book tab pill, the book board island, and the book tracking island. The board and tracking islands are on the list for the same reason the smack composer slot is: `/book` is ISR-cached HTML served to the whole league, so the member's own slip (board) and their own "YOU" tag plus their own not-yet-kicked-off picks (tracking) resolve client-side (session via `use-session-member.ts`, picks via `/api/book/picks`); the board island's picks are also re-enforced by the server action, while the tracking island is read-only. Streak Watch has no session dependency and stays a plain server component. The last four before those two exist because the page HTML is ISR-cached: the first two resolve the session client-side so the server tree stays cacheable (sharing one `/api/session` fetch via `components/use-session-member.ts`), and the last two keep live scores and the live-game count honest inside cached HTML. Everything else ships zero client JS.
- **Sync-driven ISR, not per-request queries** -- every public page declares `export const revalidate = 3600` and is served from the ISR cache; each successful sync run (sync-daily, sync-hourly, generate-content) calls `revalidatePath("/", "layout")` via `lib/revalidate.ts`, so pages refresh when data lands rather than on a timer. League data only changes when a sync runs, so this is exactly as correct as querying per request and far cheaper (the previous `force-dynamic` everywhere was exhausting Neon's transfer quota on crawler traffic). Time windows and the revalidate constant live in `lib/cache.ts`. Deliberately still dynamic: `/claim` and `/commish` (authenticated), `/api/live-scores` (the poller), `/api/session`, `/api/book/picks` (the member's own pick slip), `app/test/error-trigger`, the intercepted player modal route, and the six pages whose `searchParams` drive a server query (`/trades`, `/schedule`, `/teams/[slug]/schedule`, `/records/head-to-head`, `/drafts/[year]`, `/players/[id]`); those carry no `revalidate` export, since awaiting `searchParams` would make it inert.
- **Dynamic pages cache at the query layer instead** -- the queries behind those six pages and `/api/search` are wrapped in `cachedQuery()` (`lib/cache.ts`), which is `unstable_cache` tagged `LEAGUE_DATA_TAG`. `revalidateSite()` clears both: `revalidatePath` for the route cache and `revalidateTag` for the Data Cache, since **`revalidatePath` does not touch `unstable_cache` entries**. Wrap by renaming the implementation to `…Uncached` and exporting the cached binding under the original name, so pages need no changes.
- **`unstable_cache` serializes through JSON, and `cachedQuery` makes that a compile error** -- `Date` returns as a string, and `Map`/`Set` become `{}` and lose everything, all behind types that still claim otherwise. The `JsonSafe<T>` constraint rejects those return types outright (it caught a real `Map` in `getSeasonSchedule` that would have silently emptied `/schedule`, and a real one in `getTradeVerdicts`). When it fires, write an explicit adapter at the boundary (cache entries and rebuild the `Map`; drop unused `Date` columns) rather than casting past it. Anything genuinely live inside a cached page is a client island, not a reason to drop the cache.
- **A DB error at request time must throw, never fall through to an empty state** -- ISR will happily cache a "successful" hollow render and serve it until the next sync. Every page's data-fetch catch calls `rethrowUnlessTolerable(e)` (`lib/db-guard.ts`), which re-throws everywhere except local dev and the `next build` prerender pass, so Next serves the error boundary and keeps the last good cache entry. New pages must use it rather than a bare `catch {}`. Genuinely optional data (avatars, rivalry flags, lineups, live asides) keeps its empty-state catch: those are real non-error outcomes, not swallowed failures.
- **Builds stay tolerant of a DB outage on purpose** -- failing `next build` when Postgres is down was considered and rejected: Vercel builds every push, so it would convert a data problem into "nobody can ship", and it blocks the very deploy that might carry the fix. The cost is that a build during an outage can prerender empty HTML, which `.github/workflows/post-deploy-revalidate.yml` covers by calling `/api/revalidate` as soon as a production deploy succeeds.
- **Never read `cookies()`/`headers()` in a layout or in anything a layout renders** -- a dynamic API anywhere in the render tree opts the WHOLE route out of static generation, and from the root layout that silently defeats ISR on every page of the site. Session-dependent chrome is a client island fed by `/api/session` instead (`components/nav/nav-crest-island.tsx`, `components/smack-composer-slot.tsx`). For the same reason, a page's effective revalidate window is capped by the shortest `next: { revalidate }` fetch inside its render, so keep page-path Sleeper fetches at the page window (see `lib/queries/nfl-state.ts`).
- **Correctness over performance** -- at 12 users, correct data matters more than speed
- **Forward-compatible schema, not overbuilt code** -- schema accommodates Phase 2+ without gymnastics; application code only builds Phase 1
- No authentication in Phase 1; fully public; Phase 2 adds commish admin login (likely Auth.js)
- 3-tier Sleeper sync: daily cron (players, settings), hourly cron (transactions, rosters), client-side 30s poller (live matchup scores during game windows)
- Cron endpoint security via Vercel native `CRON_SECRET` header verification
- All data served from local Postgres cache; no page load triggers a live Sleeper API call (two deliberate exceptions: the players-page trending-adds rail, and the between-weeks hub's "Trending" module, both call Sleeper's trending endpoint through `lib/sleeper.ts` with a 1-hour fetch cache)
- Single Sleeper API client module (`lib/sleeper.ts`) with one typed function per endpoint, Zod validated
- Sync writes are atomic per data type; a failed transaction sync does not corrupt roster data
- Each data type tracks its own "last successful sync" timestamp
- `sync_log` table records every sync run with status, row counts, duration, and errors

## Project Structure
```
app/                    -> Routes, layouts, pages (App Router)
  api/                  -> API route handlers
    sync-daily/         -> Daily sync cron endpoint
    sync-hourly/        -> Hourly sync cron endpoint
    live-scores/        -> Client poller endpoint
  (hub)/                -> Homepage / seasonally-aware hub (page.tsx in app root)
  teams/                -> Franchise pages, rosters, draft history
  records/              -> Leaderboard, H2H, rivalries, power rankings, trophies
  history/              -> League history timeline, season detail
  drafts/               -> Draft history index and per-season views
  players/              -> Player search + status (reached via search/footer, not the nav)
  book/                 -> The Book: the sportsbook (The Board, Tracking, Props)
  matchups/             -> Matchup detail pages (linked from hub, not in nav)
  playoffs/             -> Playoff bracket results
components/             -> Shared UI components (nav, footer, tables, timestamp)
  ui/                   -> shadcn/ui primitives
lib/                    -> Shared logic
  db/                   -> Drizzle schema, migrations, connection config
  sleeper.ts            -> Sleeper API client (one function per endpoint, Zod validated)
  sleeper-schemas.ts    -> Zod schemas for all Sleeper API response shapes
  sync/                 -> Sync logic (daily.ts, hourly.ts, book-lines.ts, legacy-import.ts)
  book/                 -> The Book: pricing.ts (pure odds engine) + shared.ts (shapes/copy)
  queries/              -> DB query modules by domain (franchises, matchups, seasons, etc.)
e2e/                    -> Playwright E2E tests
_agents/                -> Agent personas and pipeline definition
_work/                  -> Pipeline working directory
_bmad-output/           -> Planning artifacts (PRD, architecture, UX spec, epics)
```

## Naming Conventions

**Database (Postgres/Drizzle):**
- Tables: `snake_case` plural (`franchises`, `matchups`, `draft_picks`, `sync_log`)
- Columns: `snake_case` (`roster_id`, `points_scored`, `season_year`)
- Foreign keys: `{referenced_table_singular}_id` (`franchise_id`, `season_id`)
- Indexes: `idx_{table}_{columns}` (`idx_matchups_season_id`)

**Code (TypeScript/React):**
- Files: `kebab-case` (`matchup-card.tsx`, `sync-daily.ts`, `sleeper.ts`)
- React components: `PascalCase` (`MatchupCard`, `FranchisePage`, `ScorePoller`)
- Functions/variables: `camelCase` (`getMatchups`, `seasonId`, `franchiseMapping`)
- Types/interfaces: `PascalCase` (`Franchise`, `MatchupWeek`, `SleeperRoster`)
- Constants: `UPPER_SNAKE_CASE` (`SLEEPER_BASE_URL`, `MAX_POLL_DURATION`)
- Drizzle schema table variables: `camelCase`

**API Routes:**
- Route paths: `kebab-case` (`/api/sync-daily`, `/api/live-scores`)
- Query parameters: `camelCase` (`?seasonId=2025&week=9`)

## API Response Patterns
```typescript
// Success
{ data: T, syncedAt: string }

// Error
{ error: { message: string, code: string } }
```
- Dates in JSON: ISO 8601 strings
- JSON field naming: `camelCase` (Drizzle handles snake_case <-> camelCase at DB boundary)
- Nulls: explicit `null` (never `undefined`)
- IDs: string type for Sleeper IDs (`user_id`, `roster_id`), matching Sleeper's format

## Sync Job Pattern
All sync functions follow this pattern:
1. Verify `CRON_SECRET` header
2. Call Sleeper API via `lib/sleeper.ts`
3. Validate response with Zod schema
4. Write to Postgres in a transaction (atomic per data type)
5. Log result to `sync_log` (success/failure, row count, duration, errors)
6. On success (including partial success), call `revalidateSite()` from `lib/revalidate.ts` so the ISR cache picks up the new data; never let a revalidation failure fail the sync
7. Return HTTP status code

The hourly sync throttles itself in the offseason (`shouldSkipHourlySync` in `lib/sync/hourly.ts`): out of season, a run whose last successful hourly sync is under 6 hours old logs a `skipped` row to `sync_log` and returns 200 without syncing. It throttles rather than stopping, because this is a dynasty league and trades, waivers and roster moves happen year-round. The cron itself stays hourly.

## Domain-Specific Rules

### Franchise Identity
The `roster_id -> user_id -> franchise` mapping is versioned per season and used by nearly every feature. Franchise identity (team name, branding) persists across ownership changes. Each franchise page displays the owner attributed to each season year.

### Legacy League Chaining
Sleeper's `previous_league_id` field chains seasons. The sync layer traverses this chain to pull all historical data. Transactions require iterating all weeks across all seasons. Any seasons pre-dating Sleeper require manual data entry via the legacy import script.

### Sleeper API Discipline
- `lib/sleeper.ts` is the ONLY code that touches the external API
- Stay under 1,000 API calls/minute across all sync jobs
- Players endpoint (~5MB) fetched once daily; stored locally, never on demand
- Store `user_id` as stable identifier; resolve display names at render time

## Visual Design (Non-Negotiable)

### Theme: "Command Center" -- Warm Charcoal & Gold (dark-only)
The whole site renders on a warm charcoal canvas. There is no light theme in Phase 1; tokens are centralized so a future light mode is a re-point, not a rewrite. Mock vocabulary maps to tokens as: **ink** -> `--text-primary`, **muted** -> `--text-tertiary`, **dim** -> `--text-muted`, **accent** -> `--accent-gold`.

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#1A1613` | App / page / card background ("bg") |
| `--surface` | `rgba(255,255,255,.045)` | Chips, search fields, tab bar (translucent) |
| `--surface-muted` | `rgba(255,255,255,.07)` | Slightly raised surfaces, hover rows |
| `--border` | `rgba(255,255,255,.08)` | Hairline borders |
| `--border-strong` | `rgba(255,255,255,.14)` | Emphasized borders, active outlines |
| `--divider` | `rgba(255,255,255,.05)` | Row separators (`border-divider`/`divide-divider`) |
| `--text-primary` | `#F2EADC` | Primary text ("ink"): titles, key numbers |
| `--text-secondary` | `#B8B0A0` | Body text (AA-safe on canvas) |
| `--text-tertiary` | `#98917F` | Labels, kickers, metadata ("muted") |
| `--text-muted` | `#6E6759` | "dim": DECORATIVE / disabled / large-text (24px+) ONLY -- fails AA (3.2:1) for body |
| `--accent-green` | `#8FBF7F` | Positive: win, live dot, up-arrow ("positive") |
| `--accent-green-light` | `rgba(143,191,127,.14)` | Green tint backgrounds |
| `--accent-gold` | `#E2B858` | Brand: active nav, links, key numbers ("accent") |
| `--accent-gold-light` | `rgba(226,184,88,.13)` | Accent-tint: active pill/row background |
| `--accent-warm` | `#C97C6A` | Negative: loss, mercy-rule, down-arrow, doormat (rust, NOT red) |
| `--accent-warm-light` | `rgba(201,124,106,.14)` | Warm tint backgrounds |

Card gradient fill: `linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02))`. Card inner glows: gold blob top-left `rgba(226,184,88,.09)`, sage blob top-right `rgba(120,150,110,.06)`, both `pointer-events:none`.

### Typography (three-font rule)
- **Instrument Serif, italic (400)** -- display, page titles, wordmark, editorial asides. Classes: `.text-display` (40-56px), `.text-h1` (36-44px), `.text-h2` (28-32px). Bound to `font-serif` / `var(--font-serif)`. Minimal negative tracking (serif needs less than Geist did).
- **Geist** -- all UI, labels, body, buttons. Weights 400/500/600/700/900. Classes: `.text-h3` (20-24px, 500), `.text-body-lg` (18px), `.text-body` (16px), `.text-body-sm` (14px), `.text-caption` (12px, 500, .06em, uppercase). This is the default `font-sans`.
- **JetBrains Mono, tabular** -- EVERY numeral: scores, records, stats, ranks. Class `.text-stat` (700, `tabular-nums`) / `font-mono` / `var(--font-mono)`. Never render a score or stat in the serif or in Geist.
- **Kicker** (`.text-kicker`): 10-11px, weight 600, `letter-spacing:.18em`, uppercase, `--text-tertiary` -- the small eyebrow label above titles and card groups.
- Tabular figures (`font-variant-numeric: tabular-nums`) on all `td`/`th` and every score/stat number.

### Card & Surface Language
- `.card-surface` -- the gradient fill + hairline `--border` + inset top highlight + drop shadow (`0 24px 60px rgba(0,0,0,.30)`), radius **14px** (`--radius`). This is the primary card.
- `.card-glows` -- optional ambient gold + sage radial blobs; requires a positioned, clipped host (applied together with `.card-surface` on signature cards).
- Radius scale: cards 14px; pills 999px; chips/fields ~10-11px. Derived tokens `--radius-sm..-4xl` scale off `--radius`.

### Spacing (8px base unit)
- All spacing from 8px multiples: 8, 16, 24, 32, 48, 64, 96, 128
- Content max-width: 1200px centered on desktop
- Mobile: single column, 16px horizontal padding
- Generous whitespace: Apple-level breathing room

### Semantic Indicators
- **Positive (win, up, live):** sage green `#8FBF7F`, ALWAYS paired with a text label or glyph -- "W", the number beside a ▲, or the "LIVE" label.
- **Negative (loss, down, mercy-rule, doormat):** warm rust `#C97C6A`, ALWAYS paired with a text label or glyph -- "L", the number beside a ▼.
- **Wins:** bold type weight + "W" label; **Losses:** regular/light weight + "L" label.
- **Streaks/Records:** gold accent for positive superlatives; bold type for all record callouts.
- **Live/Active:** green dot with an expanding pulse ring (`@keyframes live-pulse`: scale 1→2.4, opacity .75→0, 1.6s) + "LIVE" text label.
- **Achievements/Awards:** `--accent-gold` + gold-tint (`--accent-gold-light`) card background.
- **Negative Superlatives ("Sting"):** `--accent-warm` + warm-tint (`--accent-warm-light`) card background + snarky label.
- **Snarky Labels:** Defined in a centralized content system (TypeScript constant), not hardcoded per component. Examples: "Point Machine", "Iron Curtain", "League Doormat", "Glass Cannon", "Coaching Malpractice"

### Accessibility (Non-Negotiable)
- No information conveyed by color alone; every color signal has a text label, glyph, or typographic treatment (positive/negative are green/rust but ALWAYS carry a W/L letter or a number beside the arrow)
- No red/purple pairings anywhere (a league member has red/purple color blindness); the negative signal is warm **rust**, never red, and the positive is sage green
- All body text meets WCAG 2.1 AA contrast (4.5:1); large text (24px+) meets 3:1. `--text-primary`/`-secondary`/`-tertiary` all clear 4.5:1 on canvas
- `--text-muted` (dim `#6E6759`) is ~3.2:1 on canvas: DECORATIVE, disabled, or large-text (24px+) use ONLY -- never body copy
- All color-coded badges include text labels ("W", "L", "CHAMP", "STREAK")
- Cards over tables on mobile when >3-4 columns

### Site Voice & Personality
- The site has a confident, snarky editorial voice; think "the friend in the group chat who always has the receipts"
- Superlative labels poke fun: "League Doormat", "Glass Cannon", "Coaching Malpractice"
- Bad stats and losses are highlighted with the same design care as wins; the emotional range is part of the experience
- Error messages are calm and confident, never panicked: "Something went wrong. We're showing the last available data." NOT "Oops!"
- 404 page can be snarky: "This page doesn't exist. Maybe it was traded away."

### Design Principles
- **Trash talk first:** every design decision filters through "does this give someone something to brag about or roast someone with?"
- **Speed-to-stat:** minimize taps/clicks between question and answer; never more than two taps from any stat
- **Screenshot-worthy by default:** cards, awards, and stat callouts are self-contained visual moments; a screenshot should make sense in a group chat with no explanation
- **The site knows what season it is:** hub content shifts automatically based on the football calendar (preseason, regular season, playoffs, offseason)
- **Cards over tables, always on mobile:** data lives in cards on hub and mobile; tables reserved for deep-dive pages on larger screens
- **Bold typography as the hero:** large, confident type for key stats and records
- **Curated over comprehensive:** the hub surfaces 4-6 compelling things, not a data dump
- Do NOT use shadcn/ui default theme colors; everything redefined to match HMLML brand
- Do NOT install additional UI libraries alongside shadcn/ui

### Navigation Structure
- **Desktop topbar (64px):** serif "HMLML" wordmark (left) · centered pill nav [Hub, Teams, Records, Drafts, The Book] (active = accent-tint background + gold text) · right cluster: inline search field (~230px, ⌘K hint), a live-games pill (pulsing green dot + "N GAMES LIVE"), and the current user's dynasty crest.
- **Mobile:** slim top header (56px: wordmark · right cluster of compact live pill, search icon trigger, and dynasty crest) plus a **fixed bottom dock** for thumb reach: a tab-bar-only 5-icon nav [Hub, Teams, Records, Drafts, The Book] (icon + 9px label, active = accent-tint + gold), ~80px + safe-area. The dock labels The Book "Book" (`dockLabel` in `components/nav/nav-pills.tsx`); "The Book" does not fit at 9px in a fifth of the screen, and the full name stays as the link's aria-label.
- **The nav stays at five items; The Book took the Players slot** (Blake's call, 2026-08-29). `/players` is fully live and reachable by search (its primary door), the footer's Players link (`components/site-footer.tsx`), every PlayerLink on the site, and the "All players in the league" entry on team roster pages. Do not re-add a Players pill without removing something else. No hamburger; search opens a full-screen dialog from the header icon (same shared search UI Sleeper-backed as desktop, just a different trigger). The header stays pinned at all times; only the bottom dock hides on scroll-down and reveals on scroll-up (`components/nav/scroll-chrome.tsx`), always shown within 8px of the top to absorb iOS rubber-band. Bottom clearance for scrollable content lives on the footer (`pb-[calc(env(safe-area-inset-bottom)+96px)] lg:pb-8` on `SiteFooter`), not on `app/layout.tsx`'s `<main>`.
- **Live Pill** (replaces the old Seasonal Pill Badge): shows live-game count during game windows, otherwise the seasonal state ("Preseason", "Week 9", "Playoffs", "Offseason").
- **Matchups are NOT a nav item;** live matchup cards surface on the hub during game windows; tapping goes to matchup detail pages.

### Seasonally-Aware Hub
The homepage automatically renders different content based on the football calendar. State determined by the NFL state endpoint (`/v1/state/nfl`).

| State | Top Banner | Content Below |
|---|---|---|
| **Preseason** | Champion Banner (green gradient, trophy) | Draft Countdown > Team Awards (2-col) > Player Awards (2-col) > Wall of Shame (full-width) > Draft Order |
| **Regular Season** | Week Banner (week number, game status) | Live Matchups (game windows) OR Standings Snapshot > Weekly Superlatives ("This Week's Damage") > Power Rankings |
| **Playoffs** | Week Banner (round name variant) | Playoff Bracket > Matchup Cards > Elimination Alerts |
| **Offseason** | Champion Banner (new champion) | Offseason Recap > Transaction Activity > All-Time Records Updates |

### Component Tiers
- **Tier 1 (Signature, built from scratch):** Champion Banner, Week Banner, Draft Countdown, Player Award Card, Team Award Card, Sting Card, Live Matchup Card, Weekly Superlative Card, Playoff Bracket Card
- **Tier 2 (Page-level):** Franchise Header, Rivalry Card, Season Timeline Card, Player Search Result, Roster Row
- **Tier 3 (Utility, shadcn/ui restyled):** Table, Card, Tabs, Badge, Nav (topbar pills + mobile dock), Select, Input, Search Command, Section Header (kicker), Sync Timestamp, Live Pill, Stat Callout

### Animation Philosophy
- No page transitions, no scroll-triggered animations, no loading spinners on server-rendered pages
- **Allowed:** live score pulse (`@keyframes live-pulse`, CSS), draft countdown tick (opacity transition), card hover border (150ms), tab content fade (100ms), scroll-reveal on first paint, hide-on-scroll mobile bottom dock (`components/nav/scroll-chrome.tsx`, CSS transform; the top header stays pinned). The `prefers-reduced-motion` block neutralizes all of these.
- Movement is reserved for live data where it conveys real information

## Acceptance Testing Patterns

### Core Rule: No Mocks, Prove It Works
No feature is complete until tested against real running code. Not mocked. Not stubbed. Actually running.

### API Acceptance Tests
- Every API endpoint tested via real HTTP requests against the running Next.js dev server connected to a real Postgres database
- Seed test data, make the request, assert on actual database state afterward

### UI Acceptance Tests
- Every user-facing feature tested via Playwright against the full running stack
- Browser clicks real buttons, fills real forms, submits, verifies result on screen AND in database

### What Is Explicitly Banned
- Tests where every dependency is mocked
- Frontend component tests that mock the API client
- "Integration" tests that use in-memory databases
- Test suites that test mock wiring instead of behavior
- Any test that would still pass if the feature was completely broken

### Where Real Unit Tests Are Allowed
Pure utility functions with no dependencies to mock. Co-located as `*.test.ts` next to source.

### Agent Review Protocol (Adversarial)
After tests are written and run, a separate agent team reviews with extreme prejudice:
1. Do the tests actually exercise the acceptance criteria, line by line?
2. Could these tests pass if the feature was deleted? (If yes, they are worthless)
3. Are there mocks hiding anywhere? (If yes, reject)
4. Do the tests prove data actually persisted/changed/flowed through the real system?

### Pre-Completion Checklist
Before any task is complete, all AI agents MUST:
1. Run linting and type checking
2. Co-locate unit tests with source; E2E tests in `e2e/`
3. Test every feature against real running code (no mocks)
4. Use Drizzle ORM for all database access (no raw SQL outside migrations)
5. Validate all Sleeper API responses with Zod before writing to the database
6. Follow the sync job pattern for all sync endpoints
7. Log every sync execution to `sync_log`
8. Use React Server Components by default; `"use client"` only for live score poller
9. Return structured API responses using the defined success/error formats

## Anti-Patterns to Avoid
- Creating a `utils/` or `helpers/` grab-bag directory; put logic in `lib/` with descriptive filenames
- Using `"use client"` on pages or layouts
- Calling Sleeper API directly from page components; always go through `lib/sleeper.ts`
- Mixing naming conventions
- Installing additional UI component libraries alongside shadcn/ui
- Writing sync functions that don't log to `sync_log`
- Generic sports-template aesthetics: neon accents, harsh saturated colors, aggressive/rainbow gradients, chrome/glossy effects. (The warm-charcoal dark canvas with a single gold accent and serif display type is the intended look; the ban is on the loud "gamer" sports skin, not on dark backgrounds.)
- Showing all data at once instead of curating what matters per view
- Horizontal scroll tables as primary mobile pattern; prefer card layouts
