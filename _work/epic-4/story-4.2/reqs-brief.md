---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 4.2
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: The current Teams page (`app/teams/page.tsx`, line 48) already implements the 3px top border with `brandingColor` and the `var(--border)` fallback. DEV should verify the existing implementation satisfies all criteria below; if it does, the story may only require acceptance testing (no new code).
---

# Story 4.2: Franchise Card Top Borders -- Implementation Brief

## Story Reference

- **Epic:** 4 (Franchise Identity & Color)
- **Story:** 4.2
- **FRs:** FR7
- **NFRs:** NFR1
- **Source file:** `_work/epic-4/story-4.2/story.md`
- **Epics doc:** `_bmad-output/planning-artifacts/epics.md` (lines 194-196)

## Restated Acceptance Criteria

### AC-1: Franchise with brandingColor set (FR7)

**Given** the Teams page at `/teams` displays franchise cards in a grid
**When** a franchise has a `brandingColor` set (non-null hex string from the `franchises` table)
**Then:**
- A 3px top border in that franchise's `brandingColor` is displayed on the card.
- The border is applied via inline style (dynamic per-franchise value that cannot be a Tailwind class).

### AC-2: Franchise with no brandingColor (FR7)

**Given** a franchise has no `brandingColor` (null or undefined)
**When** the card renders
**Then** the top border falls back to `var(--border)` color via the inline style fallback.

### AC-3: Decorative only, no information by color alone (NFR1)

**Given** the franchise color accents are rendered
**Then:**
- They are purely decorative.
- Franchise identity is conveyed by team name, abbreviation, owner name, and win/loss record, not by the border color alone.
- This satisfies the project accessibility mandate: "No information conveyed by color alone" and "No red/purple color pairings" (CLAUDE.md, Accessibility section).

## Database Changes

**None required.** The `brandingColor` column already exists on the `franchises` table as `text("branding_color")` (nullable). See `lib/db/schema.ts`, line 45. No migration needed.

## API Endpoints

**None required.** This is a purely presentational change to a React Server Component. The `brandingColor` value is already returned by `getAllFranchises()` in `lib/queries/franchises.ts` (line 24) and consumed in the Teams page.

## Validation Schemas

**None required.** No new data shapes are introduced. The existing `brandingColor` field flows from the DB through Drizzle's type inference (`Franchise` type) into the page's render logic.

## Business Rules

1. **BR-1: Inline style is mandatory for brandingColor** (consistent with Story 4.1 pattern, epics doc line 58). Because `brandingColor` is a dynamic per-franchise value stored in the DB, it cannot be predefined as a Tailwind class or CSS variable. The top border MUST use `style={{ borderTopWidth: "3px", borderTopColor: value }}`.

2. **BR-2: Fallback to --border** (AC-2). When `brandingColor` is null/undefined, the fallback is `var(--border)`, not transparent or omitted. This ensures the border is always present (consistent layout) but blends with the card's existing border when no franchise color exists.

3. **BR-3: Border width is exactly 3px** (FR7). Matches the 3px accent pattern used across all Epic 4 stories (MatchupRow vertical bars in Story 4.1, standings left borders in Story 4.4).

4. **BR-4: Applied to the Link card element** (FR7). The top border is on the outer card element (`<Link>`) that wraps each franchise's content in the Teams page grid, not on an inner element.

## Existing Implementation Assessment

**Critical finding:** The current `app/teams/page.tsx` (line 48) already implements all three acceptance criteria:

```
style={{ borderTopWidth: "3px", borderTopColor: franchise.brandingColor ?? "var(--border)" }}
```

- **AC-1:** 3px top border with inline `borderTopColor` from `franchise.brandingColor`.
- **AC-2:** Nullish coalescing fallback to `"var(--border)"`.
- **AC-3:** Franchise identity is conveyed by team name (via `FranchiseIdentity` component), owner name, win/loss record, and total points scored. The border is decorative only.

The DEV agent should:
1. Confirm the existing implementation matches all criteria exactly.
2. If it does, skip code changes and proceed directly to acceptance testing.
3. If any discrepancy is found, fix only the discrepancy.

### One potential gap to verify

The story's AC-3 states the accents are "purely decorative" (NFR1). Unlike Story 4.1's MatchupRow which uses `aria-hidden="true"` on dedicated accent bar `<div>` elements, the Teams page applies the border directly to the `<Link>` element via CSS `borderTopColor`. Since this is a CSS border property (not a separate DOM element), `aria-hidden` is not applicable; CSS borders are inherently invisible to screen readers. No additional accessibility markup is needed.

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Server Component | Already satisfied | `app/teams/page.tsx` has no `"use client"` directive |
| No new dependencies | Already satisfied | Uses only inline styles and existing Tailwind classes |
| Accessibility: decorative only | Already satisfied | Border is CSS property on the Link; screen readers ignore CSS borders. Team name, owner, and record provide identity (NFR1) |
| Accessibility: no info by color alone | Already satisfied | Team name, abbreviation, owner, W/L record, and points all present (NFR1) |
| No hardcoded hex fallback | Already satisfied | Fallback uses `var(--border)` CSS variable, not a hex literal |
| WCAG contrast | N/A | Decorative borders; contrast ratio requirements apply to text, not decorative borders (NFR3) |
| No red/purple pairings | N/A for this story | Individual franchise colors are data-driven; the system does not pair colors. Franchise owners choose their own brandingColor |
| prefers-reduced-motion | N/A | No animation on these borders (NFR4 not triggered) |
| Tailwind v4 compatibility | Already satisfied | Uses inline style for dynamic value, standard Tailwind classes for everything else |

## NFR Targets

| NFR | Target | Verification Method |
|---|---|---|
| NFR1 | Color accent is decorative only; franchise identity conveyed by text (name, owner, record) | Visual inspection: remove brandingColor from a franchise and verify card is still fully identifiable. Playwright test: assert text content present regardless of color |
| NFR3 | WCAG 2.1 AA contrast maintained | N/A for decorative borders; verify surrounding text contrast unaffected |

## Forward Dependencies

- **Story 4.3 (Franchise Page Hero Gradient):** Same `brandingColor` data source, different application (background gradient at 5-8% opacity on detail page hero).
- **Story 4.4 (Standings Table Left Border):** Same inline-style pattern with `var(--border)` fallback, applied to table rows.

All stories in Epic 4 share the same fallback strategy (`var(--border)`) and the same NFR1 decorative-only constraint.

## Open Questions

None. The feature appears to already be implemented. All acceptance criteria are unambiguous, the data source (`brandingColor` on `franchises` table) exists and is already queried, and the architectural constraints (inline style for dynamic DB values, server component, no new deps) are satisfied by the current code.
