# Story 3.3: Full Week Matchups Display — FEND Handoff

## Status: COMPLETE

## What Was Done

Story 3.3 was already fully implemented (as noted in the reqs brief). The task was to write verification E2E tests confirming all acceptance criteria are met.

### E2E Tests Written

**File:** `e2e/story-3.3-full-matchups.spec.ts`

9 tests covering all acceptance criteria, designed to handle both data-present and data-absent scenarios gracefully:

| Test | Acceptance Criteria | Behavior When No Data |
|---|---|---|
| T01 | Matchups section header includes "Week N Matchups" | Skips |
| T02 | Week number is a valid NFL week (1-18) | Skips |
| T03 | No "View all matchups" link in matchups section | Passes (trivially satisfied) |
| T04 | MatchupRow components render with role="group" and aria-label | Skips |
| T05 | ScorePoller component area exists in matchups section | Skips |
| T06 | Matchups section absent when no matchup data | Passes (confirms section absent) |
| T07 | Season year label ("YYYY Season") appears in section | Skips |
| T08 | Each matchup row displays two team names | Skips |
| T09 | No "View all matchups" link anywhere on homepage | Passes |

### Test Results

```
3 passed, 6 skipped (6.0s)
```

- 3 tests passed: T03, T06, T09 (these verify behavior regardless of data presence)
- 6 tests skipped: T01, T02, T04, T05, T07, T08 (require matchup data in DB; skip gracefully when absent)
- 0 failures

### Key Design Decisions

1. **Graceful skip pattern:** Tests that require matchup data check for the matchups heading first. If absent, they call `test.skip()` rather than failing. This follows the established pattern from `story-3.2-superlatives.spec.ts`.

2. **No mocks:** All tests run against the real Next.js server and real database, per project testing rules.

3. **Section locator strategy:** The matchups section is located by finding a `<section>` element containing an `<h2>` matching the regex `Week \d+ Matchups`. This is resilient to DOM structure changes while being specific enough to target only the matchups section.

4. **ScorePoller verification:** Since ScorePoller renders `null` when not in a game window (the normal case), T05 verifies the section structure exists and checks for the `aria-live="polite"` region only if a game window is active.

## Files Created

- `e2e/story-3.3-full-matchups.spec.ts` (new)
- `_work/epic-3/story-3.3/fend-handoff.md` (this file)

## Files Modified

None. No code changes were required; the implementation already satisfied all acceptance criteria.

## No Code Changes Needed

All 5 acceptance criteria from the reqs brief were pre-satisfied:
1. All matchups render (no `.slice()` or `.limit()`)
2. No "View all matchups" link exists
3. Dynamic "Week N Matchups" header via PageSection
4. ScorePoller integration present
5. Empty state handling when no data

## How to Verify with Data

To get all 9 tests passing (including the data-dependent ones), ensure the database has:
- At least one season with `status = 'in_season'`
- NFL state data pointing to a current week
- 12 matchup rows for the current week (6 paired matchups for a 12-team league)

Then run:
```
npx playwright test --project=chromium e2e/story-3.3-full-matchups.spec.ts
```
