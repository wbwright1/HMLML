---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 3.2
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None
---

# Story 3.2: Superlative Stats Row -- Implementation Brief

## Story Reference

- **Epic**: 3 (League Hub Homepage)
- **Story**: 3.2 (Superlative Stats Row)
- **FRs**: FR2
- **UX-DRs**: UX-DR2
- **NFRs**: NFR5

## Restated Acceptance Criteria

### AC-1: Superlative Stats Row Renders with Data

**Given** the homepage at `/`
**When** the page loads with league data available
**Then** a row of 3-4 StatHero components displays league superlatives
**And** stats include: highest score this week, longest active win streak, closest matchup, most all-time wins
**And** each stat shows the number in md size (36-40px) with a label below
**And** desktop layout is a horizontal row (grid-cols-4)
**And** mobile layout is a 2x2 responsive grid (grid-cols-2)
**And** all data is server-rendered from existing queries (no new API calls)

### AC-2: Graceful Absence When No Data

**Given** no league data is available
**When** the page loads
**Then** the superlative row is not rendered (no empty placeholder)

## Current State Analysis

**Story 3.2 is already implemented.** The homepage (`app/page.tsx`) already contains the complete superlative stats row implementation at lines 98-140. Specifically:

1. **Data fetching**: `getHomepageSuperlatives(seasonId)` from `lib/queries/homepage.ts` is already called (line 46) and returns all four superlative stats.
2. **Layout**: The grid is already `grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6` (line 102), satisfying the responsive grid requirement.
3. **StatHero usage**: All four stats (highestScore, longestStreak, closestMatchup, mostAllTimeWins) are rendered as `StatHero` components with `variant="md"` (lines 103-136).
4. **Graceful absence**: The `hasAnySuperlative` guard (lines 62-71) prevents rendering when no superlative data exists.
5. **Server-rendered**: The homepage is a React Server Component (no `"use client"` directive). All data comes from `lib/queries/homepage.ts` database queries; no Sleeper API calls at page load.

## Database Changes

**None required.** The `getHomepageSuperlatives` query in `lib/queries/homepage.ts` already derives all four stats from existing tables:
- `matchups` table: highest score, closest matchup, win streaks (via `isWinner` field)
- `franchise_seasons` table: most all-time wins (via `SUM(wins)`)
- `franchises` table: franchise names for display

## API Endpoints

**None required.** No new API routes needed. All data is server-rendered via direct Postgres queries in the page's server component. Per architecture: "No page load triggers a live Sleeper API call."

## Validation Schemas

**None required.** No new external data ingestion. All data flows from the already-validated database via Drizzle ORM typed queries. The `getHomepageSuperlatives` function returns a typed object; no additional Zod validation is needed for DB-sourced data.

## Business Rules

1. **Stat definitions** (as implemented in `getHomepageSuperlatives`):
   - **Highest Score**: The single highest `points` value across all completed matchups in the current season. Displays franchise name, point total (to 1 decimal), and the week it occurred.
   - **Longest Active Win Streak**: Computed by iterating completed regular-season matchups from most recent week backward per franchise. Only streaks > 1 are displayed. Shows franchise name and streak count with "W" suffix.
   - **Closest Matchup**: The matchup pair with the smallest margin in the latest completed week of the current season. Shows the margin (to 1 decimal), both team names, and the week.
   - **Most All-Time Wins**: Career total wins across all seasons via `SUM(franchise_seasons.wins)`. Shows franchise name and total win count.

2. **Conditional rendering**: The row only renders if at least one superlative is non-null (with an additional check that win streaks must be > 1 to display). Individual StatHero cards only render when their specific stat is available; the grid accommodates 1 to 4 cards.

3. **Static per page load**: No client-side polling or dynamic updates. Data is fetched once at server render time.

4. **Season-scoped**: Superlatives are derived from the latest season's data (passed as `seasonId`). The "most all-time wins" is the sole career-spanning stat.

## Component Inventory

| Component | File | Role | Status |
|---|---|---|---|
| `StatHero` | `components/stat-hero.tsx` | Displays a stat value with badge, label, and context | Exists; used with `variant="md"` |
| `ScrollReveal` | `components/scroll-reveal.tsx` | Wraps the superlative section with fade-in animation | Exists; wraps the section |
| Homepage | `app/page.tsx` | Server component rendering the superlative row | Exists; lines 98-140 |
| `getHomepageSuperlatives` | `lib/queries/homepage.ts` | Query returning all four superlative stats | Exists; fully implemented |

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Server Component (no `"use client"`) | PASS | Homepage is a server component; `ScrollReveal` is a client island but that is the existing pattern |
| Accessibility: no color-only info | PASS | Each StatHero uses text labels (badge text, value, label, context); no color-only meaning |
| WCAG AA contrast | PASS | StatHero uses `text-primary` for badge, default text for value, `text-muted-foreground` for label/context; all within design token system |
| `tabular-nums` on stat numbers | REVIEW | `StatHero` does not explicitly apply `tabular-nums`. The `font-black` class is applied but `font-variant-numeric: tabular-nums` is not. Per CLAUDE.md: "Tabular figures on all score/stat numbers." This is a minor gap. |
| Responsive grid (NFR5) | PASS | `grid-cols-2 md:grid-cols-4` matches the requirement exactly |
| No new dependencies (NFR6) | PASS | No new libraries |
| Design tokens (no hardcoded hex) | PASS | No inline hex values in the superlative section |
| Typography: md variant = 36-40px (UX-DR2) | PASS | `StatHero` md variant uses `text-[38px]`, which is within the 36-40px range |
| Animation philosophy | PASS | `ScrollReveal` uses opacity/transform transitions only; respects `prefers-reduced-motion` |

## NFR Targets

| NFR | Requirement | Status |
|---|---|---|
| NFR5 | Responsive grid: grid-cols-2 mobile, grid-cols-4 desktop | MET |
| NFR6 | No new third-party libraries | MET |
| NFR1 (inherited) | Franchise colors decorative only | MET (no franchise colors used in this row) |
| NFR3 (inherited) | WCAG 2.1 AA contrast | MET (design token text classes) |

## Forward Dependencies

- **Story 6.3 (Responsive Edge-Case Fixes)**: The epics document notes that Story 6.3 includes "Superlative row responsive grid (grid-cols-2 mobile, grid-cols-4 desktop)" as an audit item. Since Story 3.2 already implements the correct grid, Story 6.3 should verify rather than re-implement.
- **Weekly Superlative Cards (Phase 2)**: The UX spec describes richer "Weekly Superlative Cards" for the regular season hub (closest win, biggest blowout, best possible roster, etc.). The current StatHero row is the Phase 1 implementation; the full Weekly Superlative Card component described in the UX spec is a future enhancement.

## Open Questions

**None.** This story is fully implemented. All acceptance criteria are met:

1. The superlative stats row renders 3-4 StatHero components with the specified stats (AC-1).
2. The responsive grid is correctly configured as grid-cols-2 / md:grid-cols-4 (AC-1).
3. StatHero uses `variant="md"` producing 38px numbers (AC-1).
4. All data comes from `getHomepageSuperlatives`, a server-side database query (AC-1).
5. The row does not render when no superlative data is available (AC-2).

**Minor improvement opportunity**: The `StatHero` component could benefit from adding `tabular-nums` to its value element for numeric alignment consistency per CLAUDE.md typography rules. This is not a blocker for story completion but could be addressed as part of a typography audit.
