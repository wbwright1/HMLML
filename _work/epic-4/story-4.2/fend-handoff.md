---
## Orchestrator Summary
- **Agent**: FEND
- **Story**: 4.2
- **Verdict**: COMPLETE (verification only)
- **State transition**: reqs-complete -> fend-complete
- **Flags for orchestrator**: No code changes were needed. The existing implementation in `app/teams/page.tsx` (line 48) satisfies all acceptance criteria. E2E tests written and passing (10/10).
---

# Story 4.2: Franchise Card Top Borders -- FEND Handoff

## What Was Done

This story required verification only. The feature was already implemented in `app/teams/page.tsx` line 48:

```
style={{ borderTopWidth: "3px", borderTopColor: franchise.brandingColor ?? "var(--border)" }}
```

No code changes were made. E2E tests were written to verify the existing implementation.

## E2E Tests

**File:** `e2e/story-4.2-franchise-borders.spec.ts`

| Test | AC | What It Verifies |
|---|---|---|
| AC-1a: Teams page renders franchise cards in a grid | AC-1 | Grid layout with responsive columns exists, cards present |
| AC-1b: every franchise card has borderTopWidth of 3px | AC-1 | Computed `borderTopWidth` is `3px` on every card |
| AC-1c: cards with brandingColor have inline borderTopColor set | AC-1 | Inline `style.borderTopColor` is set on every card (hex or var fallback) |
| AC-2: all cards have either a brandingColor or var(--border) fallback | AC-2 | No card has an empty/missing borderTopColor |
| AC-2b: fallback cards resolve to the --border CSS variable color | AC-2 | Cards with `var(--border)` resolve to a real rgb() computed value |
| AC-3a: each card displays the franchise name as text | AC-3 | Non-empty text content on every card |
| AC-3b: each card displays win/loss record as text identifiers | AC-3 | "W" and "L" labels present on every card |
| AC-3c: each card displays points scored | AC-3 | "pts" label present on every card |
| AC-3d: border color is CSS (decorative), not conveyed via ARIA | AC-3 | No separate aria-hidden border div elements; CSS border is inherently decorative |
| inline style sets borderTopWidth to 3px on every card | BR-3 | Inline `style.borderTopWidth` is exactly "3px" |

## Test Results

```
10 passed (13.8s)
```

All tests run against the real running app with real database data (12 franchise cards). No mocks.

## Acceptance Criteria Coverage

- **AC-1 (brandingColor set):** Verified via inline style checks and computed border width.
- **AC-2 (no brandingColor fallback):** Verified via `var(--border)` inline style detection and CSS variable resolution.
- **AC-3 (decorative only):** Verified by asserting team name text, W/L record, points scored, and absence of separate ARIA-hidden border elements.
- **BR-1 (inline style mandatory):** Verified by checking `el.style.borderTopColor` directly.
- **BR-3 (exactly 3px):** Verified via both inline style and computed style.
- **BR-4 (applied to Link card):** All assertions target `a[href^='/teams/']` elements (the Link cards).
