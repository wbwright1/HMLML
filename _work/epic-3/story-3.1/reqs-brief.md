---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 3.1
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None
---

# Story 3.1: League Identity Hero -- Implementation Brief

## Story Reference

- **Epic**: 3 (League Hub Homepage)
- **Story**: 3.1 (League Identity Hero)
- **FRs**: FR1
- **UX-DRs**: UX-DR1
- **NFRs**: NFR3, NFR6
- **Source file**: `_work/epic-3/story-3.1/story.md`

## Restated Acceptance Criteria

Each acceptance criterion from the story is restated below with implementation precision. The Given/When/Then from the story is preserved in full.

### AC-1: Hero Section Renders on Homepage (FR1)

**Given** the homepage at `/`
**When** the page loads
**Then** a hero `<section>` element is rendered at the top of the page content (before all other homepage sections).

**Implementation notes:**
- The hero section already exists in `app/page.tsx` (lines 75-96) with placeholder content and the comment `{/* Story 3.1: League Identity Hero */}`. This story refines that existing section; it does not create a new component file.
- The section remains a React Server Component (no `"use client"`). It receives data from the existing `getLatestSeason()` and `getCurrentWeekMatchups()` queries already called in the page.

### AC-2: League Name in Display Weight (FR1)

**When** the hero renders
**Then** the league name "Harambe Memorial League Memorial League" is displayed in Display weight typography.

**Typography specification (from CLAUDE.md and globals.css):**
- CSS class: `text-display` (already defined in `globals.css` lines 215-220)
- Font size: `clamp(3.5rem, 5vw, 4rem)` (56-64px)
- Font weight: 900 (Black)
- Letter spacing: -0.02em
- Line height: 1.05
- Element: `<h1>`

**Current state:** The existing implementation at line 82 already uses `<h1 className="text-display">`. Verify this is correct and unchanged.

### AC-3: "Est. 2017" Badge (FR1)

**When** the hero renders
**Then** an "Est. 2017" badge is displayed above the league name.

**Implementation specification:**
- Position: above the `<h1>`, visually first in the hero
- Typography: `text-caption` class (12px, Medium 500, 0.06em tracking) with `uppercase` and `tracking-widest`
- Color: `text-muted-foreground` (maps to `--muted-foreground: #6B6560`)
- Content is static; "2017" is hardcoded (the league's founding year, not derived from data)

**Current state:** Already implemented at line 79 as `<p className="text-caption uppercase tracking-widest text-muted-foreground">Est. 2017</p>`. Verify this matches the spec.

### AC-4: League Tagline (FR1)

**When** the hero renders
**Then** a one-line league tagline is displayed below the league name.

**Implementation specification:**
- Typography: `text-body-lg` (18px, Regular 400) with `text-muted-foreground` color
- The tagline must match the site's snarky editorial voice (per CLAUDE.md "Site Voice & Personality")
- Content is static (hardcoded string, not from database)
- Must be a single line; no wrapping to multiple lines on desktop (may wrap naturally on small mobile screens, which is acceptable)

**Current state:** Line 84 shows `"12 Teams. Dynasty Format. Harambe's Legacy."`. This is adequate for the snarky voice requirement. The developer may refine the copy, but must preserve the single-line, personality-forward approach. Alternative examples that match the voice: "Where every loss is documented and every manager has receipts." The final tagline is a content decision, not a code decision; any snarky single-liner satisfies the AC.

### AC-5: Season/Week Context (FR1)

**When** the hero renders and season data is available
**Then** the current season year and week number are displayed in Body Small typography.

**Implementation specification:**
- Typography: `text-body-sm` (14px, Regular 400, 0.005em tracking) with `text-muted-foreground` color
- Data source: `latestSeason.seasonYear` (from `getLatestSeason()`) and `matchupData.week` (from `getCurrentWeekMatchups()`)
- Format when both season and week are available: `"{seasonYear} Season, Week {week}"`
- Format when only season is available (no matchup data): `"{seasonYear} Season"`
- Format when neither is available: do not render this line at all (graceful degradation)
- Use a comma separator, not an em-dash (per CLAUDE.md writing style: "Never use em-dashes")

**Current state:** Lines 86-95 handle both cases. NOTE: Line 89 uses an em-dash character (`—`). This MUST be replaced with a comma or other allowed separator per CLAUDE.md: "Never use em-dashes (--) in output." Change to `{latestSeason.seasonYear} Season, Week {matchupData.week}` or use a comma.

**Conflict flag:** The current code at line 89 uses `—` (em-dash) which violates CLAUDE.md writing style rules. This must be corrected in this story.

### AC-6: Green Background Tint (FR1, UX-DR1)

**When** the hero renders
**Then** the hero section has a subtle primary green background tint at 3-5% opacity.

**Implementation specification:**
- Use `bg-primary/[0.04]` (4% opacity of `--primary` which is `--accent-green` #2D5A3D) as Tailwind class
- This visually distinguishes the hero from the `--canvas` (#FAF8F5) page background
- Do NOT use `--accent-green-light` (#E8F0EB) directly as a solid background; the spec calls for a tint at 3-5% opacity of the green, not the pre-mixed light green token

**Current state:** Line 77 already uses `bg-primary/[0.04]`. This is correct and within the 3-5% range.

### AC-7: Typography-Only, No Images (FR1)

**When** the hero renders
**Then** the hero section uses only typography and spacing to convey personality; no images, icons, illustrations, or decorative SVGs are used.

**Implementation specification:**
- No `<img>`, `<svg>`, `<Image>`, or icon components within the hero section
- Visual impact comes from the Display weight typography, spacing, and the green tint background
- This is consistent with the UX spec principle: "Bold typography as the hero"

### AC-8: Responsive Layout (FR1)

**When** the hero is viewed on mobile (<768px)
**Then** all hero content stacks vertically and is centered.

**When** the hero is viewed on desktop (>=768px)
**Then** all hero content remains centered (this is a centered, single-column hero on all breakpoints).

**Implementation specification:**
- The hero is always centered text (`text-center`)
- Content flows vertically with `space-y-4` (16px gap between elements)
- Vertical padding: `py-24` (96px, which is an 8px multiple per the spacing system)
- No side-by-side layout at any breakpoint; this is a stacked, centered section
- The `clamp()` in `text-display` handles font size responsiveness automatically (56px min, 64px max)

**Current state:** Lines 76-96 already implement this with `py-24 space-y-4 text-center`. Verify no changes needed.

## Database Changes

**None.** This story requires no schema changes, no migrations, and no new database queries. All data is already fetched by the existing `getLatestSeason()` and `getCurrentWeekMatchups()` functions in `app/page.tsx`.

## API Endpoints

**None.** No new API routes or endpoint changes required. The hero is fully server-rendered using existing queries.

## Validation Schemas

**None.** No new Zod schemas required. The hero uses static content (league name, tagline, est. year) plus already-validated data from existing queries.

## Business Rules

### BR-1: League Name is Exact (FR1)
The league name displayed must be exactly "Harambe Memorial League Memorial League" (the double "Memorial League" is intentional per CLAUDE.md). The abbreviation "HMLML" is used elsewhere (nav branding, code), but the hero displays the full name.

### BR-2: Founding Year is Static (FR1)
"Est. 2017" is hardcoded. It does not derive from database data. The league's founding year predates any Sleeper data.

### BR-3: Graceful Degradation (FR1)
If `getLatestSeason()` or `getCurrentWeekMatchups()` return null (e.g., database not connected, no seasons synced), the hero still renders the league name, badge, and tagline. Only the season/week context line is conditionally omitted.

### BR-4: No Em-Dashes (CLAUDE.md Writing Style)
All text content in the hero must avoid em-dashes. Use commas, semicolons, colons, or periods as separators.

### BR-5: Server Component Only (Architecture)
The hero section must remain within the server component. No `"use client"` directive. No client-side JavaScript for the hero.

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| **WCAG AA contrast** (NFR3) | Must verify | `text-display` uses `--foreground` (#1A1A1A) on `bg-primary/[0.04]` background. The effective background is nearly identical to `--canvas` (#FAF8F5) since 4% green tint is barely visible. Contrast ratio of #1A1A1A on #FAF8F5 is 16.42:1 (per cross-story-context.md). Passes. `text-muted-foreground` (#6B6560) on same background: ~5.5:1. Passes 4.5:1 for body text. |
| **No color-only information** (NFR1) | Pass | Hero conveys no information via color alone. Green tint is decorative. |
| **No new dependencies** (NFR6) | Pass | No new packages or libraries. |
| **prefers-reduced-motion** (NFR4) | N/A | Hero has no animations. |
| **No hardcoded hex values** | Pass | All colors via Tailwind utility classes referencing design tokens. |
| **8px spacing grid** | Pass | `py-24` = 96px (8*12), `space-y-4` = 16px (8*2). Both are 8px multiples. |
| **Server component** | Pass | No `"use client"` in page.tsx. |
| **Writing style** | Must fix | Em-dash on line 89 must be replaced. |
| **Geist Sans font** | Pass | Font loaded via `next/font` in layout; `text-display` inherits `--font-sans`. |

## NFR Targets

| NFR | Target | Verification |
|---|---|---|
| NFR3 (WCAG AA) | All text in hero meets 4.5:1 body / 3:1 large text contrast | Verify `text-display` (#1A1A1A on ~#FAF8F5) and `text-muted-foreground` (#6B6560 on ~#FAF8F5) ratios |
| NFR6 (No new deps) | Zero new npm packages | Verify no additions to package.json |

## Forward Dependencies

- **Story 3.2 (Superlative Stats Row):** Rendered immediately below the hero section. The hero's bottom padding (`py-24`) creates spacing before the superlative row. No code coupling, but visual adjacency matters.
- **Seasonal Hub (future):** The UX spec describes a seasonally-aware hub where the hero transforms into Champion Banner (preseason/offseason) or Week Banner (regular season/playoffs). Story 3.1 establishes the hero position and base styling. Future stories will conditionally render different hero variants based on NFL state. The current implementation is forward-compatible; it does not block seasonal variants.

## Implementation Scope Summary

This story is primarily a **verification and minor fix** of the existing implementation. The hero section was already scaffolded in `app/page.tsx` (lines 75-96). The required changes are:

1. **Fix the em-dash** on line 89: replace `—` with `,` (comma) in the season/week context string.
2. **Verify** all typography classes, spacing, color tokens, and responsive behavior match the specifications above.
3. **Verify** the tagline copy matches the site's snarky editorial voice.
4. **Write acceptance tests** (Playwright E2E) per the testing patterns in CLAUDE.md.

### E2E Test Requirements

Tests must run against the real Next.js dev server with a real Postgres database (per CLAUDE.md "No Mocks, Prove It Works"). Test file location: `e2e/story-3.1-hero.spec.ts`.

**Test cases:**

1. **Hero section is visible on homepage:** Navigate to `/`, assert a `<section>` containing the league name is visible.
2. **League name text:** Assert the `<h1>` contains exact text "Harambe Memorial League Memorial League".
3. **Est. 2017 badge:** Assert text "Est. 2017" is visible within the hero section.
4. **Tagline is present:** Assert the hero contains a tagline paragraph (non-empty body-lg text).
5. **Season context (conditional):** If seasons exist in the database, assert the season/week context line is visible. If no seasons, assert it is absent (not an error).
6. **No images in hero:** Assert the hero section contains zero `<img>` or `<svg>` elements.
7. **Responsive centered:** Assert the hero text is centered (verify `text-center` or computed `text-align: center`).
8. **No em-dash in hero text:** Assert none of the text content within the hero section contains the `—` character.

## Open Questions

None. All acceptance criteria are unambiguous and the existing implementation provides a clear baseline.
