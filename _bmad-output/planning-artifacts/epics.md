---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments: ['prd.md', 'architecture.md', 'ux-design-specification.md', 'ux-design-directions.html']
---

# FantasyWebsite - Epic Breakdown (UX Redesign)

## Overview

This document provides the complete epic and story breakdown for FantasyWebsite's full UX redesign based on the new UX Design Specification (Direction 5: Hybrid). It decomposes the requirements from the PRD, Architecture, and UX Design Specification into implementable stories. Existing implementations will be validated against the new spec; only non-conforming elements will be rebuilt.

## Requirements Inventory

### Functional Requirements

FR1: Visitors can view a chronological timeline of all HML seasons, including legacy 10-team era seasons
FR2: Visitors can view season-level summaries including final standings, champion, and notable stats for any historical season
FR3: Visitors can navigate to any individual season's detail view from the timeline
FR4: The system links historical seasons across the legacy and current league using Sleeper's previous_league_id chain
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
FR33: The system maintains a versioned mapping of roster_id to user_id to franchise per season
FR34: All pages are accessible without a login or account
FR35: All pages render correctly on mobile, tablet, and desktop screen sizes
FR36: All color-coded information is conveyed through labels, icons, or patterns in addition to color
FR37: All major content pages have clean, shareable URLs
FR38: Visitors can navigate between all major sections from a persistent navigation element

### NonFunctional Requirements

NFR1: Standard content pages load within 3 seconds on a modern mobile connection
NFR2: Matchup score updates during game windows are reflected on-screen within 5 seconds of the 30-second poll completing
NFR3: Player search returns results within 2 seconds of query submission
NFR4: All data is served from local cache; no page load triggers a live Sleeper API call
NFR5: The site remains accessible during Sleeper API outages; all pages serve last-cached data rather than returning errors
NFR6: Daily and hourly sync jobs complete without manual intervention; failed syncs are logged and retried automatically
NFR7: The game-window poller degrades gracefully on Sleeper API errors; displays last known scores with timestamp rather than blank or broken state
NFR8: Site targets 99%+ uptime, particularly September through January (active NFL season)
NFR9: All three sync jobs combined stay under Sleeper's 1,000 calls/minute rate limit
NFR10: The system stores user_id as the stable identifier for all historical data; display names resolved at render time
NFR11: A sync failure for one data type does not block or corrupt other data types
NFR12: No information is conveyed by color alone; all color-coded UI elements include a secondary indicator (label, icon, or pattern)
NFR13: The site avoids red/purple color pairings as primary data signals
NFR14: The site meets WCAG 2.1 AA contrast ratio standards for text and interactive elements

### Additional Requirements

- Architecture mandates Next.js 16.x App Router with React Server Components by default; only score-poller uses "use client"
- Architecture mandates Vercel Postgres (Neon-backed) via Drizzle ORM v0.45.x for all database access
- Architecture mandates Zod validation on all Sleeper API responses before database write
- Architecture mandates 3-tier sync: daily cron (players, settings), hourly cron (transactions, rosters), client-side 30s poller (live scores)
- Architecture mandates Tailwind CSS v4 + shadcn/ui primitives (copied into project, not npm dependency)
- Architecture mandates single Sleeper API client module (lib/sleeper.ts) with one typed function per endpoint
- Architecture mandates sync_log table recording every sync run with status, row counts, duration, errors
- Architecture mandates atomic sync writes per data type; failed transaction sync does not corrupt roster data
- Architecture mandates Geist Sans via next/font as single typeface
- Architecture mandates colocated route-specific components; shared components in components/
- Architecture mandates Playwright E2E tests against real running code; no mocks
- Architecture mandates strict naming conventions: snake_case (DB), camelCase (code), kebab-case (files/routes), PascalCase (components)

### UX Design Requirements

UX-DR1: Implement complete Press Box Evolved color token system with 15 named semantic tokens (canvas, surface, surface-muted, border, border-strong, text-primary, text-secondary, text-tertiary, text-muted, accent-green, accent-green-light, accent-gold, accent-gold-light, accent-warm, accent-warm-light)
UX-DR2: Implement complete typography system using Geist Sans with 9 levels (Display, H1, H2, H3, Body Large, Body, Body Small, Caption, Stat Number) each with specific size, weight, letter-spacing, and line-height
UX-DR3: Implement 8px base spacing system with tokens from 4px to 96px; content max-width 1200px
UX-DR4: Champion Banner component: full-width green gradient hero with trophy watermark, champion name, record, defeated opponent; tappable to franchise page; used in preseason and offseason hub states
UX-DR5: Week Banner component: full-width green gradient hero with week number or playoff round name, game status context; three states (game window active with pulse, pre-kickoff, week complete); used during regular season and playoff hub states
UX-DR6: Draft Countdown component: centered card with countdown to draft day (days, hours, min, sec); client-side interval updates; disappears when draft begins; preseason hub focal point
UX-DR7: Player Award Card component: 2-column grid, gold-tint background, category label, player headshot (64px circle with fallback), player name, owning franchise, stat with unit; tappable to positional breakdown
UX-DR8: Team Award Card component: 2-column grid, gold-tint background, snarky label from content system, display-weight stat, context description, franchise name; tappable to franchise page
UX-DR9: Sting Card component: full-width, warm-tint background, snarky label (warm accent), franchise name, context, right-aligned stat; tappable to franchise page; used in Wall of Shame section
UX-DR10: Draft Order Card component: surface background, compact pick list (rank, franchise, record); top 4 on hub, full 12 on Drafts page
UX-DR11: Live Matchup Card component: LIVE indicator (green dot + pulse + text), two franchise names with scores (tabular), top scorer callout; three states (live/final/upcoming); 30s polling; aria-live="polite"
UX-DR12: Weekly Superlative Card component: varies by type (gold positive, warm negative, neutral); closest win, biggest blowout, best roster, biggest underperformer, highest/lowest scorer; tappable to week results
UX-DR13: Standings Snapshot Card component: compact ranked list (top 3 + bottom 1 on hub), "View Full" link; leader optional green accent, last place optional warm accent
UX-DR14: Playoff Bracket Card component: visual bracket with seeds, teams, scores, progression; compact (current round on hub) and full (all rounds on detail page) variants; champion gold accent
UX-DR15: Offseason Recap Card component: compact highlight list (champion, most PF, MVP, biggest upset, longest streak); each line tappable to detail page
UX-DR16: Transaction Activity Card component: chronological trade/waiver list with date, type, franchises, players; "View All" link
UX-DR17: Franchise Header component: franchise name (H1), owner attribution, three stat callouts (all-time, championships, current), tabs (Overview/Roster/Drafts); responsive stacking
UX-DR18: Rivalry Card component: centered team names with "vs", display-weight record, streak badge, last meeting; tappable to full H2H breakdown
UX-DR19: Season Timeline Card component: year, team count, champion (gold), runner-up, most PF; legacy era badge; tappable to season detail
UX-DR20: Player Search Result Card component: headshot/fallback, name, position, NFL team, status badge, HML owner link, sync timestamp
UX-DR21: Roster Row component: headshot, name, position, NFL team, status, starter/bench weight distinction, weekly points; IR dimmed treatment
UX-DR22: Hub preseason state: Champion Banner > Draft Countdown > Team Awards (2-col) > Player Awards (2-col) > Wall of Shame (full-width) > Draft Order
UX-DR23: Hub regular season state (game windows): Week Banner > Live Matchups
UX-DR24: Hub regular season state (outside windows): Week Banner > Standings Snapshot > Weekly Superlatives > Power Rankings
UX-DR25: Hub playoffs state: Week Banner (round variant) > Playoff Bracket > Matchup Cards > Elimination Alerts
UX-DR26: Hub offseason state: Champion Banner (new champion) > Offseason Recap > Transaction Activity > All-Time Records
UX-DR27: Hub state detection driven by NFL state endpoint; automatic transitions, no manual switching
UX-DR28: Navigation: slim top bar, "HMLML" brand left, Hub|Teams|Records|History|Drafts|Players center, seasonal pill right; hamburger on mobile; active state green underline
UX-DR29: Section Header pattern: H3 title left, "View All" link right (green, arrow suffix), full-width divider
UX-DR30: Sync Timestamp: footer on every page, caption/tertiary; turns warm accent if stale (>2h hourly, >26h daily)
UX-DR31: Seasonal Pill Badge: nav right side; variants for Preseason, Week N, Playoffs, Offseason with appropriate tint backgrounds
UX-DR32: Badge component: W/L/CHAMP/STREAK/LIVE variants with gold, warm, green color options; always includes text label
UX-DR33: Stat Callout component: bold/black weight number with tabular figures and optional unit suffix
UX-DR34: Tab component: franchise pages (Overview/Roster/Drafts), Records (Leaderboard/H2H/Rivalries/Power Rankings/Trophies); green active indicator; content swaps in place
UX-DR35: Table component: Press Box typography, warm borders, tabular figures, alternating surface-muted rows; card layout on mobile >3 columns
UX-DR36: Snarky label content system: centralized TypeScript constant with 14+ labels (Point Machine, Iron Curtain, League Doormat, Glass Cannon, etc.) mapped to stat contexts
UX-DR37: Card tap pattern: entire card is tap target; desktop hover shows border-strong/shadow; mobile tap shows opacity 0.95 feedback
UX-DR38: Animation discipline: only pulse (live), countdown tick, card hover border (150ms), tab fade (100ms) allowed; all scroll-triggered and page-transition animations banned
UX-DR39: Mobile-first responsive: single column <768px, scaling 768-1023px, max-width 1200px at 1024px+; full-bleed cards on mobile
UX-DR40: WCAG 2.1 AA compliance: 4.5:1 body text, 3:1 large text, focus indicators (2px green), keyboard nav, screen reader support, 44px touch targets, no red/purple pairings
UX-DR41: Error states: calm confident tone ("Something went wrong"), stale data always shown with timestamp, 404 snarky ("Maybe it was traded away")
UX-DR42: Player search: server-side, case-insensitive partial match, no client autocomplete Phase 1
UX-DR43: Franchise/season pickers: shadcn/ui Select, pre-populated, current season default
UX-DR44: Component build priority: P0 (banners, nav, section header, badges) > P1 (preseason hub) > P2 (regular season hub) > P3 (deep pages) > P4 (playoff/offseason)

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 5 | Chronological timeline of all HML seasons |
| FR2 | Epic 5 | Season-level summaries |
| FR3 | Epic 5 | Navigate to season detail from timeline |
| FR4 | Epic 5 | Legacy league chaining via previous_league_id |
| FR5 | Epic 4 | Dedicated franchise page with complete history |
| FR6 | Epic 4 | Owner attribution per season |
| FR7 | Epic 4 | Season-by-season records on franchise page |
| FR8 | Epic 4 | Franchise identity persists across ownership |
| FR9 | Epic 3 | View weekly matchup scores |
| FR10 | Epic 3 | Auto-refresh scores during game windows |
| FR11 | Epic 3 | Full weekly schedule and results |
| FR12 | Epic 5/6 | Playoff bracket results |
| FR13 | Epic 3 | Individual matchup details |
| FR14 | Epic 5 | All-time leaderboard |
| FR15 | Epic 5 | Head-to-head records |
| FR16 | Epic 5 | Rivalry summaries |
| FR17 | Epic 3 | Current power rankings |
| FR18 | Epic 5 | Career legacy stats |
| FR19 | Epic 2/5 | Trophy case and awards |
| FR20 | Epic 4 | Franchise draft history |
| FR21 | Epic 4 | Draft picks by round and year |
| FR22 | Epic 5 | Full historical draft view |
| FR23 | Epic 5 | Draft history covers legacy era |
| FR24 | Epic 7 | Player search by name |
| FR25 | Epic 7 | Player results with HML owner, status |
| FR26 | Epic 7 | Player status reflects latest sync |
| FR27 | Epic 4/7 | Full franchise roster view |
| FR28 | Epic 1 | Daily player sync (existing, verify) |
| FR29 | Epic 1 | Hourly transaction sync (existing, verify) |
| FR30 | Epic 3 | 30s matchup score sync |
| FR31 | Epic 3 | NFL state endpoint game window detection |
| FR32 | Epic 1 | "Last updated" sync timestamp |
| FR33 | Epic 1 | Versioned roster_id to franchise mapping |
| FR34 | Epic 1 | Public access, no login |
| FR35 | Epic 1 | Mobile, tablet, desktop responsive |
| FR36 | Epic 1 | Color-coded info has secondary indicators |
| FR37 | Epic 1 | Clean, shareable URLs |
| FR38 | Epic 1 | Persistent navigation element |

## Epic List

## Epic 1: Design System & Site Shell

The site establishes its visual identity with the Press Box Evolved design direction (Direction 5: Hybrid). Design tokens are verified/updated, navigation matches the new spec, core utility components are built or rebuilt to spec. Every page inherits the branded feel. Existing implementations are validated; only non-conforming elements are rebuilt.

**FRs covered:** FR28, FR29, FR32, FR33, FR34, FR35, FR36, FR37, FR38
**UX-DRs covered:** UX-DR1-3, UX-DR28-35, UX-DR37-41
**NFRs addressed:** NFR12, NFR13, NFR14

### Story 1.1: Color Token Audit & Update

As a visitor,
I want the site to use a consistent, warm color palette,
So that every page feels cohesive and intentionally designed.

**Acceptance Criteria:**

**Given** the UX spec defines 15 named semantic color tokens
**When** the globals.css is audited against the spec
**Then** all 15 tokens match their specified hex values exactly
**And** no hardcoded hex values exist outside the token system (except dynamic franchise brandingColor)
**And** all shadcn/ui aliases reference the semantic tokens via var()
**And** no red/purple color pairings exist anywhere in the UI
**And** WCAG AA contrast ratios are verified: text-primary on canvas >= 4.5:1, text-secondary on canvas >= 4.5:1, accent-green on canvas >= 3:1

### Story 1.2: Typography System Audit & Update

As a visitor,
I want typography to create clear visual hierarchy,
So that I can scan content quickly and identify what matters.

**Acceptance Criteria:**

**Given** the UX spec defines 9 typography levels (Display, H1, H2, H3, Body Large, Body, Body Small, Caption, Stat Number)
**When** the typography utility classes are audited
**Then** each level matches its specified size, weight, letter-spacing, and line-height
**And** Display is 56-64px, Black 900, -0.02em tracking
**And** Caption is 12px, Medium 500, 0.06em tracking, always UPPERCASE
**And** tabular-nums (font-variant-numeric: tabular-nums) is applied globally to all numeric content
**And** Geist Sans is the only typeface loaded via next/font

### Story 1.3: Spacing System Audit & Update

As a visitor,
I want consistent spacing throughout the site,
So that the layout feels polished and intentional.

**Acceptance Criteria:**

**Given** the UX spec defines an 8px base spacing unit
**When** the spacing tokens are audited
**Then** tokens exist from 4px (space-1, only sub-8px exception) through 96px (space-24)
**And** content max-width is 1200px centered on desktop
**And** mobile horizontal padding is 16px
**And** no non-8px-multiple spacing values exist (except the 4px exception)

### Story 1.4: Desktop Navigation Bar

As a visitor on desktop,
I want a slim, branded navigation bar,
So that I can quickly navigate between all major sections.

**Acceptance Criteria:**

**Given** the site loads on a desktop viewport (>= 1024px)
**When** the page renders
**Then** a slim top nav bar is visible with "HMLML" brand text on the left
**And** 6 nav items are displayed: Hub, Teams, Records, History, Drafts, Players
**And** the current section is highlighted with accent-green underline and bold text
**And** inactive sections use text-tertiary color and regular weight
**And** the nav is persistent across all pages and does not scroll away

### Story 1.5: Mobile Hamburger Menu

As a visitor on mobile,
I want a hamburger menu for navigation,
So that I can access all sections without the nav taking up screen space.

**Acceptance Criteria:**

**Given** the site loads on a mobile viewport (< 768px)
**When** the page renders
**Then** a fixed slim top bar is visible with "HMLML" brand and hamburger button
**And** the hamburger button has aria-label="Open navigation"
**When** the hamburger button is tapped
**Then** nav items stack vertically in a menu overlay
**And** pressing Escape closes the menu
**And** the top bar does not scroll away

### Story 1.6: Seasonal Pill Badge

As a visitor,
I want to see the current football calendar state at a glance,
So that I know what phase the league is in.

**Acceptance Criteria:**

**Given** the nav bar renders
**When** the NFL state indicates preseason
**Then** a pill badge shows "Preseason" with accent-green text on accent-green-light background
**When** the NFL state indicates regular season week N
**Then** the pill shows "Week N" with accent-green text on accent-green-light background
**When** the NFL state indicates playoffs
**Then** the pill shows "Playoffs" with accent-gold text on accent-gold-light background
**When** the NFL state indicates offseason
**Then** the pill shows "Offseason" with text-tertiary on neutral background

### Story 1.7: Section Header Component

As a visitor,
I want clear section titles with navigation links,
So that I can quickly identify content sections and dive deeper.

**Acceptance Criteria:**

**Given** a section of content on any page
**When** the Section Header renders
**Then** an H3 title is left-aligned in bold
**And** an optional "View All" link is right-aligned in accent-green, medium weight, with arrow suffix " →"
**And** a full-width divider appears below the header
**And** the link tap target extends to include padding for easy thumb access

### Story 1.8: Badge Component

As a visitor,
I want visual badges that convey status with text labels,
So that I understand game outcomes and achievements without relying on color alone.

**Acceptance Criteria:**

**Given** a badge is rendered
**When** it displays a win indicator
**Then** it shows "W" text with appropriate styling
**And** gold variant is used for achievements (CHAMP)
**And** warm variant is used for sting moments
**And** green variant is used for active/live states (LIVE)
**And** every badge variant includes a visible text label
**And** no badge relies on background color alone to convey meaning

### Story 1.9: Stat Callout Component

As a visitor,
I want stats to be visually prominent and aligned,
So that numbers are easy to read and compare.

**Acceptance Criteria:**

**Given** a stat value is displayed
**When** the Stat Callout renders
**Then** the number uses bold or black weight with tabular figures
**And** an optional unit suffix appears on the same line (e.g., "2,147 pts")
**And** numbers below 1,000 have no separator; numbers at 1,000+ use comma separators
**And** the component size adapts based on context (larger for hero stats, smaller for inline)

### Story 1.10: Card Base Component

As a visitor,
I want cards that feel interactive and well-defined,
So that I know content is tappable and sections are visually separated.

**Acceptance Criteria:**

**Given** any card component renders
**When** viewed on any device
**Then** it has 12px border-radius, warm border (--border), surface background
**And** internal padding is 24px (20px for compact variant)
**And** the full card surface is the tap target
**When** hovered on desktop
**Then** a subtle border-strong or shadow appears with 150ms transition
**When** tapped on mobile
**Then** a brief opacity change (0.95) provides feedback

### Story 1.11: Table Component

As a visitor viewing data tables,
I want a clean, readable table layout,
So that I can scan stats and standings efficiently.

**Acceptance Criteria:**

**Given** a data table renders on desktop
**When** it contains stat data
**Then** numbers use tabular figures for column alignment
**And** borders use the warm --border color
**And** rows with 12+ entries use alternating --surface-muted backgrounds
**And** table headers use proper <th> with scope attributes
**And** Press Box typography is applied (body size, appropriate weights)

### Story 1.12: Mobile Table Card Layout

As a visitor on mobile,
I want tables to transform into card layouts,
So that I can read data without horizontal scrolling.

**Acceptance Criteria:**

**Given** a table has more than 3 columns
**When** viewed on mobile (< 768px)
**Then** it switches to a card layout
**And** each card shows franchise identity on the left, key stat on the right
**And** the switch activates consistently at the md breakpoint (768px)
**And** no horizontal scrolling occurs

### Story 1.13: Tab Component

As a visitor on pages with multiple sections,
I want tabs that switch content smoothly,
So that I can explore different views without page reloads.

**Acceptance Criteria:**

**Given** a tabbed interface renders
**When** the active tab is selected
**Then** it shows accent-green indicator with bold text
**And** inactive tabs show text-tertiary with regular weight
**When** a tab is clicked
**Then** content swaps in place without page navigation
**And** focus remains on the tab (not the content)
**And** tabs scroll horizontally on mobile if more than 3 items

### Story 1.14: Select Component

As a visitor using dropdown pickers,
I want brand-styled select inputs,
So that franchise and season selection feels consistent with the site design.

**Acceptance Criteria:**

**Given** a Select component renders (franchise or season picker)
**When** it receives focus
**Then** a green focus ring appears (accent-green)
**And** all options are pre-populated (12 franchises or all seasons)
**And** the component uses shadcn/ui Select restyled to match Press Box theme

### Story 1.15: Input Component

As a visitor using the search field,
I want a brand-styled text input,
So that the search experience matches the site design.

**Acceptance Criteria:**

**Given** the player search Input renders
**When** it is in default state
**Then** it has a warm border (--border)
**When** it receives focus
**Then** a green focus ring appears (accent-green)
**And** the input uses shadcn/ui Input restyled to match Press Box theme

### Story 1.16: Sync Timestamp Component

As a visitor,
I want to know when data was last updated,
So that I can trust the information I'm seeing.

**Acceptance Criteria:**

**Given** any page renders
**When** the footer is visible
**Then** a sync timestamp shows "Last updated: [relative time]" in caption/tertiary style
**When** the timestamp is clicked
**Then** it toggles to show the absolute date/time
**When** data is older than 2 hours (hourly sync) or 26 hours (daily sync)
**Then** the timestamp text turns accent-warm color

### Story 1.17: Skip-to-Content Link

As a keyboard user,
I want a skip-to-content link,
So that I can bypass the navigation and jump directly to main content.

**Acceptance Criteria:**

**Given** any page loads
**When** the user presses Tab as the first keyboard action
**Then** a "Skip to content" link appears as the first focusable element
**When** activated
**Then** focus moves to the main content area
**And** the link is visually hidden until focused

### Story 1.18: Focus Indicators

As a keyboard user,
I want visible focus indicators on all interactive elements,
So that I always know where my keyboard focus is.

**Acceptance Criteria:**

**Given** any interactive element (button, link, tab, input) receives keyboard focus
**When** focus is visible
**Then** a 2px solid accent-green outline with 2px offset is displayed
**And** tab order follows the visual layout (no unexpected jumps)
**And** all interactive elements are reachable via Tab key

### Story 1.19: Responsive Layout Shell

As a visitor on any device,
I want the site to adapt gracefully to my screen size,
So that the experience is optimal regardless of device.

**Acceptance Criteria:**

**Given** the site loads on mobile (< 768px)
**Then** single-column layout with 16px horizontal padding and full-bleed cards
**Given** the site loads on tablet (768px - 1023px)
**Then** gentle scaling, nav expands, content begins centering
**Given** the site loads on desktop (>= 1024px)
**Then** max-width 1200px centered, generous whitespace (96px top/bottom, 48px between sections)
**And** no horizontal scrolling occurs at any breakpoint

### Story 1.20: Error State Pattern

As a visitor encountering an error,
I want a calm, confident error message,
So that I'm not alarmed and know data is still available.

**Acceptance Criteria:**

**Given** a server error occurs
**When** the error boundary renders
**Then** it displays "Something went wrong. We're showing the last available data."
**And** a "Try again" button and "Go home" link are available
**And** no panicked language ("Oops", "Uh oh") appears
**And** the error page matches the site's visual design

### Story 1.21: 404 Not Found Page

As a visitor navigating to a non-existent page,
I want a snarky but helpful 404 page,
So that I can find my way back with a smile.

**Acceptance Criteria:**

**Given** a URL does not match any route
**When** the 404 page renders
**Then** it displays "This page doesn't exist. Maybe it was traded away."
**And** links to Hub and Teams are provided for re-orientation
**And** the page matches the site's visual design
**And** no panicked language appears

### Story 1.22: Empty State Pattern

As a visitor viewing a page with no data,
I want a graceful empty state,
So that I understand why there's no data and what I can do next.

**Acceptance Criteria:**

**Given** any page or section has no data to display
**When** the EmptyState component renders
**Then** it is centered with max-width 400px
**And** an optional icon renders at 48px in text-muted-foreground/50
**And** a title displays in H3 style
**And** a description displays in body style with muted color
**And** an optional action link provides navigation
**And** page-specific variants use appropriate icons (calendar, users, search, trophy, chart, alert)

### Story 1.23: Snarky Label Content System

As a league member,
I want the site's editorial voice to be consistent and entertaining,
So that awards and shames feel like they come from the same personality.

**Acceptance Criteria:**

**Given** the content system TypeScript constant
**When** audited against the UX spec
**Then** all 14+ labels exist: Point Machine, Iron Curtain, Alpha Dog, League Doormat, Glass Cannon, Paper Tiger, Draft Day Genius, Wasted Picks, On Fire, Rock Bottom, Mercy Rule, Cardiac Crew, What Could've Been, Coaching Malpractice
**And** each label has a tone indicator (positive, sting, neutral)
**And** labels are consumed from the centralized constant, not hardcoded in components

---

## Epic 2: Preseason Hub Experience

During preseason, visitors land on a hub that celebrates last season's champion, counts down to the draft, showcases team and player awards with snarky personality, and shames the bottom performers. The hub feels alive even before football starts.

**FRs covered:** FR19
**UX-DRs covered:** UX-DR4, UX-DR6-10, UX-DR22, UX-DR27, UX-DR36

### Story 2.1: Champion Banner Component

As a visitor arriving at the hub,
I want to see last season's champion celebrated prominently,
So that the champion gets their moment and everyone else gets motivated.

**Acceptance Criteria:**

**Given** the hub is in preseason or offseason state
**When** the Champion Banner renders
**Then** it displays a full-width green gradient background (accent-green to dark green)
**And** a "YYYY CHAMPION" caption appears in white at 60% opacity
**And** the champion franchise name appears in H2 size, white, bold
**And** the champion record and defeated opponent appear in body size, white, 75% opacity
**And** a decorative trophy icon watermark appears at 30% opacity with aria-hidden="true"
**When** the banner is tapped
**Then** it navigates to the champion franchise's page

### Story 2.2: Draft Countdown Component

As a visitor in the preseason,
I want to see a countdown to the draft,
So that I can feel the anticipation building.

**Acceptance Criteria:**

**Given** the hub is in preseason state and a draft date is set
**When** the Draft Countdown renders
**Then** it shows a centered card with surface background and border
**And** "ROOKIE DRAFT COUNTDOWN" caption appears in accent-green, uppercase
**And** four countdown segments display: days, hours, min, sec in Display/Black weight with tabular figures
**And** unit labels appear below each segment in caption style
**And** the countdown updates every second via client-side interval
**And** aria-label provides context: "N days, N hours, N minutes, N seconds until rookie draft"
**When** the draft begins
**Then** the countdown component disappears from the hub

### Story 2.3: Team Award Card Component

As a visitor,
I want to see which teams dominated last season,
So that I have fuel for trash talk and bragging rights.

**Acceptance Criteria:**

**Given** team award data is available
**When** a Team Award Card renders
**Then** a snarky label from the content system appears (gold accent, uppercase: "POINT MACHINE")
**And** a large display-weight stat number is centered
**And** a context description appears in tertiary color
**And** the franchise name appears in bold at the bottom
**And** the card has gold-tint background (accent-gold-light) and gold border
**When** the card is tapped
**Then** it navigates to the franchise page

### Story 2.4: Player Award Card Component

As a visitor,
I want to see which players were the best at each position,
So that I know who carried their teams.

**Acceptance Criteria:**

**Given** player award data is available
**When** a Player Award Card renders
**Then** a category label appears (gold accent, uppercase: "BEST QB")
**And** a 64px circular player headshot is centered (or position icon fallback if no headshot)
**And** the player name appears bold and centered
**And** the owning franchise name appears in tertiary color
**And** the stat with unit appears (bold stat: "412.8 pts")
**And** the card has gold-tint background and gold border
**When** no headshot is available
**Then** a position icon fallback renders gracefully

### Story 2.5: Sting Card Component

As a visitor,
I want to see the worst performers called out with humor,
So that the site's trash talk personality shines through.

**Acceptance Criteria:**

**Given** sting stat data is available
**When** a Sting Card renders
**Then** a snarky label appears (warm accent, uppercase: "LEAGUE DOORMAT")
**And** the franchise name appears in bold
**And** a context description appears in tertiary color
**And** the stat with unit is right-aligned
**And** the card has warm-tint background (accent-warm-light) and warm border
**And** the warm accent color is always paired with a text label
**When** the card is tapped
**Then** it navigates to the franchise page

### Story 2.6: Draft Order Card Component

As a visitor,
I want to see the upcoming draft order,
So that I know who picks first and can plan accordingly.

**Acceptance Criteria:**

**Given** draft order data is available
**When** the Draft Order Card renders on the hub
**Then** a compact list shows the top 4 picks with rank, franchise name, and record
**And** the card has surface background
**And** a "Full Draft" link in the section header navigates to the Drafts page showing all 12 picks
**And** rows are separated by subtle dividers

### Story 2.7: Preseason Award Data Queries

As a developer,
I want server-side queries that return all preseason hub data,
So that the hub components can render without additional API calls.

**Acceptance Criteria:**

**Given** the previous season's data exists in the database
**When** preseason queries execute
**Then** team awards are returned (most PF, least PA, best record with franchise info)
**And** player awards are returned (best QB, RB, WR, TE with stats and owning franchise)
**And** sting stats are returned (worst record, high PF + low wins, high PA with franchise info)
**And** draft order is returned for the upcoming season
**And** all data comes from existing database tables with no Sleeper API calls at page load

### Story 2.8: Hub Seasonal State Detection

As a visitor,
I want the hub to automatically show the right content for the current football phase,
So that I always see what's relevant without manual switching.

**Acceptance Criteria:**

**Given** the NFL state endpoint returns the current season phase
**When** the hub page renders
**Then** the correct seasonal state is detected (preseason, regular season, playoffs, offseason)
**And** state detection drives which hub layout and components render
**And** no manual switching or configuration is required
**And** state transitions happen automatically as the NFL calendar progresses

### Story 2.9: Preseason Hub Layout

As a visitor during preseason,
I want a curated hub that sets the tone for the upcoming season,
So that the site feels alive even before football starts.

**Acceptance Criteria:**

**Given** the hub state is preseason
**When** the hub page renders
**Then** components appear in order: Champion Banner > Draft Countdown > Team Awards (2-col grid) > Player Awards (2-col grid) > Wall of Shame (full-width sting cards) > Draft Order
**And** award cards display in a responsive 2-column grid (2-col mobile, 2-3-col desktop)
**And** sting cards display full-width
**And** each section has a Section Header with appropriate title
**And** the layout follows magazine pacing (one visual moment per scroll stop)

---

## Epic 3: Game Day Hub Experience

During the regular season, visitors see live matchup scores updating in real time, the current week's standings, and weekly superlatives that fuel trash talk. The hub is the go-to destination on game day.

**FRs covered:** FR9, FR10, FR11, FR13, FR14, FR17, FR30, FR31, FR32
**UX-DRs covered:** UX-DR5, UX-DR11-13, UX-DR23-24, UX-DR27, UX-DR30

### Story 3.1: Week Banner Component

As a visitor during the season,
I want to see the current week prominently displayed,
So that I immediately know what week it is and what's happening.

**Acceptance Criteria:**

**Given** the hub is in regular season state
**When** the Week Banner renders
**Then** it displays a full-width green gradient background (accent-green to dark green)
**And** "HARAMBE MEMORIAL LEAGUE" caption appears in white at 60% opacity
**And** "Week N" appears as H1 in white, bold
**And** a game status context line appears in white at 75% opacity
**And** all status information is conveyed in text

### Story 3.2: Week Banner Game Window State

As a visitor during active games,
I want the banner to reflect that games are in progress,
So that I know scores are updating live.

**Acceptance Criteria:**

**Given** the NFL state indicates games are in progress
**When** the Week Banner renders
**Then** the context line shows "N games in progress"
**And** a subtle CSS pulse animation is visible (decorative, aria-hidden)
**And** the pulse does not convey information that isn't also in text

### Story 3.3: Week Banner Pre-Kickoff State

As a visitor before games start,
I want to know when games begin,
So that I can plan to check back for live scores.

**Acceptance Criteria:**

**Given** it is regular season but games have not started this week
**When** the Week Banner renders
**Then** the context line shows "Games start [DAY] [TIME] [TIMEZONE]"

### Story 3.4: Week Banner Complete State

As a visitor after all games finish,
I want to see the week is final,
So that I know scores are settled and can review results.

**Acceptance Criteria:**

**Given** all games for the week have completed
**When** the Week Banner renders
**Then** the context line shows "Week N Final"
**And** a link to full week results is provided

### Story 3.5: Week Banner Playoff Variant

As a visitor during playoffs,
I want the banner to show the playoff round,
So that I know which round of the playoffs is active.

**Acceptance Criteria:**

**Given** the hub is in playoff state
**When** the Week Banner renders
**Then** the title shows the round name instead of week number: "Wild Card Round", "Semifinal", or "Championship"
**And** all other banner behavior (states, gradient, context line) remains the same

### Story 3.6: Live Matchup Card Component

As a visitor on game day,
I want to see matchup scores at a glance,
So that I can track all games without leaving the hub.

**Acceptance Criteria:**

**Given** matchup data is available for the current week
**When** a Live Matchup Card renders
**Then** two franchise names are displayed with prominent scores in tabular figures
**And** a week label appears in tertiary color
**And** the full card is tappable, linking to the matchup detail page

### Story 3.7: Live Matchup Card Live State

As a visitor during active games,
I want to see which games are live with updating scores,
So that I can follow the action in real time.

**Acceptance Criteria:**

**Given** a matchup game is in progress
**When** the Live Matchup Card renders in live state
**Then** a green LIVE indicator shows (green dot + "LIVE" text label + CSS pulse)
**And** scores update every 30 seconds from the client-side poller
**And** an optional top scorer callout appears (e.g., "Josh Allen 32.4 pts")
**And** aria-live="polite" is set so screen readers announce score changes

### Story 3.8: Live Matchup Card Final State

As a visitor after a game ends,
I want to clearly see the final score and winner,
So that I know the result at a glance.

**Acceptance Criteria:**

**Given** a matchup has completed
**When** the Live Matchup Card renders in final state
**Then** the LIVE indicator is replaced with a "FINAL" badge
**And** the winning team's score is bold
**And** the losing team's score is regular weight

### Story 3.9: Live Matchup Card Upcoming State

As a visitor before games start,
I want to see upcoming matchups,
So that I know who's playing.

**Acceptance Criteria:**

**Given** a matchup has not yet started
**When** the Live Matchup Card renders in upcoming state
**Then** scores show projected totals or "--"
**And** a time label shows kickoff time ("SUN 1PM")

### Story 3.10: Live Score Poller Integration

As a visitor on game day,
I want scores to update automatically,
So that I don't have to refresh the page.

**Acceptance Criteria:**

**Given** the hub shows live matchup cards during a game window
**When** the ScorePoller component is active
**Then** it polls /api/live-scores every 30 seconds
**And** matchup card scores update in place
**When** the poller encounters an error
**Then** scores freeze at last known values and pulse stops
**And** the timestamp shows last successful update
**When** games end
**Then** LIVE badges switch to FINAL and the poller stops

### Story 3.11: Weekly Superlative Card Component

As a visitor after each week,
I want to see the week's standout moments,
So that I have ammunition for trash talk.

**Acceptance Criteria:**

**Given** weekly superlative data is available
**When** a Weekly Superlative Card renders
**Then** a caption label identifies the superlative type (gold or warm depending on tone)
**And** competing franchises and scores are shown for comparative superlatives
**And** a stat value with unit is displayed
**And** a context line describes the achievement
**And** positive superlatives (Closest Win, Highest Scorer) use gold-tint backgrounds
**And** negative superlatives (Biggest Blowout loser, Lowest Scorer) use warm-tint backgrounds
**When** the card is tapped
**Then** it navigates to full week results

### Story 3.12: Weekly Superlative Data Queries

As a developer,
I want queries that derive weekly superlatives from matchup data,
So that the hub can display this week's standout moments.

**Acceptance Criteria:**

**Given** matchup data exists for a completed week
**When** superlative queries execute
**Then** closest win is returned (smallest margin of victory with both teams and scores)
**And** biggest blowout is returned (largest margin with winner and loser)
**And** highest scorer is returned (team with most points)
**And** lowest scorer is returned (team with fewest points)
**And** all data comes from existing matchup tables

### Story 3.13: Standings Snapshot Card Component

As a visitor outside game windows,
I want a quick glance at the standings,
So that I know who's leading the league.

**Acceptance Criteria:**

**Given** standings data is available
**When** the Standings Snapshot Card renders on the hub
**Then** a "STANDINGS, WEEK N" caption and "View Full" link are shown
**And** a compact ranked list displays the top 3 teams and bottom 1 team
**And** each entry shows franchise name (bold) and record (tertiary, W-L format)
**And** the leader has optional green accent treatment
**And** the last place team has optional warm accent treatment
**And** "View Full" link navigates to Records > Current Standings showing all 12 teams

### Story 3.14: Regular Season Hub Layout (Game Windows)

As a visitor during active games,
I want the hub focused on live scores,
So that game day is the primary experience.

**Acceptance Criteria:**

**Given** the hub state is regular season AND games are in progress
**When** the hub page renders
**Then** components appear in order: Week Banner (game window state) > Live Matchups (all 6 matchup cards)
**And** all matchup cards are visible (not limited to top 5)
**And** the layout is responsive (single column mobile, potentially 2-col desktop)

### Story 3.15: Regular Season Hub Layout (Outside Windows)

As a visitor between game days,
I want a hub that recaps the week and shows standings,
So that there's always something interesting to see.

**Acceptance Criteria:**

**Given** the hub state is regular season AND no games are in progress
**When** the hub page renders
**Then** components appear in order: Week Banner (pre-kickoff or complete state) > Standings Snapshot > Weekly Superlatives ("This Week's Damage") > Power Rankings snapshot
**And** each section has a Section Header with appropriate title
**And** the layout follows magazine pacing

---

## Epic 4: Franchise Deep Dive

Each franchise has a rich detail page with a branded header showing key stats, tabbed views for overview/roster/drafts, and the franchise hero gradient. The Teams section becomes each franchise's homepage within the league site.

**FRs covered:** FR5, FR6, FR7, FR8, FR20, FR21, FR27
**UX-DRs covered:** UX-DR17, UX-DR21, UX-DR34

### Story 4.1: Franchise Header Component

As a visitor viewing a franchise page,
I want to see the franchise identity prominently displayed,
So that I immediately know whose page I'm on and who owns the team.

**Acceptance Criteria:**

**Given** a franchise detail page loads
**When** the Franchise Header renders
**Then** the franchise name appears as H1
**And** owner attribution shows with season dates (e.g., "Owned by Blake (2023-present)")
**And** co-owner displays with " & " separator when applicable
**And** the layout stacks on mobile and displays horizontally on desktop

### Story 4.2: Franchise Header Stat Callouts

As a visitor viewing a franchise page,
I want to see key franchise stats at a glance,
So that I can quickly assess the franchise's historical performance.

**Acceptance Criteria:**

**Given** the Franchise Header renders
**When** stat data is available
**Then** three stat callouts display: ALL-TIME record (e.g., "87-54"), CHAMPIONSHIPS count (gold accent, e.g., "2"), CURRENT season record with rank
**And** each uses the Stat Callout component with appropriate sizing
**And** the stats row is responsive (stacked mobile, horizontal desktop)

### Story 4.3: Franchise Page Tabs

As a visitor exploring a franchise,
I want tabs to switch between different views,
So that I can see overview, roster, and draft history without navigating away.

**Acceptance Criteria:**

**Given** the franchise detail page loads
**When** tabs render below the header
**Then** three tabs appear: Overview, Roster, Drafts
**And** the active tab shows accent-green indicator with bold text
**When** a tab is clicked
**Then** content swaps in place without page navigation
**And** URL state updates to reflect the active tab
**And** focus remains on the tab after switching

### Story 4.4: Franchise Hero Gradient

As a visitor viewing a franchise page,
I want a subtle team-colored gradient in the hero,
So that the page feels like a team homepage.

**Acceptance Criteria:**

**Given** a franchise has a brandingColor set
**When** the franchise page renders
**Then** the hero section has a background gradient using brandingColor at 5-8% opacity
**And** the gradient fades to transparent below the hero
**Given** a franchise has no brandingColor
**Then** no gradient is applied (clean default background)
**And** all text over the gradient maintains WCAG AA contrast ratios

### Story 4.5: Franchise Overview Tab Content

As a visitor viewing a franchise's history,
I want to see season-by-season performance,
So that I can track the franchise's trajectory over time.

**Acceptance Criteria:**

**Given** the Overview tab is active
**When** season data is available
**Then** season-by-season cards show year, record, standings finish, and championship result
**And** co-owner displays where applicable
**And** legacy era seasons show a "Legacy Era" badge
**And** seasons are ordered chronologically (most recent first)

### Story 4.6: Roster Row Component

As a visitor viewing a franchise roster,
I want to see each player's status clearly,
So that I know who's starting, benched, or injured.

**Acceptance Criteria:**

**Given** a Roster Row renders
**Then** it shows player headshot (or position icon fallback), name, position, NFL team
**And** starter designation uses bold weight; bench uses regular weight
**And** a status indicator shows Active, IR, Questionable, or Out with text labels
**And** IR players get dimmed treatment with IR badge
**And** the row shows average points per week if available

### Story 4.7: Franchise Roster Tab Content

As a visitor viewing a franchise roster,
I want to see the full roster organized clearly,
So that I can evaluate the team's depth.

**Acceptance Criteria:**

**Given** the Roster tab is active
**When** roster data is available
**Then** the full roster displays using Roster Row components
**And** table layout is used on desktop; card layout on mobile
**And** players are grouped by starters/bench if applicable

### Story 4.8: Franchise Drafts Tab Content

As a visitor viewing draft history,
I want to see all draft picks for this franchise,
So that I can evaluate their drafting history.

**Acceptance Criteria:**

**Given** the Drafts tab is active
**When** draft data is available
**Then** picks are displayed by round and year
**And** each pick is attributed to the owning franchise at time of draft
**And** all seasons are covered including legacy era
**And** a season selector allows filtering by year

### Story 4.9: Franchise Card Top Border

As a visitor browsing the Teams page,
I want each franchise card to show its team color,
So that the grid feels personalized and visually distinct.

**Acceptance Criteria:**

**Given** the Teams page displays franchise cards
**When** a franchise has a brandingColor
**Then** a 3px top border in that color appears on the card
**Given** a franchise has no brandingColor
**Then** the border falls back to var(--border)
**And** the border is purely decorative; franchise identity is conveyed by name

---

## Epic 5: League History & Records

Visitors can explore the full league timeline, dive into any season, settle arguments with head-to-head rivalry cards, browse the enhanced trophy case, and scan all-time leaderboards. The historical archive is complete and visually rich.

**FRs covered:** FR1, FR2, FR3, FR4, FR12, FR14, FR15, FR16, FR18, FR19, FR22, FR23
**UX-DRs covered:** UX-DR14-15, UX-DR18-19, UX-DR35

### Story 5.1: Season Timeline Card Component

As a visitor exploring league history,
I want each season represented as a rich card,
So that I can quickly see the highlights of any year.

**Acceptance Criteria:**

**Given** season data is available
**When** a Season Timeline Card renders
**Then** it shows the season year (H2), team count ("12 teams" or "10 teams")
**And** the champion name appears in bold with gold accent
**And** runner-up and most PF are shown
**And** a "View" link navigates to the full season detail
**And** legacy era seasons include a subtle "Legacy Era" badge
**When** the card is tapped
**Then** it navigates to the full season detail page

### Story 5.2: Season Timeline Page Layout

As a visitor,
I want to browse all league seasons chronologically,
So that I can explore the full history of the league.

**Acceptance Criteria:**

**Given** the History page loads
**When** season data is available
**Then** Season Timeline Cards display in chronological order
**And** legacy and current eras flow naturally together (no visual break)
**And** the layout is responsive (single column)

### Story 5.3: Season Detail Page Enhancement

As a visitor viewing a specific season,
I want the champion highlighted with a premium gold treatment,
So that the championship feels significant.

**Acceptance Criteria:**

**Given** a season detail page loads for a season with a champion
**When** the page renders
**Then** the champion section has a gold-tinted background (5% opacity)
**And** ChampionshipStars (hero variant) display next to the champion name
**And** a "League Champion" SuperlativeBadge with gold variant is shown
**And** full standings table and week-by-week results are available

### Story 5.4: Rivalry Card Component

As a visitor settling an argument,
I want to see head-to-head records in a visually impactful way,
So that the data speaks for itself in the group chat.

**Acceptance Criteria:**

**Given** H2H data exists between two franchises
**When** a Rivalry Card renders
**Then** it shows centered team names with "vs" (H3)
**And** a display-weight record is shown (e.g., "7 , 3")
**And** "ALL-TIME RECORD" caption appears below
**And** a current streak badge shows (gold if winning, warm if losing)
**And** the last meeting shows date, winner, and score
**And** the card is responsive (stacked mobile, horizontal desktop)
**When** the card is tapped
**Then** it expands to or navigates to season-by-season H2H breakdown

### Story 5.5: Head-to-Head Page Layout

As a visitor comparing two franchises,
I want to select any two teams and see their full history,
So that I can settle rivalries with data.

**Acceptance Criteria:**

**Given** the H2H page loads
**When** two franchises are selected via dropdown pickers
**Then** a Rivalry Card displays their overall record
**And** a season-by-season breakdown is shown below
**And** the layout is responsive

### Story 5.6: Trophy Case Page Enhancement

As a visitor browsing league achievements,
I want a visually rich trophy case,
So that championships and awards feel premium.

**Acceptance Criteria:**

**Given** the Trophies page loads
**When** championship data is available
**Then** the most recent champion gets a larger treatment (StatHero lg)
**And** each championship entry shows season year, FranchiseIdentity, and "League Champion" gold badge
**And** historical champions are listed chronologically
**And** an all-time leaders section shows multi-championship franchises

### Story 5.7: Leaderboard Table Styling

As a visitor viewing all-time rankings,
I want a clean, scannable leaderboard,
So that I can see who dominates across all categories.

**Acceptance Criteria:**

**Given** the leaderboard page loads
**When** franchise data is available
**Then** each row shows rank (muted, bold), team name (primary, medium), stat value right-aligned (bold, tabular)
**And** rows use alternating surface-muted backgrounds for 12+ entries
**And** each row has a left border in the franchise's brandingColor (fallback to --border)
**And** the table switches to card layout on mobile

### Story 5.8: Power Rankings Page Styling

As a visitor viewing power rankings,
I want ranking cards that feel personalized,
So that I can see where my team stands.

**Acceptance Criteria:**

**Given** the power rankings page loads
**Then** ranking cards have a left border in franchise brandingColor (fallback to --border)
**And** flex-wrap is applied at md breakpoint to prevent overflow
**And** the layout is responsive

### Story 5.9: Draft History Page Enhancement

As a visitor browsing draft history,
I want to see any historical draft in full,
So that I can evaluate draft strategies across years.

**Acceptance Criteria:**

**Given** the Drafts page loads
**When** a season is selected
**Then** the full draft displays (all teams, all picks, all rounds)
**And** picks are attributed to the owning franchise at time of draft
**And** legacy era drafts are included
**And** a season selector allows browsing different years

### Story 5.10: Legacy Era Visual Treatment

As a visitor viewing historical data,
I want legacy era seasons clearly labeled,
So that I understand the context of 10-team vs 12-team data.

**Acceptance Criteria:**

**Given** any view displays data from the legacy era
**When** it renders
**Then** a subtle "Legacy Era" badge appears on legacy season entries
**And** all-time stats include context: "All-time (including legacy era)"
**And** legacy seasons flow naturally in timelines without visual breaks

---

## Epic 6: Playoffs & Offseason Hub

During playoffs, the hub shows bracket progression with live scores and elimination alerts. In the offseason, it recaps the season and shows transaction activity. All four seasonal hub states are now complete.

**FRs covered:** FR12
**UX-DRs covered:** UX-DR5, UX-DR14-16, UX-DR25-26

### Story 6.1: Playoff Bracket Card (Compact)

As a visitor during playoffs,
I want to see the current playoff round on the hub,
So that I know who's playing and who's advancing.

**Acceptance Criteria:**

**Given** the hub is in playoff state
**When** the compact Playoff Bracket Card renders
**Then** it shows the current round matchups only
**And** each matchup shows team names, seeds, and scores
**And** the winner advances with bold styling; the loser is grayed
**And** the eventual champion gets gold accent treatment
**And** the bracket structure is conveyed through semantic headings and lists for accessibility

### Story 6.2: Playoff Bracket Card (Full)

As a visitor viewing the playoffs detail page,
I want to see the complete bracket,
So that I can see the full progression from first round to championship.

**Acceptance Criteria:**

**Given** the Playoffs detail page loads for a season
**When** playoff data is available
**Then** the full bracket displays all rounds from first round through championship
**And** all scores, seeds, and team names are shown
**And** completed matchups show bold winners and grayed losers
**And** the bracket is responsive (vertical mobile, full visualization desktop)

### Story 6.3: Playoff Bracket Live Integration

As a visitor during live playoff games,
I want bracket scores to update in real time,
So that I can follow the playoff action live.

**Acceptance Criteria:**

**Given** playoff games are in progress
**When** the hub or Playoffs page shows bracket cards
**Then** active matchups show the LIVE indicator
**And** scores update via the existing poller every 30 seconds
**And** completed games switch from LIVE to FINAL

### Story 6.4: Playoffs Hub Layout

As a visitor during the playoffs,
I want a hub that focuses on the bracket and remaining games,
So that the playoff picture is immediately clear.

**Acceptance Criteria:**

**Given** the hub state is playoffs
**When** the hub page renders
**Then** components appear in order: Week Banner (playoff variant) > Playoff Bracket (compact, current round) > Remaining Matchup Cards
**And** the layout is responsive

### Story 6.5: Offseason Recap Card Component

As a visitor after the season ends,
I want a season recap highlighting the best moments,
So that I can relive the season's highlights.

**Acceptance Criteria:**

**Given** the season has ended
**When** the Offseason Recap Card renders
**Then** a "YYYY SEASON RECAP" caption appears
**And** a compact list shows: Champion, Most PF, MVP (if derivable), Biggest Upset, Longest Win Streak
**And** each line is tappable, linking to the relevant detail page
**And** a "Full Recap" link navigates to the season detail page

### Story 6.6: Transaction Activity Card Component

As a visitor in the offseason,
I want to see recent trades and waivers,
So that the site feels alive between seasons.

**Acceptance Criteria:**

**Given** transaction data is available
**When** the Transaction Activity Card renders
**Then** a "RECENT MOVES" caption appears
**And** a chronological list shows recent trades and waivers
**And** each entry shows date, transaction type (Trade/Waiver), franchises, and players involved
**And** a "View All" link navigates to the full transaction history

### Story 6.7: Offseason Recap Data Queries

As a developer,
I want queries that derive season recap highlights,
So that the offseason hub can display relevant data.

**Acceptance Criteria:**

**Given** a completed season's data exists
**When** recap queries execute
**Then** champion is returned with franchise info
**And** most PF franchise is returned
**And** biggest upset is returned (largest underdog win by margin)
**And** longest win streak is returned
**And** all data comes from existing database tables

### Story 6.8: Offseason Hub Layout

As a visitor in the offseason,
I want a hub that celebrates the past season and shows activity,
So that there's always a reason to visit the site.

**Acceptance Criteria:**

**Given** the hub state is offseason
**When** the hub page renders
**Then** components appear in order: Champion Banner (new champion) > Offseason Recap > Transaction Activity > All-Time Records updates
**And** each section has a Section Header with appropriate title
**And** the layout is responsive

---

## Epic 7: Player Discovery

Visitors can search any NFL player by name and see rich result cards with HML owner, status, position, and sync freshness. The player search is a complete, polished feature.

**FRs covered:** FR24, FR25, FR26, FR27, FR28
**UX-DRs covered:** UX-DR20, UX-DR42-43

### Story 7.1: Player Search Result Card Component

As a visitor searching for a player,
I want rich result cards showing all relevant info,
So that I can see ownership, status, and position at a glance.

**Acceptance Criteria:**

**Given** player search results are available
**When** a Player Search Result Card renders
**Then** it shows a player headshot (circle) with position icon fallback
**And** the player name appears in bold
**And** position and NFL team are shown
**And** a status badge shows current status (Active, IR, Questionable, Out, or Unowned)
**And** the HML owner franchise name is shown as a link to the franchise page
**And** a "Last synced" timestamp appears in caption/tertiary style

### Story 7.2: Player Status Badges

As a visitor viewing player information,
I want clear status indicators,
So that I know a player's availability at a glance.

**Acceptance Criteria:**

**Given** a player has a status
**When** the status badge renders
**Then** "Active" shows green badge with "Active" text
**And** "IR" shows warm badge with "IR" text
**And** "Questionable" shows warm badge with "Questionable" text
**And** "Out" shows warm badge with "Out" text
**And** unowned free agents show neutral badge with "Unowned" text
**And** every badge includes its text label; never relies on color alone

### Story 7.3: Player Search Page Layout

As a visitor looking for a specific player,
I want a clean search experience,
So that I can find any player quickly.

**Acceptance Criteria:**

**Given** the Players page loads
**When** no search has been performed
**Then** the input shows with warm border and placeholder "Search by player name"
**When** a search is submitted (Enter or button)
**Then** results render server-side as Player Search Result Cards
**And** search is case-insensitive and matches partial names ("allen" finds "Josh Allen", "Keenan Allen")
**When** no results match
**Then** "No players found matching '[query]'" appears in tertiary text
**And** no client-side autocomplete exists in Phase 1

### Story 7.4: Franchise Picker Component

As a visitor selecting a franchise for comparison,
I want a dropdown pre-populated with all teams,
So that I can quickly pick any franchise.

**Acceptance Criteria:**

**Given** a franchise picker renders (H2H page, filters)
**Then** a shadcn/ui Select is styled with green focus ring
**And** all 12 franchises are pre-populated as options
**And** the component matches the Press Box theme

### Story 7.5: Season Picker Component

As a visitor browsing historical data,
I want a dropdown pre-populated with all seasons,
So that I can quickly jump to any year.

**Acceptance Criteria:**

**Given** a season picker renders (draft history, season views)
**Then** a shadcn/ui Select is styled with green focus ring
**And** all seasons are pre-populated as options
**And** the current/most recent season is the default selection
**And** the component matches the Press Box theme
