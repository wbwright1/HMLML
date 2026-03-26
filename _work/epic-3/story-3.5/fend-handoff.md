# Story 3.5: Season Narrative Block -- FEND Handoff

## Status: COMPLETE

## Gap Resolved

**Gap 1 (ChampionshipStars missing from reigning champion):** Fixed.

### Changes Made

#### 1. `lib/queries/homepage.ts` -- Extended `getLeagueAtAGlance()`
- Added `championFranchiseId` to the reigning champion query select fields.
- Added a follow-up query that counts total championships for the reigning champion's franchise (`COUNT(*)` on `seasons` where `champion_franchise_id` matches).
- Added `reigningChampionshipCount` to the return type (both success and error paths).

#### 2. `app/page.tsx` -- Added ChampionshipStars to offseason view
- Imported `ChampionshipStars` from `components/championship-stars.tsx`.
- Composed `ChampionshipStars` into the `StatHero` value prop for the reigning champion card, using a flex column layout with the champion name above and stars below.
- Stars only render when `reigningChampionshipCount > 0`.
- Uses `variant="inline"` (14px stars) to fit within the StatHero card.

### Files Modified
- `lib/queries/homepage.ts` (lines 232-247 area: query extension + championship count query)
- `app/page.tsx` (import added; lines 177-190 area: StatHero value prop updated)

### Files Created
- `e2e/story-3.5-season-narrative.spec.ts` (8 tests)

## Verification

### Type Checking
- `npx tsc --noEmit` passes with zero errors.

### E2E Tests
- 8 tests in `e2e/story-3.5-season-narrative.spec.ts`
- Results: 6 passed, 2 skipped (in-season tests skip because current DB state is offseason)
- Command: `npx playwright test --project=chromium e2e/story-3.5-season-narrative.spec.ts`

### Test Coverage
| Test | What It Verifies |
|------|-----------------|
| T01 | Homepage renders a narrative section (either variant) |
| T02 | In-season: winners in bold, scores with tabular-nums, blowout callout |
| T03 | Offseason: StatHero cards with Champion, Seasons Played, Total Matchups |
| T04 | ChampionshipStars present on reigning champion (role=img, aria-label) |
| T05 | No panicked language ("Oops", "Uh oh", etc.) anywhere on page |
| T06 | Page loads cleanly whether data exists or not |
| T07 | In-season results use "def." text labels (not color-only) |
| T08 | Offseason section has "Offseason" label with uppercase text-transform |

### Design Compliance
- No `"use client"` added; everything is server-rendered.
- No new dependencies introduced.
- ChampionshipStars uses existing `variant="inline"` with gold star icons.
- StatHero `value` prop accepts `ReactNode`; no component changes needed.
- Accessible: ChampionshipStars has `role="img"` and `aria-label` describing count.

## Known Pre-existing Issue
- React hydration mismatch warning exists on the homepage (unrelated to story 3.5; appears to come from the ScorePoller client component). This is a pre-existing issue and does not affect narrative block functionality.
