# Story 6.3: Responsive Edge-Case Fixes - Implementation Brief

## Orchestrator Summary
**Story:** 6.3 - Responsive Edge-Case Fixes
**Epic:** 6 - Polished Edge States & Responsive Fixes
**Status:** Requirements analysis complete
**Risk Level:** Low - all changes are CSS/layout only with no data model or API changes
**Estimated Scope:** 5 targeted fixes across existing components; no new components required
**Blockers:** None identified
**Conflicts:** None identified (see Conflict Analysis section)

---

## 1. Requirements Traceability

| AC# | Given/When/Then | UX-DR | FR/NFR | Component(s) |
|-----|-----------------|-------|--------|---------------|
| AC1 | Power rankings flex-wrap at md | UX-DR12 | NFR3 | `app/records/power-rankings/page.tsx` |
| AC2 | Superlative stats responsive grid | UX-DR2 (partial), NFR5 | NFR5 | `app/page.tsx` |
| AC3 | MobileTableView card consistency at md | UX-DR14 | NFR3 | `components/mobile-table-view.tsx` |
| AC4 | SeasonSelector overflow fade + auto-scroll | UX-DR13 | NFR4 | `components/season-selector.tsx` |
| AC5 | Bottom nav safe-area-inset-bottom | UX-DR15 | NFR3 | `components/site-nav-client.tsx`, `app/layout.tsx` |

---

## 2. AC1: Power Rankings Flex-Wrap at md Breakpoint

### Requirement
**UX-DR12:** Power rankings layout shall use flex-wrap at md breakpoint to prevent overflow on tablets.

### Current State
File: `app/records/power-rankings/page.tsx` (line 59)
The ranking card inner container already uses `flex flex-wrap items-center gap-4`. The flex-wrap is applied at all breakpoints, not conditionally at md.

### Analysis
The current implementation already applies `flex-wrap` unconditionally (line 59: `className="flex flex-wrap items-center gap-4"`). This means the AC is technically satisfied in the current code. However, the story calls this out as a fix, so the implementer must:

1. **Verify at 768px** that the rank number, franchise identity, and stats columns wrap correctly without horizontal overflow.
2. **If wrapping causes layout issues at 768px** (e.g., stats column dropping below and looking misaligned), add responsive width hints. For example, ensure the stats `div` (line 101: `className="flex flex-col items-end gap-1 text-sm shrink-0"`) has appropriate min-width or the franchise identity column (`flex-1 min-w-0`) truncates properly.
3. **If no overflow exists at 768px**, document that the AC is pre-satisfied and add a Playwright viewport test to lock in the behavior.

### Implementation Guidance
- Test at exactly 768px viewport width with the longest possible franchise name
- Confirm no horizontal scrollbar appears on the ranking cards
- If adjustment needed: consider adding `md:flex-nowrap` to allow wrapping only below md, or adjusting min-width constraints on child elements
- Constraint: must maintain the existing layout at desktop (rank left, franchise center, stats right)

### Acceptance Criteria Mapping
**Given** the power rankings page on tablet (768px)
**When** content would overflow
**Then** flex-wrap is applied at md breakpoint to prevent overflow

**Test:** Playwright E2E at 768px viewport width; assert no horizontal scrollbar on ranking cards; assert all content visible without clipping.

---

## 3. AC2: Superlative Stats Row Responsive Grid

### Requirement
**NFR5:** The superlative row shall use responsive grid: grid-cols-2 on mobile, grid-cols-4 on desktop.
**UX-DR2:** Superlative row StatHero components shall use `md` size arranged in a responsive grid.

### Current State
File: `app/page.tsx` (line 102)
The grid already uses `className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"`.

The same pattern is repeated for the "League at a Glance" section (line 176): `className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"`.

### Analysis
**This AC is already satisfied in the current code.** Both superlative grid instances use the correct responsive pattern. The implementer should:

1. Confirm via Playwright tests at 375px (2-col) and 1280px (4-col) that grids render correctly
2. Existing tests in `e2e/story-3.2-superlatives.spec.ts` (T05, T06) already cover this; verify they still pass

### Implementation Guidance
- No code changes expected; this is a verification/audit item
- If tests pass at both breakpoints, mark AC as pre-satisfied
- If any edge case found (e.g., very long franchise name causing overflow in 2-col on 375px), fix with `truncate` or `min-w-0` on the StatHero label

### Acceptance Criteria Mapping
**Given** the superlative stats row
**When** viewed on mobile vs desktop
**Then** responsive grid applies: grid-cols-2 on mobile, grid-cols-4 on desktop

**Test:** Re-run existing `e2e/story-3.2-superlatives.spec.ts` T05 and T06; add new assertions if needed.

---

## 4. AC3: MobileTableView Card Consistency at md Breakpoint

### Requirement
**UX-DR14:** Mobile table card views shall activate consistently at md breakpoint (768px) with franchise identity left, key stat right pattern.

### Current State
File: `components/mobile-table-view.tsx`
- Card view: `className="md:hidden space-y-3"` (line 17) -- cards shown below 768px
- Table view: `className="hidden md:block overflow-x-auto"` (line 42) -- table shown at 768px+
- Card layout: each row renders as label-left, value-right (`flex items-center justify-between gap-4`, lines 27-28)

The component currently switches at `md` (768px) which is correct per the breakpoint strategy.

### Analysis
The breakpoint behavior is correct. The issue flagged by UX-DR14 is about **consistency of the card layout pattern**: "franchise identity left, key stat right." The current MobileTableView renders generic label/value pairs, not specifically franchise identity. The "franchise identity left, key stat right" pattern must be verified on the pages that use MobileTableView:

1. `app/teams/[franchiseSlug]/roster/page.tsx` - roster table
2. `app/teams/[franchiseSlug]/drafts/page.tsx` - draft history table
3. `app/drafts/[seasonYear]/page.tsx` - season draft board

### Implementation Guidance
- **Audit each page using MobileTableView** to verify the card layout places the most identifying column (franchise name, player name) as the first visible item and key stat (points, pick number) on the right
- The `keyColumns` prop controls which columns appear in card view; verify each consumer passes appropriate keyColumns that put identity first, stat second
- If any consumer does not follow the "identity left, key stat right" pattern, adjust the `keyColumns` array or the order of columns in the `headers`/`rows` arrays passed to MobileTableView
- The MobileTableView component itself may need a layout adjustment: currently all columns render as stacked label/value pairs. To achieve "franchise identity left, key stat right," the first keyColumn should be rendered as a prominent left element and the remaining as right-aligned stats. This may require a minor structural change to the card template:
  - Option A: Add a `primaryColumn` prop that renders the first column differently (larger text, no label)
  - Option B: Keep current stacked layout but ensure consumers order columns correctly
- **Recommended:** Option B (minimal change), unless review reveals the stacked layout is insufficient
- Verify at exactly 768px that the transition between card and table is clean (no flash of both layouts)

### Acceptance Criteria Mapping
**Given** the MobileTableView component
**When** viewed at md breakpoint (768px)
**Then** card views activate consistently with franchise identity left, key stat right

**Test:** Playwright E2E at 767px and 768px on a page using MobileTableView (e.g., `/teams/{slug}/roster`); at 767px cards visible with identity/stat layout; at 768px table visible.

---

## 5. AC4: SeasonSelector Overflow Fade Indicators + Auto-Scroll

### Requirement
**UX-DR13:** SeasonSelector shall have fade/gradient indicators on edges when content overflows, and auto-scroll active season into view.

### Current State
File: `components/season-selector.tsx`
- **Fade indicators already implemented** (lines 92-97): conditional left/right gradient divs based on `canScrollLeft`/`canScrollRight` state
- **Auto-scroll already implemented** (lines 69-79): `useEffect` scrolls the `aria-selected="true"` tab into view with `scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })`
- **Scroll state tracking already implemented** (lines 22-40): `updateScrollState` callback with scroll listener and ResizeObserver

### Analysis
**This AC appears to be fully satisfied in the current code.** Both sub-requirements (fade indicators and auto-scroll) are implemented. The implementer should:

1. **Verify the fade gradients are visible** when there are enough seasons to cause overflow. Test with 8+ seasons.
2. **Verify auto-scroll works** when navigating to a page where the active season is off-screen (e.g., selecting an early season when many exist)
3. **Verify the gradient `from-background` color matches the actual page background** (should resolve to `--canvas` / `#FAF8F5` per design tokens, not pure white)
4. **Check that `prefers-reduced-motion` is respected** (NFR4) for the auto-scroll behavior. Currently `behavior: "smooth"` is hardcoded; consider using `behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"` for motion-sensitive users
5. Verify the `px-6` padding on the scrollable container (line 102) does not interfere with the fade overlays

### Implementation Guidance
- Primary task: write Playwright tests confirming fade indicators and auto-scroll behavior
- If `prefers-reduced-motion` is not respected, update the `scrollIntoView` call to conditionally use `behavior: "auto"`
- If the gradient color does not match the parent background (e.g., component is used inside a tinted section), consider making the gradient color configurable via a prop or CSS variable
- No structural changes expected

### Acceptance Criteria Mapping
**Given** the SeasonSelector component
**When** content overflows horizontally
**Then** fade/gradient indicators appear on edges
**And** the active season auto-scrolls into view

**Test:** Playwright E2E with a page using SeasonSelector (e.g., `/seasons` or `/records`); seed enough seasons to cause overflow; verify gradient elements appear; change active season and verify scroll position updates.

---

## 6. AC5: Bottom Navigation Safe-Area-Inset-Bottom

### Requirement
**UX-DR15:** Bottom tab bar shall use `pb-[env(safe-area-inset-bottom)]` for notched device support.

### Current State
- There is **no bottom tab bar** in the current implementation. Navigation uses a sticky top header (`components/site-nav.tsx`) with a mobile hamburger overlay (`components/site-nav-client.tsx`).
- The mobile nav overlay is positioned `fixed top-14 inset-x-0` (line 193 of site-nav-client.tsx), anchored to the top, not the bottom.
- The root layout (`app/layout.tsx`) does not include `viewport-fit=cover` meta, which is a prerequisite for `env(safe-area-inset-bottom)` to work.
- The `<html>` tag does not have the `viewport-fit=cover` viewport configuration.

### Analysis
The story says "if present" for the bottom navigation. Since no bottom tab bar exists, this AC has a conditional applicability. However, UX-DR15 still applies to any element that could be obscured by a device notch/home indicator. The relevant elements to consider:

1. **SiteFooter** (`components/site-footer.tsx`) -- bottom of every page, could be obscured
2. **Mobile nav overlay** -- drops from top, not affected by bottom inset
3. **Page content bottom padding** -- the last section on any page could be obscured by the home indicator

### Implementation Guidance
- **Add viewport-fit=cover** to the viewport metadata in `app/layout.tsx`. In Next.js App Router, export a `viewport` object:
  ```
  export const viewport = { ... viewportFit: "cover" }
  ```
  This is a prerequisite for `env(safe-area-inset-bottom)` to have any effect.
- **Add safe area padding** to the `<body>` or the main content wrapper in `app/layout.tsx`:
  - Add `pb-[env(safe-area-inset-bottom)]` to the body element
  - Alternatively, add it to the SiteFooter component
- **If a bottom tab bar is added later**, it must include `pb-[env(safe-area-inset-bottom)]`
- Since there is no bottom tab bar currently, the implementer should apply the safe area inset to the **SiteFooter** and/or the **body** to prevent content from being obscured on notched devices
- The `env()` function returns `0px` on devices without a notch, so this is safe to add unconditionally

### Acceptance Criteria Mapping
**Given** the mobile bottom navigation (if present)
**When** viewed on notched devices
**Then** `pb-[env(safe-area-inset-bottom)]` is applied for safe area support

**Test:** Verify `viewport-fit=cover` is present in the rendered HTML head. Verify the footer or body has `pb-[env(safe-area-inset-bottom)]` in its class list. Playwright can check computed styles but cannot simulate a notch; the test verifies the CSS is applied.

---

## 7. Conflict Analysis

### No Conflicts Found

- **AC2 vs existing code:** The superlative grid already matches the requirement. No conflict; just verification.
- **AC4 vs existing code:** The SeasonSelector already has fade indicators and auto-scroll. No conflict; just verification and potential `prefers-reduced-motion` enhancement.
- **AC1 vs existing code:** The power rankings already use `flex-wrap`. No conflict if it works correctly at 768px.
- **AC5 vs architecture:** Adding `viewport-fit=cover` to the viewport metadata is a safe, additive change. It does not conflict with any existing layout. The `env()` function gracefully degrades to 0px.
- **NFR4 (prefers-reduced-motion):** The SeasonSelector auto-scroll uses `behavior: "smooth"` which does NOT respect reduced motion preferences. This is a minor gap to address.

### Assumptions
- "Bottom navigation" in AC5 refers to any bottom-positioned UI. Since no bottom tab bar exists, the fix is applied to the footer/body.
- MobileTableView consumers are expected to pass correctly ordered columns; no structural redesign of MobileTableView is needed.

---

## 8. Files to Modify

| File | Change Type | AC |
|------|------------|-----|
| `app/records/power-rankings/page.tsx` | Verify/adjust flex-wrap at 768px | AC1 |
| `app/page.tsx` | Verify only (grid already correct) | AC2 |
| `components/mobile-table-view.tsx` | Audit card layout pattern; possible minor adjustment | AC3 |
| `app/teams/[franchiseSlug]/roster/page.tsx` | Verify keyColumns ordering | AC3 |
| `app/teams/[franchiseSlug]/drafts/page.tsx` | Verify keyColumns ordering | AC3 |
| `app/drafts/[seasonYear]/page.tsx` | Verify keyColumns ordering | AC3 |
| `components/season-selector.tsx` | Add prefers-reduced-motion check to auto-scroll | AC4 |
| `app/layout.tsx` | Add `viewport` export with `viewportFit: "cover"` | AC5 |
| `components/site-footer.tsx` (or body in layout) | Add `pb-[env(safe-area-inset-bottom)]` | AC5 |

---

## 9. Testing Requirements

All tests must be E2E via Playwright against the running dev server (no mocks per project rules).

| Test ID | Description | Viewport | AC |
|---------|------------|----------|-----|
| T01 | Power rankings cards have no horizontal overflow at 768px | 768x1024 | AC1 |
| T02 | Power rankings content is fully visible (no clipping) at 768px | 768x1024 | AC1 |
| T03 | Superlative grid renders 2 columns at 375px | 375x812 | AC2 |
| T04 | Superlative grid renders 4 columns at 1280px | 1280x800 | AC2 |
| T05 | MobileTableView shows cards at 767px, table at 768px | 767/768 | AC3 |
| T06 | MobileTableView card has label left, value right pattern | 375x812 | AC3 |
| T07 | SeasonSelector fade indicators visible when content overflows | 375x812 | AC4 |
| T08 | SeasonSelector active season is scrolled into view | 375x812 | AC4 |
| T09 | Viewport meta includes viewport-fit=cover | any | AC5 |
| T10 | Footer/body includes safe-area-inset-bottom padding class | 375x812 | AC5 |

---

## 10. Out of Scope

- Full responsive overhaul (per story notes: "targeted fixes, not a full responsive overhaul")
- New component creation
- Data model or API changes
- Changes to desktop layouts (fixes target mobile and tablet edge cases only)
- Adding a bottom tab bar (the story says "if present"; it is not present)
