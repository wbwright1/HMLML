---
## Orchestrator Summary
- **Agent**: FEND
- **Story**: 3.2
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> fend-complete
- **Flags for orchestrator**: None
---

# Story 3.2: Superlative Stats Row -- FEND Handoff

## What Was Done

### Code Change: `tabular-nums` on StatHero value element

**File:** `components/stat-hero.tsx` (line 32)

The `StatHero` component's value `<p>` element was missing the `tabular-nums` class required by CLAUDE.md ("Tabular figures on all score/stat numbers"). Added `tabular-nums` to the className:

```
- <p className={`font-black ${valueSizeMap[variant]}`}>{value}</p>
+ <p className={`font-black tabular-nums ${valueSizeMap[variant]}`}>{value}</p>
```

This was the only gap identified by the REQS analysis. All other acceptance criteria (grid layout, responsive breakpoints, conditional rendering, server component, data queries) were already correctly implemented.

### Verification Summary

- **Homepage superlatives section** (`app/page.tsx`, lines 98-140): Confirmed correct. Uses `grid grid-cols-2 md:grid-cols-4` with 1-4 `StatHero` cards at `variant="md"`.
- **Data layer** (`lib/queries/homepage.ts`): `getHomepageSuperlatives()` returns all four stats from DB queries. No changes needed.
- **Graceful absence**: `hasAnySuperlative` guard on line 62-71 prevents rendering when no data exists. Confirmed correct.

## E2E Tests

**File:** `e2e/story-3.2-superlatives.spec.ts`

9 tests, all passing against the real running app (no mocks):

| Test | What It Verifies |
|---|---|
| T01 | Superlatives section renders with grid layout (or gracefully absent) |
| T02 | Stat cards use `<figure role="group">` pattern |
| T03 | Stat values have `font-variant-numeric: tabular-nums` computed style |
| T04 | Each stat card includes a text badge label (no color-only info) |
| T05 | Mobile (375px) shows 2-column grid |
| T06 | Desktop (1280px) shows 4-column grid |
| T07 | Stat values use md variant font size (36-40px range) |
| T08 | Stat values use Black font weight (900) |
| T09 | No em-dashes in superlative text content |

All tests conditionally skip if no superlative data is in the DB, per AC-2 (graceful absence).

## Pre-Completion Checklist

- [x] TypeScript type check passes (`npx tsc --noEmit`)
- [x] E2E tests pass (`npx playwright test --project=chromium e2e/story-3.2-superlatives.spec.ts`)
- [x] No mocks in tests; all tests run against real app
- [x] Server component (no `"use client"` on homepage)
- [x] `tabular-nums` applied to all stat number elements
- [x] Responsive grid verified (2-col mobile, 4-col desktop)
- [x] Accessibility: text labels on all stat cards, no color-only information
- [x] No new dependencies added
