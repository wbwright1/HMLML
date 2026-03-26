---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 1.2 - Press Box Evolved Theme Implementation
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Flags for orchestrator**: Two contrast ratios require developer verification before story can be marked done (see Section 4). No interactive components in this story; spec focuses entirely on token definitions, Tailwind mapping, contrast verification, and implementation guidance.
---

# UXA Spec: Story 1.2 — Press Box Evolved Theme Implementation

## Scope

This is a foundation story with no UI components, no interaction flows, and no page layouts. All deliverables are CSS custom properties, Tailwind `@theme inline` registrations, typography utility classes, and global base rules confined to `app/globals.css`. The spec below is organized as direct implementation guidance for the developer.

---

## Section 1: Color Token Definitions

All 15 tokens must be defined on `:root` as CSS custom properties. Each hex value appears exactly once in the file; all other references use `var()`.

### 1.1 Named Tokens (New — Add to `:root`)

The following 14 tokens are not currently present in `globals.css` and must be added:

| CSS Custom Property | Hex Value | Role |
|---|---|---|
| `--canvas` | `#FAF8F5` | Page background |
| `--surface` | `#FFFFFF` | Card backgrounds |
| `--surface-muted` | `#F5F2EE` | Subtle section dividers, alternating row backgrounds |
| `--border-strong` | `#D4CFC9` | Emphasized borders, active card outlines |
| `--text-primary` | `#1A1A1A` | Headlines, stat numbers, bold callouts |
| `--text-secondary` | `#4A4540` | Body text, descriptions, supporting context |
| `--text-tertiary` | `#7A756F` | Labels, metadata, timestamps, captions |
| `--text-muted` | `#9C9590` | Placeholder text, disabled states |
| `--accent-green` | `#2D5A3D` | Brand accent, nav active states, live indicators, CTAs |
| `--accent-green-light` | `#E8F0EB` | Green tint backgrounds |
| `--accent-gold` | `#B8860B` | Achievements, championships, awards, positive superlatives |
| `--accent-gold-light` | `#FDF6E3` | Gold tint backgrounds for award card surfaces |
| `--accent-warm` | `#C45D3E` | Negative superlatives, loss callouts (rust/terra cotta, NOT red) |
| `--accent-warm-light` | `#FDF0EC` | Warm tint backgrounds for loss/negative stat cards |

The `--border` token (`#E8E4E0`) already exists in `:root`. It serves as both the named semantic token and the shadcn/ui alias. No change needed; no self-reference introduced.

### 1.2 shadcn/ui Alias Updates (Modify Existing `:root` Entries)

Once the named tokens above are defined, the following existing shadcn/ui aliases must be updated to reference the named tokens via `var()`. This enforces the single-source-of-truth rule (BR-1): hex values are only written once.

| shadcn/ui Property | New Value | Previous Value |
|---|---|---|
| `--background` | `var(--canvas)` | `#FAF8F5` |
| `--foreground` | `var(--text-primary)` | `#1A1A1A` |
| `--card` | `var(--surface)` | `#FFFFFF` |
| `--card-foreground` | `var(--text-primary)` | `#1A1A1A` |
| `--popover` | `var(--surface)` | `#FFFFFF` |
| `--popover-foreground` | `var(--text-primary)` | `#1A1A1A` |
| `--primary` | `var(--accent-green)` | `#2D5A3D` |
| `--accent` | `var(--accent-green)` | `#2D5A3D` |
| `--ring` | `var(--accent-green)` | `#2D5A3D` |
| `--gold` | `var(--accent-gold)` | `#B8860B` |

**Do not change `--muted-foreground`.** It remains `#6B6560` for shadcn/ui component compatibility. The new `--text-secondary` (`#4A4540`) is a separate semantic token for HML components and must not be conflated with `--muted-foreground`.

**Do not change `--loss`.** The current value `#C4402F` is brighter than `--accent-warm` (`#C45D3E`). The `--loss` alias serves shadcn/ui destructive-adjacent roles; `--accent-warm` is the HML semantic token for negative superlatives. Both must coexist. Components should use `--accent-warm` for HML negative states, not `--loss`. [UXA EXTRAPOLATION: the REQS brief does not explicitly address this distinction; this guidance is extrapolated from the presence of both values in the existing file and the color blindness constraint requiring rust/terra cotta rather than true red.]

**Do not change `--destructive`.** Its current value `#B91C1C` is used only for shadcn/ui destructive button states. No HML feature uses a "destructive" action pattern in Phase 1.

---

## Section 2: Tailwind Token Registration

All 15 named tokens must be registered in the `@theme inline { }` block so Tailwind v4 generates utility classes. The existing block already registers `--color-border: var(--border)`. Add the following alongside it:

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

### 2.1 Generated Tailwind Utility Classes

Once registered, these are the Tailwind classes available to all consuming components. Downstream story developers must use these classes exclusively; no inline hex values in JSX.

| Token | Background Class | Text Class | Border Class |
|---|---|---|---|
| `--canvas` | `bg-canvas` | — | — |
| `--surface` | `bg-surface` | — | — |
| `--surface-muted` | `bg-surface-muted` | — | — |
| `--border` | — | — | `border-border` |
| `--border-strong` | — | — | `border-border-strong` |
| `--text-primary` | — | `text-text-primary` | — |
| `--text-secondary` | — | `text-text-secondary` | — |
| `--text-tertiary` | — | `text-text-tertiary` | — |
| `--text-muted` | — | `text-text-muted` | — |
| `--accent-green` | `bg-accent-green` | `text-accent-green` | `border-accent-green` |
| `--accent-green-light` | `bg-accent-green-light` | — | — |
| `--accent-gold` | `bg-accent-gold` | `text-accent-gold` | `border-accent-gold` |
| `--accent-gold-light` | `bg-accent-gold-light` | — | — |
| `--accent-warm` | `bg-accent-warm` | `text-accent-warm` | `border-accent-warm` |
| `--accent-warm-light` | `bg-accent-warm-light` | — | — |

Note: Tailwind v4 generates utility classes from `--color-*` tokens automatically. The `text-text-primary` pattern (doubled word) is intentional and correct per Tailwind v4 behavior for tokens with a `text-` prefix in the name.

### 2.2 Spacing Token Registration

The following spacing tokens must be added to `@theme inline { }`. They represent the 8px-multiple system from the UX spec:

| `@theme inline` Declaration | Generated Class Prefix | px Value |
|---|---|---|
| `--spacing-space-1: 0.25rem` | `p-space-1`, `m-space-1`, `gap-space-1` | 4px |
| `--spacing-space-2: 0.5rem` | `p-space-2`, `m-space-2`, `gap-space-2` | 8px |
| `--spacing-space-3: 0.75rem` | `p-space-3`, `m-space-3`, `gap-space-3` | 12px |
| `--spacing-space-4: 1rem` | `p-space-4`, `m-space-4`, `gap-space-4` | 16px |
| `--spacing-space-6: 1.5rem` | `p-space-6`, `m-space-6`, `gap-space-6` | 24px |
| `--spacing-space-8: 2rem` | `p-space-8`, `m-space-8`, `gap-space-8` | 32px |
| `--spacing-space-12: 3rem` | `p-space-12`, `m-space-12`, `gap-space-12` | 48px |
| `--spacing-space-16: 4rem` | `p-space-16`, `m-space-16`, `gap-space-16` | 64px |
| `--spacing-space-24: 6rem` | `p-space-24`, `m-space-24`, `gap-space-24` | 96px |

These are added alongside (not replacing) the existing semantic spacing tokens (`--spacing-xs` through `--spacing-4xl`). The developer must verify Tailwind v4 actually generates `p-space-4` style classes from `--spacing-space-4` entries. If the naming convention differs, adapt the `@theme inline` key names while keeping the rem values intact. Document the confirmed behavior in `cross-story-context.md` for Story 1.3 to use.

---

## Section 3: Typography Scale

### 3.1 Corrections to Existing Utility Classes

The following existing classes in `@layer utilities` contain values that differ from the UX spec and must be updated:

| Class | Property | Current Value | Target Value |
|---|---|---|---|
| `.text-display` | `font-size` | `clamp(3rem, 4vw, 4rem)` | `clamp(3.5rem, 5vw, 4rem)` |
| `.text-display` | `line-height` | `1.1` | `1.05` |
| `.text-h1` | `letter-spacing` | `-0.01em` | `-0.015em` |
| `.text-h1` | `line-height` | `1.2` | `1.15` |
| `.text-h2` | `letter-spacing` | (absent) | `-0.01em` |
| `.text-h2` | `line-height` | `1.25` | `1.2` |
| `.text-h3` | `line-height` | `1.35` | `1.3` |
| `.text-body-lg` | `line-height` | `1.6` | `1.5` |
| `.text-body` | `line-height` | `1.6` | `1.5` |
| `.text-body-sm` | `letter-spacing` | (absent) | `0.005em` |
| `.text-body-sm` | `line-height` | `1.5` | `1.45` |
| `.text-caption` | `letter-spacing` | (absent) | `0.06em` |
| `.text-caption` | `line-height` | `1.5` | `1.35` |

### 3.2 New Utility Class: `.text-stat`

This class does not exist and must be added to `@layer utilities`:

```css
.text-stat {
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.0;
    font-variant-numeric: tabular-nums;
}
```

Note: `.text-stat` does not set `font-size`. It is a modifier class applied in combination with a size class (e.g., `text-h2 text-stat`, or `text-body text-stat`). Size is always contextual based on where the stat appears.

### 3.3 Complete Target State (All Typography Classes)

The full target state for `@layer utilities`, for developer reference:

| Class | font-size | font-weight | letter-spacing | line-height | font-variant-numeric |
|---|---|---|---|---|---|
| `.text-display` | `clamp(3.5rem, 5vw, 4rem)` | 900 | `-0.02em` | `1.05` | — |
| `.text-h1` | `clamp(2.25rem, 3vw, 2.5rem)` | 700 | `-0.015em` | `1.15` | — |
| `.text-h2` | `clamp(1.75rem, 2.5vw, 2rem)` | 700 | `-0.01em` | `1.2` | — |
| `.text-h3` | `clamp(1.25rem, 2vw, 1.5rem)` | 500 | `0` | `1.3` | — |
| `.text-body-lg` | `1.125rem` | 400 | `0` | `1.5` | — |
| `.text-body` | `1rem` | 400 | `0` | `1.5` | — |
| `.text-body-sm` | `0.875rem` | 400 | `0.005em` | `1.45` | — |
| `.text-caption` | `0.75rem` | 500 | `0.06em` | `1.35` | — |
| `.text-stat` | (none — modifier only) | 700 | `-0.01em` | `1.0` | `tabular-nums` |

---

## Section 4: Contrast Ratio Verification

### 4.1 Verified Ratios (from UX Spec)

These pairs are documented in the UX spec accessibility table and do not require recalculation:

| Foreground | Background | Hex (FG) | Hex (BG) | Ratio | WCAG Requirement | Status |
|---|---|---|---|---|---|---|
| `--text-primary` | `--canvas` | `#1A1A1A` | `#FAF8F5` | 14.8:1 | 3:1 large text | PASS |
| `--text-secondary` | `--canvas` | `#4A4540` | `#FAF8F5` | 7.2:1 | 4.5:1 body | PASS |
| `--accent-green` | `--canvas` | `#2D5A3D` | `#FAF8F5` | 6.1:1 | 3:1 interactive | PASS |

### 4.2 Ratios Requiring Developer Verification

The following two tokens are flagged in the REQS brief as potentially failing 4.5:1 at body text sizes. The developer must calculate these ratios using a WCAG contrast checker (e.g., WebAIM Contrast Checker) before closing the story:

**`--text-tertiary` (`#7A756F`) on `--canvas` (`#FAF8F5`):**

Estimated approximate ratio: ~4.3:1. This is below the 4.5:1 threshold for normal body text.

Usage restriction (pending verification):
- If ratio is below 4.5:1: restrict to Caption (12px, Medium 500) and Body Small (14px) contexts only, where large-text exemption (3:1) applies
- Must not be used for Body (16px, Regular 400) or larger regular-weight text
- Document the verified ratio and the restriction in `cross-story-context.md`

**`--text-muted` (`#9C9590`) on `--canvas` (`#FAF8F5`):**

Estimated approximate ratio: ~2.8:1. This likely fails even the 3:1 large-text threshold.

Usage restriction (pending verification):
- If ratio is below 3:1: restrict to decorative and non-informational contexts only (placeholder text, disabled state indicators that have a separate visual treatment)
- Must never be used as the sole conveyance of information
- Acceptable: placeholder text in empty input fields (paired with placeholder label text), disabled state opacity layered over an already-labeled element
- Document the verified ratio and the restriction in `cross-story-context.md`

### 4.3 Accent Token Contrast Guidance

The following accent tokens appear as text on light backgrounds in certain components. These are provided as guidance for downstream stories; verification is not required for story 1.2 acceptance, but should be noted:

| Foreground Token | On Surface (`#FFFFFF`) | Notes |
|---|---|---|
| `--accent-gold` (`#B8860B`) | Estimated ~3.5:1 | Passes 3:1 large text; marginal for body text; use Bold weight or large size |
| `--accent-warm` (`#C45D3E`) | Estimated ~3.8:1 | Passes 3:1 large text; use Bold weight; avoid at body Regular size |

[UXA EXTRAPOLATION: These specific pairs are not in the UX spec's contrast table. Estimated values are based on lightness calculations; developer should verify before using `text-accent-gold` or `text-accent-warm` at body text sizes in later stories.]

---

## Section 5: Global Base Rules

### 5.1 Tabular Figures — Global Rule (Add to `@layer base`)

Add the following rule to the existing `@layer base` block:

```css
td, th {
    font-variant-numeric: tabular-nums;
}
```

This ensures all table cells display numeric content with consistent column widths, preventing visual shifting during live score updates.

### 5.2 Existing Rules — No Change Required

The following rules in `@layer base` already satisfy acceptance criteria and must not be modified:

- Focus ring: `2px solid var(--primary)` with `2px` offset (maps to `--accent-green`)
- Reduced motion: `@media (prefers-reduced-motion: reduce)` block
- Body background and foreground: `@apply bg-background text-foreground`
- Font family: `@apply font-sans`

---

## Section 6: Accessibility Requirements

### 6.1 Color Signal Companion Requirements

The token system itself does not enforce this, but all downstream component authors must follow these rules, which are established here at the design-system level:

| Color Token | Usage Context | Required Companion |
|---|---|---|
| `--accent-green` | Win/positive state, live indicator | "W" text label, "LIVE" text label, or upward-context text |
| `--accent-gold` | Championship, achievement | "CHAMP" badge, trophy icon, or explicit achievement label |
| `--accent-warm` | Loss/negative state | "L" text label or explicit negative label |
| `--accent-green` (dot) | Live/active indicator | Green dot + "LIVE" text label, always paired |

No information may be conveyed by color alone. This is non-negotiable per NFR12 and the project's accessibility commitment.

### 6.2 Color Blindness Safety

- `--accent-warm` (`#C45D3E`) is rust/terra cotta, not true red. The distinction exists specifically for protanopia and deuteranopia users in the league. Do not substitute or override with a brighter red.
- No red/purple pairings appear anywhere in the token set.
- Gold and green are naturally distinguishable across all common color blindness types.

### 6.3 Focus Indication

- Existing focus rule already uses `var(--primary)` which resolves to `var(--accent-green)` after the shadcn/ui alias update.
- Once `--primary` is updated to `var(--accent-green)` in `:root`, the focus ring color automatically follows. No separate change needed.

---

## Section 7: Implementation Order

The developer should apply changes in this order to avoid breaking the existing styles mid-implementation:

1. Add all 14 new named tokens to `:root` (before the existing shadcn/ui tokens)
2. Update shadcn/ui alias values in `:root` to use `var()` references
3. Add new `--color-*` registrations to `@theme inline { }`
4. Add spacing token registrations to `@theme inline { }`
5. Correct existing typography classes in `@layer utilities`
6. Add `.text-stat` class to `@layer utilities`
7. Add `td, th` tabular-nums rule to `@layer base`
8. Verify `--text-tertiary` and `--text-muted` contrast ratios; document restrictions
9. Verify Tailwind v4 spacing token naming generates expected classes; document in `cross-story-context.md`

---

## Section 8: Visual Regression Concerns

The following existing styles will have their rendered output affected by this story:

1. **Body text color:** Any element using `text-foreground` renders `#1A1A1A` before and after (no change). Any element using `text-muted-foreground` renders `#6B6560` before and after (no change — `--muted-foreground` is not being modified).

2. **Typography line-heights:** All elements using `.text-display`, `.text-h1`, `.text-h2`, `.text-h3`, `.text-body-lg`, `.text-body`, `.text-body-sm`, `.text-caption` will have subtly different line spacing. This is intentional; the changes tighten heading rhythm and bring body text in line with the UX spec.

3. **`.text-display` minimum size increase:** The floor moves from 48px to 56px. Any viewport where the display clamp was previously at its minimum (48px) will now render at 56px. This affects only the smallest viewports where `4vw < 3.5rem`. At 320px wide: 4vw = 12.8px (well below the floor in both cases), so clamp always returns the minimum. The rendered size increases on narrow viewports.

4. **No color changes are visible** from the shadcn/ui alias updates: all aliases currently hold the same hex values; the update to `var()` references produces identical computed colors.

---

## Section 9: What This Story Does NOT Include

- No dark mode tokens (light-only per BR-4)
- No additional npm packages (BR-5)
- No typography base styles on HTML element selectors (BR-6; utility classes only)
- No interactive component states (hover, active, disabled) — those belong to individual component stories
- No Geist Sans font loading changes (AC-5 is already satisfied by `layout.tsx`)
- No database, API, or Zod schema changes
