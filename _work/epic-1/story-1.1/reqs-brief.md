---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 1.1 - Project Scaffolding
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: Two missing packages (`drizzle-zod`, `@vercel/postgres`) need installation. `lib/utils.ts` violates the anti-pattern prohibition on a `utils/` grab-bag but is a shadcn/ui convention artifact — flagged, resolution proposed below. One non-conforming shadcn style setting noted. See Open Questions.
---

# Implementation Brief: Story 1.1 — Project Scaffolding

## Story Reference

- **Epic:** 1 — Project Foundation & Design System
- **Story:** 1.1 — Project Scaffolding
- **Source:** `_work/epic-1/story-1.1/story.md`, `_work/epics.md` (AR1-AR11), `_bmad-output/planning-artifacts/architecture.md` (Starter Template Evaluation, Core Architectural Decisions)
- **Cross-story:** `_work/epic-1/cross-story-context.md` (Story 1.1 must complete before 1.2-1.5)

---

## Current Project State Assessment

The project is **not greenfield**. A substantial Next.js application already exists. The table below inventories every acceptance criterion against the actual codebase state.

| Criterion | Status | Evidence |
|---|---|---|
| Next.js 16+ (App Router) | PRESENT | `package.json` → `"next": "^16.2.1"` |
| TypeScript strict mode | PRESENT | `tsconfig.json` → `"strict": true` |
| Tailwind CSS v4 | PRESENT | `package.json` → `"tailwindcss": "^4.2.2"` |
| ESLint | PRESENT | `package.json` → `"eslint": "^9.39.4"`, `"eslint-config-next": "^16.2.1"` |
| Turbopack (dev) | PRESENT | `package.json` scripts → `"dev": "next dev --turbopack"` |
| Drizzle ORM | PRESENT | `package.json` → `"drizzle-orm": "^0.45.1"`, `drizzle-kit` in devDependencies |
| `@vercel/postgres` | **MISSING** | Not in `package.json`; DB uses `@neondatabase/serverless` directly instead |
| Zod | PRESENT | `package.json` → `"zod": "^4.3.6"` |
| `drizzle-zod` | **MISSING** | Not in `package.json`; no `drizzle-zod` usage found |
| Playwright | PRESENT | `"@playwright/test": "^1.58.2"` in devDependencies; `playwright.config.ts` configured |
| shadcn/ui initialized | PRESENT | `components.json` present; `components/ui/button.tsx` exists |
| `@/*` import alias | PRESENT | `tsconfig.json` → `"paths": { "@/*": ["./*"] }` |
| `app/` directory | PRESENT | Full App Router structure with routes, layouts, API handlers |
| `components/` directory | PRESENT | 15+ shared components including nav, footer, UI primitives |
| `lib/` directory | PRESENT | `db/`, `queries/`, `sync/`, `sleeper.ts`, `sleeper-schemas.ts` all present |
| `e2e/` directory | PRESENT | `e2e/navigation.spec.ts` exists; Playwright config points to `./e2e` |
| GitHub Action for E2E (AR11) | PRESENT | `.github/workflows/e2e.yml` — triggers on PRs to main |
| Vercel Cron config (AR10) | PARTIAL | `vercel.json` has daily cron; no hourly cron entry |

---

## Restated Acceptance Criteria

### AC-1: Framework Stack
**Given** the project exists
**When** inspected
**Then** it uses Next.js 16+ (App Router), TypeScript strict mode, Tailwind CSS v4, ESLint, and Turbopack for `dev`

**Resolution:** Already satisfied. No action required. (AR1)

### AC-2: Required Dependencies Installed
**Given** the project exists
**When** `package.json` is inspected
**Then** all of the following are installed:
- Drizzle ORM — PRESENT
- `@vercel/postgres` — **MISSING**
- Zod — PRESENT
- `drizzle-zod` — **MISSING**
- Playwright — PRESENT

**Resolution:** Install the two missing packages. See Database Changes section. (AR1, AR2)

### AC-3: shadcn/ui Initialized
**Given** the project exists
**When** `components.json` and `components/ui/` are inspected
**Then** shadcn/ui is initialized with RSC support, Tailwind CSS variables, lucide icon library, and `@/components/ui` alias

**Resolution:** Initialized. `components.json` present. One deviation noted (see Open Questions #1). (AR4)

### AC-4: `@/*` Import Alias
**Given** `tsconfig.json` is inspected
**When** the `paths` key is read
**Then** `"@/*": ["./*"]` is configured

**Resolution:** Already satisfied. No action required.

### AC-5: Folder Structure Matches Architecture Spec
**Given** the project exists
**When** root directory is listed
**Then** these top-level directories are present: `app/`, `components/`, `lib/`, `e2e/`
**And** `app/api/` contains sync and live-score route handlers
**And** `lib/db/` contains Drizzle schema and migrations
**And** `lib/queries/` contains domain query modules
**And** `lib/sync/` contains sync logic

**Resolution:** All directories exist and match the architecture spec layout. No structural changes required.

---

## Database Changes

### No schema changes required for this story.

The full database schema (`lib/db/schema.ts`) is already implemented and includes all tables specified in AR8:
- `seasons`, `franchises`, `franchise_seasons`, `matchups`, `players`, `draft_picks`, `transactions`, `roster_players`, `sync_log`

The `sync_log` table (AR8) is present with all required columns: `sync_type`, `status`, `data_type`, `row_count`, `duration_ms`, `error_message`, `details_json`, `started_at`, `completed_at`.

Drizzle migration files exist at `lib/db/migrations/`.

---

## Dependency Changes Required

### Install: `@vercel/postgres`

**Why missing matters:** The architecture doc (ADR-2, architecture.md) specifies Drizzle ORM with `@vercel/postgres` as the database driver. The current implementation uses `@neondatabase/serverless` directly in `lib/db/index.ts`. The story acceptance criteria explicitly list `@vercel/postgres` as a required dependency (story.md AC-2).

**Action:** Add `@vercel/postgres` to `dependencies` in `package.json`.

**Note:** Whether `lib/db/index.ts` should be refactored to use `@vercel/postgres` driver (via `drizzle-orm/vercel-postgres`) vs. keeping `@neondatabase/serverless` (via `drizzle-orm/neon-http`) is an open question that requires a decision. Both connect to the same Neon-backed database. See Open Questions #2.

### Install: `drizzle-zod`

**Why missing matters:** The story acceptance criteria explicitly list `drizzle-zod` (story.md AC-2). The architecture doc specifies "Zod (with drizzle-zod) for all Sleeper API response validation" (architecture.md Data Architecture table). While current `lib/sleeper-schemas.ts` uses Zod schemas independently, `drizzle-zod` enables deriving insert/select schemas directly from Drizzle table definitions — used in later stories for validation at the DB boundary.

**Action:** Add `drizzle-zod` to `dependencies` in `package.json`.

---

## API Endpoints

No new API endpoints are required for this story. All sync endpoints already exist:
- `app/api/sync-daily/` (AR7, AR10)
- `app/api/sync-hourly/` (AR7, AR10)
- `app/api/live-scores/` (FR30)
- `app/api/legacy-import/` (AR9)
- `app/api/legacy-validate/` (AR9)

---

## Validation Schemas

No new Zod schemas required for this story. `lib/sleeper-schemas.ts` already contains schemas for all Sleeper API response shapes (AR3, AR6).

---

## Business Rules

### BR-1: Vercel Cron Configuration (AR10)
The `vercel.json` file currently contains only the daily cron job (`/api/sync-daily` at `0 6 * * *`). The hourly sync (`/api/sync-hourly`) is missing from `vercel.json`. This is a scaffolding concern: the cron configuration must declare all scheduled jobs.

**Action:** Add an entry for `/api/sync-hourly` at `0 * * * *` to `vercel.json`.

### BR-2: `lib/utils.ts` — Anti-Pattern Exception
CLAUDE.md prohibits a `utils/` or `helpers/` grab-bag directory and says "put logic in `lib/` with descriptive filenames." The file `lib/utils.ts` exists solely to export the `cn()` function (a `clsx` + `tailwind-merge` helper) required by shadcn/ui primitives. `components.json` aliases it at `"utils": "@/lib/utils"` per shadcn/ui convention.

**Resolution:** This is a required shadcn/ui structural artifact that cannot be renamed without breaking all `shadcn` CLI-generated components. Accept `lib/utils.ts` as the sole permitted exception to the anti-pattern rule. No change required. Document this exception in `_work/epic-1/cross-story-context.md` so downstream agents do not flag it.

---

## Cross-Cutting Concerns Checklist

| Concern | Status for Story 1.1 |
|---|---|
| TypeScript strict mode | SATISFIED — `tsconfig.json` `"strict": true` |
| ESLint configured | SATISFIED — `eslint-config-next` present |
| `@/*` import alias | SATISFIED — `tsconfig.json` paths configured |
| React Server Components by default | SATISFIED — App Router, no client components in layout |
| No `"use client"` on pages/layouts | SATISFIED — `app/layout.tsx` is a Server Component |
| Drizzle ORM for all DB access | SATISFIED — `lib/db/index.ts` uses Drizzle |
| Zod validation on Sleeper responses | SATISFIED — `lib/sleeper-schemas.ts` present, used in `lib/sleeper.ts` |
| Sync jobs log to `sync_log` | SATISFIED — `sync_log` table present in schema |
| Playwright E2E configured | SATISFIED — `playwright.config.ts` + `e2e/` directory |
| GitHub Action for E2E on PRs (AR11) | SATISFIED — `.github/workflows/e2e.yml` |
| WCAG 2.1 AA accessibility baseline | SATISFIED — skip link in `app/layout.tsx`, focus-visible ring in `globals.css`, `prefers-reduced-motion` media query |
| No color-only information (NFR12) | N/A for scaffolding story |
| No red/purple pairings (NFR13) | N/A for scaffolding story |
| Press Box color palette in CSS | SATISFIED — `globals.css` defines `#FAF8F5` background, `#2D5A3D` primary, `#B8860B` gold |
| Geist Sans font via `next/font` | SATISFIED — `app/layout.tsx` loads Geist via `next/font/google` |
| SLEEPER_LEAGUE_ID env var | Present in `.github/workflows/e2e.yml`; must be set in Vercel env vars |
| POSTGRES_URL env var | Present; `drizzle.config.ts` reads from `.env.local` |
| CRON_SECRET env var | Present in `.github/workflows/e2e.yml`; must be set in Vercel env vars |

---

## NFR Targets

| NFR | Relevant to Story 1.1 | Current State |
|---|---|---|
| NFR4: No page load triggers Sleeper API | Scaffolding prerequisite | SATISFIED — architecture enforces this via RSC + sync pattern |
| NFR9: Under 1,000 API calls/minute | Scaffolding prerequisite | SATISFIED — rate limit respected in `lib/sleeper.ts` design |
| NFR11: Sync failure isolation | Satisfied by schema design | SATISFIED — `sync_log` per data type exists |
| NFR12: No color-only info | N/A this story | N/A |
| NFR14: WCAG 2.1 AA | Baseline in layout | SATISFIED — focus rings, skip link, reduced motion |

---

## Forward Dependencies

These items from this story are required by all downstream stories:

| Item | Required By |
|---|---|
| `@/*` import alias | Every story — all imports use `@/` |
| Drizzle schema (`lib/db/schema.ts`) | Epic 2 (sync pipeline), every data-display story |
| `lib/sleeper.ts` + `lib/sleeper-schemas.ts` | Epic 2 (sync pipeline) |
| `lib/queries/` module structure | Every page story (3+) |
| shadcn/ui `components/ui/` | Stories 1.2, 1.3, 1.4, 1.5 and all UI stories |
| `app/globals.css` Press Box tokens | Story 1.2 (theme validation), all UI stories |
| Playwright + `e2e/` + GitHub Action | All stories with E2E acceptance tests |
| `vercel.json` cron entries (both) | Epic 2 sync stories |
| `drizzle-zod` (once installed) | Epic 2 stories using schema-derived validation |

---

## Open Questions

### OQ-1: shadcn/ui Style Setting (Non-blocking)
`components.json` sets `"style": "base-nova"`. The architecture spec (AR4) says shadcn/ui should be initialized with the project and restyled to the Press Box Evolved theme. Story 1.2 owns the full theme implementation. However, `"base-nova"` is a non-standard shadcn style value (standard options are `"default"` and `"new-york"`). This may have been set during initialization with a newer shadcn CLI version.

**Proposed resolution:** Accept as-is; Story 1.2 (theme) overrides all default colors regardless of the style preset. Flag for Story 1.2 REQS to verify compatibility.

### OQ-2: `@vercel/postgres` vs `@neondatabase/serverless` (Decision Required)
The story requires installing `@vercel/postgres`, but `lib/db/index.ts` already uses `@neondatabase/serverless` with `drizzle-orm/neon-http`. Both connect to the same Neon-backed Vercel Postgres database. The `@vercel/postgres` package uses a different Drizzle adapter (`drizzle-orm/vercel-postgres`) and a different connection mode.

**Options:**
1. Install `@vercel/postgres` and refactor `lib/db/index.ts` to use it (strict compliance with AR2 and story AC)
2. Install `@vercel/postgres` as a dependency but keep `@neondatabase/serverless` as the active driver (satisfies the letter of the AC without behavior change)
3. Accept `@neondatabase/serverless` as the driver with a documented deviation from AR2 (both are valid Neon drivers; `@neondatabase/serverless` is actually recommended by Neon for serverless)

**Recommendation:** Option 1 is the strictest interpretation of AR2. However, the existing implementation with `@neondatabase/serverless` is architecturally equivalent and works correctly. The IMPL agent should make this call. The REQS brief requires that `@vercel/postgres` is at minimum installed as a package (satisfying the story AC literally), and that a decision is documented in the cross-story context.

### OQ-3: `drizzle-zod` Usage Pattern (Non-blocking)
`drizzle-zod` is listed in acceptance criteria but currently unused. The `lib/sleeper-schemas.ts` module defines Zod schemas independently from the Drizzle schema. This is valid (Zod schemas for API responses, Drizzle types for DB rows). `drizzle-zod` would be used to generate insert-validation schemas from Drizzle table definitions. Installing the package satisfies the AC; actual usage patterns are defined by Epic 2 stories.

**Proposed resolution:** Install `drizzle-zod`; defer usage decisions to Epic 2 (Data Infrastructure & Sync Pipeline).

---

## Implementation Checklist for IMPL Agent

The following concrete actions are required to close Story 1.1:

1. **Install `@vercel/postgres`** — add to `dependencies` in `package.json` (run `npm install @vercel/postgres`)
2. **Install `drizzle-zod`** — add to `dependencies` in `package.json` (run `npm install drizzle-zod`)
3. **Add hourly cron to `vercel.json`** — add `{ "path": "/api/sync-hourly", "schedule": "0 * * * *" }` to the `crons` array (BR-1, AR10)
4. **Decision on DB driver** — resolve OQ-2 and document the outcome in `_work/epic-1/cross-story-context.md`
5. **Update cross-story context** — document the `lib/utils.ts` anti-pattern exception (BR-2)
6. **Run `npm run lint`** and `npx tsc --noEmit` to verify no regressions from package additions
7. **Run `npm run dev`** to verify the dev server starts correctly with Turbopack

No file renames, folder restructuring, or component changes are required. The existing folder structure exactly matches the architecture spec (`app/`, `components/`, `lib/`, `e2e/`).

---

## What Is Explicitly Out of Scope for Story 1.1

- Theme token implementation (Story 1.2)
- Layout component implementation (Story 1.3)
- Snarky label content system (Story 1.4)
- Empty state and error components (Story 1.5)
- Any Drizzle schema changes
- Any new Sleeper API integration
- Any new page routes
- E2E test authoring (beyond what already exists in `e2e/navigation.spec.ts`)
