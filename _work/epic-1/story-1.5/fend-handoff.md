---
## Orchestrator Summary
- **Agent**: FEND
- **Story**: 1.5 — Empty State & Error Components
- **Status**: COMPLETE
- **State transition**: judge-g1-approved -> fend-complete
- **Key findings**: All three target files updated per UXA spec. E2E tests pass (10/10 on Chromium). One architectural issue encountered and resolved: `buttonVariants` was in a `"use client"` module, preventing use from server component `not-found.tsx`. Extracted to a shared non-client module.
---

# FEND Handoff: Story 1.5 — Empty State & Error Components

## Files Modified

### `app/not-found.tsx`
- Title updated from "Page not found" to "This page doesn't exist."
- Body copy updated from generic text to "Maybe it was traded away."
- Replaced single inline-styled link with two properly styled links using `buttonVariants`:
  - "Go to Hub" (default variant, links to `/`)
  - "Browse Teams" (outline variant, links to `/teams`)
- Button group wraps in `flex flex-col sm:flex-row gap-3` for responsive stacking.
- Imports `buttonVariants` from `@/components/ui/button-variants` (server-safe module).
- No `"use client"` directive (pure server component).

### `app/error.tsx`
- Primary description rewritten to: "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."
- Added assurance line: "We're showing the last available data." with `text-caption text-muted-foreground` styling.
- Removed "If the problem persists" paragraph (no spec basis).
- Added "Go home" outline link to `/` alongside existing "Try again" button.
- Both actions wrapped in responsive `flex flex-col sm:flex-row gap-3` container.
- No em-dashes in any copy.

### `components/empty-state.tsx`
- Added code comment above `iconMap` documenting all 6 canonical keys and their page-variant mappings.
- All 6 keys verified present: `calendar`, `users`, `search`, `alert`, `trophy`, `chart`.
- No structural changes needed; component already meets spec.

### `components/ui/button-variants.ts` (NEW)
- Extracted `buttonVariants` CVA definition into a server-safe module (no `"use client"`).
- This resolves the issue where `not-found.tsx` (a server component) could not call `buttonVariants()` when it was exported from the client-only `button.tsx`.

### `components/ui/button.tsx`
- Updated to import `buttonVariants` from `./button-variants` instead of defining it inline.
- Still re-exports `buttonVariants` for backward compatibility with existing consumers.
- No behavioral change.

### `components/site-nav.tsx`
- Removed stale `@ts-expect-error` comment that was causing a build-time type error (pre-existing issue, not story-related).

## Files Created

### `app/test/error-trigger/page.tsx`
- Test fixture that throws unconditionally to trigger the `error.tsx` boundary.
- Uses `export const dynamic = "force-dynamic"` to prevent build-time prerendering.
- Not linked from any production navigation.

### `e2e/empty-state-error.spec.ts`
- 10 E2E tests covering the QA test plan:
  - FE-T06: 404 page renders correct title, returns 404 status
  - FE-T07: 404 page shows snarky body copy, no em-dashes
  - FE-T08: "Go to Hub" link visible with correct href, navigates to /
  - FE-T09: "Browse Teams" link visible with correct href, navigates to /teams
  - EDGE-T01: Deeply nested non-existent route shows 404 page
  - FE-T11: Error boundary shows correct title, no prohibited phrases
  - FE-T12: Error boundary shows primary description without em-dashes
  - FE-T13: Error boundary shows "last available data" assurance line
  - FE-T14: "Try again" button visible and re-renders error page on click
  - FE-T15: "Go home" link visible with correct href, navigates to /

## Patterns Used

- **buttonVariants extraction**: Separated CVA variant definitions from the `"use client"` Button component so server components can apply button styling to `<Link>` elements. This is a standard pattern for Next.js App Router projects where Link elements need button styling without client-side JS.
- **Server component links**: Used `buttonVariants()` directly on `<Link>` className rather than `Button asChild` (which is not supported by Base UI's Button primitive).
- **Dynamic test fixture**: Used `export const dynamic = "force-dynamic"` to prevent the intentionally-throwing test page from breaking the production build.

## UXA Extrapolations Applied

- **Gap-3 button spacing**: Used `gap-3` (12px) per UXA spec, acknowledging it is slightly off the 8px grid but consistent with shadcn/ui conventions.
- **Metadata export**: Not added for `not-found.tsx` (flagged as optional, not blocking by UXA).

## Test Results

```
Running 10 tests using 10 workers
  10 passed (19.3s)
```

All tests executed against the full production build (`npm run build && npm run start`) with real Chromium browser. No mocks, no stubs.

## Dependencies on BEND

None. This story is purely UI with no database or API interaction.

## Source Inspection Items (for QA Phase B)

- FE-T05: Verify `iconMap` contains all 6 keys via source inspection of `components/empty-state.tsx`.
- FE-T10: Verify `not-found.tsx` uses `buttonVariants` import (not inline ad-hoc classes) and has no `"use client"`.
- FE-T16: Verify `error.tsx` has `"use client"`, `not-found.tsx` does not, `empty-state.tsx` does not.
- EDGE-T04: Verify no prohibited strings in any of the three files.
