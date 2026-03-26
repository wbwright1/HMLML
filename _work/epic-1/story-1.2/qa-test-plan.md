---
## Orchestrator Summary
- **Agent**: QA Phase A
- **Story**: 1.2 - Press Box Evolved Theme Implementation
- **Verdict**: COMPLETE
- **State transition**: uxa-complete -> qa-plan-complete
- **Flags for orchestrator**: This story is pure CSS. No API tests. No database state to verify. All tests are static file inspection tests or Playwright computed-style tests against the running dev server. Two contrast ratios (`--text-tertiary` and `--text-muted`) must be manually verified and documented by the developer before story closure; test cases flag these as required developer assertions. Tailwind v4 spacing token class generation must be confirmed experimentally.
---

# QA Test Plan: Story 1.2 — Press Box Evolved Theme Implementation

## Test Strategy

This story makes no database changes, introduces no API endpoints, and introduces no Zod schemas. All changes are confined to `app/globals.css`. The test approach has two tiers:

**Tier 1 — Static inspection tests (CSS-T*):** These tests inspect the literal contents of `globals.css` to verify token definitions, exact hex values, Tailwind registrations, and typography class property values. They do not require a running server. They catch the most common failure modes: wrong hex value, missing property, wrong numeric value.

**Tier 2 — Playwright computed-style tests (FE-T*):** These tests launch the Next.js dev server, load a real page in a real browser, and assert on `getComputedStyle()` output. They verify the CSS actually resolves to the expected values at runtime — catching issues that static inspection cannot find, such as circular `var()` references, Tailwind v4 not generating the expected utility classes, and font loading failures.

**No mocks.** No API tests. No database seed data. Every test runs against the real file or the real running application.

---

## AC Coverage Matrix

| AC | Description | Test IDs |
|---|---|---|
| AC-1 | 15 color tokens defined as CSS custom properties on `:root` | CSS-T01 through CSS-T15 |
| AC-2 | All 15 tokens registered in `@theme inline` | CSS-T16 through CSS-T29 |
| AC-2b | 9 spacing tokens registered in `@theme inline` | CSS-T30 through CSS-T38 |
| AC-3 | Typography scale — 9 classes with correct values | CSS-T39 through CSS-T65, FE-T01 through FE-T09 |
| AC-4 | tabular-nums applied globally to td/th and .text-stat | CSS-T66, CSS-T67, FE-T10 |
| AC-5 | Geist Sans loaded via next/font | FE-T11 |
| AC-6 | shadcn/ui aliases reference named tokens via var() | CSS-T68 through CSS-T77 |
| AC-7 | WCAG 2.1 AA contrast ratios verified | FE-T12 through FE-T16, MANUAL-T01 through MANUAL-T02 |
| BR-1 | Single source of truth — no duplicate hex values | CSS-T78 |
| BR-2 | No red/purple pairings — accent-warm is rust, not red | CSS-T79 |
| BR-4 | No dark mode blocks | CSS-T80 |
| BR-5 | No new npm packages introduced | CSS-T81 |
| BR-6 | Typography classes in @layer utilities, not on HTML selectors | CSS-T82 |

---

## Static CSS Inspection Tests (CSS-T*)

These tests inspect `app/globals.css` directly. Each test is self-contained — it reads the single file with no dependencies on other tests or server state.

---

### CSS-T01 through CSS-T15: Color Token Definitions on `:root`

**Setup:** Read `app/globals.css`.

**For each of the following 15 tokens, assert that the `:root` block contains the exact custom property and hex value:**

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T01 | `--canvas` | `#FAF8F5` |
| CSS-T02 | `--surface` | `#FFFFFF` |
| CSS-T03 | `--surface-muted` | `#F5F2EE` |
| CSS-T04 | `--border` | `#E8E4E0` |
| CSS-T05 | `--border-strong` | `#D4CFC9` |
| CSS-T06 | `--text-primary` | `#1A1A1A` |
| CSS-T07 | `--text-secondary` | `#4A4540` |
| CSS-T08 | `--text-tertiary` | `#7A756F` |
| CSS-T09 | `--text-muted` | `#9C9590` |
| CSS-T10 | `--accent-green` | `#2D5A3D` |
| CSS-T11 | `--accent-green-light` | `#E8F0EB` |
| CSS-T12 | `--accent-gold` | `#B8860B` |
| CSS-T13 | `--accent-gold-light` | `#FDF6E3` |
| CSS-T14 | `--accent-warm` | `#C45D3E` |
| CSS-T15 | `--accent-warm-light` | `#FDF0EC` |

**Assert:** Each property appears exactly once within the `:root { }` block, with the exact hex value listed. Hex values are case-insensitive but must match the 6-character format (not shorthand). Fail if the property is absent, has the wrong value, or appears in a block other than `:root`.

---

### CSS-T16 through CSS-T29: Tailwind `@theme inline` Color Registrations

**Setup:** Read `app/globals.css`.

**For each of the following registrations, assert that the `@theme inline { }` block contains the exact declaration:**

| Test ID | `@theme inline` Declaration | References |
|---|---|---|
| CSS-T16 | `--color-canvas: var(--canvas)` | `--canvas` |
| CSS-T17 | `--color-surface: var(--surface)` | `--surface` |
| CSS-T18 | `--color-surface-muted: var(--surface-muted)` | `--surface-muted` |
| CSS-T19 | `--color-border-strong: var(--border-strong)` | `--border-strong` |
| CSS-T20 | `--color-text-primary: var(--text-primary)` | `--text-primary` |
| CSS-T21 | `--color-text-secondary: var(--text-secondary)` | `--text-secondary` |
| CSS-T22 | `--color-text-tertiary: var(--text-tertiary)` | `--text-tertiary` |
| CSS-T23 | `--color-text-muted: var(--text-muted)` | `--text-muted` |
| CSS-T24 | `--color-accent-green: var(--accent-green)` | `--accent-green` |
| CSS-T25 | `--color-accent-green-light: var(--accent-green-light)` | `--accent-green-light` |
| CSS-T26 | `--color-accent-gold: var(--accent-gold)` | `--accent-gold` |
| CSS-T27 | `--color-accent-gold-light: var(--accent-gold-light)` | `--accent-gold-light` |
| CSS-T28 | `--color-accent-warm: var(--accent-warm)` | `--accent-warm` |
| CSS-T29 | `--color-accent-warm-light: var(--accent-warm-light)` | `--accent-warm-light` |

**Assert:** Each declaration appears within the `@theme inline { }` block. `--color-border: var(--border)` already existed and must still be present (regression check). No hex literals allowed in `@theme inline` for these tokens.

---

### CSS-T30 through CSS-T38: Spacing Token Registrations

**Setup:** Read `app/globals.css`.

**Assert that the `@theme inline { }` block contains each of the following spacing declarations:**

| Test ID | Declaration | Expected rem Value | px Equivalent |
|---|---|---|---|
| CSS-T30 | `--spacing-space-1` | `0.25rem` | 4px |
| CSS-T31 | `--spacing-space-2` | `0.5rem` | 8px |
| CSS-T32 | `--spacing-space-3` | `0.75rem` | 12px |
| CSS-T33 | `--spacing-space-4` | `1rem` | 16px |
| CSS-T34 | `--spacing-space-6` | `1.5rem` | 24px |
| CSS-T35 | `--spacing-space-8` | `2rem` | 32px |
| CSS-T36 | `--spacing-space-12` | `3rem` | 48px |
| CSS-T37 | `--spacing-space-16` | `4rem` | 64px |
| CSS-T38 | `--spacing-space-24` | `6rem` | 96px |

**Assert:** All 9 tokens are present. The legacy semantic spacing tokens (`--spacing-xs` through `--spacing-4xl`) have been intentionally removed as part of the app-wide spacing standardization; Tailwind utility classes are used directly instead. Their absence is expected, not a regression.

---

### CSS-T39 through CSS-T65: Typography Class Property Values

**Setup:** Read `app/globals.css`. All assertions are within the `@layer utilities { }` block.

#### CSS-T39 through CSS-T45: `.text-display`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T39 | `font-size` | `clamp(3.5rem, 5vw, 4rem)` |
| CSS-T40 | `font-weight` | `900` |
| CSS-T41 | `letter-spacing` | `-0.02em` |
| CSS-T42 | `line-height` | `1.05` |

**Regression:** Assert old incorrect values are NOT present: `clamp(3rem, 4vw, 4rem)` (old floor), `line-height: 1.1` (old value).

#### CSS-T43 through CSS-T46: `.text-h1`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T43 | `font-size` | `clamp(2.25rem, 3vw, 2.5rem)` |
| CSS-T44 | `font-weight` | `700` |
| CSS-T45 | `letter-spacing` | `-0.015em` |
| CSS-T46 | `line-height` | `1.15` |

**Regression:** Assert old incorrect value `-0.01em` is NOT the letter-spacing for `.text-h1`.

#### CSS-T47 through CSS-T50: `.text-h2`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T47 | `font-size` | `clamp(1.75rem, 2.5vw, 2rem)` |
| CSS-T48 | `font-weight` | `700` |
| CSS-T49 | `letter-spacing` | `-0.01em` |
| CSS-T50 | `line-height` | `1.2` |

**Regression:** Assert `line-height: 1.25` does NOT appear for `.text-h2`. Assert letter-spacing is now present (was absent).

#### CSS-T51 through CSS-T53: `.text-h3`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T51 | `font-size` | `clamp(1.25rem, 2vw, 1.5rem)` |
| CSS-T52 | `font-weight` | `500` |
| CSS-T53 | `line-height` | `1.3` |

**Regression:** Assert `line-height: 1.35` does NOT appear for `.text-h3`.

#### CSS-T54 through CSS-T55: `.text-body-lg`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T54 | `font-size` | `1.125rem` |
| CSS-T55 | `line-height` | `1.5` |

**Regression:** Assert `line-height: 1.6` does NOT appear for `.text-body-lg`.

#### CSS-T56 through CSS-T57: `.text-body`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T56 | `font-size` | `1rem` |
| CSS-T57 | `line-height` | `1.5` |

**Regression:** Assert `line-height: 1.6` does NOT appear for `.text-body`.

#### CSS-T58 through CSS-T60: `.text-body-sm`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T58 | `font-size` | `0.875rem` |
| CSS-T59 | `letter-spacing` | `0.005em` |
| CSS-T60 | `line-height` | `1.45` |

**Regression:** Assert `line-height: 1.5` does NOT appear for `.text-body-sm`. Assert letter-spacing is now present (was absent).

#### CSS-T61 through CSS-T63: `.text-caption`

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T61 | `font-size` | `0.75rem` |
| CSS-T62 | `letter-spacing` | `0.06em` |
| CSS-T63 | `line-height` | `1.35` |

**Regression:** Assert `line-height: 1.5` does NOT appear for `.text-caption`. Assert letter-spacing is now present (was absent).

#### CSS-T64 through CSS-T65: `.text-stat` (new class)

| Test ID | Property | Expected Value |
|---|---|---|
| CSS-T64 | `.text-stat` class is present in `@layer utilities` | class exists |
| CSS-T65 | `.text-stat` properties | `font-weight: 700`, `letter-spacing: -0.01em`, `line-height: 1.0`, `font-variant-numeric: tabular-nums` |

**Assert:** All four properties are present. `.text-stat` does NOT declare a `font-size` property.

---

### CSS-T66 through CSS-T67: Tabular Figures Global Rule

**Setup:** Read `app/globals.css`.

| Test ID | Assertion |
|---|---|
| CSS-T66 | The `@layer base { }` block contains a `td, th` rule with `font-variant-numeric: tabular-nums` |
| CSS-T67 | The rule covers both `td` and `th` — not just one of them |

---

### CSS-T68 through CSS-T77: shadcn/ui Alias Updates

**Setup:** Read `app/globals.css`.

**Assert that the following shadcn/ui aliases in `:root` use `var()` references, not hex literals:**

| Test ID | Property | Expected Value (must be `var()` reference) |
|---|---|---|
| CSS-T68 | `--background` | `var(--canvas)` |
| CSS-T69 | `--foreground` | `var(--text-primary)` |
| CSS-T70 | `--card` | `var(--surface)` |
| CSS-T71 | `--card-foreground` | `var(--text-primary)` |
| CSS-T72 | `--popover` | `var(--surface)` |
| CSS-T73 | `--popover-foreground` | `var(--text-primary)` |
| CSS-T74 | `--primary` | `var(--accent-green)` |
| CSS-T75 | `--accent` | `var(--accent-green)` |
| CSS-T76 | `--ring` | `var(--accent-green)` |
| CSS-T77 | `--gold` | `var(--accent-gold)` |

**Additional assertions:**
- `--muted-foreground` is NOT changed; it must still equal `#6B6560` (NOT `#4A4540`)
- `--loss` is NOT changed; it must still equal `#C4402F`
- `--destructive` is NOT changed; it must still equal `#B91C1C`

---

### CSS-T78: Single Source of Truth — No Duplicate Hex Values

**Setup:** Read `app/globals.css`.

**Assert:** Each of the 15 named token hex values appears exactly once as a hex literal in the file. Specifically:

- `#FAF8F5` appears exactly once (as value of `--canvas`)
- `#FFFFFF` appears exactly once (as value of `--surface`)
- `#2D5A3D` appears exactly once (as value of `--accent-green`)
- `#1A1A1A` appears exactly once (as value of `--text-primary`)
- `#B8860B` appears exactly once (as value of `--accent-gold`)
- `#E8E4E0` appears exactly once (as value of `--border`)

**How to verify:** Search for each hex value in the full file. If a value appears more than once (e.g., `#2D5A3D` appears as both `--accent-green: #2D5A3D` and `--primary: #2D5A3D`), the single-source rule is violated. After the alias update, `--primary` should read `var(--accent-green)`, eliminating the duplicate.

---

### CSS-T79: No Red/Purple Pairings — accent-warm Tone Verification

**Setup:** Read `app/globals.css`.

**Assert:**
- `--accent-warm` value is `#C45D3E` (rust/terra cotta hue, NOT a true red)
- No property in `:root` contains a true red value in the hue range 0-10 degrees that would be used alongside any purple value
- Specifically: neither `#FF0000`, `#FF3333`, `#DC2626`, `#EF4444`, nor any similar saturated red (hue 0-15, saturation >80%) appears as a named HML semantic token
- `--destructive: #B91C1C` and `--loss: #C4402F` are present but confirmed to be shadcn/ui internal aliases, not HML semantic tokens used in components

---

### CSS-T80: No Dark Mode Blocks

**Setup:** Read `app/globals.css`.

**Assert:**
- No `@media (prefers-color-scheme: dark)` block exists anywhere in the file
- No `.dark` class selector block exists anywhere in the file

---

### CSS-T81: No New npm Packages

**Setup:** Read `package.json`.

**Assert:** The set of dependencies and devDependencies in `package.json` is identical to pre-story state. No new packages were added. The story is achievable with Tailwind v4 `@theme inline` mechanism alone.

---

### CSS-T82: Typography Classes in `@layer utilities`, Not on HTML Selectors

**Setup:** Read `app/globals.css`.

**Assert:**
- The string `h1 {` does NOT appear in `@layer base`
- The string `h2 {` does NOT appear in `@layer base`
- The string `h3 {` does NOT appear in `@layer base`
- No `font-size`, `font-weight`, or `letter-spacing` property appears inside a rule targeting bare HTML heading elements (`h1`, `h2`, `h3`, `h4`) in `@layer base`
- All typography property definitions exist only inside `@layer utilities` under the `.text-*` class selectors

---

## E2E Tests (FE-T*) — Playwright Computed Style Verification

**Prerequisites:** Next.js dev server running against the real codebase. No mock CSS, no mock server. Tests navigate to the application's real home page (or any page that renders the HTML shell, even if the page content is minimal) and use `page.evaluate()` to read computed styles from `document.documentElement` or rendered elements.

---

### FE-T01 through FE-T09: Computed Color Token Values

**Setup:** Launch Playwright. Navigate to `/` (root page). Verify HTTP 200.

For each token, assert that `getComputedStyle(document.documentElement).getPropertyValue('--<token-name>').trim()` returns the expected hex value:

| Test ID | CSS Custom Property | Expected Computed Value |
|---|---|---|
| FE-T01 | `--canvas` | `#FAF8F5` (or normalized form) |
| FE-T02 | `--surface` | `#FFFFFF` |
| FE-T03 | `--text-primary` | `#1A1A1A` |
| FE-T04 | `--text-secondary` | `#4A4540` |
| FE-T05 | `--accent-green` | `#2D5A3D` |
| FE-T06 | `--accent-gold` | `#B8860B` |
| FE-T07 | `--accent-warm` | `#C45D3E` |
| FE-T08 | `--border` | `#E8E4E0` |
| FE-T09 | `--accent-green-light` | `#E8F0EB` |

**Note on computed value normalization:** Browsers may return hex values in lowercase or as `rgb()` notation. The test assertion must normalize both the expected and actual values to a common form (e.g., lowercase hex via conversion, or compare as `rgb()`) before asserting equality. Failing to normalize is a false negative, not a test pass.

---

### FE-T10: Computed tabular-nums on Table Cells

**Setup:** Launch Playwright. Navigate to any page that renders at least one `<table>` with `<td>` or `<th>` elements. If no such page exists in the current implementation, inject a minimal test element: use `page.evaluate()` to create a `<table><tr><td id="test-cell">1234</td></tr></table>` appended to `document.body`, then read its computed style.

**Assert:** `getComputedStyle(tdElement).fontVariantNumeric` equals `"tabular-nums"`.

**Also assert:** Same property on a `<th>` element returns `"tabular-nums"`.

---

### FE-T11: Geist Sans Font Family Loading

**Setup:** Launch Playwright. Navigate to `/`.

**Assert:**
- `getComputedStyle(document.body).fontFamily` contains `"Geist"` or `"GeistSans"` or resolves to Geist as the first font in the stack
- The `<html>` element has a class attribute that includes the Geist font variable class (set by `next/font`; the class name contains `--font-sans` variable)

**Additional assertion:** `getComputedStyle(document.documentElement).getPropertyValue('--font-sans')` is not empty and resolves to a Geist font family string.

---

### FE-T12 through FE-T14: WCAG Contrast — Verified Ratios

These tests verify the three contrast pairs that the UX spec has pre-verified. They are programmatic assertions using computed color values.

**Setup:** Use a WCAG contrast ratio calculation function within the Playwright test context (implement the relative luminance formula from WCAG 2.1 section 1.4.3, or use a utility like `color-contrast` that runs in-browser).

| Test ID | Foreground Token | Background Token | Expected Ratio | Minimum Required |
|---|---|---|---|---|
| FE-T12 | `--text-primary` (`#1A1A1A`) | `--canvas` (`#FAF8F5`) | 14.8:1 | 4.5:1 |
| FE-T13 | `--text-secondary` (`#4A4540`) | `--canvas` (`#FAF8F5`) | 7.2:1 | 4.5:1 |
| FE-T14 | `--accent-green` (`#2D5A3D`) | `--canvas` (`#FAF8F5`) | 6.1:1 | 3:1 (interactive) |

**Assert:** Computed contrast ratio (from computed custom property values, not hardcoded hex) is greater than or equal to the minimum required ratio. Fail with the actual computed ratio in the failure message.

---

### FE-T15 through FE-T16: WCAG Contrast — Developer-Verified Ratios (Automated Lower-Bound Check)

The UX spec flags `--text-tertiary` and `--text-muted` as potentially failing 4.5:1. These automated tests verify that the developer has computed and documented these ratios, and that the tokens are not inadvertently improved or worsened.

| Test ID | Token | Expected Hex | Minimum Required for Usage Context |
|---|---|---|---|
| FE-T15 | `--text-tertiary` (`#7A756F`) | on `#FAF8F5` | Must meet 3:1 (large text); exact body-text usage documented |
| FE-T16 | `--text-muted` (`#9C9590`) | on `#FAF8F5` | Must meet 3:1 for labeled/decorative only |

**Assert:**
- FE-T15: Computed contrast ratio of `#7A756F` on `#FAF8F5` is at least 3:1. (Expected to be approximately 4.3:1 per UX spec estimate — passes 3:1 large text.)
- FE-T16: Compute contrast ratio of `#9C9590` on `#FAF8F5`. Record the actual value. If below 3:1, the test documents this and the developer must confirm `--text-muted` is restricted to decorative/placeholder-only usage.

---

## Manual Developer Verification Tests (MANUAL-T*)

These tests cannot be automated and require developer judgment and documentation.

### MANUAL-T01: Contrast Ratio Documentation for `--text-tertiary`

**Steps:**
1. Use WebAIM Contrast Checker (https://webaim.org/resources/contrastchecker/) with foreground `#7A756F` and background `#FAF8F5`
2. Record the exact contrast ratio
3. Determine whether the ratio meets 4.5:1 (normal body text) or only 3:1 (large/bold text)
4. Open `_work/epic-1/story-1.2/cross-story-context.md` and document: the computed ratio, and the usage restriction (which context sizes `--text-tertiary` may be used in)

**Pass criteria:** `cross-story-context.md` contains the verified ratio for `--text-tertiary` with an explicit usage restriction statement.

### MANUAL-T02: Contrast Ratio Documentation for `--text-muted`

**Steps:**
1. Use WebAIM Contrast Checker with foreground `#9C9590` and background `#FAF8F5`
2. Record the exact contrast ratio
3. Determine whether it passes any WCAG threshold (4.5:1, 3:1, or neither)
4. Document in `cross-story-context.md`: the computed ratio, and the usage restriction (e.g., "decorative and placeholder text only — must not convey information")

**Pass criteria:** `cross-story-context.md` contains the verified ratio for `--text-muted` with an explicit usage restriction statement.

### MANUAL-T03: Tailwind v4 Spacing Class Generation Verification

**Steps:**
1. Create a minimal test HTML element in a dev environment page with class `p-space-4`
2. Inspect the element's computed `padding` in browser DevTools
3. Verify computed padding equals `16px` (1rem at 16px base)
4. If the class `p-space-4` does NOT generate padding (Tailwind did not generate the class), investigate Tailwind v4 `@theme inline` naming convention for spacing tokens and document the correct token key pattern
5. Document the confirmed naming convention in `cross-story-context.md` for Story 1.3

**Pass criteria:** `cross-story-context.md` contains the confirmed Tailwind v4 spacing utility class naming result.

---

## Security and Isolation Tests

Not applicable. This story makes no backend changes, introduces no authentication, no API routes, and no user-facing interactive features. There are no security boundaries to test.

---

## Edge Case Tests

### EDGE-T01: No Circular `var()` References

**Setup:** Read `app/globals.css`.

**Assert:** No property references itself through a chain of `var()` calls. Specifically:
- `--border` is defined as a hex value; `--color-border: var(--border)` references it safely
- No custom property has a value of `var(--same-property-name)` at any level

**How to verify:** For each `var(--X)` usage in `:root`, confirm `--X` is defined as a non-`var()` value (or as `var(--Y)` where Y is different from X). The `--background: var(--canvas)` pattern is safe if `--canvas` is a hex value.

### EDGE-T02: `--border` Not Self-Referencing

**Setup:** Read `app/globals.css`.

The REQS brief flagged a potential self-reference risk: `--border` serves as both a named semantic token and a shadcn/ui alias.

**Assert:**
- `--border` is defined once in `:root` as a hex literal: `#E8E4E0`
- There is no `--border: var(--border)` line anywhere in the file
- `--color-border: var(--border)` in `@theme inline` is valid (references the `:root` hex value)

### EDGE-T03: Typography Class Letter-Spacing Values Are Correct Type

**Setup:** Read `app/globals.css`.

**Assert:** Letter-spacing values use `em` units (not `px` or `rem`):
- `.text-display`: `-0.02em` (not `-0.02px`)
- `.text-h1`: `-0.015em`
- `.text-h2`: `-0.01em`
- `.text-body-sm`: `0.005em`
- `.text-caption`: `0.06em`
- `.text-stat`: `-0.01em`

### EDGE-T04: `.text-stat` Has No `font-size` Declaration

**Setup:** Read `app/globals.css`.

**Assert:** The `.text-stat { }` rule block does NOT contain a `font-size` property. It is a modifier class only. Including a font-size would override the paired size class and break compositions like `text-h2 text-stat`.

### EDGE-T05: `@layer` Block Integrity

**Setup:** Read `app/globals.css`.

**Assert:**
- `@layer base { }` block contains the `td, th` tabular-nums rule and the existing focus/reduced-motion/body rules, and nothing else newly introduced by this story outside those
- `@layer utilities { }` block contains all `.text-*` classes and no HTML element selectors (no `h1`, `h2`, etc.)
- Typography classes are NOT in `@layer base`

---

## PMCP Visual Checklist

This checklist is for the developer to complete by visual inspection in a browser before requesting QA sign-off. It is not automated.

### Color Token Rendering

- [ ] Page background renders as warm off-white (`#FAF8F5`), not pure white or gray
- [ ] Card surfaces render as pure white (`#FFFFFF`), visually distinct from the page background
- [ ] Subtle warm difference between `--canvas` and `--surface` is visible when a card sits on the page background
- [ ] Border between card and background uses `--border` (`#E8E4E0`) — a warm, soft gray, not a cool gray
- [ ] No blue, purple, or cool gray tones appear anywhere in the base palette
- [ ] The forest green (`#2D5A3D`) accent is deep and professional, not a bright or lime green
- [ ] The gold (`#B8860B`) reads as antique/amber gold, not yellow or orange
- [ ] The warm rust (`#C45D3E`) reads as terra cotta/brick, not as a fire-engine red

### Typography Rendering

- [ ] Apply `.text-display` to a heading element in a test page. Verify it renders at minimum 56px on narrow viewports (not 48px as before)
- [ ] Apply `.text-h1` to a heading. Verify tighter letter-spacing (`-0.015em`) gives a slightly more compact look than default
- [ ] Apply `.text-body` and `.text-body-lg` side by side. Verify line heights appear tighter than the old 1.6 (now 1.5) — less airy
- [ ] Apply `.text-caption` to small label text. Verify the increased letter-spacing (`0.06em`) gives a wide, airy label feel appropriate for badges
- [ ] Apply `.text-stat` to a numeric value. Verify bold weight and negative letter-spacing give a compact, high-impact number appearance
- [ ] Apply `.text-stat` combined with `.text-h1` on a number. Verify both classes compose without conflict (size from `.text-h1`, weight/tabular from `.text-stat`)

### tabular-nums Rendering

- [ ] Create a table with numeric values of varying widths (e.g., "7" and "14" and "100"). Verify column alignment is consistent — numbers do not shift horizontally
- [ ] Apply `.text-stat` to a sequence of changing numbers (e.g., score display). Verify layout does not shift as numbers change

### Geist Sans Loading

- [ ] Browser DevTools computed styles on `body` shows Geist or Geist Sans as the resolved font family
- [ ] No fallback system fonts (Arial, Helvetica, sans-serif) are visible in rendered text
- [ ] Geist Sans renders at various weights: confirm 400 (body), 500 (medium), 700 (bold), 900 (black) all render distinctly
- [ ] The "900" weight renders noticeably heavier than 700 — the display heading style carries visual impact

### shadcn/ui Integration Regression

- [ ] Any existing shadcn/ui components (Button, Card, etc.) that exist in the codebase still render correctly after the alias updates
- [ ] No component that previously used `--primary` now renders with an unexpected color (it should still be forest green)
- [ ] Focus ring on interactive elements remains forest green (`#2D5A3D`) — confirm by tabbing to a link or button

### No Dark Mode Rendering

- [ ] In browser DevTools, switch OS to dark mode preference. Verify the page does NOT switch to a dark color scheme. Colors remain light.

---

## What Is NOT Tested

The following are explicitly out of scope for this story's test plan:

1. **Database state.** No database changes in this story. No database assertions anywhere.
2. **API endpoints.** No endpoints added. No HTTP response assertions.
3. **Interactive component states.** Hover, active, focus, disabled states on specific components belong to component stories (1.3+).
4. **Dark mode behavior.** Dark mode is not implemented; testing its absence is covered by CSS-T80.
5. **shadcn/ui primitive component visual appearance.** The alias updates preserve existing hex values via `var()` indirection; visual regression of shadcn primitives is a regression concern handled by the PMCP checklist, not automated tests.
6. **Mobile responsive breakpoints for typography.** The `clamp()` values handle scaling continuously; breakpoint-specific visual testing belongs to layout component stories.
7. **Cross-browser font rendering.** Font rendering differences across browsers are outside WCAG scope and outside this story's acceptance criteria.
8. **The `--loss`, `--destructive`, and `--muted-foreground` shadcn/ui properties.** Explicitly confirmed unchanged by the UXA spec. Their values are not tested for change.
9. **Tailwind utility class generation for color tokens on non-test pages.** Verifying that `bg-canvas`, `text-text-primary`, etc. render correctly is deferred to Story 1.3 where these classes are first applied in actual components. FE-T01 through FE-T09 verify the CSS custom property values that back these classes.
10. **Playwright visual screenshot comparisons.** No baseline screenshots exist; pixel-diff testing is not set up and is inappropriate for a pure CSS token story.
