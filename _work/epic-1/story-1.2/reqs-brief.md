---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 1.2 - Press Box Evolved Theme Implementation
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None. All acceptance criteria are unambiguous. One discrepancy between story.md notes and UX spec resolved in favor of the UX spec (see Open Questions section).
---

# Implementation Brief: Story 1.2 — Press Box Evolved Theme Implementation

## Story Reference

- **Story file:** `_work/epic-1/story-1.2/story.md`
- **Primary requirements:** UX-DR1, UX-DR2, UX-DR3 (`_work/epics.md` lines 90-92)
- **NFR:** NFR12, NFR13, NFR14 (`_work/epics.md` lines 71-73)
- **UX spec:** Visual Design Foundation section, `_bmad-output/planning-artifacts/ux-design-specification.md` (lines 319-458)
- **Project guidelines:** Visual Design section, CLAUDE.md

---

## Restated Acceptance Criteria

All seven criteria from the story's Given/When/Then block are restated below with exact target values:

### AC-1: 15 Color Tokens as CSS Custom Properties (UX-DR1)

All tokens defined on `:root` as CSS custom properties. The story acceptance criteria names the full range as `--canvas` through `--accent-warm-light`. The exact 15 tokens, by UX spec name, are:

| # | CSS Custom Property | Hex Value | UX Spec Usage |
|---|---|---|---|
| 1 | `--canvas` | `#FAF8F5` | Page background |
| 2 | `--surface` | `#FFFFFF` | Card backgrounds |
| 3 | `--surface-muted` | `#F5F2EE` | Subtle section dividers, alternating row backgrounds |
| 4 | `--border` | `#E8E4E0` | Card borders, dividers, table rules |
| 5 | `--border-strong` | `#D4CFC9` | Emphasized borders, active card outlines |
| 6 | `--text-primary` | `#1A1A1A` | Headlines, stat numbers, bold callouts |
| 7 | `--text-secondary` | `#4A4540` | Body text, descriptions, supporting context |
| 8 | `--text-tertiary` | `#7A756F` | Labels, metadata, timestamps, captions |
| 9 | `--text-muted` | `#9C9590` | Placeholder text, disabled states |
| 10 | `--accent-green` | `#2D5A3D` | Brand accent, nav active states, live indicators, CTAs |
| 11 | `--accent-green-light` | `#E8F0EB` | Green tint backgrounds |
| 12 | `--accent-gold` | `#B8860B` | Achievements, championships, awards, positive superlatives |
| 13 | `--accent-gold-light` | `#FDF6E3` | Gold tint backgrounds for award card surfaces |
| 14 | `--accent-warm` | `#C45D3E` | Negative superlatives, loss callouts (rust/terra cotta, NOT red) |
| 15 | `--accent-warm-light` | `#FDF0EC` | Warm tint backgrounds for loss/negative stat cards |

**Critical note on `--text-secondary`:** The UX spec explicitly darkened this from `#6B6560` to `#4A4540` to ensure WCAG AA compliance on the warm canvas. The current `globals.css` has `--muted-foreground: #6B6560` which maps to a similar role but is NOT the same value. The new semantic tokens are separate from the shadcn/ui semantic aliases.

**Color blindness constraint (NFR13):** `--accent-warm` (`#C45D3E`) is a warm rust/terra cotta, deliberately NOT a true red. No red/purple pairings anywhere. Do not substitute a brighter red.

### AC-2: Tailwind v4 Theme Registration

All 15 tokens must be registered inside `@theme inline { }` in `globals.css` so Tailwind v4 generates utility classes (e.g., `bg-canvas`, `text-text-primary`, `text-accent-green`, `bg-accent-gold-light`). This is in addition to the `:root` custom property definitions.

The registration pattern follows the existing shadcn/ui mappings already in the file:
```
--color-canvas: var(--canvas);
--color-surface: var(--surface);
/* etc. */
```

### AC-3: Typography Scale (UX-DR2)

Implemented as utility classes in `@layer utilities` inside `globals.css`. The current file has these classes but several values differ from the UX spec v2. The exact target values are:

| CSS Class | Size | Weight | Letter Spacing | Line Height | Notes |
|---|---|---|---|---|---|
| `.text-display` | `clamp(3.5rem, 5vw, 4rem)` (56-64px) | 900 | `-0.02em` | `1.05` | Story notes confirm -0.02em. Current has 48-64px range; spec says 56-64px. |
| `.text-h1` | `clamp(2.25rem, 3vw, 2.5rem)` (36-40px) | 700 | `-0.015em` | `1.15` | Story notes confirm -0.015em. Current has -0.01em; MUST be corrected. |
| `.text-h2` | `clamp(1.75rem, 2.5vw, 2rem)` (28-32px) | 700 | `-0.01em` | `1.2` | Currently missing letter-spacing; add -0.01em. |
| `.text-h3` | `clamp(1.25rem, 2vw, 1.5rem)` (20-24px) | 500 | `0` | `1.3` | No change. |
| `.text-body-lg` | `1.125rem` (18px) | 400 | `0` | `1.5` | No change. |
| `.text-body` | `1rem` (16px) | 400 | `0` | `1.5` | No change. |
| `.text-body-sm` | `0.875rem` (14px) | 400 | `0.005em` | `1.45` | Currently missing letter-spacing; add 0.005em. |
| `.text-caption` | `0.75rem` (12px) | 500 | `0.06em` | `1.35` | Story notes confirm 0.06em. Currently missing letter-spacing; add 0.06em. |
| `.text-stat` | contextual | 700 | `-0.01em` | `1.0` | New class required. Not currently present. Applies tabular-nums. |

**Corrections required in existing classes:**
- `.text-display`: size floor raised from `3rem` to `3.5rem` (48px -> 56px minimum per UX spec)
- `.text-h1`: letter-spacing corrected from `-0.01em` to `-0.015em`
- `.text-h2`: letter-spacing `-0.01em` added (currently absent)
- `.text-body-sm`: letter-spacing `0.005em` added (currently absent)
- `.text-caption`: letter-spacing `0.06em` added (currently absent)
- `.text-stat`: new class added

### AC-4: Tabular Figures Applied Globally to Numeric Content (UX-DR2)

`font-variant-numeric: tabular-nums` must be applied globally using a CSS selector that targets numeric content. Two mechanisms are required:

1. The `.text-stat` utility class includes `font-variant-numeric: tabular-nums` (see AC-3).
2. A global rule in `@layer base` applies `font-variant-numeric: tabular-nums` to elements that conventionally display numbers: `<table>`, `<td>`, `<th>`, and any element with class patterns common to score/stat display. The most defensible approach given the RSC-first architecture is a blanket rule on `td` and `th` elements plus the `.text-stat` class.

### AC-5: Geist Sans via next/font (already implemented)

`layout.tsx` already loads Geist Sans:
```typescript
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
```
And applies it to `<html>` via `geist.variable`. The `@theme inline` block in `globals.css` already maps `--font-sans: var(--font-sans)`. **No changes required for this criterion.** REQS confirms it is already satisfied.

### AC-6: shadcn/ui Default Colors Overridden (UX-DR1, AR4)

The shadcn/ui semantic tokens (`--background`, `--foreground`, `--primary`, etc.) must remain mapped to the HML brand palette. The current `:root` block in `globals.css` already does this. However, it must be updated to ensure the new semantic tokens reference the new named tokens where appropriate. Specifically:

- `--background` must equal `--canvas` value (`#FAF8F5`)
- `--foreground` must equal `--text-primary` value (`#1A1A1A`)
- `--muted-foreground` must NOT be changed to match the new `--text-secondary`; it remains `#6B6560` for shadcn/ui component compatibility unless a full audit of shadcn component usage determines otherwise. The new `--text-secondary` (`#4A4540`) is a separate semantic layer.
- `--accent` and `--ring` must equal `--accent-green` value (`#2D5A3D`)
- `--gold` and `--loss` custom properties already exist and must remain.

**No shadcn/ui default dark-mode theme should be added** (the project is light-only per CLAUDE.md).

### AC-7: WCAG 2.1 AA Contrast Ratios (NFR14)

Contrast ratios per UX spec accessibility table. Developer must verify all combinations pass before marking done:

| Foreground Token | Background Token | Ratio | Requirement | Status per UX Spec |
|---|---|---|---|---|
| `--text-secondary` (`#4A4540`) | `--canvas` (`#FAF8F5`) | 7.2:1 | 4.5:1 body | PASS |
| `--text-primary` (`#1A1A1A`) | `--canvas` (`#FAF8F5`) | 14.8:1 | 3:1 large | PASS |
| `--accent-green` (`#2D5A3D`) | `--canvas` (`#FAF8F5`) | 6.1:1 | 3:1 interactive | PASS |
| `--text-tertiary` (`#7A756F`) | `--canvas` (`#FAF8F5`) | must be verified | 4.5:1 body | Developer must verify |
| `--text-muted` (`#9C9590`) | `--canvas` (`#FAF8F5`) | must be verified | 4.5:1 body | Developer must verify |

**`--text-tertiary` and `--text-muted` may fail at body text sizes.** They are acceptable for Caption (12px, Medium) and Body Small contexts (WCAG allows 3:1 for large text), but must not be used for body-size (16px) text. Developer must document which roles each token is valid for.

**Focus indicator:** 2px solid `--accent-green` (`#2D5A3D`) with 2px offset. Already implemented in `globals.css` `@layer base` block. No change required.

---

## Database Changes

**None.** This story makes no database schema changes. All changes are confined to CSS and the Tailwind configuration layer.

---

## API Endpoints

**None.** This story introduces no API endpoints.

---

## Validation Schemas

**None.** This story introduces no Zod schemas or data validation logic.

---

## Business Rules

**BR-1: Single source of truth for color values.** Each hex value is defined ONCE in `:root` as a CSS custom property (e.g., `--accent-green: #2D5A3D`). All other references — shadcn/ui aliases, Tailwind `@theme inline` registrations — must use `var(--accent-green)`, not the hex literal. No hex value may appear in two places. (Source: CLAUDE.md, "Correctness over performance.")

**BR-2: No red/purple pairings.** `--accent-warm` is `#C45D3E` (rust/terra cotta). Any component using a "negative" or "loss" state color must use this token, never a brighter red or any purple. (Source: UX spec, Color Blindness Safety Protocol; NFR13.)

**BR-3: Color never sole information carrier.** Every color signal in the UI must be accompanied by a text label, icon, or typographic treatment. This is enforced at the design-system level: the token system does not enforce this, but the brief flags it as a non-negotiable constraint for all consuming components. (Source: NFR12, UX spec Accessibility Considerations.)

**BR-4: No dark mode.** The project is light-only in Phase 1. No `@media (prefers-color-scheme: dark)` blocks. No `.dark` class variants. (Source: CLAUDE.md, "Press Box Design System — Light-only palette".)

**BR-5: No additional UI libraries.** Changes must not introduce any new npm packages. The Tailwind v4 `@theme inline` mechanism covers all token registration needs. (Source: CLAUDE.md, "Do NOT install additional UI libraries alongside shadcn/ui".)

**BR-6: Typography classes are utilities, not base styles.** The `.text-display`, `.text-h1`, etc. classes live in `@layer utilities` and are applied via Tailwind class names in JSX. They are NOT applied to HTML element selectors globally (e.g., do NOT apply `.text-h1` to all `<h1>` elements in `@layer base`). (Source: CLAUDE.md, RSC-first architecture; shadcn/ui compatibility.)

---

## Current State vs Target State Diff

This section documents exactly what must change in `globals.css` to satisfy all acceptance criteria.

### Section 1: `@theme inline` — ADD new token mappings

The following `--color-*` registrations must be added inside the existing `@theme inline { }` block:

```
--color-canvas: var(--canvas);
--color-surface: var(--surface);
--color-surface-muted: var(--surface-muted);
--color-border-strong: var(--border-strong);
--color-text-primary: var(--text-primary);
--color-text-secondary: var(--text-secondary);
--color-text-tertiary: var(--text-tertiary);
--color-text-muted: var(--text-muted);
--color-accent-green: var(--accent-green);
--color-accent-green-light: var(--accent-green-light);
--color-accent-gold: var(--accent-gold);
--color-accent-gold-light: var(--accent-gold-light);
--color-accent-warm: var(--accent-warm);
--color-accent-warm-light: var(--accent-warm-light);
```

Note: `--color-border` already exists in `@theme inline` (maps to `var(--border)`). This mapping should remain and also register under `--color-border` (no duplicate needed).

### Section 2: `@theme inline` — ADD spacing tokens

The current spacing tokens use `--spacing-xs` through `--spacing-4xl` (semantic labels). The story acceptance criteria requires `space-1` through `space-24` with the 8px-multiples system from UX-DR3. These must be added alongside (not replacing) the existing semantic tokens:

| Token | Value (rem) | Value (px) |
|---|---|---|
| `--spacing-space-1` | `0.25rem` | 4px |
| `--spacing-space-2` | `0.5rem` | 8px |
| `--spacing-space-3` | `0.75rem` | 12px |
| `--spacing-space-4` | `1rem` | 16px |
| `--spacing-space-6` | `1.5rem` | 24px |
| `--spacing-space-8` | `2rem` | 32px |
| `--spacing-space-12` | `3rem` | 48px |
| `--spacing-space-16` | `4rem` | 64px |
| `--spacing-space-24` | `6rem` | 96px |

Note: The token names follow the UX spec naming (`space-1`, `space-2`, etc., skipping 5, 7, 9, 10, 11). In Tailwind v4 `@theme inline`, these register as `--spacing-space-1` which generates `p-space-1`, `m-space-1`, `gap-space-1`, etc. Developer must confirm Tailwind v4 naming convention for spacing tokens in `@theme inline` (check Tailwind v4 docs for whether `--spacing-space-4` generates `p-space-4` or `p-[var(--spacing-space-4)]`).

### Section 3: `:root` — ADD new named color tokens

The following custom properties must be added to the `:root` block. They are NOT currently present:

```css
--canvas: #FAF8F5;
--surface: #FFFFFF;
--surface-muted: #F5F2EE;
--border-strong: #D4CFC9;
--text-primary: #1A1A1A;
--text-secondary: #4A4540;
--text-tertiary: #7A756F;
--text-muted: #9C9590;
--accent-green: #2D5A3D;
--accent-green-light: #E8F0EB;
--accent-gold: #B8860B;
--accent-gold-light: #FDF6E3;
--accent-warm: #C45D3E;
--accent-warm-light: #FDF0EC;
```

The existing shadcn/ui tokens (`--background`, `--primary`, `--gold`, etc.) remain and must reference the new named tokens via `var()` where their values coincide:

```css
--background: var(--canvas);        /* was: #FAF8F5 */
--foreground: var(--text-primary);  /* was: #1A1A1A */
--card: var(--surface);             /* was: #FFFFFF */
--card-foreground: var(--text-primary); /* was: #1A1A1A */
--popover: var(--surface);          /* was: #FFFFFF */
--popover-foreground: var(--text-primary); /* was: #1A1A1A */
--primary: var(--accent-green);     /* was: #2D5A3D */
--accent: var(--accent-green);      /* was: #2D5A3D */
--ring: var(--accent-green);        /* was: #2D5A3D */
--gold: var(--accent-gold);         /* was: #B8860B */
--border: var(--border);            /* already correct, no change -- note: --border is already defined, no circular ref needed; keep as hex */
```

**Important:** `--border` already exists as a hex value (`#E8E4E0`) in both the named token layer and the shadcn alias. Since `--border` is being introduced as a named token itself, the shadcn alias `--border` and the named token `--border` are the same. No `var(--border)` self-reference. The `--color-border: var(--border)` in `@theme inline` remains valid.

### Section 4: `@layer utilities` — CORRECT existing typography classes

Changes required to existing utility classes:

- **`.text-display`:** Change `clamp(3rem, 4vw, 4rem)` to `clamp(3.5rem, 5vw, 4rem)`. Add `line-height: 1.05` (currently `1.1`). Letter-spacing `-0.02em` already correct.
- **`.text-h1`:** Change `letter-spacing` from `-0.01em` to `-0.015em`. Change `line-height` from `1.2` to `1.15`.
- **`.text-h2`:** Add `letter-spacing: -0.01em`. Change `line-height` from `1.25` to `1.2` (already `1.25`, UX spec says `1.2`).
- **`.text-h3`:** Change `line-height` from `1.35` to `1.3`. Already has no letter-spacing (correct).
- **`.text-body-lg`:** Change `line-height` from `1.6` to `1.5`.
- **`.text-body`:** Change `line-height` from `1.6` to `1.5`.
- **`.text-body-sm`:** Add `letter-spacing: 0.005em`. Change `line-height` from `1.5` to `1.45`.
- **`.text-caption`:** Add `letter-spacing: 0.06em`. Change `line-height` from `1.5` to `1.35`.

### Section 5: `@layer utilities` — ADD `.text-stat` class

```css
.text-stat {
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.0;
    font-variant-numeric: tabular-nums;
}
```

### Section 6: `@layer base` — ADD tabular-nums rule

```css
td, th {
    font-variant-numeric: tabular-nums;
}
```

---

## Cross-Cutting Concerns Checklist

| Concern | Requirement | Status for This Story |
|---|---|---|
| React Server Components | `"use client"` only for live score poller | N/A — no React components in this story |
| Drizzle ORM only | No raw SQL | N/A — no DB changes |
| Zod validation | All Sleeper responses validated | N/A — no Sleeper calls |
| Sync log | Every sync logged | N/A — no sync changes |
| No caching | Direct Postgres queries | N/A |
| Dark mode | Light-only | Enforced — no dark mode blocks |
| Additional UI libraries | None allowed | Enforced — CSS only changes |
| Accessibility | WCAG 2.1 AA | Addressed in AC-7 |
| No red/purple | NFR13 | Addressed in BR-2 |
| Color alone | NFR12 | Addressed in BR-3 |
| Naming conventions | kebab-case files, CSS custom properties with `--` prefix | Enforced — all tokens use `--` prefix |

---

## NFR Targets

| NFR | Requirement | Implementation Approach |
|---|---|---|
| NFR12 | No information by color alone | Token system constraint; all color signals require companion text/icon in components |
| NFR13 | No red/purple pairings | `--accent-warm: #C45D3E` is rust/terra cotta; no brighter red or purple in token set |
| NFR14 | WCAG 2.1 AA | Token choices validated per UX spec contrast table; developer must verify `--text-tertiary` and `--text-muted` use-case restrictions |

---

## Forward Dependencies

Stories that depend on this story's output:

- **Story 1.3 (Layout Components):** Will use color tokens (`bg-canvas`, `bg-surface`, `text-text-primary`), typography classes (`.text-h1`, `.text-body`), and spacing tokens. Layout components should not be built until this story is complete.
- **All UX-DR4 through UX-DR31 components** (Stories 2.x and beyond): Every signature component (award cards, matchup cards, rivalry cards) uses the token system defined here. Any change to token names after this story completes requires a cross-component refactor.
- **shadcn/ui primitives restyling** (AR4): Relies on the shadcn/ui alias override being in place.

Token names are a PUBLIC CONTRACT for all downstream stories. Once named and merged, token names must not change without a migration.

---

## Open Questions

**OQ-1 (Resolved by REQS): Display size range discrepancy.**

The story notes say "Display (48-64px, Black 900)" but the UX spec v2 table says "56-64px." REQS resolves in favor of the UX spec v2 (the more specific, more recently authored document). Implementation target: `clamp(3.5rem, 5vw, 4rem)` (56px min, 64px max).

**OQ-2 (Resolved by REQS): H1 letter-spacing discrepancy.**

The story notes say `-0.015em` for H1, but the current `globals.css` has `-0.01em`. The story notes and UX spec agree on `-0.015em`. Implementation target: `-0.015em`.

**OQ-3 (For developer): Tailwind v4 spacing token naming.**

REQS requires tokens named `space-1` through `space-24` generating classes like `p-space-4`. Developer must confirm Tailwind v4 `@theme inline` generates utility classes in this pattern for `--spacing-space-4` entries. If the naming convention differs (e.g., Tailwind v4 requires `--spacing-4` for `p-4`), adapt the token names accordingly while preserving the 8px-multiple values. Document the confirmed naming convention in the cross-story-context.md for Story 1.3.

**OQ-4 (For developer): `--text-tertiary` and `--text-muted` contrast floors.**

`--text-tertiary` (`#7A756F`) and `--text-muted` (`#9C9590`) must not be used for 16px+ regular-weight body text. Their contrast ratios must be calculated and documented. If either fails 4.5:1 at body sizes, components using them must restrict usage to Caption (12px, Medium 500) or labeled/decorative contexts only. Document this restriction in cross-story-context.md.
