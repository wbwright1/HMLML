# Story 6.2: Page-Specific Empty States - FEND Handoff

## Summary

Replaced 12 plain-text empty state messages across 12 files with the `EmptyState` component. Each instance uses the correct icon, title, description, and action link (where applicable) per the requirements brief.

## Changes Made

### Files Modified (12 files, 12 instances)

| # | File | Icon | Title | Action Link |
|---|---|---|---|---|
| 1 | `app/drafts/page.tsx` | calendar | "No Draft Data" | /seasons |
| 2 | `app/matchups/page.tsx` | calendar | "No Matchups Available" | /seasons |
| 3 | `app/records/leaderboard-table.tsx` | trophy | "No Leaderboard Data" | None |
| 4 | `app/records/trophies/page.tsx` | trophy | "No Championship Data" | /seasons |
| 5 | `app/records/power-rankings/page.tsx` | chart | "No Power Rankings" | None |
| 6 | `app/records/rivalries/page.tsx` | users | "No Rivalry Data" | None |
| 7 | `app/playoffs/[seasonYear]/page.tsx` | calendar | "No Playoff Data" | /seasons/{year} |
| 8 | `app/teams/[franchiseSlug]/roster/page.tsx` | users | "No Roster Data" | None |
| 9 | `app/teams/[franchiseSlug]/page.tsx` | calendar | "No Season History" | None |
| 10 | `app/seasons/[seasonYear]/week/[week]/page.tsx` | calendar | "No Matchup Data" | /seasons/{year} |
| 11 | `app/teams/[franchiseSlug]/drafts/page.tsx` | calendar | "No Draft History" | None |
| 12 | `app/records/head-to-head/page.tsx` | chart | "No Match History" | None |

### Key Implementation Details

- Wrapper `<div>` card elements removed where EmptyState handles its own layout (trophies, power rankings, playoffs, week detail)
- Existing `<Link>` elements replaced with `actionHref`/`actionLabel` props (matchups, playoffs, week detail)
- Dynamic content preserved via template literals (leaderboard season filter, playoffs year, week detail year)
- `leaderboard-table.tsx` is a `"use client"` component; EmptyState imports correctly since it has no server-only APIs
- All copy uses confident, calm voice; no "Oops", "Uh oh", or panicked language

### Files NOT Modified (already compliant)

- `app/page.tsx` (homepage)
- `app/teams/page.tsx`
- `app/seasons/page.tsx`
- `app/players/player-table.tsx`
- `app/records/head-to-head/page.tsx` (lines 78-91, existing EmptyState usages)
- `app/error.tsx`
- `app/not-found.tsx`
- `components/empty-state.tsx`

## Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors
- E2E tests: 28/28 passing (`npx playwright test --project=chromium e2e/story-6.2-page-empty-states.spec.ts`)
- Grep audit: No remaining plain-text empty state `<p>` messages in `app/` directory outside of EmptyState descriptions

## Test File

- `e2e/story-6.2-page-empty-states.spec.ts` (28 tests)
  - AC1: EmptyState structure verification (icon, title, description) for 8 pages
  - AC1: Action link preservation for matchups, drafts, trophies
  - AC2: Voice/tone compliance (no "Oops"/"Uh oh") across 11 pages
  - AC1: No orphan plain-text empty messages across 6 pages
