---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-03-21'
inputDocuments: ['prd.md', 'architecture.md', 'ux-design-specification.md']
---

# FantasyWebsite - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FantasyWebsite (Harambe Memorial League), decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Visitors can view a chronological timeline of all HML seasons, including legacy 10-team era seasons
FR2: Visitors can view season-level summaries including final standings, champion, and notable stats for any historical season
FR3: Visitors can navigate to any individual season's detail view from the timeline
FR4: The system links historical seasons across the legacy and current league using Sleeper's `previous_league_id` chain
FR5: Visitors can view a dedicated page for each franchise showing its complete history across all seasons
FR6: Each franchise page displays the owner attributed to each season year
FR7: Franchise pages display season-by-season records, standings finishes, and championship results
FR8: Franchise identity (team name, branding) persists across ownership changes
FR9: Visitors can view weekly matchup scores for the current season
FR10: Matchup scores refresh automatically during active NFL game windows without requiring a page reload
FR11: Visitors can view the full weekly schedule and results for any historical season
FR12: Visitors can view playoff bracket results for any completed season
FR13: Visitors can view individual matchup details including team scores and rosters for any historical week
FR14: Visitors can view the all-time leaderboard ranking all franchises by career performance metrics (wins, points scored, championships)
FR15: Visitors can view head-to-head records between any two franchises across all seasons
FR16: Visitors can view rivalry summaries including win streaks, notable matchups, and historical trends
FR17: Visitors can view the current power rankings
FR18: Visitors can view career legacy stats for any franchise spanning all seasons including legacy era
FR19: Visitors can view the trophy case displaying all-time awards and championship history
FR20: Visitors can view the complete draft history for any franchise, including startup draft and all annual rookie drafts
FR21: Draft history displays picks by round and year, attributed to the owning franchise at time of draft
FR22: Visitors can view any historical draft in full (all teams, all picks, all rounds)
FR23: Draft history covers all seasons including legacy era
FR24: Visitors can search for any NFL player by name
FR25: Player results display the player's current HML roster owner, NFL team, position, and injury/status designation
FR26: Player status reflects the most recent Sleeper data sync
FR27: Visitors can view the full roster for any franchise
FR28: The system syncs the full player database from Sleeper once per day
FR29: The system syncs transactions, trades, rosters, and traded picks from Sleeper once per hour
FR30: The system syncs matchup scores from Sleeper every 30 seconds during active NFL game windows
FR31: The system uses the NFL state endpoint to determine active game windows and activates/deactivates the score poller accordingly
FR32: Every page displays a "Last updated" timestamp indicating when data was last synced
FR33: The system maintains a versioned mapping of `roster_id → user_id → franchise` per season
FR34: All pages are accessible without a login or account
FR35: All pages render correctly on mobile, tablet, and desktop screen sizes
FR36: All color-coded information is conveyed through labels, icons, or patterns in addition to color
FR37: All major content pages have clean, shareable URLs
FR38: Visitors can navigate between all major sections from a persistent navigation element

### NonFunctional Requirements

NFR1: Standard content pages (history, franchise, standings, leaderboard) load within 3 seconds on a modern mobile connection
NFR2: Matchup score updates during game windows are reflected on-screen within 5 seconds of the 30-second poll completing
NFR3: Player search returns results within 2 seconds of query submission
NFR4: All data is served from local cache; no page load triggers a live Sleeper API call
NFR5: The site remains accessible during Sleeper API outages — all pages serve last-cached data rather than returning errors
NFR6: Daily and hourly sync jobs complete without manual intervention; failed syncs are logged and retried automatically
NFR7: The game-window poller degrades gracefully on Sleeper API errors — displays last known scores with timestamp rather than blank or broken state
NFR8: Site targets 99%+ uptime, particularly September through January (active NFL season)
NFR9: All three sync jobs combined stay under Sleeper's 1,000 calls/minute rate limit
NFR10: The system stores `user_id` as the stable identifier for all historical data; display names resolved at render time
NFR11: A sync failure for one data type does not block or corrupt other data types
NFR12: No information is conveyed by color alone — all color-coded UI elements include a secondary indicator (label, icon, or pattern)
NFR13: The site avoids red/purple color pairings as primary data signals
NFR14: The site meets WCAG 2.1 AA contrast ratio standards for text and interactive elements

### Additional Requirements

- **Starter template**: Architecture specifies `create-next-app` with TypeScript, Tailwind, ESLint, App Router, Turbopack, and `@/*` import alias as the project scaffold
- **Dependencies to install**: drizzle-orm, @vercel/postgres, zod, drizzle-kit, @playwright/test, shadcn/ui init
- **Database**: Vercel Postgres (Neon-backed) with Drizzle ORM v0.45.x for all data access; drizzle-kit for migrations
- **Validation**: Zod with drizzle-zod for runtime validation on all Sleeper API responses before DB writes
- **Sleeper API client**: Single shared module (`lib/sleeper.ts`) with one typed function per endpoint, Zod-validated responses
- **Sync job pattern**: All sync endpoints must verify CRON_SECRET header, call Sleeper via lib/sleeper.ts, validate with Zod, write atomically per data type, and log to sync_log table
- **Atomic sync writes**: Each data type syncs independently; a failed roster sync must not block transaction sync (NFR11)
- **sync_log table**: Records every sync run with status, row counts, duration, and errors
- **Per-type sync timestamps**: Each data type tracks its own "last successful sync" timestamp
- **Cron endpoint security**: Vercel native CRON_SECRET header verification on all sync API routes
- **Project structure**: App Router with colocated route components, shared UI in `components/`, Sleeper client and DB in `lib/`, E2E tests in `e2e/`
- **React Server Components by default**: Only `score-poller.tsx` uses `"use client"`; all other pages are server components with zero client JS
- **Legacy data import**: One-time idempotent script chunked by season, run before go-live, with validation report for commish review
- **CI/CD**: Vercel Git integration for deploys + GitHub Action running Playwright E2E tests on PRs
- **Environment variables**: `POSTGRES_URL`, `CRON_SECRET`, `SLEEPER_LEAGUE_ID`
- **Error boundaries**: Next.js `error.tsx` per route showing "data unavailable" with last sync timestamp; never blank pages
- **API response format**: Success: `{ data: T, syncedAt: string }`, Error: `{ error: { message: string, code: string } }`
- **Naming conventions**: snake_case DB tables/columns, kebab-case files/routes, PascalCase components/types, camelCase functions/variables

### UX Design Requirements

UX-DR1: Implement the Press Box color system as Tailwind theme tokens — warm off-white background (#FAF8F5), soft white surfaces, rich charcoal text (#1A1A1A), warm gray secondary text (#6B6560), forest green accent (#2D5A3D), antique gold achievement (#B8860B), warm light gray borders (#E8E4E0)
UX-DR2: Implement Geist Sans typography system via next/font with defined type scale — Display (48-64px, Black 900), H1 (36-40px, Bold 700), H2 (28-32px, Bold 700), H3 (20-24px, Medium 500), Body Large (18px), Body (16px), Body Small (14px), Caption (12px, Medium 500)
UX-DR3: Implement 8px base spacing system as Tailwind theme tokens — xs(8), sm(16), md(24), lg(32), xl(48), 2xl(64), 3xl(96), 4xl(128)
UX-DR4: Build FranchiseLogo component — square container with next/image logo or 2-letter initial fallback with per-franchise background color; variants: sm(32px), md(48px), lg(64px), xl(96px)
UX-DR5: Build ChampionshipStars component — gold star icons (antique gold) per championship count; variants: inline (12-14px) and hero (18-20px); renders nothing for zero championships; aria-label for accessibility
UX-DR6: Build SuperlativeBadge component — caption-sized uppercase text with subtle background tint; variants: gold (achievements), green (active/current), neutral (informational like "Legacy Era")
UX-DR7: Build LiveIndicator component — pulsing green dot (8px) + "Live" text label; respects prefers-reduced-motion (solid dot, no pulse); aria-label when active
UX-DR8: Build SyncTimestamp component — "Last updated" with relative time, absolute time on hover via Tooltip; states: fresh (<1hr), stale (>1hr, muted), error ("Data may be outdated")
UX-DR9: Build SeasonSelector component — horizontal row of SeasonYear pills with active year in forest green; optional "All-Time" pill; role="tablist" with keyboard arrow navigation; horizontal scroll on mobile overflow
UX-DR10: Build StatHero component — display-weight number with optional SuperlativeBadge above, label below, and context line; variants: xl(80px), lg(48-56px), md(36-40px)
UX-DR11: Build FranchiseIdentity composed component — FranchiseLogo + franchise name + ChampionshipStars + optional owner name; variants: compact (leaderboard row), standard (matchup row), hero (franchise page)
UX-DR12: Build MatchupRow component — left team vs right team layout with scores; variants: live (with LiveIndicator, scores update), final (winning score bolded), preview (no scores, "vs" centered); aria reads as "{Team A} {score} versus {Team B} {score}"
UX-DR13: Build H2HHero component — massive head-to-head record display with FranchiseIdentity on each side, StatHero xl record, context line, streak SuperlativeBadge; optimized for mobile screenshot
UX-DR14: Build ScrollReveal component — Intersection Observer wrapper; fade up from 20px, 400ms ease-out; 50ms stagger for sequential elements; triggers once only; fully disabled when prefers-reduced-motion is set
UX-DR15: Build ScorePoller client component — single "use client" island; manages setInterval fetch to /api/live-scores every 30s; auto-starts on isGameWindow flag; pauses on tab hidden (Visibility API); auto-stops after 4 hours; aria-live="polite" for score updates
UX-DR16: Build PageSection layout component — section label (optional, forest green caption) + section title (H2) + content slot; 96px vertical padding between sections, 48px internal
UX-DR17: Build MobileTableView component — renders DataTable on desktop, converts to stacked cards on mobile (<768px) showing key columns with detail on tap
UX-DR18: Build BottomTabBar component — mobile-only (<768px) persistent bottom navigation; 5-6 icon+label tabs (Matchups, Teams, Records, Drafts, History, Players); active tab forest green; 56px height with safe-area padding for notched devices
UX-DR19: Implement top navigation bar for desktop (>=768px) — sticky, forest green logo/wordmark left, nav links right; active page indicated by forest green text + underline; no dropdowns
UX-DR20: Implement Editorial Scroll as the base visual language — full-width sections, bold typography as hero, generous whitespace, scroll-triggered content reveals via ScrollReveal
UX-DR21: Implement team logo system — logos stored in public/logos/{slug}.png at square aspect ratio; FranchiseLogo component handles image-present and initial-fallback states seamlessly
UX-DR22: Implement win/loss presentation via typography — wins use bold weight (700) + "W" label, losses use regular weight (400) + "L" label in muted color; never rely on green/red color coding
UX-DR23: Implement responsive breakpoint strategy — mobile-first CSS with md(768px) as primary breakpoint, lg(1024px) for full desktop, xl(1280px) content max-width, 2xl(1440px) no layout changes
UX-DR24: Implement max content width of 1200px centered on desktop — extra screen space becomes margin, not wider content
UX-DR25: Implement accessibility patterns — skip-to-content link, visible focus indicators (forest green ring), semantic HTML hierarchy, aria-current on active nav items, aria-labels on icon-only elements via VisuallyHidden
UX-DR26: Implement homepage as living dashboard — current season standings, this week's matchup preview/results, featured rotating superlative stat; editorial scroll layout without card containers
UX-DR27: Implement franchise page with hero-then-detail pattern — hero section with career stats at Display weight + championship stars; season-by-season scroll narrative below; tabs for History/Roster/Drafts; legacy era subtly distinguished
UX-DR28: Implement all-franchises overview page — grid of FranchiseIdentity blocks with logo, name, record, championship stars; previous/next navigation between franchise detail pages
UX-DR29: Implement H2H page with franchise picker — two side-by-side selectors (stacked on mobile), URL updates on selection for shareability, default "Select two franchises to compare" prompt
UX-DR30: Implement leaderboard with three contexts via SeasonSelector — current season, any historical season, and all-time career; bold rank numbers, gold top-3, superlative badges; sortable columns

### FR Coverage Map

FR1: Epic 1 - League history timeline display
FR2: Epic 1 - Season-level summaries (standings, champion, stats)
FR3: Epic 1 - Navigate to individual season detail views
FR4: Epic 1 - Link historical seasons via previous_league_id chain
FR5: Epic 2 - Dedicated franchise page with complete history
FR6: Epic 2 - Owner attributed to each season year
FR7: Epic 2 - Season-by-season records, standings, championships
FR8: Epic 2 - Franchise identity persists across ownership changes
FR9: Epic 3 - Weekly matchup scores for current season
FR10: Epic 3 - Auto-refresh scores during active game windows
FR11: Epic 3 - Full weekly schedule/results for any historical season
FR12: Epic 3 - Playoff bracket results for any completed season
FR13: Epic 3 - Individual matchup details (scores + rosters) for any week
FR14: Epic 4 - All-time leaderboard by career metrics
FR15: Epic 4 - Head-to-head records between any two franchises
FR16: Epic 4 - Rivalry summaries with streaks and trends
FR17: Epic 4 - Current power rankings
FR18: Epic 4 - Career legacy stats spanning all seasons
FR19: Epic 4 - Trophy case with all-time awards and championships
FR20: Epic 5 - Complete draft history per franchise (startup + rookie)
FR21: Epic 5 - Picks by round and year, attributed to owning franchise
FR22: Epic 5 - Full historical draft view (all teams, all picks)
FR23: Epic 5 - Draft history covers all seasons including legacy era
FR24: Epic 6 - Search any NFL player by name
FR25: Epic 6 - Player results show HML owner, NFL team, position, status
FR26: Epic 6 - Player status reflects most recent Sleeper sync
FR27: Epic 2 - Full roster view for any franchise
FR28: Epic 1 - Daily sync of full player database from Sleeper
FR29: Epic 3 - Hourly sync of transactions, trades, rosters, traded picks
FR30: Epic 3 - 30-second matchup score sync during active game windows
FR31: Epic 3 - NFL state endpoint determines active game windows
FR32: Epic 1 - "Last updated" sync timestamp on every page
FR33: Epic 1 - Versioned roster_id → user_id → franchise mapping per season
FR34: Epic 1 - All pages accessible without login
FR35: Epic 1 - All pages render on mobile, tablet, and desktop
FR36: Epic 1 - Color-coded info conveyed through labels/icons/patterns + color
FR37: Epic 1 - Clean, shareable URLs for all major content pages
FR38: Epic 1 - Persistent navigation element across all sections

## Epic List

### Epic 1: Site Foundation & League Overview
Visitors can browse the HML site, view the league history timeline, and explore any season's standings and results. Establishes the site shell, design system, Sleeper data pipeline, and the first content pages.
**FRs covered:** FR1, FR2, FR3, FR4, FR28, FR32, FR33, FR34, FR35, FR36, FR37, FR38
**Additional Requirements:** Project scaffolding (create-next-app), DB schema, Sleeper API client, daily sync, sync_log, CRON_SECRET security, error boundaries, CI/CD pipeline, naming conventions, environment config
**UX-DRs:** UX-DR1, UX-DR2, UX-DR3, UX-DR8, UX-DR9, UX-DR14, UX-DR16, UX-DR18, UX-DR19, UX-DR20, UX-DR23, UX-DR24, UX-DR25

### Epic 2: Franchise Pages & Team Identity
Visitors can view dedicated franchise pages with complete history, year-attributed ownership, season records, championship history, and current rosters.
**FRs covered:** FR5, FR6, FR7, FR8, FR27
**UX-DRs:** UX-DR4, UX-DR5, UX-DR10, UX-DR11, UX-DR21, UX-DR22, UX-DR27, UX-DR28

### Epic 3: Matchups & Live Scoring
Visitors can view weekly matchups with near-live scores during NFL game windows, browse historical matchup results, playoff brackets, and see this week's action on the homepage dashboard.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR29, FR30, FR31
**UX-DRs:** UX-DR7, UX-DR12, UX-DR15, UX-DR17, UX-DR26

### Epic 4: Records, Rankings & Rivalries
Visitors can view the all-time leaderboard, head-to-head records, rivalry summaries, power rankings, career legacy stats, and the trophy case.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19
**UX-DRs:** UX-DR6, UX-DR10, UX-DR13, UX-DR29, UX-DR30

### Epic 5: Draft History
Visitors can explore complete draft history by franchise and year, including startup and rookie drafts across all seasons and the legacy era.
**FRs covered:** FR20, FR21, FR22, FR23

### Epic 6: Player Search & Status
Visitors can search for any NFL player by name and see their HML roster owner, NFL team, position, and injury/status designation.
**FRs covered:** FR24, FR25, FR26

### Epic 7: Legacy Data Import & Validation
The full legacy 10-team era history is imported from Sleeper's league chain, validated by the commish, and seamlessly integrated into all existing site features from day one.
**Additional Requirements:** One-time idempotent import script, chunked by season, with validation report for commish review

---

## Epic 1: Site Foundation & League Overview

Visitors can browse the HML site, view the league history timeline, and explore any season's standings and results. Establishes the site shell, design system, Sleeper data pipeline, and the first content pages.

### Story 1.1: Project Initialization

As a developer,
I want the project scaffolded with the correct stack and dependencies,
So that all future development starts from a consistent, working foundation.

**Acceptance Criteria:**

**Given** no project exists yet
**When** the initialization script is run
**Then** a Next.js App Router project is created with TypeScript, Tailwind CSS v4, ESLint, and Turbopack
**And** drizzle-orm, @vercel/postgres, and zod are installed as dependencies
**And** drizzle-kit, @playwright/test are installed as dev dependencies
**And** shadcn/ui is initialized with the project
**And** a .env.example file lists POSTGRES_URL, CRON_SECRET, and SLEEPER_LEAGUE_ID
**And** vercel.json defines cron schedules for daily and hourly sync jobs
**And** a GitHub Action workflow file runs Playwright E2E tests on pull requests
**And** the @/* import alias is configured in tsconfig.json

### Story 1.2: Design System Tokens

As a developer,
I want the Press Box design tokens defined in the Tailwind theme,
So that all components use consistent colors, typography, and spacing without hardcoded values.

**Acceptance Criteria:**

**Given** the project is initialized with Tailwind CSS
**When** the design tokens are configured in the Tailwind theme
**Then** the Press Box color palette is available as Tailwind utilities — warm off-white background (#FAF8F5), soft white surfaces, rich charcoal text (#1A1A1A), warm gray secondary (#6B6560), forest green accent (#2D5A3D), antique gold (#B8860B), warm light gray borders (#E8E4E0)
**And** Geist Sans is loaded via next/font with zero layout shift
**And** a typography scale is defined — Display (48-64px, Black 900), H1 (36-40px, Bold 700), H2 (28-32px, Bold 700), H3 (20-24px, Medium 500), Body Large (18px), Body (16px), Body Small (14px), Caption (12px, Medium 500)
**And** an 8px spacing scale is defined — xs(8), sm(16), md(24), lg(32), xl(48), 2xl(64), 3xl(96), 4xl(128)
**And** no hardcoded hex values or pixel sizes appear outside the theme config

### Story 1.3: Root Layout & Responsive Shell

As a visitor,
I want the site to look polished and readable on any device,
So that I can browse on my phone, tablet, or desktop without layout issues.

**Acceptance Criteria:**

**Given** a visitor loads any page on the site
**When** the root layout renders
**Then** Geist Sans is applied as the page font
**And** content is constrained to a max-width of 1200px, centered with auto margins
**And** on screens wider than 1440px, extra space becomes margin, not wider content
**And** base styles follow mobile-first CSS with responsive breakpoints at md(768px), lg(1024px), xl(1280px)
**And** horizontal padding is 16px on mobile

### Story 1.4: Desktop Navigation

As a visitor on a desktop or tablet,
I want a persistent top navigation bar,
So that I can quickly jump between the main sections of the site.

**Acceptance Criteria:**

**Given** a visitor is viewing the site at screen width >= 768px
**When** any page loads
**Then** a sticky top navigation bar is visible with the HML logo/wordmark on the left
**And** navigation links for Matchups, Teams, Records, Drafts, History, and Players are visible on the right
**And** the active page link is indicated with forest green text and a subtle underline
**And** inactive links display in warm gray
**And** no dropdown menus or mega-menus are used
**And** the nav bar remains visible on scroll

### Story 1.5: Mobile Navigation

As a visitor on a phone,
I want a bottom tab bar for navigation,
So that I can switch between sections with one thumb tap.

**Acceptance Criteria:**

**Given** a visitor is viewing the site at screen width < 768px
**When** any page loads
**Then** a fixed bottom tab bar is visible with 5-6 icon+label tabs (Matchups, Teams, Records, Drafts, History, Players)
**And** the active tab is highlighted with forest green icon and label
**And** inactive tabs display in muted gray
**And** the tab bar height is 56px with safe-area padding for notched devices (env(safe-area-inset-bottom))
**And** tapping the currently active tab scrolls the page to the top
**And** the top navigation bar is hidden on mobile

### Story 1.6: Layout & Animation Components

As a visitor,
I want content sections to have consistent rhythm and reveal smoothly as I scroll,
So that the site feels polished and the editorial layout creates a pleasant reading experience.

**Acceptance Criteria:**

**Given** a page uses PageSection components
**When** the sections render
**Then** each PageSection displays an optional forest green caption label, an H2 title, and a content slot
**And** sections are separated by 96px vertical padding with 48px internal spacing

**Given** a page uses ScrollReveal wrappers
**When** a wrapped element enters the viewport
**Then** it fades up from 20px below with a 400ms ease-out transition
**And** sequential elements stagger by 50ms each
**And** the animation triggers only once — elements do not re-animate on scroll-up
**And** when prefers-reduced-motion is set, content appears immediately with no animation

**Given** all navigation destinations need placeholder content
**When** a visitor navigates to any section
**Then** a placeholder page loads with the section title confirming navigation works

### Story 1.7: Accessibility Foundations

As a visitor using assistive technology or keyboard navigation,
I want the site to be accessible and navigable without a mouse,
So that I can use the site regardless of how I interact with it.

**Acceptance Criteria:**

**Given** a visitor tabs into the page
**When** the first focusable element receives focus
**Then** a "Skip to content" link is the first focusable element and jumps to the main content area when activated

**Given** a visitor navigates with the keyboard
**When** any interactive element receives focus
**Then** a visible focus indicator appears as a forest green ring (focus-visible:ring-2)
**And** focus order follows a logical reading sequence

**Given** a screen reader parses the page
**When** it encounters the page structure
**Then** semantic HTML is used throughout — nav, main, section, correct h1-h3 hierarchy
**And** the active navigation item has aria-current="page"
**And** a VisuallyHidden component is available for icon-only elements that need text alternatives

### Story 1.8: Database Schema & Migrations

As a developer,
I want the core database schema defined and migrated,
So that league data can be stored and queried.

**Acceptance Criteria:**

**Given** a Postgres database is connected via POSTGRES_URL
**When** the initial migration runs
**Then** a seasons table exists with columns for season year, league ID, previous league ID, status, champion, and metadata
**And** a franchises table exists with columns for franchise ID, slug, name, abbreviation, and branding color
**And** a franchise_seasons table exists mapping franchise to season with roster_id, user_id, owner display name, wins, losses, points scored, standings finish, and playoff result
**And** a sync_log table exists with columns for sync type, status, row count, duration, errors, and timestamp
**And** all tables use snake_case naming with proper foreign key relationships and indexes
**And** Drizzle config (drizzle.config.ts) and DB connection module (lib/db/index.ts) are configured

### Story 1.9: Sleeper API Client

As a developer,
I want a typed Sleeper API client with response validation,
So that all external API calls are consistent, validated, and centralized.

**Acceptance Criteria:**

**Given** the Sleeper API client module exists at lib/sleeper.ts
**When** any sync function needs Sleeper data
**Then** one typed function per endpoint is available — league info, rosters, users, NFL state, matchups (by week), drafts, draft picks, transactions (by week), traded picks, and players (NFL)
**And** each function returns a typed response validated by a Zod schema
**And** Zod schemas for all Sleeper API response shapes are defined in lib/sleeper-schemas.ts
**And** the module uses a shared SLEEPER_BASE_URL constant
**And** errors are returned as typed errors, never thrown unhandled

### Story 1.10: Daily Sync Pipeline

As the system,
I want league data synced from Sleeper once per day,
So that franchise mappings, league settings, and player data stay current.

**Acceptance Criteria:**

**Given** the daily sync endpoint is triggered at app/api/sync-daily/route.ts
**When** a request arrives
**Then** the CRON_SECRET header is verified — unauthorized requests receive a 401 response
**And** league settings are fetched and upserted into the seasons table
**And** user and roster data are fetched and the franchise_seasons mapping is updated for the current season
**And** the full NFL player database (~5MB) is fetched and stored/cached locally
**And** each data type is written atomically — a failure in one does not block or corrupt others
**And** a sync_log entry is created with status (success/failure), row counts, duration, and any errors
**And** the function returns appropriate HTTP status codes (200 for success, 500 for failure)

### Story 1.11: SyncTimestamp & Error Handling

As a visitor,
I want to see when the site's data was last updated,
So that I know how fresh the information is.

**Acceptance Criteria:**

**Given** a visitor is on any page
**When** the page renders
**Then** a SyncTimestamp component is visible in the footer showing "Last updated" with relative time (e.g., "12 minutes ago")
**And** hovering or tapping the timestamp shows the absolute time via a Tooltip
**And** if the last sync was less than 1 hour ago, the timestamp displays in normal style
**And** if the last sync was more than 1 hour ago, the timestamp displays in a muted/stale style
**And** if the last sync failed, the timestamp shows "Data may be outdated"

**Given** a server error occurs on any page
**When** the error boundary catches it
**Then** the page displays a "Data unavailable" message with the last sync timestamp
**And** the page never shows a blank or broken state

### Story 1.12: League History Timeline

As a visitor,
I want to view a chronological timeline of all HML seasons,
So that I can explore the league's full history at a glance.

**Acceptance Criteria:**

**Given** a visitor navigates to the History section (/seasons)
**When** the page loads
**Then** all HML seasons are displayed in chronological order, including legacy 10-team era seasons
**And** each season entry shows the year, champion, and key stats
**And** each season links to its detail page with a clean shareable URL (/seasons/[year])
**And** legacy and current league seasons are linked via previous_league_id chain traversal

**Given** the page includes a SeasonSelector component
**When** it renders
**Then** a horizontal row of year pills is displayed with the most recent season active in forest green
**And** tapping a year navigates to that season's view
**And** the selector supports keyboard arrow navigation with role="tablist"
**And** on mobile, the year row scrolls horizontally if years overflow

**Given** the page uses editorial scroll layout
**When** the visitor scrolls
**Then** content sections reveal with ScrollReveal animation and generous vertical spacing

### Story 1.13: Season Detail Pages

As a visitor,
I want to view any season's final standings, champion, and notable stats,
So that I can see what happened in any historical season.

**Acceptance Criteria:**

**Given** a visitor navigates to /seasons/[seasonYear]
**When** the page loads
**Then** the season year and champion are displayed prominently
**And** final standings show all franchises ranked by record with wins bolded (700 weight) + "W" label and losses in regular weight (400) + "L" label
**And** points scored are visible per franchise
**And** the page has a clean, shareable URL
**And** the page uses semantic HTML with proper heading hierarchy

---

## Epic 2: Franchise Pages & Team Identity

Visitors can view dedicated franchise pages with complete history, year-attributed ownership, season records, championship history, and current rosters.

### Story 2.1: FranchiseLogo Component

As a visitor,
I want each franchise to have a recognizable visual identity,
So that I can quickly identify teams across the site.

**Acceptance Criteria:**

**Given** a FranchiseLogo component is rendered
**When** a logo image exists at public/logos/{slug}.png
**Then** the logo displays via next/image in a square container at the requested size
**And** size variants are available: sm (32px), md (48px), lg (64px), xl (96px)

**Given** no logo image exists for a franchise
**When** the component renders
**Then** a fallback displays showing a 2-letter abbreviation on a per-franchise background color
**And** the fallback is visually consistent with the logo variant sizes

**Given** the logo is adjacent to the franchise name in text
**When** a screen reader encounters it
**Then** the logo has alt text with the franchise name, or alt="" when decorative

### Story 2.2: ChampionshipStars Component

As a visitor,
I want to see championship counts at a glance,
So that I can instantly identify the league's dynasties.

**Acceptance Criteria:**

**Given** a franchise has one or more championships
**When** the ChampionshipStars component renders
**Then** gold star icons (antique gold) display — one per championship
**And** the inline variant shows stars at 12-14px alongside franchise names
**And** the hero variant shows stars at 18-20px on franchise page heroes
**And** the container has aria-label announcing the count (e.g., "2 championships")

**Given** a franchise has zero championships
**When** the component renders
**Then** nothing is rendered — no empty placeholder or container

### Story 2.3: StatHero Component

As a visitor,
I want key stats presented with bold visual weight,
So that the most important numbers hit me immediately and are screenshot-worthy.

**Acceptance Criteria:**

**Given** a StatHero component is rendered
**When** it displays a stat
**Then** the number appears at Display weight with an optional SuperlativeBadge above, a label below, and an optional context line
**And** the xl variant renders the number at 80px (for H2H records, homepage hero stats)
**And** the lg variant renders at 48-56px (franchise career stats, spotlight stats)
**And** the md variant renders at 36-40px (section-level stats)
**And** the number and label form a logical group for screen readers

### Story 2.4: FranchiseIdentity Composed Component

As a visitor,
I want a consistent franchise display across the site,
So that I always recognize a franchise regardless of where it appears.

**Acceptance Criteria:**

**Given** a FranchiseIdentity component is rendered
**When** the compact variant is used (leaderboard rows)
**Then** a small FranchiseLogo, franchise name on a single line, and inline ChampionshipStars are displayed

**Given** the standard variant is used (matchup rows, franchise overview)
**When** it renders
**Then** a medium FranchiseLogo, franchise name, ChampionshipStars, and optional owner name are displayed

**Given** the hero variant is used (franchise page)
**When** it renders
**Then** a large FranchiseLogo, franchise name at H1 weight, hero ChampionshipStars, and owner name are displayed

### Story 2.5: All Franchises Overview Page

As a visitor,
I want to see all 12 franchises at a glance,
So that I can understand the league landscape and pick a team to explore.

**Acceptance Criteria:**

**Given** a visitor navigates to /teams
**When** the page loads
**Then** all 12 franchises display in a grid of FranchiseIdentity blocks (standard variant) showing logo, name, record, and championship stars
**And** on desktop, the grid uses 3-4 columns with 32px gutters
**And** on mobile, the grid stacks to a single column
**And** tapping any franchise navigates to its dedicated franchise page
**And** franchise identity (name, branding) is consistent regardless of ownership changes (FR8)

### Story 2.6: Franchise Page — Hero & Season History

As a visitor,
I want to see a franchise's complete story on one page,
So that I can explore its full history, ownership, and performance across all seasons.

**Acceptance Criteria:**

**Given** a visitor navigates to /teams/[franchiseSlug]
**When** the page loads
**Then** a hero section displays the franchise identity (hero variant) with career stats at Display weight — all-time record, total points scored, championships
**And** championship stars are visible in the hero section immediately without scrolling

**Given** the visitor scrolls below the hero
**When** the season history section renders
**Then** season-by-season records display chronologically showing year, owner for that season (FR6), record, standings finish, and playoff result (FR7)
**And** wins are displayed with bold weight (700) + "W" label and losses with regular weight (400) + "L" label
**And** legacy era seasons are subtly distinguished with a visual indicator
**And** the page uses scroll-as-narrative layout with ScrollReveal sections

**Given** the franchise page has sub-sections
**When** tabs are available
**Then** History, Roster, and Drafts tabs allow switching between views without full page navigation
**And** the URL updates for shareability

### Story 2.7: Franchise Roster Page

As a visitor,
I want to see the full current roster for any franchise,
So that I can see which players a team has.

**Acceptance Criteria:**

**Given** a visitor navigates to /teams/[franchiseSlug]/roster or taps the Roster tab
**When** the page loads
**Then** the complete current roster is displayed with player name, position, and NFL team
**And** the data reflects the most recent Sleeper sync
**And** on mobile, the roster displays in a readable format without excessive horizontal scrolling

---

## Epic 3: Matchups & Live Scoring

Visitors can view weekly matchups with near-live scores during NFL game windows, browse historical matchup results, playoff brackets, and see this week's action on the homepage dashboard.

### Story 3.1: Matchup Database Schema

As a developer,
I want matchup and score data stored in the database,
So that current and historical matchup results can be queried.

**Acceptance Criteria:**

**Given** the database needs to support matchup data
**When** the migration runs
**Then** a matchups table exists with columns for season, week, franchise matchup pairings, scores, and result status (scheduled/in-progress/final)
**And** the schema supports storing individual roster scores per matchup
**And** proper indexes exist for querying by season, week, and franchise
**And** a matchup query module exists at lib/queries/matchups.ts

### Story 3.2: Hourly Sync Pipeline

As the system,
I want transactions, rosters, and traded picks synced from Sleeper every hour,
So that roster changes and trade activity are reflected within 60 minutes.

**Acceptance Criteria:**

**Given** the hourly sync endpoint is triggered at app/api/sync-hourly/route.ts
**When** a request arrives
**Then** the CRON_SECRET header is verified — unauthorized requests receive a 401 response
**And** transactions are fetched for the current week and upserted
**And** rosters and traded picks are fetched and upserted
**And** matchup scores for the current week are fetched and upserted
**And** each data type is written atomically — a failure in one does not block others (NFR11)
**And** a sync_log entry records status, row counts, duration, and errors
**And** all three sync jobs combined stay under 1,000 Sleeper API calls/minute (NFR9)

### Story 3.3: MatchupRow Component

As a visitor,
I want matchups displayed as a clear left-vs-right layout,
So that I can instantly see who is playing whom and the score.

**Acceptance Criteria:**

**Given** a MatchupRow component renders in the final variant
**When** the matchup is complete
**Then** the left team's FranchiseIdentity and score face the right team's FranchiseIdentity and score
**And** the winning team's score is displayed in bold weight
**And** a screen reader announces "{Team A} {score} versus {Team B} {score}"

**Given** the preview variant is used
**When** the matchup has not started
**Then** "vs" is centered between the two franchise identities with no scores displayed

**Given** the component renders on mobile
**When** screen width is < 768px
**Then** the left-vs-right layout is maintained with compact FranchiseIdentity (logo + abbreviation)

### Story 3.4: Current Week Matchups Page

As a visitor,
I want to see this week's matchups and scores,
So that I can follow the current week's action.

**Acceptance Criteria:**

**Given** a visitor navigates to /matchups
**When** the page loads
**Then** all matchup pairings for the current NFL week are displayed using MatchupRow components
**And** scores reflect the most recent sync data
**And** the current week number is displayed prominently
**And** the page has a clean, shareable URL

### Story 3.5: Live Score Polling System

As a visitor during an active NFL game window,
I want matchup scores to update automatically every 30 seconds,
So that I can follow the action in near-real-time without refreshing.

**Acceptance Criteria:**

**Given** the NFL game window is active (determined by /v1/state/nfl)
**When** the matchups page loads
**Then** a LiveIndicator component displays a pulsing green dot (8px) + "Live" text label
**And** a ScorePoller client component ("use client") begins fetching /api/live-scores every 30 seconds
**And** score updates appear in-place on MatchupRow components with a subtle 200ms scale pulse
**And** the /api/live-scores endpoint reads current scores from Postgres and returns JSON

**Given** the visitor switches to another tab
**When** the tab becomes hidden (Visibility API)
**Then** polling pauses and resumes when the tab becomes visible again

**Given** polling has been active for 4 hours
**When** the auto-stop threshold is reached
**Then** polling stops automatically

**Given** the API returns an error during polling
**When** scores cannot be fetched
**Then** last known scores remain displayed with the sync timestamp visible
**And** no blank or broken state is shown (NFR7)

**Given** the user has prefers-reduced-motion enabled
**When** the LiveIndicator renders
**Then** the green dot is solid with no pulse animation
**And** score updates appear instantly with no scale animation

**Given** score updates occur
**When** screen readers encounter the score region
**Then** updates are announced via aria-live="polite"

### Story 3.6: MobileTableView Component

As a visitor on a phone,
I want data tables to be readable without excessive horizontal scrolling,
So that I can scan standings, stats, and results on a small screen.

**Acceptance Criteria:**

**Given** a MobileTableView component wraps a data table
**When** the screen width is >= 768px
**Then** the full DataTable renders with all columns visible and 24px row padding

**Given** the screen width is < 768px
**When** a table has more than 3 essential columns
**Then** the table converts to stacked card layout showing key columns per row
**And** detail is available on tap
**And** both views maintain the same data and reading order

### Story 3.7: Historical Weekly Results

As a visitor,
I want to browse any week's matchup results from any historical season,
So that I can look up specific games and relive past matchups.

**Acceptance Criteria:**

**Given** a visitor navigates to /seasons/[seasonYear]/week/[week]
**When** the page loads
**Then** all matchup results for that week are displayed using MatchupRow components (final variant)
**And** individual matchup details show team scores and starting rosters (FR13)
**And** the page is accessible from the season detail page
**And** the page has a clean, shareable URL

### Story 3.8: Playoff Bracket Display

As a visitor,
I want to see playoff bracket results for any completed season,
So that I can see who advanced and how the champion was crowned.

**Acceptance Criteria:**

**Given** a visitor navigates to /playoffs/[seasonYear]
**When** the page loads
**Then** the playoff bracket displays all rounds with matchup results
**And** the champion is highlighted with gold accent treatment
**And** the bracket is navigable and readable on mobile
**And** the page is linked from the season detail page

### Story 3.9: Homepage Living Dashboard

As a visitor,
I want the homepage to show me what's happening now and surface interesting stats,
So that I have a reason to visit even without a specific question.

**Acceptance Criteria:**

**Given** a visitor navigates to the homepage (/)
**When** the page loads
**Then** current season standings are displayed
**And** this week's matchup preview or results are shown with links to the full matchups page
**And** a featured superlative stat is surfaced (e.g., "Longest active win streak: Team X — 5 games")
**And** the layout follows the editorial scroll pattern — full-width sections with bold typography, generous whitespace, no card containers
**And** during active game windows, live scores are visible via the ScorePoller
**And** the homepage gives visitors something to react to immediately

---

## Epic 4: Records, Rankings & Rivalries

Visitors can view the all-time leaderboard, head-to-head records, rivalry summaries, power rankings, career legacy stats, and the trophy case.

### Story 4.1: SuperlativeBadge Component

As a visitor,
I want records, streaks, and achievements called out with visual flair,
So that I discover "that's sick" moments as I browse.

**Acceptance Criteria:**

**Given** a SuperlativeBadge component is rendered
**When** the gold variant is used
**Then** it displays caption-sized uppercase text with a subtle gold background tint (achievements — "League Champion", "Most Points All-Time")

**Given** the green variant is used
**When** it renders
**Then** it displays with a subtle green background tint (active states — "Active Streak: 5W", "Current Leader")

**Given** the neutral variant is used
**When** it renders
**Then** it displays with a subtle gray background tint (informational — "Legacy Era", "Playoff Game")

**Given** a screen reader encounters the badge
**When** it reads the element
**Then** the badge text is read as inline text with no additional ARIA needed

### Story 4.2: All-Time Leaderboard & Career Stats

As a visitor,
I want to see how all franchises rank across their full career,
So that I can settle debates about who's the best dynasty manager in HML history.

**Acceptance Criteria:**

**Given** a visitor navigates to /records
**When** the page loads
**Then** the all-time leaderboard ranks all franchises by career performance metrics — wins, points scored, championships (FR14)
**And** rank numbers are displayed in bold type with the top 3 highlighted in gold
**And** SuperlativeBadges appear inline for notable achievements (e.g., "Most Wins All-Time")
**And** columns are sortable — tapping a header sorts by that metric with a forest green indicator + arrow

**Given** the leaderboard has a SeasonSelector
**When** it renders
**Then** three contexts are available: current season standings, any historical season, and all-time career (FR18)
**And** "All-Time" is an additional pill at the end of the season selector
**And** switching contexts updates the page content and URL immediately

**Given** the page is viewed on mobile
**When** more than 3 columns are needed
**Then** the MobileTableView converts to card layout with key data visible per row

### Story 4.3: H2HHero Component

As a visitor,
I want head-to-head records displayed in a massive, screenshot-worthy format,
So that I can grab proof of rivalry dominance and share it.

**Acceptance Criteria:**

**Given** an H2HHero component is rendered
**When** two franchises are selected
**Then** it displays: FranchiseIdentity (left) → StatHero xl record (e.g., "7–2") → FranchiseIdentity (right)
**And** a context line appears below (e.g., "All-time regular season")
**And** a SuperlativeBadge shows the current streak (e.g., "Active Streak: 3W")
**And** a screen reader announces "{Franchise A} leads {Franchise B} 7 to 2 all-time"

**Given** the component is viewed at mobile width
**When** screenshotted
**Then** the layout captures the key information with enough context to stand alone in a group chat

### Story 4.4: Head-to-Head Records Page

As a visitor,
I want to look up the all-time record between any two franchises,
So that I can prove who really owns the rivalry.

**Acceptance Criteria:**

**Given** a visitor navigates to /records/head-to-head
**When** the page loads
**Then** two franchise selectors are displayed side by side (stacked on mobile with "vs" divider)
**And** the default state shows "Select two franchises to compare"

**Given** both franchises are selected
**When** the H2H data loads
**Then** the H2HHero component displays the all-time record
**And** match history is listed below with individual game results
**And** the URL updates to reflect the two selected franchises (e.g., /records/head-to-head/gorilla-warfare-vs-zoo-crew) for shareability

**Given** a visitor taps a franchise selector
**When** the selector opens
**Then** all 12 franchises are listed with FranchiseLogo + name
**And** selecting a franchise updates the display immediately — no submit button needed

### Story 4.5: Rivalry Summaries Page

As a visitor,
I want to see rivalry summaries with streaks and trends,
So that I can discover compelling matchup narratives across seasons.

**Acceptance Criteria:**

**Given** a visitor navigates to /records/rivalries
**When** the page loads
**Then** rivalry summaries display notable H2H pairings with win streaks, recent trends, and historical context (FR16)
**And** each rivalry links to the full H2H detail page for that pairing

### Story 4.6: Power Rankings Page

As a visitor,
I want to view the current power rankings,
So that I can see how franchises stack up right now.

**Acceptance Criteria:**

**Given** a visitor navigates to /records/power-rankings
**When** the page loads
**Then** current power rankings display all 12 franchises in ranked order (FR17)
**And** rank numbers use bold type
**And** each franchise links to its franchise page

### Story 4.7: Trophy Case Page

As a visitor,
I want to view the trophy case with all-time awards and championships,
So that I can see the league's most decorated franchises.

**Acceptance Criteria:**

**Given** a visitor navigates to /records/trophies
**When** the page loads
**Then** the trophy case displays all championships and all-time awards by season (FR19)
**And** championship entries use gold accent treatment
**And** each franchise name links to its franchise page

---

## Epic 5: Draft History

Visitors can explore complete draft history by franchise and year, including startup and rookie drafts across all seasons and the legacy era.

### Story 5.1: Draft Database Schema & Sync

As a developer,
I want draft data stored and synced from Sleeper,
So that draft history can be queried and displayed.

**Acceptance Criteria:**

**Given** the database needs to support draft data
**When** the migration runs
**Then** a draft_picks table exists with columns for season year, draft type (startup/rookie), round, pick number, player selected, and owning franchise at time of draft
**And** the daily sync is extended to fetch draft data from Sleeper (/v1/league/{id}/drafts and /v1/draft/{id}/picks)
**And** a draft query module exists at lib/queries/drafts.ts

### Story 5.2: Draft History Index Page

As a visitor,
I want to browse all drafts by year,
So that I can pick a specific draft to explore.

**Acceptance Criteria:**

**Given** a visitor navigates to /drafts
**When** the page loads
**Then** all drafts are listed chronologically using the SeasonSelector component
**And** each year links to the full draft view for that season
**And** draft type is indicated (startup vs. rookie)
**And** the page includes legacy era drafts (FR23)

### Story 5.3: Full Draft View Page

As a visitor,
I want to see every pick from any historical draft,
So that I can relive draft day decisions — the league-winners and the busts.

**Acceptance Criteria:**

**Given** a visitor navigates to /drafts/[seasonYear]
**When** the page loads
**Then** the full draft displays all teams, all picks, all rounds (FR22)
**And** picks are organized by round with pick number, player name, and owning franchise (FR21)
**And** franchise names link to franchise pages
**And** the page has a clean, shareable URL
**And** on mobile, the draft board uses a readable format (card layout or focused column view)

### Story 5.4: Franchise Draft History Page

As a visitor,
I want to see all draft picks for a specific franchise across all years,
So that I can evaluate their draft track record.

**Acceptance Criteria:**

**Given** a visitor navigates to /teams/[franchiseSlug]/drafts or taps the Drafts tab on a franchise page
**When** the page loads
**Then** the complete draft history displays — startup draft and all annual rookie drafts (FR20)
**And** picks are organized by year with round and player selected
**And** picks are attributed to the owning franchise at the time of draft (FR21)
**And** legacy era drafts are included and subtly distinguished (FR23)
**And** the page has a clean, shareable URL

---

## Epic 6: Player Search & Status

Visitors can search for any NFL player by name and see their HML roster owner, NFL team, position, and injury/status designation.

### Story 6.1: Player Search Page

As a visitor,
I want to search for any NFL player and see who owns them in the HML,
So that I can quickly check roster ownership for trade discussions.

**Acceptance Criteria:**

**Given** a visitor navigates to /players
**When** the page loads
**Then** a search input is prominently placed at the top of the page

**Given** the visitor types a player name and submits
**When** results are returned
**Then** matching players display with: player name, HML roster owner (linked to franchise page), NFL team, position, and injury/status designation (FR25)
**And** results return within 2 seconds (NFR3)
**And** player status reflects the most recent Sleeper data sync (FR26)
**And** the sync timestamp is visible for freshness context

### Story 6.2: Player Search Edge States

As a visitor,
I want helpful feedback when my search doesn't find results,
So that I'm not confused by a blank page.

**Acceptance Criteria:**

**Given** a visitor searches for a player name with no matches
**When** the results area renders
**Then** a clean, centered message displays: "No players found for '[query]'"
**And** a suggestion reads: "Check the spelling or try a different name"
**And** no error styling is applied — this is an expected state, not an error

**Given** a visitor has not yet searched
**When** the page loads
**Then** the search input is focused and ready with no confusing empty state below

---

## Epic 7: Legacy Data Import & Validation

The full legacy 10-team era history is imported from Sleeper's league chain, validated by the commish, and seamlessly integrated into all existing site features from day one.

### Story 7.1: Legacy Import Script

As the commish,
I want all historical league data from the legacy 10-team era imported,
So that the site's history is complete from day one.

**Acceptance Criteria:**

**Given** the legacy import script runs (lib/sync/legacy-import.ts)
**When** it executes
**Then** it traverses the previous_league_id chain to discover all historical league seasons
**And** for each historical season, it imports league settings, rosters, matchup results, draft picks, and transactions
**And** import is chunked by season to manage execution time
**And** the script is idempotent — it can be wiped and re-run safely
**And** transactions are fetched by iterating all weeks across all seasons
**And** the franchise_seasons mapping is populated for all historical seasons
**And** a validation report is generated summarizing what was imported per season

### Story 7.2: Import Validation & Commish Review

As the commish,
I want a validation report showing data completeness,
So that I can verify the historical record before the site goes live.

**Acceptance Criteria:**

**Given** the legacy import script has completed
**When** the validation report is generated
**Then** it lists every imported season with counts of: matchups, draft picks, transactions, and roster records
**And** any seasons with missing or incomplete data are flagged
**And** any data gaps that pre-date Sleeper (requiring manual entry) are identified
**And** the commish can review the report and confirm accuracy against known league history
**And** the report format is clear enough for a non-technical user to validate
