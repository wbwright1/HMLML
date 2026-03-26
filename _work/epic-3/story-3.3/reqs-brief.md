# Story 3.3: Full Week Matchups Display — Requirements Brief

> **Orchestrator Summary:** This story is nearly complete as-implemented. The homepage already displays all matchups (no limit/slice), uses a dynamic "Week N Matchups" section header via PageSection, and integrates ScorePoller. The only remaining gap is that the story explicitly requires removing a "View all matchups" link, which does not currently exist (already satisfied). The primary verification task is confirming all 6 matchups render for a 12-team league and that no regressions exist. This is a low-effort validation story, not a build story.

---

## 1. Applicable Requirements

| ID | Requirement | Source |
|---|---|---|
| FR3 | The homepage shall display all current week matchups (all 6 for a 12-team league), not just the top 5 | epics.md |
| UX-DR3 | Homepage "Week N Matchups" section header shall dynamically display the current week number | epics.md |
| NFR1 | All franchise color usage shall be decorative only; never the sole way to identify a team | epics.md |
| NFR3 | All visual changes shall maintain WCAG 2.1 AA contrast ratios | epics.md |
| NFR6 | No new third-party libraries or dependencies shall be introduced | epics.md |

## 2. Current State Analysis

### What already exists (verified from source)

1. **All matchups are already rendered.** The `getCurrentWeekMatchups()` query in `lib/queries/matchups.ts` (line 187-225) calls `getMatchupsByWeek()` which has no `.limit()` or `.slice()` on the matchup result set. It returns all paired matchups for the current week. The homepage at `app/page.tsx` (line 214) iterates `matchupData.matchups.map(...)` with no truncation.

2. **No "View all matchups" link exists.** The homepage matchups section (lines 206-242 of `app/page.tsx`) does not contain any "View all matchups" link or equivalent. The `SectionHeader` component (which supports `viewAllHref`) is not used on the homepage; instead, `PageSection` is used, which has no link prop.

3. **Dynamic "Week N Matchups" header exists.** The PageSection at line 211 already renders `title={\`Week ${matchupData.week} Matchups\`}` with the label set to `{matchupData.seasonYear} Season`. This satisfies UX-DR3.

4. **ScorePoller integration is present.** `ScorePoller` is rendered at line 239 inside the matchups PageSection with `initialIsGameWindow={hasLiveMatchups}`. It is the only `"use client"` component on the page, per architecture rules.

5. **Empty state handling exists.** When `matchupData` is null or matchups array is empty (line 207 conditional), the matchups section is not rendered. A global fallback EmptyState is at line 390-396.

### Components involved

| Component | Path | Role |
|---|---|---|
| HomePage (server) | `app/page.tsx` | Renders all homepage sections including matchups |
| PageSection | `components/page-section.tsx` | Section wrapper with label + title (used for matchups header) |
| MatchupRow | `components/matchup-row.tsx` | Individual matchup card with team colors, scores, status |
| ScorePoller | `app/matchups/score-poller.tsx` | Client-side live score poller ("use client") |
| getCurrentWeekMatchups | `lib/queries/matchups.ts` | Query returning all matchups for current week |
| getMatchupsByWeek | `lib/queries/matchups.ts` | Core query; pairs raw rows into PairedMatchup objects |
| pairMatchupRows | `lib/queries/matchups.ts` | Helper that groups rows by matchupId and pairs them |

## 3. Acceptance Criteria Verification Map

### AC1: All 6 matchups displayed

> **Given** the homepage at `/` during the regular season
> **When** the page loads with matchup data available
> **Then** all 6 matchups for the current week are displayed (12-team league = 6 matchups)

**Status: Already satisfied in code.**
- `getCurrentWeekMatchups()` returns all matchups; no limit applied.
- `page.tsx` maps over the full array with no `.slice()`.
- **Verification needed:** E2E test confirming exactly 6 MatchupRow components render when 12 matchup rows (6 pairs) exist in the database for the current week.

### AC2: "View all matchups" link removed

> **And** the "View all matchups" link is removed (all are already shown)

**Status: Already satisfied.**
- No such link exists in the current `app/page.tsx`.
- The `PageSection` component has no link prop (unlike `SectionHeader` which has `viewAllHref`).
- **Verification needed:** E2E test confirming no "View all" link appears in the matchups section.

### AC3: Dynamic section header with week number

> **And** a dynamic section header shows "Week N Matchups" with the current week number

**Status: Already satisfied.**
- `PageSection` title is `Week ${matchupData.week} Matchups` (line 211).
- Label shows `${matchupData.seasonYear} Season`.
- **Verification needed:** E2E test confirming the rendered heading text matches "Week {N} Matchups" where N is the current week from the database.

### AC4: ScorePoller integration maintained

> **And** ScorePoller integration is maintained for live game windows

**Status: Already satisfied.**
- `ScorePoller` rendered at line 239 with `initialIsGameWindow={hasLiveMatchups}`.
- `hasLiveMatchups` derived from `matchupData.matchups.some(m => m.status === "in_progress")` (line 59-60).
- ScorePoller uses `"use client"` directive (the only client component per architecture rules).
- **Verification needed:** Confirm ScorePoller renders within the matchups section. Confirm that when `hasLiveMatchups` is true, polling activates.

### AC5: Empty state when no matchup data

> **Given** no matchup data is available
> **When** the page loads
> **Then** the matchups section is not rendered or shows an appropriate empty state

**Status: Already satisfied.**
- Line 207: `matchupData && matchupData.matchups.length > 0` gates the entire matchups section.
- Lines 390-396: Global EmptyState fallback when both matchups and standings are absent.
- **Verification needed:** E2E test confirming the matchups section is absent when no matchup data exists.

## 4. Implementation Delta

**No code changes are required.** All five acceptance criteria are already met by the current implementation.

The implementation task reduces to:

1. **Write E2E tests** (`e2e/` directory) that verify each acceptance criterion against the real running stack with seeded test data.
2. **Run linting and type checking** to confirm no regressions.
3. **Run the E2E tests** against the dev server with a real Postgres database.

## 5. E2E Test Specifications

All tests must follow project testing rules: real HTTP requests, real database, no mocks.

### Test 1: All 6 matchups render (FR3)
- **Setup:** Seed database with 1 season, 12 franchises, 12 matchup rows for week 1 (forming 6 pairs by matchupId).
- **Action:** Navigate to `/`.
- **Assert:** Exactly 6 elements with `role="group"` (MatchupRow's role attribute) are visible within the matchups section.
- **Assert:** Each matchup displays two franchise names and scores (or "vs" for preview).

### Test 2: No "View all matchups" link (FR3)
- **Setup:** Same seed as Test 1.
- **Action:** Navigate to `/`.
- **Assert:** No link with text matching "View all" or "view all matchups" exists within the page.

### Test 3: Dynamic week number in header (UX-DR3)
- **Setup:** Seed matchup data for week 7.
- **Action:** Navigate to `/`.
- **Assert:** An h2 element contains the text "Week 7 Matchups".
- **Assert:** The section label contains the season year.

### Test 4: ScorePoller present (FR3, architecture)
- **Setup:** Seed matchup data with at least one matchup having status "in_progress".
- **Action:** Navigate to `/`.
- **Assert:** The ScorePoller component's `aria-live="polite"` container eventually appears (ScorePoller renders when `isGameWindow` is true and scores are fetched).
- **Note:** This test requires the `/api/live-scores` endpoint to return data. If the endpoint is not seeded, test that the ScorePoller component is at least mounted (its DOM container exists in the matchups section).

### Test 5: Empty state when no matchups (FR3)
- **Setup:** Empty database (no seasons, no matchups).
- **Action:** Navigate to `/`.
- **Assert:** No h2 element with text "Matchups" is visible.
- **Assert:** The EmptyState component is visible with its "Syncing League Data" title.

## 6. Conflicts and Risks

**No conflicts identified.**

- The story text mentions "Remove 'View all matchups' link" but this link does not exist in the current code. This is a no-op, not a conflict; the requirement is pre-satisfied.
- The story references the SectionHeader component conceptually, but the homepage uses `PageSection` instead. PageSection already provides the dynamic title. No component swap is needed.
- ScorePoller uses `"use client"` as mandated by architecture. No changes needed.

## 7. Out of Scope

- MatchupRow styling changes (covered by Story 4.1 in Epic 4).
- Live score polling behavior changes (ScorePoller already works as designed).
- Matchup detail page links (separate feature; matchups page already exists at `/matchups`).
- Any changes to the matchup query logic or database schema.

## 8. Dependencies

- **Story 3.1 (League Identity Hero):** Already complete. Hero section renders above matchups.
- **Story 3.2 (Superlative Stats Row):** Already complete. Stats row renders above matchups.
- **Database seeded with matchup data:** Required for E2E tests. The sync pipeline must have run at least once, or test data must be seeded.

## 9. Files to Touch

| File | Action | Reason |
|---|---|---|
| `e2e/story-3.3-matchups.spec.ts` | **Create** | E2E tests for all 5 acceptance criteria |

No existing files need modification.
