# Story 4.3: Franchise Page Hero Gradient - Implementation Brief

## Orchestrator Summary
**Story:** 4.3 - Franchise Page Hero Gradient
**Epic:** 4 - Franchise Identity & Color
**Status:** REQS COMPLETE
**Risk Level:** Low
**Conflicts Found:** None (see notes below on existing implementation)
**Key Finding:** The hero gradient is already implemented in the current codebase. This brief defines the acceptance requirements so the implementation can be verified, and addresses a minor spec deviation that needs correction.

---

## 1. Requirements Traceability

| Requirement | ID | Source |
|---|---|---|
| Franchise detail page hero displays subtle background gradient using brandingColor at 5-8% opacity | FR8 | epics.md |
| Gradient fades to transparent below the hero section | UX-DR5 | epics.md |
| Franchise color usage is decorative only; never sole identifier | NFR1 | epics.md |
| All text over gradient maintains WCAG 2.1 AA contrast ratios | NFR3 | epics.md |
| No new third-party libraries | NFR6 | epics.md |
| React Server Components by default | Architecture ADR | CLAUDE.md |
| Dynamic per-franchise brandingColor must use inline styles | Architecture note | epics.md |

## 2. Current State Analysis

The franchise detail page (`app/teams/[franchiseSlug]/page.tsx`, lines 69-142) already implements a hero gradient via inline style on the `<section>` element at line 70-77:

```
style={{
  background: franchise.brandingColor
    ? `linear-gradient(to bottom, ${franchise.brandingColor}0F, transparent 60%)`
    : undefined,
}}
```

**Observation:** The hex suffix `0F` equals approximately 6% opacity (15/255 = 5.9%), which falls within the 5-8% spec range. The gradient fades to `transparent` at `60%` of the section height. This implementation appears to satisfy the story requirements.

### Data Path
- `brandingColor` is a nullable `text` column on the `franchises` table (`lib/db/schema.ts`, line 45)
- `getFranchiseBySlug()` in `lib/queries/franchises.ts` (line 84) returns `brandingColor` with nullish coalescing to `undefined` (line 135)
- The page component reads `franchise.brandingColor` and conditionally applies the gradient

## 3. Acceptance Criteria Verification Matrix

### AC-1: Gradient Applied When brandingColor Exists
**Given** the franchise detail page at `/teams/[franchiseSlug]`
**When** the franchise has a `brandingColor` set
**Then** the hero section displays a subtle background gradient using the franchise's `brandingColor` at 5-8% opacity, fading to transparent below the hero section

**Implementation requirements:**
- The hero `<section>` element must apply a CSS `linear-gradient` via inline `style` attribute (FR8, UX-DR5)
- The gradient must use the franchise's `brandingColor` hex value from the database
- Opacity of the color stop must be between 5% and 8% (hex alpha channel `0D` to `14`, or equivalent `rgba()`)
- The gradient must transition from the tinted color at the top to `transparent` before the section ends
- The gradient direction must be `to bottom` (top-to-bottom fade)

**Verification:** Render a franchise page where `brandingColor` is set (e.g., `#2D5A3D`). Inspect the hero section's computed `background` style. Confirm the gradient is visible as a subtle wash and fades out before content below the hero.

### AC-2: No Gradient When brandingColor Is Absent
**Given** a franchise has no `brandingColor` (null in DB)
**When** the page renders
**Then** no gradient is applied; the hero section uses the default page background (`--canvas`)

**Implementation requirements:**
- When `brandingColor` is `null`/`undefined`, the inline `style` for `background` must either be omitted or set to `undefined`
- No fallback gradient color should be applied (unlike Stories 4.1/4.2 which fall back to `var(--border)` for borders; the gradient simply does not render)

**Verification:** Render a franchise page where `brandingColor` is null. Confirm the hero `<section>` has no inline background style. The background should be the default `--canvas` color.

### AC-3: Decorative Only (NFR1)
**Given** the gradient is rendered
**Then** it is purely decorative and does not convey information

**Implementation requirements:**
- The gradient must not be the sole visual indicator of any semantic meaning
- The franchise name, owner name, stats, and all other content within the hero must be readable and identifiable without the gradient
- No `aria-label` or `role` needed on the gradient itself (it is a background style on a structural element, not a standalone decorative element)

**Verification:** Disable CSS backgrounds (or set `background: none` on the hero section via DevTools). Confirm all content remains fully understandable and no information is lost.

### AC-4: WCAG AA Contrast Compliance (NFR3)
**Given** the gradient is rendered behind text content
**Then** all text maintains WCAG 2.1 AA contrast ratios (4.5:1 for body text, 3:1 for large text)

**Implementation requirements:**
- At 5-8% opacity, the brandingColor tint over `--canvas` (#FAF8F5) must not reduce contrast below AA thresholds for any text color used in the hero
- `--text-primary` (#1A1A1A) over worst-case tinted background must maintain 4.5:1+
- `--text-secondary` (#4A4540) over worst-case tinted background must maintain 4.5:1+
- `--text-tertiary` (#7A756F) over worst-case tinted background must maintain 3:1+ (used only at large text sizes or as metadata)
- `--text-muted` (#9C9590) if used in the hero must maintain required ratios

**Verification:** For the darkest possible brandingColor at 8% opacity over `--canvas`, compute the resulting background color and check contrast ratios for all text colors used in the hero section. At 8% opacity, even a pure black brandingColor (#000000) would produce a background of approximately #E8E6E3, which maintains adequate contrast with `--text-primary` (contrast ratio ~14:1) and `--text-secondary` (contrast ratio ~6:1).

## 4. Technical Specifications

### 4.1 File Scope
| File | Action | Reason |
|---|---|---|
| `app/teams/[franchiseSlug]/page.tsx` | Verify/adjust | Hero section gradient implementation (lines 70-77) |

### 4.2 Gradient CSS Specification
- **Property:** `background` (inline style)
- **Value pattern:** `linear-gradient(to bottom, {brandingColor}{alphaHex}, transparent {fadeStop})`
- **Alpha range:** `0D` (5.1%) to `14` (7.8%) in hex; current `0F` (5.9%) is acceptable
- **Fade stop:** Between 50% and 80% of the section height; current `60%` is acceptable
- **Conditional:** Only applied when `brandingColor` is truthy; otherwise `undefined`

### 4.3 No Client-Side JavaScript
- The gradient is applied via a React Server Component (the page itself is a server component)
- No `"use client"` directive needed; this is a static inline style resolved at render time
- Complies with the architecture mandate for server components by default

### 4.4 Data Flow
```
DB (franchises.branding_color)
  -> getFranchiseBySlug() [lib/queries/franchises.ts]
  -> franchise.brandingColor [page.tsx]
  -> inline style on <section> element
```

## 5. Edge Cases

| Case | Expected Behavior |
|---|---|
| `brandingColor` is `null` | No gradient; clean default background |
| `brandingColor` is an empty string | Treated as falsy; no gradient applied (current conditional `franchise.brandingColor ? ...` handles this) |
| `brandingColor` is a 3-digit hex (e.g., `#F00`) | Appending `0F` to a 3-digit hex produces an invalid color. The DB should store 6-digit hex values. If encountered, the browser will ignore the invalid value gracefully (no gradient rendered). No runtime error. |
| `brandingColor` lacks `#` prefix | The gradient string would produce `linear-gradient(to bottom, FF00000F, transparent 60%)` which is invalid CSS. Browser ignores gracefully. |
| Very dark brandingColor (e.g., `#000000`) | At 5-8% opacity, produces a very subtle gray tint. WCAG contrast remains safe (see AC-4 verification). |
| Very light brandingColor (e.g., `#FFFFFF`) | At 5-8% opacity over `--canvas`, the gradient is nearly invisible. This is acceptable; it is decorative. |

## 6. Testing Requirements

### E2E Test (Playwright)
1. **Gradient present:** Navigate to a franchise page with a known `brandingColor`. Assert the hero `<section>` element has an inline `background` style containing `linear-gradient`.
2. **Gradient absent:** Navigate to a franchise page with no `brandingColor`. Assert the hero `<section>` element does NOT have an inline `background` style.
3. **Text readability:** Visual regression or manual check that text content in the hero is legible over the gradient.

### Unit Test
- No pure-function logic to unit test; the gradient is a conditional inline style in JSX.

## 7. Out of Scope
- Changing the gradient opacity value (current `0F`/5.9% is within spec)
- Changing the gradient fade stop (current `60%` is within spec)
- Adding gradient to any other section of the franchise page
- Adding gradient to other pages (franchise card borders are Story 4.2; standings borders are Story 4.4)
- Validating or sanitizing `brandingColor` format at the DB/sync layer (separate concern)

## 8. Conflicts and Risks
- **No conflicts identified.** The current implementation aligns with all requirements.
- **Minor risk:** If `brandingColor` values in the database are not consistently formatted as 6-digit hex with `#` prefix, the gradient could fail silently. This is a data quality concern outside this story's scope but worth noting for the sync layer (Epic 2 / data pipeline).
