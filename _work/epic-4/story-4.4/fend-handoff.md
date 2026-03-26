# Story 4.4: Standings Table Color Borders — FEND Handoff

## Status: Complete

## Changes Made

### 1. Records Leaderboard Table (`app/records/leaderboard-table.tsx`)
- **Desktop table rows (`<tr>`):** Added `style={{ borderLeft: \`3px solid ${entry.brandingColor ?? "var(--border)"}\` }}` to each data row in the desktop `<tbody>`.
- **Mobile card view (`<Link>`):** Added `style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}` to each mobile card link.

### 2. Power Rankings Cards (`app/records/power-rankings/page.tsx`)
- **Ranking cards (`<Link>`):** Added `style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}` to each ranking card link.

### 3. No data or query changes needed
- `brandingColor` was already available on both `LeaderboardEntry` and `PowerRankingEntry` types from existing queries.

## Acceptance Criteria Coverage

| AC | Description | Status |
|---|---|---|
| AC-1 | Left border on all standings/leaderboard rows | Done |
| AC-2 | Fallback to `var(--border)` when no brandingColor | Done |
| AC-3 | Color is decorative only; identity conveyed by name/record | Done |

## E2E Tests

File: `e2e/story-4.4-standings-borders.spec.ts` (8 tests, all passing)

1. Leaderboard desktop rows have 3px left border (computed style)
2. Leaderboard desktop rows use inline `borderLeft` style
3. Leaderboard mobile cards have 3px left border (computed style)
4. Leaderboard mobile cards use inline `borderLeftColor`
5. Power rankings cards have 3px left border
6. Power rankings cards use inline `borderLeftColor`
7. All leaderboard borders have either brandingColor or var(--border) fallback
8. Borders are decorative; franchise name and record text are present

## Verification

- TypeScript: `npx tsc --noEmit` passes with no errors
- E2E: `npx playwright test --project=chromium e2e/story-4.4-standings-borders.spec.ts` passes (8/8)
