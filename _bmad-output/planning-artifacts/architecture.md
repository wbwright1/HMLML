---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ['prd.md']
workflowType: 'architecture'
project_name: 'FantasyWebsite'
user_name: 'Blake'
date: '2026-03-17'
lastStep: 8
status: 'complete'
completedAt: '2026-03-17'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Architectural Principles

1. **Simplicity over abstraction** — This is a read-only data mirror with a presentation layer serving 12 people. The entire system is Next.js + Postgres + 3 cron functions. Resist the urge to add layers, services, or abstractions beyond what the workload demands.
2. **Data durability is #1** — The site's value compounds over time. The historical record in Postgres becomes irreplaceable after a few seasons. Automated backups, a clear migration strategy, and a normalized schema designed for decades are non-negotiable.
3. **Server components by default, single client island** — 37 of 38 FRs are read-only data display. The only client-side JavaScript is a `setInterval` fetch for live matchup scores during game windows. Every other page ships zero client JS via React Server Components.
4. **Correctness over performance** — At 12-user scale, a 500ms page load and a 100ms page load are both fine. Build for correct data, not speed. No caching layers, edge optimization, or connection pooling strategies needed.
5. **Forward-compatible schema, not overbuilt code** — The database schema should accommodate Phase 2+ without gymnastics, but application code should only build what Phase 1 needs. The schema is the long-term asset; features come and go.

### Requirements Overview

**Functional Requirements:**
38 FRs across 7 domains. The core pattern is: ingest data from Sleeper, normalize it across seasons (including legacy era), and present it through purpose-built views. Most FRs are read-only data display with the exception of the game-window score poller which adds a near-live client-side refresh layer. The franchise identity model (persistent team identity with year-attributed ownership) is the central domain concept — nearly every FR depends on correctly resolving which manager owned which franchise in which season.

**Non-Functional Requirements:**
14 NFRs focused on performance (3s page loads, 5s score refresh), reliability (99%+ uptime, graceful degradation), integration discipline (rate limiting, stable identifiers, isolated sync failure), and accessibility (WCAG 2.1 AA, no color-only information). The key architectural driver is NFR4: no page load triggers a live Sleeper API call — the entire site is served from local cache.

**Scale & Complexity:**

- Primary domain: Full-stack web (server-rendered MPA + background sync)
- Complexity level: Low-Medium
- System footprint: Next.js app + Vercel Postgres + 3 cron-triggered serverless functions + 1 client-side score poller
- Audience: 12 league members; peak concurrent users ~10

### Technical Constraints & Dependencies

- **Deployment platform: Vercel** — serverless hosting with edge network, serverless/edge functions, and Vercel Cron Jobs. Sync jobs run as discrete serverless invocations (not long-running processes). Database must be an external managed service.
- **Sleeper API is the sole external dependency** — read-only, no auth required, rate-limited to 1,000 calls/minute. The Sleeper API client (`lib/sleeper.ts`) is the single most important integration code in the system.
- **Players endpoint is 5MB** — must be fetched once daily and cached locally; never on demand
- **Username instability** — `user_id` is the stable key; display names resolved at render time
- **Legacy league chaining** — `previous_league_id` traversal is the only way to access historical seasons; transactions require per-week iteration across all seasons
- **Server-rendered MPA** — React Server Components by default; near-zero client JS; single client component for live score polling
- **Game-window detection** — poller relies on `/v1/state/nfl` to know when games are active; 30-second polling is client-side fetch against an API route that reads from Postgres
- **Vercel serverless function limits** — default 10s execution (up to 300s on Pro); sync jobs for a 12-team league are well within limits but should set extended timeouts as safety margin
- **Phase 2 auth** — architecture must not preclude adding commish login later, but should not build auth scaffolding now

### Preliminary Architecture Decisions

#### ADR-1: Framework — Next.js App Router

Next.js App Router is the recommended framework. It provides first-party Vercel deployment support, React Server Components for near-zero client JS (only the live score component needs `"use client"`), built-in API routes for sync endpoints and score reads, and ISR if ever needed. It scales to Phase 2 requirements (commish auth, dynamic newsletter editing) without a framework rewrite.

#### ADR-2: Data Store — Vercel Postgres

Vercel Postgres (Neon-backed) is the recommended data store. The domain is inherently relational: seasons, franchises, rosters, matchups, draft picks, and the versioned `roster_id → user_id → franchise` mapping all benefit from SQL joins and referential integrity. The dataset is small (~12 teams, ~20 seasons, <50MB total) so cost and performance are non-issues. Managed automated backups are the most important infrastructure feature — data durability is the #1 architectural principle.

#### ADR-3: Sync Architecture — 3 Cron Jobs + 1 Client Poller

The sync layer is intentionally simple — three cron-triggered serverless functions calling a shared Sleeper API module, plus client-side polling for live scores:

| Concern | Mechanism | Cadence |
|---|---|---|
| **Daily sync** | Vercel Cron → serverless function | Once/day |
| **Hourly sync** | Vercel Cron → serverless function | Every 60 min |
| **Live scores** | Client-side JS fetch → API route → Postgres read | Every 30s (game windows only) |
| **Legacy import** | One-time script, chunked by season | Manual / before go-live |

This is not a "pipeline" — it's three functions that call Sleeper, validate responses, and upsert rows into Postgres. The shared API module (`lib/sleeper.ts`) handles all Sleeper communication with typed responses and schema validation.

The legacy data import is a one-time operation run before go-live. It is idempotent (can be wiped and re-run) and produces a validation report for commish review against known league history.

### Risk Mitigations & Resilience Patterns

| # | Failure Mode | Severity | Likelihood | Prevention |
|---|---|---|---|---|
| 1 | Sleeper API changes silently | High | Medium | Response schema validation + data integrity checks on every sync |
| 2 | Legacy import has bad data | Medium | Medium | One-time import with manual validation by commish before go-live; idempotent so it can be re-run |
| 3 | Vercel function timeouts mid-sync | Medium | Medium | Atomic writes per data type, extended timeouts, per-type sync timestamps |
| 4 | Client poller runs indefinitely | Low | High | Game-window flag from API, visibility API check, auto-stop timeout |
| 5 | Schema blocks Phase 2 evolution | Medium | Low | Forward-compatible schema design, documented Phase 2 schema requirements |

**Resilience principles:**
- Sync writes are **atomic per data type** — a failed transaction sync does not corrupt roster data (NFR11)
- Each data type tracks its own **"last successful sync" timestamp** — not just one global timestamp
- All sync jobs include **response schema validation** before writing to Postgres
- A `sync_log` table records every sync run with row counts, duration, and anomalies
- **Automated database backups** are non-negotiable — the historical record is the site's core asset

### Cross-Cutting Concerns Identified

- **Data durability** — automated Postgres backups, clear migration strategy, normalized schema designed for long-term archival; the historical record is the site's most valuable and irreplaceable asset
- **Data freshness & sync orchestration** — every page depends on cached Sleeper data with visible "last updated" timestamps; sync failures isolated per data type with per-type freshness tracking
- **Serverless execution model** — all backend logic runs as stateless, short-lived serverless functions on Vercel; sync jobs are discrete function invocations triggered by Vercel Cron
- **Legacy import as separate concern** — one-time historical data loading, idempotent, validated by commish before go-live
- **Franchise identity resolution** — the `roster_id → user_id → franchise` mapping is versioned per season and used by nearly every feature
- **Legacy/current era continuity** — all historical features must seamlessly span both the 10-team legacy era and current 12-team league
- **Graceful degradation** — site must serve stale data with timestamps on any Sleeper API failure; no blank pages
- **Client-side poller lifecycle** — game-window poller must self-deactivate when games end (via API flag), pause when tab is hidden (visibility API), and auto-stop after a maximum duration
- **Near-zero client JS** — server components by default; only the live score component ships client-side JavaScript
- **Mobile-first responsive design** — tables need horizontal scroll or card layout on small screens
- **Accessibility** — WCAG 2.1 AA contrast, no color-only signals, no red/purple pairings
- **Schema forward-compatibility** — Phase 1 schema accommodates Phase 2 additions (auth, newsletters, trade center) without overbuilding application code

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application (server-rendered MPA) based on project requirements — Next.js on Vercel with Postgres.

### Starter Options Considered

| Option | What It Is | Verdict |
|---|---|---|
| **`create-next-app` (defaults)** | Official Next.js scaffolding — TypeScript, Tailwind, ESLint, App Router, Turbopack | Best fit — minimal, official, exactly what we need |
| **Vercel `postgres-drizzle` template** | Vercel's starter with Drizzle + Vercel Postgres pre-wired | Good reference, but bundles demo code we don't need |
| **T3 Stack (`create-t3-app`)** | Next.js + tRPC + Prisma + Tailwind + NextAuth | Over-engineered — tRPC and auth unnecessary for Phase 1 |
| **`ts-nextjs-tailwind-starter`** | Community starter with extras (SEO, testing, lint presets) | Too opinionated for a project with clear, simple requirements |

### Selected Starter: `create-next-app` (Official Defaults)

**Rationale:** The official scaffolding gives us exactly what we need with zero bloat. Drizzle, Playwright, and Vercel Postgres are added manually — each is a small, well-documented addition. No demo code to rip out, no opinions to fight.

**Initialization Command:**

```bash
npx create-next-app@latest harambe-memorial-league --typescript --tailwind --eslint --app --turbopack --import-alias "@/*"
```

Then add project dependencies:

```bash
npm install drizzle-orm @vercel/postgres
npm install -D drizzle-kit @playwright/test
npx playwright install
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (strict mode) — Next.js 16.x
- Node.js 20.x+ required

**Styling Solution:**
- Tailwind CSS (v4.x) — configured via `globals.css` with Tailwind directives, PostCSS pre-configured

**Build Tooling:**
- Turbopack (dev server) — significantly faster HMR than Webpack
- Next.js built-in production bundling and optimization

**Testing Framework:**
- Playwright — E2E testing across Chromium, Firefox, WebKit
- Next.js has first-party Playwright documentation and `with-playwright` example for reference

**Code Organization:**
- App Router (`app/` directory) — file-based routing with layouts, loading states, and error boundaries
- React Server Components by default — aligns with "near-zero client JS" principle
- `@/*` import alias for clean imports

**Database & ORM:**
- Drizzle ORM (~7KB runtime) with `@vercel/postgres` driver
- TypeScript-native schema definitions in project code
- `drizzle-kit` for migrations
- SQL-like query syntax — transparent, no magic

**Development Experience:**
- Turbopack hot reload
- TypeScript strict mode with Next.js type checking
- ESLint with Next.js recommended rules

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data modeling approach (Drizzle + Vercel Postgres, Zod validation)
- Sync endpoint security (Vercel native `CRON_SECRET`)
- API route design (Next.js Route Handlers)
- Component architecture (colocated by route, shadcn/ui primitives)

**Important Decisions (Shape Architecture):**
- No caching in Phase 1 — direct Postgres queries on every request
- Hybrid CI/CD — Vercel Git deploy + GitHub Action for Playwright
- Structured sync logging via `sync_log` table
- Sleeper API client as single shared module with per-endpoint functions

**Deferred Decisions (Phase 2+):**
- Authentication (likely Auth.js/NextAuth.js for commish login)
- External error tracking (Sentry or similar if scale warrants)
- Caching layer (ISR available as one-line addition per route if ever needed)

### Data Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Database | Vercel Postgres (Neon) | Relational model fits domain; native Vercel integration; managed backups for data durability |
| ORM | Drizzle ORM v0.45.x | ~7KB runtime; SQL-like transparency; first-class Vercel Postgres support; TypeScript-native schema |
| Migrations | drizzle-kit | Drizzle's built-in migration tooling; generates SQL migration files from schema changes |
| Validation | Zod (with drizzle-zod) | Runtime validation on all Sleeper API responses before DB writes; shared type inference with Drizzle schema |
| Caching | None (Phase 1) | 12-user scale doesn't warrant caching; direct Postgres queries are fast enough; ISR available later if needed |

### Authentication & Security

| Decision | Choice | Rationale |
|---|---|---|
| Phase 1 auth | None — fully public | PRD specifies no login required for Phase 1 |
| Cron endpoint security | Vercel native `CRON_SECRET` header verification | Built-in Vercel pattern; ~3 lines per route handler; prevents unauthorized sync triggers |
| Phase 2 auth (deferred) | Likely Auth.js/NextAuth.js | First-party Next.js integration; only commish needs login; decision documented but not built |
| Principle | Native/built-in verification preferred over third-party | Reduces dependencies; leverages platform guarantees |

### API & Communication Patterns

| Decision | Choice | Rationale |
|---|---|---|
| API layer | Next.js Route Handlers (`app/api/`) | Built-in, file-based; ~4 total routes; no framework needed |
| Sleeper API client | Single shared module (`lib/sleeper.ts`) | One typed function per Sleeper endpoint; each validates its own response with Zod; consistent error handling; small, single-purpose functions |
| Error handling | Structured sync logging + HTTP status codes | `sync_log` table records every sync run (status, rows, errors, duration); API routes return standard HTTP codes; no external tracking in Phase 1 |
| Error tracking | Vercel built-in logs (Phase 1) | Sufficient for 12-user scale; Sentry or similar deferred to Phase 2 if needed |

### Frontend Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Rendering | React Server Components by default | Near-zero client JS; only live score component uses `"use client"` |
| Component organization | Colocated by route | Route-specific components live alongside `page.tsx`; shared UI (nav, footer, tables, timestamp) in top-level `components/` |
| UI primitives | shadcn/ui (Radix UI + Tailwind) | Copied into project (not a dependency); accessible building blocks; 100% customizable; only add what you use |
| Styling | Tailwind CSS v4 | Utility-first; full creative control over visual design; pairs natively with shadcn/ui |
| State management | None | Server components eliminate client state for 95% of the app; live score poller uses a simple `useState`/`setInterval` |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | Vercel (free/hobby tier sufficient for Phase 1) | First-party Next.js support; CDN, serverless functions, cron jobs built-in |
| CI/CD | Vercel Git integration + GitHub Action for Playwright | Push to main = production deploy; PR branches get preview deploys; GitHub Action runs E2E tests before merge |
| Environment config | Vercel env vars (production/preview) + `.env.local` (dev) | Next.js native loading; auto-scoped per environment |
| Monitoring | Vercel built-in logs + `sync_log` table | Function logs and deployment logs from Vercel; sync-specific health from `sync_log` (status, row counts, errors, duration) |
| Env variables required | `POSTGRES_URL`, `CRON_SECRET`, `SLEEPER_LEAGUE_ID` | Minimal config surface; Postgres URL auto-provisioned by Vercel |

### Decision Impact Analysis

**Implementation Sequence:**
1. Project scaffolding (`create-next-app` + dependencies + shadcn/ui init)
2. Database schema design + Drizzle config + initial migration
3. Sleeper API client module (`lib/sleeper.ts`) with Zod validation
4. Sync functions (daily → hourly → game-window poller)
5. Page routes and UI (server components, colocated by route)
6. Live score client component (single `"use client"` island)
7. GitHub Action for Playwright E2E tests
8. Legacy data import script

**Cross-Component Dependencies:**
- Drizzle schema defines types used by both sync functions and page queries
- Zod schemas in `lib/sleeper.ts` validate API responses; Drizzle-Zod bridges DB schema and validation
- shadcn/ui table components are shared across standings, leaderboards, draft history, and matchup views
- `sync_log` table is written by all three sync functions and readable from a future admin/status view

## Implementation Patterns & Consistency Rules

### Naming Conventions

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
- Drizzle schema table variables: `camelCase` (`franchises`, `matchups`)

**API Routes:**
- Route paths: `kebab-case` (`/api/sync-daily`, `/api/sync-hourly`, `/api/live-scores`)
- Query parameters: `camelCase` (`?seasonId=2025&week=9`)

### Structure Conventions

```
app/                    → Routes, layouts, pages (App Router)
  api/                  → API route handlers
    sync-daily/         → Daily sync cron endpoint
    sync-hourly/        → Hourly sync cron endpoint
    live-scores/        → Client poller endpoint
  (routes)/             → Page routes with colocated components
components/             → Shared UI components (nav, footer, tables, timestamp)
  ui/                   → shadcn/ui primitives
lib/                    → Shared logic
  db/                   → Drizzle schema, migrations, connection config
  sleeper.ts            → Sleeper API client (one function per endpoint, Zod validated)
e2e/                    → Playwright E2E tests
public/                 → Static assets
```

- Route-specific components colocated in their `app/` route folder
- Only truly shared components in top-level `components/`
- All database-related code in `lib/db/`
- Playwright tests in top-level `e2e/`
- Unit tests (if any) colocated as `*.test.ts` next to source file

### Format Conventions

**API Responses:**
```typescript
// Success
{ data: T, syncedAt: string }

// Error
{ error: { message: string, code: string } }
```

**Data Formats:**
- Dates in JSON: ISO 8601 strings (`2025-11-23T14:30:00Z`)
- JSON field naming: `camelCase` (Drizzle handles snake_case ↔ camelCase at DB boundary)
- Nulls: explicit `null` in API responses (never `undefined`)
- IDs: string type for Sleeper IDs (`user_id`, `roster_id`), matching Sleeper's format

### Process Patterns

**Sync Job Pattern (all sync functions follow this):**
1. Verify `CRON_SECRET` header
2. Call Sleeper API via `lib/sleeper.ts`
3. Validate response with Zod schema
4. Write to Postgres in a transaction (atomic per data type)
5. Log result to `sync_log` (success/failure, row count, duration, errors)
6. Return HTTP status code

**Error Handling:**
- Sync functions: catch errors per data type; log to `sync_log`; never throw unhandled — a failed roster sync must not block transaction sync
- API routes: return appropriate HTTP status codes (`200`, `401`, `500`) with error response structure
- Pages: Next.js `error.tsx` boundaries per route — show "data unavailable" with last sync timestamp; never a blank page
- Sleeper API client: return typed errors, never throw unhandled exceptions

**Loading & UI States:**
- Server components render complete HTML — no client-side loading states for most pages
- Use Next.js `loading.tsx` per route for streaming/suspense if needed
- Live score poller: show last known scores immediately, update in-place — no spinner, no flash of empty state

### Enforcement Guidelines

**All AI agents MUST:**
- Follow naming conventions exactly — no exceptions or creative alternatives
- Use Drizzle ORM for all database access — no raw SQL outside of migration files
- Validate all Sleeper API responses with Zod before writing to the database
- Use React Server Components by default — `"use client"` only for the live score poller
- Colocate route-specific components in their route folder; only shared components go in `components/`
- Use shadcn/ui primitives as the base for all UI components — do not install additional UI libraries
- Follow the sync job pattern for all sync endpoints
- Log every sync execution to `sync_log` with status, row count, duration, and errors
- Return structured API responses using the defined success/error formats

**Anti-Patterns to Avoid:**
- Creating a `utils/` or `helpers/` grab-bag directory — put logic in `lib/` with descriptive filenames
- Using `"use client"` on pages or layouts — only on the specific interactive component that needs it
- Calling Sleeper API directly from page components — always go through `lib/sleeper.ts`
- Mixing naming conventions (e.g., `camelCase` table names, `PascalCase` file names)
- Installing additional UI component libraries alongside shadcn/ui
- Writing sync functions that don't log to `sync_log`

## Project Structure & Boundaries

### Complete Project Directory Structure

```
harambe-memorial-league/
├── .env.example                    → Template for required env vars
├── .env.local                      → Local dev environment (git-ignored)
├── .gitignore
├── .github/
│   └── workflows/
│       └── e2e.yml                 → GitHub Action: Playwright tests on PRs
├── drizzle.config.ts               → Drizzle Kit migration configuration
├── next.config.ts                  → Next.js configuration
├── package.json
├── playwright.config.ts            → Playwright test configuration
├── postcss.config.js               → PostCSS (Tailwind)
├── tsconfig.json
├── vercel.json                     → Vercel cron job schedules
│
├── app/
│   ├── globals.css                 → Tailwind directives + custom theme
│   ├── layout.tsx                  → Root layout (nav, footer, sync timestamp)
│   ├── page.tsx                    → Homepage (current season overview, recent results)
│   ├── error.tsx                   → Root error boundary
│   ├── not-found.tsx               → 404 page
│   │
│   ├── api/
│   │   ├── sync-daily/
│   │   │   └── route.ts            → Daily sync: players, league settings, historical data
│   │   ├── sync-hourly/
│   │   │   └── route.ts            → Hourly sync: transactions, rosters, traded picks
│   │   └── live-scores/
│   │       └── route.ts            → Live score read endpoint for client poller
│   │
│   ├── seasons/
│   │   ├── page.tsx                → League history timeline (FR1-FR4)
│   │   └── [seasonYear]/
│   │       ├── page.tsx            → Season detail: standings, results, champion (FR2-FR3)
│   │       └── week/
│   │           └── [week]/
│   │               └── page.tsx    → Weekly matchup details (FR11, FR13)
│   │
│   ├── teams/
│   │   ├── page.tsx                → All franchises overview
│   │   └── [franchiseSlug]/
│   │       ├── page.tsx            → Franchise page: history, records, trophies (FR5-FR8)
│   │       ├── roster/
│   │       │   └── page.tsx        → Current full roster (FR27)
│   │       └── drafts/
│   │           └── page.tsx        → Franchise draft history (FR20-FR21)
│   │
│   ├── matchups/
│   │   ├── page.tsx                → Current week matchups with live scores (FR9-FR10)
│   │   └── score-poller.tsx        → "use client" — live score polling component
│   │
│   ├── records/
│   │   ├── page.tsx                → All-time leaderboard + career stats (FR14, FR18)
│   │   ├── head-to-head/
│   │   │   └── page.tsx            → H2H record lookup between two franchises (FR15-FR16)
│   │   ├── rivalries/
│   │   │   └── page.tsx            → Rivalry summaries (FR16)
│   │   ├── power-rankings/
│   │   │   └── page.tsx            → Current power rankings (FR17)
│   │   └── trophies/
│   │       └── page.tsx            → Trophy case: championships, awards (FR19)
│   │
│   ├── drafts/
│   │   ├── page.tsx                → Draft history index (all years)
│   │   └── [seasonYear]/
│   │       └── page.tsx            → Full draft view: all teams, all picks (FR22-FR23)
│   │
│   ├── players/
│   │   └── page.tsx                → Player search + status display (FR24-FR26)
│   │
│   └── playoffs/
│       └── [seasonYear]/
│           └── page.tsx            → Playoff bracket results (FR12)
│
├── components/
│   ├── ui/                         → shadcn/ui primitives (table, card, nav, badge, etc.)
│   ├── site-nav.tsx                → Persistent navigation (FR38)
│   ├── site-footer.tsx             → Footer with sync timestamp (FR32)
│   ├── sync-timestamp.tsx          → "Last updated" display (FR32)
│   ├── data-table.tsx              → Shared sortable table (standings, leaderboards, stats)
│   ├── franchise-badge.tsx         → Franchise name/branding display
│   ├── season-selector.tsx         → Season year picker (reused across routes)
│   └── mobile-table-wrapper.tsx    → Horizontal scroll wrapper for tables on mobile (NFR, FR35)
│
├── lib/
│   ├── sleeper.ts                  → Sleeper API client: one typed function per endpoint, Zod validated
│   ├── sleeper-schemas.ts          → Zod schemas for all Sleeper API response shapes
│   ├── sync/
│   │   ├── daily.ts                → Daily sync logic (players, league settings)
│   │   ├── hourly.ts               → Hourly sync logic (transactions, rosters, picks)
│   │   └── legacy-import.ts        → One-time legacy import, chunked by season
│   ├── db/
│   │   ├── index.ts                → Drizzle client + connection config
│   │   ├── schema.ts               → All Drizzle table definitions
│   │   └── migrations/             → Generated SQL migration files (drizzle-kit)
│   └── queries/
│       ├── franchises.ts           → Franchise-related DB queries
│       ├── matchups.ts             → Matchup/score DB queries
│       ├── seasons.ts              → Season/standings DB queries
│       ├── drafts.ts               → Draft history DB queries
│       ├── records.ts              → Leaderboard/H2H/rivalry DB queries
│       ├── players.ts              → Player search/status DB queries
│       └── sync-log.ts             → Sync log read/write queries
│
├── e2e/
│   ├── home.spec.ts                → Homepage E2E tests
│   ├── franchise.spec.ts           → Franchise page E2E tests
│   ├── matchups.spec.ts            → Matchup/live score E2E tests
│   └── navigation.spec.ts         → Site navigation E2E tests
│
└── public/
    └── (static assets: favicon, images if any)
```

### Architectural Boundaries

**API Boundaries:**
- **Sleeper API → `lib/sleeper.ts`** — the only code that touches the external API. All Sleeper communication flows through this module. No other file imports from Sleeper endpoints directly.
- **Sync endpoints (`app/api/sync-*`)** — only callable by Vercel Cron (verified via `CRON_SECRET`). These call `lib/sync/*.ts` which calls `lib/sleeper.ts` and writes to Postgres.
- **Live scores endpoint (`app/api/live-scores`)** — public read endpoint; returns current matchup scores from Postgres. No Sleeper calls.

**Component Boundaries:**
- **Server components** (all pages) → import from `lib/queries/*.ts` to get data, render HTML
- **Client components** → only `app/matchups/score-poller.tsx`; fetches from `/api/live-scores` on interval
- **Shared components** (`components/`) → pure presentational; receive data as props; never fetch data themselves

**Data Boundaries:**
- **Write path:** Vercel Cron → `app/api/sync-*` → `lib/sync/*.ts` → `lib/sleeper.ts` → Zod validation → `lib/db/` (Drizzle) → Postgres
- **Read path:** Page request → `app/**/page.tsx` (server component) → `lib/queries/*.ts` → `lib/db/` (Drizzle) → Postgres → rendered HTML
- **Live score path:** Client JS → `/api/live-scores` → `lib/queries/matchups.ts` → Postgres → JSON response

### Requirements to Structure Mapping

| FR Category | Route(s) | Query Module | Key Components |
|---|---|---|---|
| League History (FR1-4) | `app/seasons/` | `lib/queries/seasons.ts` | `season-selector`, `data-table` |
| Franchise Pages (FR5-8) | `app/teams/[franchiseSlug]/` | `lib/queries/franchises.ts` | `franchise-badge`, `data-table` |
| Scoring & Matchups (FR9-13) | `app/matchups/`, `app/seasons/[year]/week/[week]/` | `lib/queries/matchups.ts` | `score-poller` (client), `data-table` |
| Records & Rankings (FR14-19) | `app/records/` | `lib/queries/records.ts` | `data-table`, `franchise-badge` |
| Draft History (FR20-23) | `app/drafts/`, `app/teams/[slug]/drafts/` | `lib/queries/drafts.ts` | `data-table`, `season-selector` |
| Player Info (FR24-27) | `app/players/`, `app/teams/[slug]/roster/` | `lib/queries/players.ts` | Search input, `data-table` |
| Data Sync (FR28-33) | `app/api/sync-*`, `app/api/live-scores` | `lib/sync/*.ts`, `lib/queries/sync-log.ts` | `sync-timestamp` |
| Navigation & Access (FR34-38) | Root layout, all routes | — | `site-nav`, `mobile-table-wrapper` |

**Cross-Cutting Concerns Mapping:**

| Concern | Location |
|---|---|
| Franchise identity resolution | `lib/queries/franchises.ts` (shared by all franchise-dependent routes) |
| Sync timestamp display | `components/sync-timestamp.tsx` (in root layout footer) |
| Mobile table handling | `components/mobile-table-wrapper.tsx` (wraps all data tables) |
| Accessibility (color-blind safe) | Tailwind theme config + shadcn/ui component customization |
| Error boundaries | `app/error.tsx` (root) + per-route `error.tsx` where needed |

### Data Flow

```
┌─────────────┐    Cron trigger     ┌──────────────────┐
│ Vercel Cron  │───────────────────→│ app/api/sync-*   │
└─────────────┘                     │ (route handlers) │
                                    └────────┬─────────┘
                                             │ calls
                                    ┌────────▼─────────┐
                                    │ lib/sync/*.ts     │
                                    │ (sync logic)      │
                                    └────────┬─────────┘
                                             │ calls
                                    ┌────────▼─────────┐     validates    ┌──────────┐
                                    │ lib/sleeper.ts    │────────────────→│ Zod      │
                                    │ (API client)      │                 │ schemas  │
                                    └────────┬─────────┘                 └──────────┘
                                             │ writes
                                    ┌────────▼─────────┐
                                    │ lib/db/           │
                                    │ (Drizzle → PG)    │
                                    └────────┬─────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │      Vercel Postgres         │
                              └──────────────┬──────────────┘
                                             │ reads
                              ┌──────────────▼──────────────┐
                              │  lib/queries/*.ts            │
                              └──────────────┬──────────────┘
                                             │
                    ┌────────────────────────┬┴───────────────────┐
                    │                        │                    │
          ┌────────▼────────┐    ┌──────────▼────────┐  ┌───────▼────────┐
          │ app/**/page.tsx  │    │ app/api/live-scores│  │ sync-timestamp │
          │ (server render)  │    │ (JSON response)    │  │ (footer)       │
          └─────────────────┘    └──────────┬─────────┘  └────────────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │ score-poller.tsx  │
                                   │ ("use client")    │
                                   └──────────────────┘
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All technology choices are within the Vercel first-party ecosystem (Next.js 16.x, Vercel Postgres, Vercel Cron) supplemented by ecosystem-standard tools (Drizzle, Zod, Tailwind, shadcn/ui, Playwright). No version conflicts or contradictory decisions found.

**Pattern Consistency:** Naming conventions flow cleanly across boundaries — snake_case in Postgres, camelCase in TypeScript, kebab-case in file names and routes. Drizzle handles the DB↔code naming boundary. The sync job pattern is uniformly applied across all three sync endpoints.

**Structure Alignment:** The project tree maps directly to all 38 functional requirements. Architectural boundaries (Sleeper API → lib/sleeper.ts only; DB writes → sync functions only; DB reads → lib/queries/ only) are clean and enforceable.

### Requirements Coverage

**Functional Requirements:** All 38 FRs mapped to specific routes, query modules, and components. No gaps.

**Non-Functional Requirements:** All 14 NFRs addressed through architectural decisions — performance via direct Postgres queries, reliability via atomic syncs and graceful degradation, integration via rate-limit-safe batch sync, accessibility via shadcn/ui primitives and Tailwind theming.

### Implementation Readiness

**Decision Completeness:** All critical and important decisions are documented with technology choices, versions, and rationale. Deferred decisions (Phase 2 auth, error tracking, caching) are explicitly noted with intended direction.

**Structure Completeness:** Every file and directory is defined with its purpose and FR mapping. Architectural boundaries are specified with data flow paths.

**Pattern Completeness:** Naming, structure, format, process, and enforcement patterns are comprehensive. Anti-patterns are documented. The sync job pattern provides a template for all sync endpoints.

### Gap Analysis

| Priority | Gap | Status |
|---|---|---|
| Important | Database schema (table definitions, relationships, indexes) | Deferred to implementation — architecture provides framework and conventions |
| Important | Visual design system (colors, typography, component styling) | Deferred to UX/design phase — architecture provides Tailwind + shadcn/ui tools |
| Nice-to-have | Health check endpoint (`/api/health`) | Can be added trivially; not blocking |
| Nice-to-have | Sitemap/robots.txt | SEO not a priority per PRD; trivial to add later |

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (low-medium, 12-user audience)
- [x] Technical constraints identified (Sleeper API, Vercel serverless, legacy chaining)
- [x] Cross-cutting concerns mapped (12 concerns identified)

**Architectural Principles**
- [x] Simplicity over abstraction
- [x] Data durability as #1 priority
- [x] Server components by default, single client island
- [x] Correctness over performance
- [x] Forward-compatible schema, not overbuilt code

**Architectural Decisions**
- [x] Framework: Next.js 16.x App Router
- [x] Database: Vercel Postgres (Neon) with Drizzle ORM
- [x] Validation: Zod with drizzle-zod
- [x] Styling: Tailwind CSS v4 + shadcn/ui
- [x] Testing: Playwright E2E
- [x] Deployment: Vercel (Git integration + GitHub Action)
- [x] Security: Vercel native CRON_SECRET
- [x] Monitoring: Vercel logs + sync_log table

**Implementation Patterns**
- [x] Naming conventions established (DB, code, API, files)
- [x] Structure conventions defined (colocated routes, shared components, lib/ organization)
- [x] Format conventions specified (API responses, dates, JSON fields, nulls)
- [x] Process patterns documented (sync job pattern, error handling, loading states)
- [x] Enforcement guidelines and anti-patterns listed

**Project Structure**
- [x] Complete directory tree with all files and purpose annotations
- [x] Architectural boundaries defined (API, component, data)
- [x] Requirements-to-structure mapping complete (all 38 FRs)
- [x] Data flow diagram with write/read/live-score paths
- [x] Cross-cutting concerns mapped to specific locations

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Extremely simple system (Next.js + Postgres + 3 cron functions) aligned with actual project needs
- Every FR and NFR mapped to specific files and patterns
- Clear boundaries prevent AI agents from making conflicting decisions
- Vercel-native stack eliminates integration complexity
- Architecture principles (simplicity, durability, correctness) provide decision-making guardrails

**Areas for Future Enhancement:**
- Database schema design (first implementation story after scaffolding)
- Visual design system and Tailwind theme
- Phase 2 auth architecture (when commish login is needed)
- Potential health check / admin status dashboard

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and architectural boundaries
- Refer to this document for all architectural questions
- When in doubt, favor simplicity — this is a 12-user site

**First Implementation Priority:**
```bash
npx create-next-app@latest harambe-memorial-league --typescript --tailwind --eslint --app --turbopack --import-alias "@/*"
cd harambe-memorial-league
npm install drizzle-orm @vercel/postgres zod
npm install -D drizzle-kit @playwright/test
npx playwright install
npx shadcn@latest init
```
