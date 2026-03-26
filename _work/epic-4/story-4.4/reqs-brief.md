# Story 4.4: Standings Table Color Borders — Requirements Brief

## Orchestrator Summary
**Story:** 4.4 — Standings Table Color Borders
**Epic:** 4 — Franchise Identity & Color
**Status:** Requirements analysis complete
**Key finding:** The homepage standings and season detail standings already implement the left border pattern correctly. The primary remaining work is applying the same pattern to the Records leaderboard table and Power Rankings cards. One conflict identified regarding the MobileTableView generic component (not currently used by any standings view, so no action needed).

---

## 1. Acceptance Criteria Breakdown

### AC-1: Left border on all standings rows
> **Given** any standings table (homepage and dedicated standings page)
> **When** franchise rows are displayed
> **Then** each row has a 2-3px left border in the franchise's brandingColor
> **And** the border is applied via inline style (dynamic per franchise)

**Requirements:** FR9

#### Current State Analysis

| Location | Desktop | Mobile | Status |
|---|---|---|---|
| Homepage standings (`app/page.tsx`, lines 271-316, 320-375) | `style={{ borderLeft: \`3px solid ${entry.franchiseBrandingColor ?? "var(--border)"}\` }}` on `<tr>` | `style={{ borderLeftWidth: "3px", borderLeftColor: entry.franchiseBrandingColor ?? "var(--border)" }}` on card `<div>` | DONE |
| Season detail standings (`app/seasons/[seasonYear]/page.tsx`, lines 149-232, 236-308) | Same `borderLeft` inline style on `<tr>` | Same `borderLeftWidth`/`borderLeftColor` on card `<div>` | DONE |
| Records leaderboard (`app/records/leaderboard-table.tsx`, lines 141-205 desktop, 211-269 mobile) | No left border on `<tr>` | No left border on card `<Link>` | NOT DONE |
| Power Rankings (`app/records/power-rankings/page.tsx`, lines 53-145) | N/A (card layout only) | No left border on card `<Link>` | NOT DONE |

#### Implementation Tasks

**Task 1: Records Leaderboard Desktop Table Rows**
- File: `F:\Fantasy Website\FantasyWebsite\app\records\leaderboard-table.tsx`
- Target: The `<tr>` element at line 144 (inside the desktop `<tbody>`)
- Current classes: `"border-b border-border/50 last:border-0"`
- Add: `style={{ borderLeft: \`3px solid ${entry.brandingColor ?? "var(--border)"}\` }}`
- Data: `entry.brandingColor` is already available on the `LeaderboardEntry` type (confirmed in `lib/queries/records.ts`)

**Task 2: Records Leaderboard Mobile Cards**
- File: `F:\Fantasy Website\FantasyWebsite\app\records\leaderboard-table.tsx`
- Target: The `<Link>` element at line 215 (inside the mobile card view)
- Current classes: `"block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"`
- Add: `style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}`

**Task 3: Power Rankings Cards**
- File: `F:\Fantasy Website\FantasyWebsite\app\records\power-rankings\page.tsx`
- Target: The `<Link>` element at line 55 (each ranking card)
- Current classes: `"block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"`
- Add: `style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}`
- Data: `entry.brandingColor` is already available on the `PowerRankingEntry` type

**Note on "standings" scope:** The story says "any standings table (homepage and dedicated standings page)." The Records leaderboard is titled "All-Time Standings" in the UI (`<PageSection label="Leaderboard" title="All-Time Standings">`). Power Rankings is a standings-adjacent view. Both should be included per the spirit of FR9 ("Standings tables (homepage and dedicated) shall display a 2-3px left border"). If the team wants a narrower scope, Power Rankings could be deferred; but the leaderboard is explicitly labeled "All-Time Standings" in the UI and must be included.

### AC-2: Fallback when no brandingColor
> **Given** a franchise has no brandingColor
> **When** the standings render
> **Then** the left border falls back to `var(--border)`

**Requirements:** FR9

- The homepage and season detail pages already implement this fallback via the `?? "var(--border)"` pattern.
- Tasks 1-3 above all specify the same fallback pattern.
- The fallback uses the CSS variable `var(--border)` (hex `#E8E4E0` per CLAUDE.md design tokens), which ensures the border is still visible but blends with the card/row border style.

### AC-3: Color is decorative only
> **Given** the color borders
> **Then** they are purely decorative (NFR1)
> **And** franchise identity is conveyed by name and record, not color alone

**Requirements:** NFR1

- All affected views already display franchise name (text), win/loss record (text), and rank position (number) as primary identifiers.
- The left border color conveys zero semantic information; removing it would not cause any loss of meaning.
- No ARIA role or label should be attached to the border.
- Verification: confirm that no `aria-label`, `title`, or `alt` attribute references the border color.

---

## 2. Data Availability

All data is already available in existing queries. No new queries or schema changes are needed.

| View | Query | Field | Type |
|---|---|---|---|
| Homepage standings | `getSeasonStandings()` | `franchiseBrandingColor` | `string \| null` |
| Season detail standings | `getSeasonStandings()` | `franchiseBrandingColor` | `string \| null` |
| Records leaderboard | `getLeaderboard()` | `brandingColor` | `string \| undefined` |
| Power Rankings | `getPowerRankings()` | `brandingColor` | `string \| undefined` |

Note the type difference: `getSeasonStandings` returns `null` for missing colors; `getLeaderboard`/`getPowerRankings` return `undefined`. The fallback expression `entry.brandingColor ?? "var(--border)"` handles both correctly since `??` catches both `null` and `undefined`.

---

## 3. Component Architecture

**No new components are needed.** This is a styling-only change applied via inline `style` attributes on existing elements.

**MobileTableView component** (`components/mobile-table-view.tsx`): This generic component is NOT used by any of the standings views. All standings views use custom-built table/card layouts. No changes to MobileTableView are required.

**LeaderboardTable is a client component** (`"use client"`). The inline style approach works identically in client components. No architecture concerns.

---

## 4. Conflicts and Risks

### Conflict: None identified
- The pattern (3px left border via inline style with CSS variable fallback) is identical to what Stories 4.1 and 4.2 use. Consistency is maintained.

### Risk: Leaderboard sorting reorder
- The LeaderboardTable supports client-side sorting and season filtering. The `brandingColor` travels with each `LeaderboardEntry` object, so re-sorting does not break the color association. No risk.

### Risk: Border stacking on mobile cards
- Mobile card views already have `border border-border` (1px all sides). Adding `borderLeftWidth: "3px"` overrides the left border specifically. The existing homepage and season detail mobile cards already do this successfully. Pattern is proven.

---

## 5. Acceptance Testing Criteria

Per project rules: no mocks, real running code only.

**Test 1 (E2E, Playwright):** Navigate to the homepage. Verify that each standings row/card has a visible left border. For at least one franchise with a known brandingColor, assert the `border-left-color` computed style matches the expected hex value.

**Test 2 (E2E, Playwright):** Navigate to a season detail page (e.g., `/seasons/2024`). Verify same left-border behavior on standings rows/cards.

**Test 3 (E2E, Playwright):** Navigate to `/records`. Verify the leaderboard table rows (desktop) and cards (mobile viewport) have left borders matching franchise brandingColor.

**Test 4 (E2E, Playwright):** Navigate to `/records/power-rankings`. Verify ranking cards have left borders matching franchise brandingColor.

**Test 5 (Accessibility):** Verify no ARIA attributes reference border colors. Verify franchise name and record text are present in every row/card regardless of border color presence.

**Test 6 (Fallback):** If a test franchise has no brandingColor, verify the left border falls back to the `--border` CSS variable value.

---

## 6. Files to Modify

| File | Change |
|---|---|
| `app/records/leaderboard-table.tsx` | Add inline `borderLeft` style to desktop `<tr>` and mobile `<Link>` elements |
| `app/records/power-rankings/page.tsx` | Add inline `borderLeft` style to ranking card `<Link>` elements |

**Files already complete (no changes needed):**
- `app/page.tsx` (homepage standings)
- `app/seasons/[seasonYear]/page.tsx` (season detail standings)

---

## 7. Definition of Done

1. Every standings/leaderboard view displays a 3px left border in franchise brandingColor
2. Missing brandingColor falls back to `var(--border)`
3. Color borders are purely decorative; franchise identity conveyed by name and record
4. Inline styles used for dynamic per-franchise colors (not Tailwind classes, since values are DB-driven)
5. All E2E tests pass against real running stack
6. No new dependencies introduced (NFR6)
7. React Server Component default maintained; LeaderboardTable remains the only `"use client"` component affected
8. Linting and type checking pass
