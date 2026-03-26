---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 4.1
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: The current MatchupRow component already implements the color accent bars. DEV should verify existing implementation satisfies all criteria below; if it does, the story may only require acceptance testing (no new code).
---

# Story 4.1: MatchupRow Team Color Accents — Implementation Brief

## Story Reference

- **Epic:** 4 (Franchise Color Accents)
- **Story:** 4.1
- **FRs:** FR6
- **UX-DRs:** UX-DR4
- **NFRs:** NFR1
- **Source file:** `_work/epic-4/story-4.1/story.md`
- **Epics doc:** `_bmad-output/planning-artifacts/epics.md` (lines 21, 43, 65, 87, 190-192)

## Restated Acceptance Criteria

### AC-1: Both teams have brandingColor (FR6, UX-DR4)

**Given** the MatchupRow component renders a matchup between two teams
**When** both teams have a `brandingColor` set (non-null hex string from the `franchises` table)
**Then:**
- A 3px-wide vertical bar in the home/left team's `brandingColor` appears flush against the left edge of the row.
- A 3px-wide vertical bar in the away/right team's `brandingColor` appears flush against the right edge of the row.
- Both bars span the full height of the row.
- Both bars use inline `style={{ backgroundColor: <brandingColor> }}` because `brandingColor` is a dynamic per-franchise DB value that cannot be predefined as a CSS variable (epics doc, line 58).

### AC-2: Missing brandingColor fallback (FR6)

**Given** a team has no `brandingColor` (null or undefined)
**When** the MatchupRow renders
**Then** that team's accent bar uses `var(--border)` as its background color (via the nullish coalescing fallback in the inline style).

### AC-3: Decorative only, no information by color alone (NFR1)

**Given** the color accent bars are rendered
**Then:**
- The bars are marked `aria-hidden="true"` so screen readers ignore them.
- Team names and scores remain the primary identifiers for each side of the matchup.
- No information is conveyed by color alone; the bars are purely decorative.
- This satisfies the project's accessibility mandate: "No information conveyed by color alone" and "No red/purple color pairings" (CLAUDE.md, Accessibility section).

## Database Changes

**None required.** The `brandingColor` column already exists on the `franchises` table as `text("branding_color")` (nullable). See `lib/db/schema.ts`, line 45. No migration needed.

## API Endpoints

**None required.** This is a purely presentational change to a React Server Component. The `brandingColor` value is already available in the data flow: it is part of the `MatchupTeamInfo` interface (`franchiseBrandingColor: string | null`) and is passed through from whatever query fetches matchup data with franchise joins.

## Validation Schemas

**None required.** No new data shapes are introduced. The existing `brandingColor` field flows from the DB through Drizzle's type inference (`Franchise` type) into the component props.

## Business Rules

1. **BR-1: Inline style is mandatory for brandingColor** (epics doc, line 58). Because `brandingColor` is a dynamic per-franchise value stored in the DB, it cannot be predefined as a Tailwind class or CSS variable. The accent bar MUST use `style={{ backgroundColor: value }}`.

2. **BR-2: Fallback to --border** (AC-2). When `brandingColor` is null/undefined, the fallback is `var(--border)`, not transparent or omitted. This ensures the bar is always present (consistent layout) but blends with the card border when no franchise color exists.

3. **BR-3: Left = home, Right = away** (UX-DR4). The left-edge bar corresponds to the home/left team; the right-edge bar corresponds to the away/right team. This mirrors the matchup layout where home is on the left and away is on the right.

4. **BR-4: Bar dimensions** (FR6). The bar is exactly 3px wide (`w-[3px]`), spans full height (`top-0 bottom-0` with absolute positioning), and has matching border-radius on its outer edge to align with the card's `rounded-xl`.

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Server Component | Already satisfied | `matchup-row.tsx` has no `"use client"` directive |
| No new dependencies | Already satisfied | Uses only inline styles and Tailwind (NFR6) |
| Accessibility: aria-hidden on bars | Must verify | Bars must have `aria-hidden="true"` (NFR1) |
| Accessibility: no info by color alone | Must verify | Team names/scores are primary identifiers (NFR1) |
| No hardcoded hex in component | Must verify | The `var(--border)` fallback uses a CSS variable, not a hex literal (FR11) |
| WCAG contrast | N/A | The bars are decorative; contrast ratio requirements apply to text, not decorative borders |
| prefers-reduced-motion | N/A | No animation on these bars (NFR4 not triggered) |
| Tailwind v4 compatibility | Already satisfied | Uses `w-[3px]` arbitrary value syntax, compatible with Tailwind v4 |

## Existing Implementation Assessment

**Critical finding:** The current `components/matchup-row.tsx` (read at the start of analysis) already implements all three acceptance criteria:

- **AC-1 (lines 46-50, 119-124):** Two absolutely-positioned 3px bars with inline `backgroundColor` from `franchiseBrandingColor`.
- **AC-2 (lines 48, 122):** Nullish coalescing fallback to `"var(--border)"`.
- **AC-3 (lines 49, 123):** Both bars have `aria-hidden="true"`.

The DEV agent should:
1. Confirm the existing implementation matches all criteria exactly.
2. If it does, skip code changes and proceed directly to acceptance testing.
3. If any discrepancy is found (e.g., bar width not exactly 3px, missing aria attribute, wrong fallback), fix only the discrepancy.

## NFR Targets

| NFR | Target | Verification Method |
|---|---|---|
| NFR1 | Color accents are decorative only; `aria-hidden="true"` on bars; team names/scores are primary identifiers | Visual inspection + screen reader test (or Playwright a11y assertion) |
| NFR3 | WCAG 2.1 AA contrast maintained | N/A for decorative elements; verify surrounding text contrast is not affected |
| NFR6 | No new dependencies introduced | `package.json` unchanged |

## Forward Dependencies

- **Story 4.2 (Franchise Card Top Border):** Uses the same `brandingColor` inline-style pattern. Any pattern established or refined here applies there.
- **Story 4.3 (Franchise Detail Hero Gradient):** Same `brandingColor` source, different application (background gradient at 5-8% opacity).
- **Story 4.4 (Standings Table Left Border):** Same pattern (2-3px left border in `brandingColor`).

All stories in Epic 4 share the same fallback strategy (`var(--border)`) and the same NFR1 decorative-only constraint.

## Open Questions

None. All acceptance criteria are unambiguous, the data source (`brandingColor` on `franchises` table) exists, the component already appears to implement the feature, and the architectural constraints (inline style for dynamic DB values, server component, no new deps) are clear.
