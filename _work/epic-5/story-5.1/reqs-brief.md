---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 5.1
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: [None]
---

# Implementation Brief: Story 5.1 — ChampionshipStars SVG Upgrade

## Story Reference
- **Epic:** 5 (Championship & Trophy Experience)
- **Story:** 5.1 — ChampionshipStars SVG Upgrade
- **Requirements:** FR18, UX-DR9, NFR3, NFR6
- **Source file:** `_work/epic-5/story-5.1/story.md`

## Restated Acceptance Criteria

### AC-1: Lucide Star icon replaces custom SVG (FR18, UX-DR9)
**Given** the ChampionshipStars component,
**When** rendering for a franchise with 1+ championships,
**Then:**
1. The Lucide React `Star` icon (imported from `lucide-react`) is used instead of the current custom inline `StarIcon` SVG function.
2. The `Star` icon uses `fill="currentColor"` to render as a solid (filled) star, not an outline.
3. The star color is applied via the existing `text-gold` Tailwind utility class, which resolves to `var(--gold)` -> `var(--accent-gold)` -> `#B8860B`.

### AC-2: Inline variant sizing (FR18, UX-DR9)
**Given** the ChampionshipStars component with `variant="inline"` (the default),
**When** rendering,
**Then** the Lucide `Star` icon renders at 14px (`size={14}` prop on the Lucide component, or equivalent `w-3.5 h-3.5` classes).

### AC-3: Hero variant sizing and drop shadow (FR18, UX-DR9)
**Given** the ChampionshipStars component with `variant="hero"`,
**When** rendering,
**Then:**
1. The Lucide `Star` icon renders at 20px (`size={20}` prop, or equivalent `w-5 h-5` classes).
2. A subtle drop shadow is applied. Use `drop-shadow-sm` Tailwind utility or the existing inline `filter: drop-shadow(...)` approach. The shadow should be a gold-tinted subtle shadow, not a generic gray shadow.

### AC-4: Accessibility preserved (FR18, NFR3)
**Given** the ChampionshipStars component,
**When** rendering for any count >= 1,
**Then:**
1. The outer container retains `aria-label` with the format `"{count} championship"` (singular) or `"{count} championships"` (plural).
2. The outer container retains `role="img"`.
3. Each individual `Star` icon has `aria-hidden="true"` (Lucide icons include this by default).

### AC-5: Zero championships renders nothing
**Given** a franchise with zero championships,
**When** ChampionshipStars renders,
**Then** nothing is rendered: no DOM element, no empty container, no placeholder. The component returns `null`.

## Database Changes
None. This story is a purely visual/component upgrade with no schema or data changes.

## API Endpoints
None. This story does not involve any API changes.

## Validation Schemas
None. No data validation changes required.

## Business Rules

### BR-1: Replace custom StarIcon with Lucide Star (FR18)
The current custom `StarIcon` function component (lines 6-18 of `components/championship-stars.tsx`) must be removed entirely and replaced with the `Star` component imported from `lucide-react`. The Lucide `Star` must be rendered with `fill="currentColor"` to produce a solid gold star, not an outline.

### BR-2: Size mapping (UX-DR9)
| Variant  | Size   | Equivalent Tailwind |
|----------|--------|---------------------|
| `inline` | 14px   | `w-3.5 h-3.5`      |
| `hero`   | 20px   | `w-5 h-5`          |

These sizes match the current implementation; this is a confirmation, not a change.

### BR-3: Drop shadow on hero variant only (UX-DR9)
The hero variant applies a subtle drop shadow. The current implementation uses an inline style with `drop-shadow(0 1px 2px color-mix(in srgb, var(--gold) 30%, transparent))`. This approach is acceptable. Alternatively, Tailwind's `drop-shadow-sm` class may be used if it provides sufficient subtlety. The developer should evaluate which approach produces the better visual result while maintaining the gold tint.

### BR-4: No empty render (FR18)
`count <= 0` returns `null`. This is already implemented in the current component; preserve this behavior.

### BR-5: Color token usage (FR18)
Stars use `text-gold` Tailwind class. Do not hardcode `#B8860B` anywhere. The token chain is: `text-gold` -> `--color-gold` -> `--gold` -> `--accent-gold` -> `#B8860B` (defined once in `globals.css`).

## Component Changes

### File: `components/championship-stars.tsx`

**Current state:** The component already has the correct structure, sizing, aria-label, role, and null-return behavior. It uses a custom inline SVG `StarIcon` subcomponent.

**Required changes:**
1. **Remove** the `StarIcon` function component (lines 6-18).
2. **Add** import: `import { Star } from "lucide-react";`
3. **Replace** `<StarIcon ... />` usage in the render with `<Star />` from Lucide, passing `fill="currentColor"` and `aria-hidden="true"` (though Lucide sets `aria-hidden` by default).
4. For **inline** variant: pass `size={14}` to `Star` (or use `className="w-3.5 h-3.5"`). Apply `text-gold` for color.
5. For **hero** variant: pass `size={20}` to `Star` (or use `className="w-5 h-5"`). Apply `text-gold` for color. Apply drop shadow (either via Tailwind `drop-shadow-sm` class or the existing inline style approach).
6. **Preserve** the `ChampionshipStarsProps` interface unchanged.
7. **Preserve** the outer `<div>` with `className="inline-flex items-center gap-0.5"`, `aria-label`, and `role="img"`.

### No changes to consuming components
The following files import and use `ChampionshipStars` and require **zero changes** since the component's props interface is unchanged:
- `components/franchise-identity.tsx` (inline and hero variants)
- `app/records/trophies/page.tsx` (inline and hero variants)
- `app/seasons/[seasonYear]/page.tsx` (hero variant)
- `app/playoffs/[seasonYear]/page.tsx` (hero variant)

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---------|--------|-------|
| Accessibility (WCAG AA) | Covered by AC-4 | `aria-label`, `role="img"`, `aria-hidden` on icons |
| Color-only information | N/A | Stars are always paired with franchise name context; color is decorative |
| No red/purple pairing | N/A | Gold only; no red or purple involved |
| Server component | Confirmed | Component has no `"use client"` directive; must remain a server component |
| No new dependencies | Confirmed (NFR6) | `lucide-react` is already installed (`^0.577.0` in `package.json`) |
| Naming conventions | Confirmed | File is `championship-stars.tsx` (kebab-case), export is `ChampionshipStars` (PascalCase) |
| Design token compliance | Confirmed (BR-5) | Uses `text-gold` Tailwind class, no hardcoded hex values |
| Mobile responsiveness | N/A | Stars are inline elements that scale with surrounding text; no layout changes |
| Animation | N/A | No animation on stars; drop shadow is a static CSS effect |
| `prefers-reduced-motion` | N/A (NFR4) | No animations to disable |

## NFR Targets

| NFR | Requirement | How Satisfied |
|-----|-------------|---------------|
| NFR3 | WCAG 2.1 AA contrast ratios | Gold (#B8860B) on white (#FFFFFF) = 4.03:1. Stars are decorative (paired with text context) so the 3:1 large-text ratio applies. At 14-20px bold icon rendering, this passes. Stars are never the sole information carrier; always accompanied by franchise name and championship count in aria-label. |
| NFR6 | No new dependencies | Uses already-installed `lucide-react` |

## Forward Dependencies

- **Story 5.2 (Trophy Case Enhancement)** uses `ChampionshipStars` with hero variant on the trophies page. The SVG upgrade in 5.1 will automatically improve 5.2's visual output with no additional work.
- **Story 5.3 (Season Champion Gold Highlight)** uses `ChampionshipStars` hero variant on season detail pages. Same automatic benefit.
- **Story 3.5 (Season Narrative Block)** references `ChampionshipStars` in offseason "League at a Glance" view. The upgrade applies there as well.

## Testing Requirements

### Unit Test (co-located: `components/championship-stars.test.ts`)
This is a pure presentational component with no dependencies to mock, so a unit test is appropriate per project conventions:
1. Verify that rendering with `count=0` returns `null` (no DOM output).
2. Verify that rendering with `count=3` produces exactly 3 SVG elements.
3. Verify that the outer container has `aria-label="3 championships"`.
4. Verify that the outer container has `role="img"`.
5. Verify that rendering with `count=1` produces `aria-label="1 championship"` (singular).

### Visual Verification (manual or E2E)
1. Navigate to `/records/trophies` and verify gold filled stars appear next to championship counts.
2. Navigate to a season page (e.g., `/seasons/2024`) with a champion and verify hero-variant stars with drop shadow.
3. Navigate to a team page for a franchise with championships and verify inline stars appear in the franchise identity.
4. Verify stars render as solid filled gold (not outlines).

## Open Questions
None. The story is well-defined, the component already exists with the correct structure, and the change is a straightforward icon library swap. All design tokens, sizes, and accessibility patterns are established.
