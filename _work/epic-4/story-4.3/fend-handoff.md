# Story 4.3: Franchise Page Hero Gradient - FEND Handoff

## Status: COMPLETE (Verification Only)

## Summary
Story 4.3 was already implemented in `app/teams/[franchiseSlug]/page.tsx` (lines 70-76). The hero section conditionally applies a `linear-gradient` using the franchise's `brandingColor` at ~6% opacity (`0F` hex alpha = 5.9%), fading to transparent at 60% of the section height. No code changes were needed.

This handoff covers the E2E verification tests written to confirm all acceptance criteria.

## Files Created
| File | Purpose |
|---|---|
| `e2e/story-4.3-hero-gradient.spec.ts` | 12 Playwright E2E tests covering all acceptance criteria |
| `e2e/helpers/seed-hero-gradient.ts` | Test data seeder: branded franchise (#2D5A3D) and unbranded franchise (null color) |

## Test Results
All 12 tests pass against Chromium (7.7s total).

### Test Coverage Matrix

| Test ID | Acceptance Criteria | What It Verifies |
|---|---|---|
| AC-1a | Gradient applied when brandingColor exists | Hero `<section>` inline style contains `linear-gradient` |
| AC-1b | Gradient direction is top-to-bottom | No non-default direction keywords (no `to top`, `to left`, degree values) |
| AC-1c | Opacity in 5-8% range | Parses rgba alpha from browser-normalized gradient; asserts 0.04-0.09 |
| AC-1d | Uses franchise brandingColor | RGB components of #2D5A3D (45, 90, 61) present in gradient rgba |
| AC-1e | Fades to transparent | Gradient string contains "transparent" |
| AC-2 | No gradient without brandingColor | Unbranded franchise hero has no inline background style |
| AC-3a | Franchise name readable | Hero text contains seeded franchise name |
| AC-3b | Back link visible | `a[href='/teams']` is visible in hero section |
| AC-3c | Stats visible | Hero contains seeded record (10-4) and points (1850.5) |
| AC-3d | Owner name visible | Hero contains seeded owner name |
| AC-4a | Decorative only (inline style) | No aria-hidden gradient overlay divs; gradient on section element |
| AC-4b | Content identifiable without gradient | Unbranded page shows all content (name, owner, record) with no gradient |

## Technical Notes
- The browser normalizes `linear-gradient(to bottom, #2D5A3D0F, transparent 60%)` to `linear-gradient(rgba(45, 90, 61, 0.06), transparent 60%)`. Tests account for this normalization by parsing rgba values instead of hex.
- "to bottom" is the default gradient direction; Chromium omits it from serialized `style.background`. The test verifies no non-default direction is present.
- Test data uses season year 1997 and franchise IDs prefixed `e2e-4-3-` to avoid collisions with real data.
- Cleanup runs in `afterAll` to remove seeded data.

## No Code Changes Required
The existing implementation at `app/teams/[franchiseSlug]/page.tsx` lines 72-75 satisfies all acceptance criteria as documented in the reqs brief.
