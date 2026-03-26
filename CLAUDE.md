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
- **Font:** Geist Sans (via next/font) as single typeface; hierarchy via size/weight/spacing
- **Build:** Turbopack (dev), Next.js production bundling

## Writing Style
- Never use em-dashes (--) in output. Use commas, semicolons, colons, parentheses, or separate sentences instead.

## Key Architecture Decisions
- Full-stack in one Next.js project; API routes handle sync endpoints, React Server Components handle all pages
- **Server components by default, single client island** -- only the live score poller uses `"use client"`; every other page ships zero client JS
- **No caching in Phase 1** -- direct Postgres queries on every request; 12-user scale doesn't warrant caching; ISR available later
- **Correctness over performance** -- at 12 users, correct data matters more than speed
- **Forward-compatible schema, not overbuilt code** -- schema accommodates Phase 2+ without gymnastics; application code only builds Phase 1
- No authentication in Phase 1; fully public; Phase 2 adds commish admin login (likely Auth.js)
- 3-tier Sleeper sync: daily cron (players, settings), hourly cron (transactions, rosters), client-side 30s poller (live matchup scores during game windows)
- Cron endpoint security via Vercel native `CRON_SECRET` header verification
- All data served from local Postgres cache; no page load triggers a live Sleeper API call
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
  players/              -> Player search + status
  matchups/             -> Matchup detail pages (linked from hub, not in nav)
  playoffs/             -> Playoff bracket results
components/             -> Shared UI components (nav, footer, tables, timestamp)
  ui/                   -> shadcn/ui primitives
lib/                    -> Shared logic
  db/                   -> Drizzle schema, migrations, connection config
  sleeper.ts            -> Sleeper API client (one function per endpoint, Zod validated)
  sleeper-schemas.ts    -> Zod schemas for all Sleeper API response shapes
  sync/                 -> Sync logic (daily.ts, hourly.ts, legacy-import.ts)
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
6. Return HTTP status code

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

### Theme: "Press Box Evolved" -- Warm, Institutional, with Confident Pops
| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#FAF8F5` | Page background |
| `--surface` | `#FFFFFF` | Card backgrounds, elevated content |
| `--surface-muted` | `#F5F2EE` | Alternating rows, subtle section dividers |
| `--border` | `#E8E4E0` | Card borders, dividers, table rules |
| `--border-strong` | `#D4CFC9` | Emphasized borders, active card outlines |
| `--text-primary` | `#1A1A1A` | Headlines, stat numbers, bold callouts |
| `--text-secondary` | `#4A4540` | Body text, descriptions (darkened for WCAG AA) |
| `--text-tertiary` | `#7A756F` | Labels, metadata, timestamps |
| `--text-muted` | `#9C9590` | Placeholder text, disabled states |
| `--accent-green` | `#2D5A3D` | Brand accent, nav active, live indicators, CTAs |
| `--accent-green-light` | `#E8F0EB` | Green tint backgrounds |
| `--accent-gold` | `#B8860B` | Achievements, championships, awards |
| `--accent-gold-light` | `#FDF6E3` | Gold tint card backgrounds |
| `--accent-warm` | `#C45D3E` | Negative superlatives, "sting" moments (rust, NOT red) |
| `--accent-warm-light` | `#FDF0EC` | Warm tint card backgrounds |

### Typography
- Single typeface: Geist Sans via `next/font`
- Weights: Regular (400), Medium (500), Bold (700), Black (900)
- Display (56-64px, Black 900, -0.02em tracking): Hero stats; one number per viewport
- H1 (36-40px, Bold 700, -0.015em): Page titles
- H2 (28-32px, Bold 700, -0.01em): Section headers, card group titles
- H3 (20-24px, Medium 500): Card titles, subsection headers
- Body Large (18px, Regular): Featured descriptions, hub card body
- Body (16px, Regular): Standard text, table cells
- Body Small (14px, Regular, 0.005em): Labels, metadata, timestamps
- Caption (12px, Medium 500, 0.06em, UPPERCASE): Badges, tags, micro-labels; wide tracking
- Stat Number (contextual size, Bold 700, -0.01em): Stats in tables/cards; always `tabular-nums`
- Key stats use Display or H1 weight; the number IS the visual moment
- Negative tracking on large text for premium magazine feel
- Wide tracking on Caption for authority at small sizes
- Tabular figures (`font-variant-numeric: tabular-nums`) on all score/stat numbers

### Spacing (8px base unit)
- All spacing from 8px multiples: 8, 16, 24, 32, 48, 64, 96, 128
- Content max-width: 1200px centered on desktop
- Mobile: single column, 16px horizontal padding
- Generous whitespace: Apple-level breathing room

### Semantic Indicators
- **Wins:** Bold type weight + "W" label (no dedicated win color)
- **Losses:** Regular/light type weight + "L" label
- **Streaks/Records:** Gold accent for positive superlatives; bold type for all record callouts
- **Live/Active:** Forest green dot + "LIVE" text label + subtle pulse
- **Achievements/Awards:** `--accent-gold` + gold-tint card background
- **Negative Superlatives ("Sting"):** `--accent-warm` + warm-tint card background + snarky label
- **Snarky Labels:** Defined in a centralized content system (TypeScript constant), not hardcoded per component. Examples: "Point Machine", "Iron Curtain", "League Doormat", "Glass Cannon", "Coaching Malpractice"

### Accessibility (Non-Negotiable)
- No information conveyed by color alone; every color signal has a text label, icon, or typographic treatment
- No red/purple color pairings anywhere (a league member has red/purple color blindness)
- All text meets WCAG 2.1 AA contrast ratios (4.5:1 body, 3:1 large text)
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
- **Primary nav:** Hub | Teams | Records | History | Drafts | Players
- **Matchups are NOT a nav item;** live matchup cards surface on the hub during game windows; tapping goes to matchup detail pages
- **Seasonal pill badge** in nav (right side): "Preseason", "Week 9", "Playoffs", "Offseason"
- **Brand:** "HMLML" in nav bar left
- **Mobile:** hamburger menu; fixed slim top bar

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
- **Tier 3 (Utility, shadcn/ui restyled):** Table, Card, Tabs, Badge, Nav, Select, Input, Section Header, Sync Timestamp, Seasonal Pill Badge, Stat Callout

### Animation Philosophy
- No page transitions, no scroll-triggered animations, no loading spinners on server-rendered pages
- **Allowed:** live score pulse (CSS), draft countdown tick (opacity transition), card hover border (150ms), tab content fade (100ms)
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
- Generic sports template aesthetics (dark backgrounds, neon accents, aggressive gradients)
- Showing all data at once instead of curating what matters per view
- Horizontal scroll tables as primary mobile pattern; prefer card layouts
