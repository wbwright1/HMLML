---
stepsCompleted: [1, 2]
inputDocuments: ['prd.md', 'architecture.md', 'ux-design-specification.md', 'ux-design-polish.md']
status: 'complete'
createdAt: '2026-03-25'
---

# FantasyWebsite - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the HMLML website redesign, decomposing requirements from the PRD, UX Design Specification (v2), Architecture, and UX Polish spec into implementable stories. The redesign focuses on transforming the existing site into a seasonally-aware, card-based, snarky trash-talk arsenal with the "Press Box Evolved" visual identity.

## Requirements Inventory

### Functional Requirements

FR1: Visitors can view a chronological timeline of all HMLML seasons, including legacy 10-team era seasons
FR2: Visitors can view season-level summaries including final standings, champion, and notable stats for any historical season
FR3: Visitors can navigate to any individual season's detail view from the timeline
FR4: The system links historical seasons across the legacy and current league using Sleeper's `previous_league_id` chain
FR5: Visitors can view a dedicated page for each franchise showing its complete history across all seasons
FR6: Each franchise page displays the owner (and co-owner when applicable) attributed to each season year
FR7: Franchise pages display season-by-season records, standings finishes, and championship results
FR8: Franchise identity (team name, branding) persists across ownership changes
FR9: Visitors can view weekly matchup scores for the current season
FR10: Matchup scores refresh automatically during active NFL game windows without requiring a page reload
FR11: Visitors can view the full weekly schedule and results for any historical season
FR12: Visitors can view playoff bracket results for any completed season
FR13: Visitors can view individual matchup details including team scores and rosters for any historical week
FR14: Visitors can view the all-time leaderboard ranking all franchises by career performance metrics
FR15: Visitors can view head-to-head records between any two franchises across all seasons
FR16: Visitors can view rivalry summaries including win streaks, notable matchups, and historical trends
FR17: Visitors can view the current power rankings
FR18: Visitors can view career legacy stats for any franchise spanning all seasons including legacy era
FR19: Visitors can view the trophy case displaying all-time awards and championship history
FR20: Visitors can view the complete draft history for any franchise
FR21: Draft history displays picks by round and year, attributed to the owning franchise at time of draft
FR22: Visitors can view any historical draft in full (all teams, all picks, all rounds)
FR23: Draft history covers all seasons including legacy era
FR24: Visitors can search for any NFL player by name
FR25: Player results display the player's current HMLML roster owner, NFL team, position, and injury/status designation
FR26: Player status reflects the most recent Sleeper data sync
FR27: Visitors can view the full roster for any franchise
FR28: The system syncs the full player database from Sleeper once per day
FR29: The system syncs transactions, trades, rosters, and traded picks from Sleeper once per hour
FR30: The system syncs matchup scores from Sleeper every 30 seconds during active NFL game windows
FR31: The system uses the NFL state endpoint to determine active game windows
FR32: Every page displays a "Last updated" timestamp indicating when data was last synced
FR33: The system maintains a versioned mapping of `roster_id -> user_id -> franchise` per season
FR34: All pages are accessible without a login or account
FR35: All pages render correctly on mobile, tablet, and desktop screen sizes
FR36: All color-coded information is conveyed through labels, icons, or patterns in addition to color
FR37: All major content pages have clean, shareable URLs
FR38: Visitors can navigate between all major sections from a persistent navigation element

### Non-Functional Requirements

NFR1: Standard content pages load within 3 seconds on a modern mobile connection
NFR2: Matchup score updates during game windows are reflected on-screen within 5 seconds of the 30-second poll completing
NFR3: Player search returns results within 2 seconds of query submission
NFR4: All data is served from local cache; no page load triggers a live Sleeper API call
NFR5: The site remains accessible during Sleeper API outages; all pages serve last-cached data
NFR6: Daily and hourly sync jobs complete without manual intervention
NFR7: The game-window poller degrades gracefully on Sleeper API errors
NFR8: Site targets 99%+ uptime, particularly September through January
NFR9: All three sync jobs combined stay under Sleeper's 1,000 calls/minute rate limit
NFR10: The system stores `user_id` as the stable identifier; display names resolved at render time
NFR11: A sync failure for one data type does not block or corrupt other data types
NFR12: No information is conveyed by color alone
NFR13: The site avoids red/purple color pairings as primary data signals
NFR14: The site meets WCAG 2.1 AA contrast ratio standards

### Additional Requirements (Architecture)

AR1: Project scaffolded with `create-next-app` (TypeScript, Tailwind, ESLint, App Router, Turbopack)
AR2: Drizzle ORM with `@vercel/postgres` driver for all database access
AR3: Zod validation on all Sleeper API responses before DB writes
AR4: shadcn/ui primitives copied into project, restyled to Press Box Evolved theme
AR5: Playwright E2E tests for all user-facing features
AR6: Single Sleeper API client module (`lib/sleeper.ts`) with one typed function per endpoint
AR7: Sync job pattern: verify CRON_SECRET, call Sleeper, validate with Zod, write in transaction, log to sync_log
AR8: `sync_log` table records every sync run with status, row counts, duration, and errors
AR9: Legacy data import script (one-time, idempotent, chunked by season)
AR10: Vercel Cron for daily and hourly sync; client-side poller for live scores
AR11: GitHub Action for Playwright E2E on PRs

### UX Design Requirements

UX-DR1: Implement Press Box Evolved color token system (15 tokens: canvas, surface, surface-muted, border, border-strong, text-primary through text-muted, accent-green/light, accent-gold/light, accent-warm/light)
UX-DR2: Implement typography scale with Geist Sans (Display through Caption with specific sizes, weights, letter-spacing, line-heights)
UX-DR3: Implement 8px base spacing system with defined tokens (space-1 through space-24)
UX-DR4: Build Champion Banner component (green gradient, trophy icon, links to franchise page)
UX-DR5: Build Week Banner component (green gradient, week number, game status with states: live/pre-kickoff/complete; playoff variant with round names)
UX-DR6: Build Draft Countdown Card component (live countdown, client-side interval, draft-day and post-draft states)
UX-DR7: Build Player Award Card component (2-column grid, headshot with fallback, player-centered layout, "412.8 pts" stat+unit format)
UX-DR8: Build Team Award Card component (2-column grid, stat-centered layout, snarky labels from content system)
UX-DR9: Build Sting Card component (full-width, warm tint, snarky labels, stat right-aligned)
UX-DR10: Build Draft Order Card component (compact list, top 4 on hub, full 12 on drafts page)
UX-DR11: Build Live Matchup Card component (live/final/upcoming/close-game states, LIVE indicator with pulse, 30s polling, aria-live)
UX-DR12: Build Weekly Superlative Card component (6 types: closest win, biggest blowout, best possible roster, biggest underperformer, highest/lowest scorer)
UX-DR13: Build Standings Snapshot Card component (compact top 3 + bottom 1 on hub, full on Records page)
UX-DR14: Build Playoff Bracket Card component (compact hub variant, full playoffs page variant, live scoring support)
UX-DR15: Build Offseason Recap Card component (season summary highlights, tappable items linking to details)
UX-DR16: Build Transaction Activity Card component (chronological list, "View All" link)
UX-DR17: Build Franchise Header component (h1 name, owner/co-owner, headline stats row, tabs for overview/roster/drafts)
UX-DR18: Build Rivalry Card component (H2H record in display weight, streak badge, last meeting, screenshot-worthy)
UX-DR19: Build Season Timeline Card component (season year, champion with gold accent, legacy era badge)
UX-DR20: Build Player Search Result Card component (headshot, name, position, NFL team, status badge, HMLML owner, sync timestamp)
UX-DR21: Build Roster Row component (headshot, player name, position, team, status, starter/bench weight distinction)
UX-DR22: Build Section Header component (title left, "View All" link right, consistent across hub and pages)
UX-DR23: Build Sync Timestamp component (footer, caption size, stale-warning state with warm color)
UX-DR24: Build Seasonal Pill Badge component (4 variants: Preseason/Week N/Playoffs/Offseason)
UX-DR25: Implement snarky label content system as TypeScript constant map (14+ labels: Point Machine, Iron Curtain, League Doormat, Glass Cannon, etc.)
UX-DR26: Implement hub seasonal state logic (4 states driven by NFL state endpoint, automatic component rendering per state)
UX-DR27: Implement primary nav: Hub | Teams | Records | History | Drafts | Players with HMLML branding and seasonal pill badge
UX-DR28: Implement mobile hamburger menu with fixed slim top bar
UX-DR29: Implement franchise color integration (decorative borders on matchup rows, franchise cards, franchise page hero, standings rows)
UX-DR30: Implement "best possible roster" weekly stat calculation (optimal lineup score vs actual)
UX-DR31: Implement weekly superlative auto-generation after Tuesday night/Wednesday morning data refresh
UX-DR32: Implement empty state component with contextual messaging per page
UX-DR33: Implement 404 page with snarky messaging ("This page doesn't exist. Maybe it was traded away.")
UX-DR34: Implement player headshot progressive enhancement (Sleeper image endpoints, fallback to position icon/initials)
UX-DR35: Implement co-owner display across all owner-showing contexts

### FR Coverage Map

| FR | Epic | Stories |
|---|---|---|
| FR1-FR4 | Epic 4 | 4.1, 4.2 |
| FR5-FR8 | Epic 5 | 5.1, 5.2, 5.3 |
| FR9-FR10 | Epic 7 | 7.1, 7.2 |
| FR11-FR13 | Epic 4, Epic 7 | 4.2, 7.3 |
| FR14-FR19 | Epic 6 | 6.1, 6.2, 6.3, 6.4, 6.5 |
| FR20-FR23 | Epic 8 | 8.1, 8.2 |
| FR24-FR27 | Epic 9 | 9.1, 9.2 |
| FR28-FR33 | Epic 2 | 2.1, 2.2, 2.3, 2.4 |
| FR34-FR38 | Epic 1, Epic 3 | 1.2, 3.1, 3.2 |

## Epic List

1. **Epic 1: Project Foundation & Design System** — Scaffold project, implement Press Box Evolved theme, core layout components
2. **Epic 2: Data Infrastructure & Sync Pipeline** — Database schema, Sleeper API client, all three sync tiers, legacy import
3. **Epic 3: Seasonally-Aware Hub** — Homepage with 4 seasonal states, all hub-specific card components
4. **Epic 4: League History & Seasons** — History timeline, season detail pages, legacy era support
5. **Epic 5: Team Franchise Pages** — Franchise overview, roster, draft history tabs, franchise header, co-owner display
6. **Epic 6: Records, Rankings & Rivalries** — Leaderboard, H2H, rivalries, power rankings, trophy case
7. **Epic 7: Matchups & Live Scoring** — Matchup detail pages, live score poller, game-window detection
8. **Epic 8: Draft History** — Draft index, per-season draft views, franchise draft history
9. **Epic 9: Player Search & Status** — Player search page, result cards, headshot integration
10. **Epic 10: Polish, Accessibility & Testing** — Visual consistency, responsive edge cases, E2E tests, accessibility audit

---

## Epic 1: Project Foundation & Design System

**Goal:** Establish the project scaffolding, implement the Press Box Evolved design token system, and build all core layout and utility components that every other epic depends on.

### Story 1.1: Project Scaffolding

As a developer,
I want the project initialized with the correct tech stack and folder structure,
So that all subsequent development has a consistent foundation.

**Acceptance Criteria:**

**Given** no existing project setup
**When** the scaffolding script runs
**Then** the project is created with Next.js 16+ (App Router), TypeScript strict mode, Tailwind CSS v4, ESLint, and Turbopack
**And** Drizzle ORM, @vercel/postgres, Zod, drizzle-zod, and Playwright are installed
**And** shadcn/ui is initialized with the project
**And** the `@/*` import alias is configured
**And** the folder structure matches the architecture spec (app/, components/, lib/, e2e/)

### Story 1.2: Press Box Evolved Theme Implementation

As a developer,
I want all design tokens (colors, typography, spacing) implemented in Tailwind CSS v4,
So that every component uses the brand system consistently.

**Acceptance Criteria:**

**Given** the Tailwind configuration
**When** the theme is applied
**Then** all 15 color tokens are defined as CSS custom properties (--canvas through --accent-warm-light)
**And** the typography scale is defined (Display through Caption with correct sizes, weights, letter-spacing, line-heights)
**And** the 8px spacing system tokens are available (space-1 through space-24)
**And** `font-variant-numeric: tabular-nums` is applied globally to numeric content
**And** Geist Sans is loaded via next/font as the single typeface
**And** shadcn/ui default theme colors are overridden with HMLML brand tokens
**And** all text/background combinations meet WCAG 2.1 AA contrast ratios

### Story 1.3: Core Layout Components

As a visitor,
I want consistent navigation and page structure across all pages,
So that I can navigate the site confidently.

**Acceptance Criteria:**

**Given** any page on the site
**When** the page renders
**Then** a persistent top nav displays: Hub | Teams | Records | History | Drafts | Players
**And** the nav shows "HMLML" brand text on the left
**And** the nav shows a Seasonal Pill Badge on the right (Preseason/Week N/Playoffs/Offseason)
**And** the nav collapses to a hamburger menu on mobile (< 768px)
**And** the nav bar is fixed/slim on mobile and does not scroll away
**And** a Sync Timestamp component appears in the footer showing last sync time
**And** the Sync Timestamp turns warm color when data is significantly stale
**And** a Section Header component is available (title left, optional "View All" link right)
**And** the root layout constrains content to 1200px max-width on desktop

### Story 1.4: Snarky Label Content System

As a developer,
I want a centralized content system for superlative labels,
So that snarky copy is consistent and easy to update without touching component code.

**Acceptance Criteria:**

**Given** the content system TypeScript constant
**When** a component needs a superlative label
**Then** all 14+ labels are available (Point Machine, Iron Curtain, Alpha Dog, League Doormat, Glass Cannon, Paper Tiger, Draft Day Genius, Wasted Picks, On Fire, Rock Bottom, Mercy Rule, Cardiac Crew, What Could've Been, Coaching Malpractice)
**And** each label includes context (what triggers it), tone (positive/sting/neutral), and display text
**And** labels are importable from a single `lib/content.ts` module

### Story 1.5: Empty State & Error Components

As a visitor,
I want clear, on-brand messaging when data is unavailable,
So that I understand what's happening and don't see a broken page.

**Acceptance Criteria:**

**Given** a page with no data available
**When** the page renders
**Then** an EmptyState component displays with contextual icon, title, description, and optional action link
**And** the 404 page shows snarky messaging ("This page doesn't exist. Maybe it was traded away.") with links back to Hub and Teams
**And** error boundaries show calm messaging ("Something went wrong. We're showing the last available data.")
**And** empty states never show a blank page; always show last-cached data with timestamp when possible

---

## Epic 2: Data Infrastructure & Sync Pipeline

**Goal:** Build the database schema, Sleeper API client, all three sync tiers, and the legacy import script so the site has data to display.

### Story 2.1: Database Schema & Drizzle Configuration

As a developer,
I want a complete database schema covering all HMLML data types,
So that all features have a normalized, queryable data store.

**Acceptance Criteria:**

**Given** the Drizzle ORM configuration
**When** migrations are run
**Then** tables exist for: franchises, franchise_seasons (with coOwnerDisplayName), seasons, matchups, matchup_players, rosters, roster_players, draft_picks, transactions, players, sync_log
**And** all tables use snake_case naming with appropriate foreign keys and indexes
**And** the `roster_id -> user_id -> franchise` mapping is versioned per season in franchise_seasons
**And** the sync_log table records status, row counts, duration, and errors per sync run
**And** franchise_seasons includes brandingColor for franchise color integration

### Story 2.2: Sleeper API Client

As a developer,
I want a single typed API client module for all Sleeper endpoints,
So that all Sleeper communication is centralized, validated, and rate-limit safe.

**Acceptance Criteria:**

**Given** `lib/sleeper.ts` as the single Sleeper API module
**When** any sync function calls a Sleeper endpoint
**Then** each endpoint has a dedicated typed function with Zod validation on the response
**And** the module covers: league info, rosters, users, matchups, playoff brackets, transactions, traded picks, drafts, draft picks, players, NFL state
**And** all functions return typed results or typed errors (never throw unhandled exceptions)
**And** Zod schemas are defined in `lib/sleeper-schemas.ts`

### Story 2.3: Sync Pipeline (Daily, Hourly, Live)

As a site operator,
I want automated data sync from Sleeper at three cadences,
So that the site always has fresh data without manual intervention.

**Acceptance Criteria:**

**Given** Vercel Cron triggers
**When** the daily sync runs
**Then** it syncs the player database (~5MB), league settings, and historical data
**And** it verifies the CRON_SECRET header before proceeding
**And** it writes atomically per data type and logs to sync_log

**Given** Vercel Cron triggers
**When** the hourly sync runs
**Then** it syncs transactions, trades, rosters, and traded picks
**And** a failure in one data type does not block others (NFR11)

**Given** an active NFL game window (detected via /v1/state/nfl)
**When** the client-side poller is active
**Then** matchup scores refresh every 30 seconds via /api/live-scores
**And** the poller degrades gracefully on errors (shows last known scores with timestamp)
**And** the poller auto-stops when games end

### Story 2.4: Legacy Data Import

As the commish,
I want all historical league data imported from Sleeper's league chain,
So that the site has complete history from day one including the legacy 10-team era.

**Acceptance Criteria:**

**Given** the legacy import script
**When** it runs against the Sleeper league chain (via previous_league_id traversal)
**Then** all historical seasons, rosters, matchups, draft picks, and transactions are imported
**And** the import is idempotent (can be re-run safely)
**And** it processes one season at a time (chunked)
**And** it produces a validation report for commish review
**And** legacy 10-team era seasons are flagged with appropriate metadata

---

## Epic 3: Seasonally-Aware Hub

**Goal:** Build the homepage as a seasonally-aware hub that automatically renders the right content based on the football calendar, with all hub-specific card components.

### Story 3.1: Hub Seasonal State Engine

As a visitor,
I want the homepage to show contextually relevant content based on the current football calendar,
So that every visit feels current and interesting.

**Acceptance Criteria:**

**Given** the NFL state endpoint data
**When** the homepage renders
**Then** it determines the current state: preseason, regular season, playoffs, or offseason
**And** it renders the appropriate banner (Champion Banner for preseason/offseason, Week Banner for regular season/playoffs)
**And** it renders the appropriate card set for each state (as defined in Hub Seasonal State Summary)
**And** state transitions happen automatically with no manual switching
**And** the Seasonal Pill Badge in the nav reflects the current state

### Story 3.2: Champion Banner & Week Banner

As a visitor,
I want to immediately see who the reigning champion is (preseason) or what week it is (regular season),
So that I have instant context when I land on the site.

**Acceptance Criteria:**

**Given** preseason or offseason state
**When** the hub renders
**Then** a Champion Banner displays with green gradient, champion team name, record, opponent defeated, and decorative trophy icon
**And** the banner links to the champion's franchise page

**Given** regular season state
**When** the hub renders
**Then** a Week Banner displays with green gradient, "HARAMBE MEMORIAL LEAGUE" overline, week number, and game status
**And** game window active state shows "N games in progress" with subtle pulse
**And** pre-kickoff shows "Games start [day] [time]"
**And** week complete shows "Week N Final" with link to results

**Given** playoff state
**When** the hub renders
**Then** the Week Banner adapts to show round names ("Wild Card Round", "Semifinal", "Championship")

### Story 3.3: Preseason Hub Content

As a visitor during preseason,
I want to see draft countdown, last year's awards, and draft order,
So that I have trash talk fuel and anticipation for the upcoming season.

**Acceptance Criteria:**

**Given** preseason state on the hub
**When** the page renders below the Champion Banner
**Then** a Draft Countdown Card shows days/hours/min/sec until the rookie draft with live client-side updates
**And** a "Team Awards" section shows 2-column grid cards (Point Machine/Most PF, Iron Curtain/Least PA, etc.) with gold tint
**And** team awards appear ABOVE player awards
**And** a "Last Season's Best" section shows 2-column grid Player Award Cards (Best QB, RB, WR, TE) with headshot, player name, team, and "412.8 pts" format
**And** a "Wall of Shame" section shows full-width Sting Cards (League Doormat, Glass Cannon) with warm tint and snarky labels
**And** a "Draft Order" section shows the first-round pick order in a compact list card

### Story 3.4: Regular Season Hub Content

As a visitor during the regular season,
I want to see live matchups, weekly superlatives, and standings,
So that I can check scores and find trash talk material from this week.

**Acceptance Criteria:**

**Given** regular season state with active game window
**When** the hub renders below the Week Banner
**Then** Live Matchup Cards display for all current week matchups with scores updating every 30 seconds
**And** each matchup card shows LIVE indicator (green dot + text), both teams, scores, and top scorer
**And** cards transition to "FINAL" state when games complete

**Given** regular season state outside game window (after Tuesday night/Wednesday)
**When** the hub renders
**Then** a "This Week's Damage" section shows Weekly Superlative Cards (closest win, biggest blowout, best possible roster, biggest underperformer, highest/lowest scorer)
**And** a Standings Snapshot Card shows top 3 and bottom 1 franchise with "View Full" link

### Story 3.5: Playoff & Offseason Hub Content

As a visitor during playoffs or offseason,
I want contextually appropriate hub content,
So that the site never feels dormant.

**Acceptance Criteria:**

**Given** playoff state
**When** the hub renders below the Week Banner (round name variant)
**Then** a Playoff Bracket Card shows the current round with live scores during game windows
**And** completed rounds show winners advancing and losers grayed
**And** the championship winner gets gold accent treatment

**Given** offseason state
**When** the hub renders below the Champion Banner (new champion)
**Then** an Offseason Recap Card shows season highlights (champion, most PF, MVP, biggest upset, longest streak)
**And** a Transaction Activity Card shows recent trades and waiver moves chronologically
**And** each transaction links to relevant detail

### Story 3.6: Best Possible Roster Calculation

As a visitor,
I want to see what each team's optimal lineup would have scored each week,
So that I can roast managers who left points on their bench.

**Acceptance Criteria:**

**Given** a completed week with all player scores synced
**When** the best possible roster is calculated
**Then** the system determines the highest-scoring legal lineup from each team's full roster (starters + bench)
**And** the result is stored and available for the Weekly Superlative Cards
**And** the "Biggest Underperformer" superlative shows the largest gap between optimal and actual lineup
**And** the stat generates the "Coaching Malpractice" or "What Could've Been" snarky label

---

## Epic 4: League History & Seasons

**Goal:** Build the History page timeline and individual season detail pages spanning all eras.

### Story 4.1: League History Timeline

As a visitor,
I want to browse a chronological timeline of all HMLML seasons,
So that I can explore the league's full history as an institution.

**Acceptance Criteria:**

**Given** the History page
**When** a visitor navigates to /history
**Then** Season Timeline Cards display for every season from founding to current
**And** each card shows: year, team count, champion (gold accent), runner-up, most PF
**And** legacy 10-team era seasons show a "Legacy Era" badge
**And** each card links to the full season detail page
**And** seasons flow naturally without visual breaks between eras

### Story 4.2: Season Detail Pages

As a visitor,
I want to see complete details for any historical season,
So that I can deep-dive into standings, results, and notable moments.

**Acceptance Criteria:**

**Given** a season detail page at /history/[seasonYear]
**When** the page renders
**Then** it shows final standings with all franchise records
**And** it shows the champion with gold accent treatment
**And** it provides week-by-week matchup results navigable by week selector
**And** it shows the playoff bracket for that season
**And** weekly matchup detail is accessible at /history/[seasonYear]/week/[week]

---

## Epic 5: Team Franchise Pages

**Goal:** Build franchise pages as the hub for team-specific deep dives with tabs for overview, roster, and draft history.

### Story 5.1: Franchise Overview Page

As a visitor,
I want to see a franchise's complete history on one page,
So that I can understand any team's legacy at a glance.

**Acceptance Criteria:**

**Given** a franchise page at /teams/[franchiseSlug]
**When** the overview tab is active
**Then** a Franchise Header shows team name (h1), owner and co-owner (when applicable), and headline stats (all-time record, championships with gold accent, current record)
**And** tabs are available: Overview | Roster | Drafts
**And** the overview shows season-by-season records with year-attributed ownership
**And** championship seasons are highlighted with gold treatment
**And** franchise brandingColor appears as a subtle hero background gradient (5-8% opacity)

### Story 5.2: Franchise Roster Tab

As a visitor,
I want to see a franchise's current full roster,
So that I can check who they own and assess their team.

**Acceptance Criteria:**

**Given** the Roster tab on a franchise page
**When** the tab is active
**Then** Roster Row components display for every player on the roster
**And** each row shows: headshot (with fallback), player name, position, NFL team, status, starter/bench distinction (bold vs regular weight)
**And** injured players show injury designation; IR players show dimmed treatment with IR badge

### Story 5.3: Franchise Draft History Tab

As a visitor,
I want to see every draft pick a franchise has made across all seasons,
So that I can evaluate their draft track record.

**Acceptance Criteria:**

**Given** the Drafts tab on a franchise page
**When** the tab is active
**Then** draft picks are organized by year (startup draft first, then rookie drafts)
**And** each pick shows round, pick number, player name, and position
**And** legacy era picks are included with appropriate context
**And** the display spans all seasons including the 10-team era

---

## Epic 6: Records, Rankings & Rivalries

**Goal:** Build the Records section with leaderboards, head-to-head records, rivalries, power rankings, and trophy case.

### Story 6.1: All-Time Leaderboard

As a visitor,
I want to see career performance rankings for all franchises,
So that I can settle arguments about who's the best dynasty manager.

**Acceptance Criteria:**

**Given** the Records page at /records
**When** the Leaderboard tab is active
**Then** all franchises are ranked by career wins, points scored, and championships
**And** the display includes "All-time (including legacy era)" context
**And** the top franchise is bold; the bottom franchise gets optional warm accent
**And** alternating row backgrounds improve readability

### Story 6.2: Head-to-Head Records

As a visitor,
I want to see the all-time record between any two franchises,
So that I can prove who owns who in a rivalry.

**Acceptance Criteria:**

**Given** the H2H page at /records/head-to-head
**When** two franchises are selected via dropdowns
**Then** a Rivalry Card displays showing the all-time H2H record in display weight (e.g., "7 — 3")
**And** the current streak is shown with a badge (e.g., "Harambe W3")
**And** the last meeting details are shown (week, year, score)
**And** a season-by-season breakdown is available below
**And** the card is screenshot-worthy and self-contained

### Story 6.3: Rivalry Summaries

As a visitor,
I want to browse notable rivalries with streaks and trends,
So that I can find the most heated matchups in league history.

**Acceptance Criteria:**

**Given** the Rivalries page at /records/rivalries
**When** the page renders
**Then** notable rivalry pairings are displayed with their all-time records
**And** win streaks, notable matchups, and historical trends are surfaced
**And** each rivalry links to the full H2H detail

### Story 6.4: Power Rankings

As a visitor,
I want to see the current power rankings,
So that I can see where franchises stand beyond just win-loss records.

**Acceptance Criteria:**

**Given** the Power Rankings page at /records/power-rankings
**When** the page renders
**Then** all franchises are displayed with their current power ranking
**And** the ranking methodology is transparent (based on available data)

### Story 6.5: Trophy Case

As a visitor,
I want to see all championships and awards in one place,
So that I can see the league's roll of honor.

**Acceptance Criteria:**

**Given** the Trophies page at /records/trophies
**When** the page renders
**Then** all championships are listed chronologically with champion franchise (gold accent), season year, and record
**And** the most recent champion gets a larger treatment
**And** positional awards (Best QB, RB, WR, TE) and team awards (Most PF, Least PA) are shown per season
**And** championship stars use proper SVG star icons (gold fill, not text characters)

---

## Epic 7: Matchups & Live Scoring

**Goal:** Build matchup detail pages and the live score polling system for game-day energy.

### Story 7.1: Current Week Matchups (Hub Integration)

As a visitor during an NFL game window,
I want to see live-updating matchup scores on the hub,
So that I can check scores in real time.

**Acceptance Criteria:**

**Given** an active game window detected by /v1/state/nfl
**When** the hub renders Live Matchup Cards
**Then** scores update every 30 seconds via the client-side poller
**And** the LIVE indicator shows a green dot with "LIVE" text label and subtle pulse
**And** the poller uses aria-live="polite" for screen reader announcements
**And** the "use client" directive is only on the score-poller component (single client island)

### Story 7.2: Matchup Detail Page

As a visitor,
I want to see full matchup details including both rosters and player scores,
So that I can analyze a specific matchup in depth.

**Acceptance Criteria:**

**Given** a matchup detail page at /matchups/[matchupId] or similar
**When** the page renders
**Then** both teams' full rosters are displayed with individual player scores
**And** during live game windows, scores continue updating on the detail page
**And** the page shows the matchup result (final score, winner highlighted in bold)

### Story 7.3: Historical Matchup Browsing

As a visitor,
I want to browse matchup results for any historical week,
So that I can look up past results and settle arguments.

**Acceptance Criteria:**

**Given** a historical week page at /history/[seasonYear]/week/[week]
**When** the page renders
**Then** all matchups for that week are displayed with final scores
**And** each matchup links to its detail page with full roster/player breakdown

---

## Epic 8: Draft History

**Goal:** Build draft history browsing at both the league level and franchise level.

### Story 8.1: Draft History Index

As a visitor,
I want to browse all historical drafts by year,
So that I can look up any draft in the league's history.

**Acceptance Criteria:**

**Given** the Drafts page at /drafts
**When** the page renders
**Then** all drafts are listed by year (startup + rookie drafts)
**And** each draft links to its full view
**And** legacy era drafts are included

### Story 8.2: Full Draft View

As a visitor,
I want to see a complete draft with all picks, all rounds, all teams,
So that I can review who picked whom and evaluate draft strategies.

**Acceptance Criteria:**

**Given** a draft view at /drafts/[seasonYear]
**When** the page renders
**Then** all picks are displayed by round with pick number, player name, position, and drafting franchise
**And** the display works on mobile (card layout) and desktop (table)

---

## Epic 9: Player Search & Status

**Goal:** Build the player search page with headshot integration and roster ownership display.

### Story 9.1: Player Search Page

As a visitor,
I want to search for any NFL player by name,
So that I can quickly check who owns them in the HMLML.

**Acceptance Criteria:**

**Given** the Players page at /players
**When** a visitor submits a search query
**Then** results display as Player Search Result Cards showing: headshot (with fallback), name, position, NFL team, status, HMLML owner (linking to franchise page), and sync timestamp
**And** search is case-insensitive with partial matching
**And** "No players found" message appears for empty results
**And** results load server-side (no client-side autocomplete in Phase 1)

### Story 9.2: Player Headshot Integration

As a developer,
I want player headshots sourced from available image endpoints with graceful fallbacks,
So that player-facing components have visual richness without being blocked by missing images.

**Acceptance Criteria:**

**Given** a component displaying a player (award cards, roster rows, search results)
**When** a headshot URL is available
**Then** the headshot displays as a circular image at the appropriate size (64px for award cards, smaller for roster rows)
**And** images load via next/image with responsive sizing

**Given** no headshot URL is available
**When** the component renders
**Then** a fallback displays: position icon or styled initials in a neutral circle
**And** the fallback is visually consistent and does not look broken

---

## Epic 10: Polish, Accessibility & Testing

**Goal:** Final visual polish, accessibility compliance, responsive edge cases, and comprehensive E2E test coverage.

### Story 10.1: Visual Consistency Audit

As a developer,
I want all components using design tokens consistently with no hardcoded hex values,
So that the design system is maintainable and consistent.

**Acceptance Criteria:**

**Given** the complete codebase
**When** audited for visual consistency
**Then** zero hardcoded hex color values exist outside of the CSS custom property definitions
**And** all badge/label components use the snarky label content system
**And** all interactive elements follow the link/tap patterns (card taps, text links, section header links)
**And** franchise brandingColor is used decoratively (borders/accents only, never as text or full backgrounds)

### Story 10.2: Accessibility Compliance

As a visitor with disabilities,
I want the site to meet WCAG 2.1 AA standards,
So that I can use it fully regardless of how I access the web.

**Acceptance Criteria:**

**Given** the complete site
**When** tested for accessibility
**Then** all text meets WCAG 2.1 AA contrast ratios (4.5:1 body, 3:1 large text)
**And** no information is conveyed by color alone; all color signals have text labels
**And** no red/purple color pairings exist anywhere
**And** all interactive elements are reachable via keyboard with visible focus indicators (2px solid accent-green, 2px offset)
**And** skip-to-content link is the first focusable element on every page
**And** all images have appropriate alt text; decorative elements use aria-hidden
**And** data tables use proper th headers with scope attributes
**And** live score updates use aria-live="polite"
**And** minimum tap targets are 44x44px with 8px gaps between adjacent targets

### Story 10.3: Responsive Edge Cases

As a visitor on any device,
I want the site to render correctly at all screen sizes,
So that nothing breaks or overflows.

**Acceptance Criteria:**

**Given** the site at mobile (375px), tablet (768px), and desktop (1280px) viewports
**When** all pages are tested
**Then** no horizontal overflow exists on any page at any breakpoint
**And** award card grids display correctly as 2-column on mobile, 2-3 column on desktop
**And** tables switch to card layouts on mobile when more than 3 columns
**And** the season selector scrolls horizontally with fade indicators when overflowing
**And** the nav hamburger menu works correctly on mobile with safe-area-inset handling

### Story 10.4: E2E Test Suite

As a developer,
I want comprehensive Playwright E2E tests for all critical user journeys,
So that regressions are caught before deployment.

**Acceptance Criteria:**

**Given** the Playwright test suite
**When** tests run against the full stack (real Next.js dev server + real Postgres)
**Then** tests cover: hub rendering in all 4 seasonal states, franchise page navigation and tab switching, records/H2H lookup, player search, draft history browsing, live score poller behavior
**And** tests run at both mobile (375px) and desktop (1280px) viewports
**And** no mocks are used; all tests hit real data
**And** a GitHub Action runs the test suite on PRs

### Story 10.5: Co-Owner Display

As a visitor,
I want to see co-owners displayed wherever franchise ownership is shown,
So that all owners get proper attribution.

**Acceptance Criteria:**

**Given** a franchise with a co-owner
**When** ownership is displayed (franchise header, standings, season history)
**Then** the display shows "Owner & Co-Owner" format
**And** the " & " separator is used consistently everywhere
**And** when only an owner exists, just the owner name is shown
**And** when neither exists, the owner line is omitted
