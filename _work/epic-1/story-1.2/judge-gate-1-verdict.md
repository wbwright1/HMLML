---
## JUDGE Gate 1 Verdict
- **Story**: 1.2 - Press Box Evolved Theme Implementation
- **Verdict**: APPROVED
- **State transition**: qa-plan-complete -> judge-g1-approved
- **Reviewed by**: JUDGE Gate 1
- **Reviewed at**: 2026-03-25
---

# JUDGE Gate 1: Test Plan Review Verdict

## Verdict: APPROVED (with required developer acknowledgements noted)

The test plan is substantively complete and would catch real bugs. I have found no untested AC clause. The plan earns approval with two noted weaknesses that do not rise to the level of rejection but must be tracked.

---

## AC Coverage Audit

### AC-1: 15 color tokens as CSS custom properties

Coverage: CSS-T01 through CSS-T15.

Each of the 15 tokens is mapped to a dedicated test with the exact expected hex value. The assertion text is precise: it checks that the property appears exactly once in the `:root` block, with the correct value, and not in a different block. This is not a grep-and-hope test; the scope condition (must be within `:root`) prevents a false pass if the token were placed in a wrong context.

**Status: COVERED.**

---

### AC-2: All 15 tokens registered in `@theme inline`

Coverage: CSS-T16 through CSS-T29.

That is 14 tests. The token set has 15 entries. The 15th token in the `:root` block is `--border`, which the UXA spec explicitly notes already exists and requires a regression check. The plan handles this correctly: it calls out the regression ("--color-border: var(--border) already existed and must still be present") within the assertion text for CSS-T16 through CSS-T29 rather than as a standalone test ID. This is an acceptable approach. The regression is in the plan and will be checked; the absence of a dedicated test ID for it is a presentational choice, not a coverage gap.

**Status: COVERED.**

---

### AC-2b: 9 spacing tokens registered in `@theme inline`

Coverage: CSS-T30 through CSS-T38.

Each token has a dedicated test asserting the correct rem value and px equivalent. The regression check (existing `--spacing-xs` through `--spacing-4xl` tokens must not be removed) is included in the assertion text. MANUAL-T03 covers the Tailwind v4 class generation behavior, which is the one piece of AC-2b that cannot be verified by static file inspection alone.

**Status: COVERED.**

---

### AC-3: Typography scale (9 classes, correct values)

Coverage: CSS-T39 through CSS-T65 (static), FE-T01 through FE-T09 (Playwright).

**Here is my largest criticism.** FE-T01 through FE-T09 test computed CSS custom property values on the document root. They do NOT test that a `.text-display` class applied to a real DOM element resolves to the correct `font-size`, `letter-spacing`, or `line-height` in a browser. That means the Playwright tier does not independently verify the typography at runtime; it only re-checks the custom property values, which were already verified in CSS-T01 through CSS-T15 by a different mechanism.

The plan defends this choice with a reasonable argument: the story changes are confined to `globals.css`, and static file inspection of `@layer utilities` class property values is the primary mechanism. That argument holds for the property values themselves. But it does not address the one failure mode that static inspection cannot catch: what if the `@layer utilities` block is accidentally suppressed or overridden at a higher specificity, causing the browser-rendered `.text-display` to not apply?

This is a real (if low-probability) failure scenario for a CSS story. The plan's FE tier does not exercise it.

**However**: The PMCP visual checklist explicitly requires the developer to apply each typography class to a test element in a browser and visually confirm rendering. While not automated, this human verification step closes the gap for the current scope. The plan also notes that breakpoint-specific visual testing and cross-browser rendering are out of scope, which is correct.

**Ruling**: The gap is real but the combination of static inspection + PMCP checklist is sufficient for a CSS-only foundation story. This does not rise to an automatic rejection. If the developer skips the PMCP checklist, the gap becomes significant; the verdict is contingent on the developer completing the PMCP section fully.

**Status: COVERED (with PMCP dependency noted).**

---

### AC-4: `font-variant-numeric: tabular-nums` applied globally

Coverage: CSS-T66, CSS-T67 (static), FE-T10 (Playwright).

CSS-T66 and CSS-T67 verify the rule exists in `@layer base` and covers both `td` and `th`. FE-T10 verifies the browser actually applies the computed style to a real table cell, including the fallback of injecting a test element if no table exists on the current page. That injection fallback is good defensive testing.

CSS-T65 verifies `.text-stat` includes `font-variant-numeric: tabular-nums`. The combination is complete.

**Status: COVERED.**

---

### AC-5: Geist Sans loaded via next/font

Coverage: FE-T11.

FE-T11 checks three things: the resolved `fontFamily` on `body` contains Geist, the `<html>` element has the font variable class, and the `--font-sans` CSS custom property is non-empty and resolves to a Geist string. This is the right set of assertions for a `next/font` integration. The plan also correctly identifies AC-5 as already satisfied (no implementation required), and the test exists as a regression guard.

**Status: COVERED.**

---

### AC-6: shadcn/ui default colors overridden with HML brand tokens

Coverage: CSS-T68 through CSS-T77.

Each of the 10 required `var()` references is given a dedicated test. The negative assertions are present: `--muted-foreground` must NOT have been changed from `#6B6560`, `--loss` must remain `#C4402F`, `--destructive` must remain `#B91C1C`. These negatives are important because the plan explicitly protects unchanged properties from inadvertent modification, which is a legitimate bug category for this type of refactor.

One minor note: the plan does not include a test asserting that `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--accent-foreground`, `--destructive-foreground`, `--border`, `--input`, `--sidebar-*` tokens (the full shadcn/ui default set) are not accidentally wiped or changed. However, the AC explicitly defines only the 10 properties listed, and testing beyond the AC is not required. The scope is correct.

**Status: COVERED.**

---

### AC-7: WCAG 2.1 AA contrast ratios verified

Coverage: FE-T12 through FE-T16, MANUAL-T01 through MANUAL-T02.

FE-T12 through FE-T14 programmatically compute contrast ratios from actual computed CSS custom property values (not hardcoded hex), which means the test proves the contrast relationship is real at runtime, not just theoretically correct on paper. That is the correct approach.

FE-T15 and FE-T16 handle the two borderline cases (`--text-tertiary` and `--text-muted`). FE-T15 asserts a 3:1 minimum floor (correct for large text), and FE-T16 documents the actual ratio and requires developer confirmation for sub-3:1 scenarios. MANUAL-T01 and MANUAL-T02 require the developer to compute and document the ratios in `cross-story-context.md`.

The plan correctly flags that `--text-muted` is estimated at approximately 2.8:1 (UXA spec estimate) and handles it with a documentation requirement rather than an automated pass/fail. This is the right call: a token that fails 3:1 is still acceptable for decorative-only usage, and the plan enforces that the developer must document that restriction.

**Status: COVERED.**

---

### BR-1: Single source of truth (no duplicate hex values)

Coverage: CSS-T78.

The test checks 6 specific hex values for uniqueness. These are the 6 hex values that are most likely to appear as duplicates after the shadcn/ui alias refactor (`#FAF8F5`, `#FFFFFF`, `#2D5A3D`, `#1A1A1A`, `#B8860B`, `#E8E4E0`). The other 9 token hex values are new additions with no pre-existing duplicate risk.

One reasonable objection: the test checks only 6 of the 15 token hex values. If a developer accidentally duplicated `#4A4540` (the new `--text-secondary`) by also hardcoding it somewhere else, CSS-T78 would not catch it. However, the 9 tokens not checked (`--surface-muted`, `--border-strong`, `--text-secondary`, `--text-tertiary`, `--text-muted`, `--accent-green-light`, `--accent-gold-light`, `--accent-warm`, `--accent-warm-light`) have no pre-existing shadcn/ui alias that would create a duplicate. The duplicate risk is confined to the 6 values that were previously hardcoded in the shadcn/ui section. The selection is defensible.

**Status: COVERED.**

---

### BR-2: No red/purple pairings

Coverage: CSS-T79.

The test checks that `--accent-warm` is the specific rust value `#C45D3E` and that no true red value (hue 0-15, saturation >80%) appears as a named HML semantic token. It explicitly distinguishes between HML semantic tokens and shadcn/ui internal aliases (`--destructive`, `--loss`).

**Status: COVERED.**

---

### BR-4: No dark mode blocks

Coverage: CSS-T80.

The test checks for both `@media (prefers-color-scheme: dark)` and `.dark` class selectors. Both are the mechanisms through which dark mode could be inadvertently introduced.

**Status: COVERED.**

---

### BR-5: No new npm packages

Coverage: CSS-T81.

Checks `package.json` directly. Correct.

**Status: COVERED.**

---

### BR-6: Typography classes in `@layer utilities`, not on HTML selectors

Coverage: CSS-T82.

The test checks that `h1 {`, `h2 {`, `h3 {` do not appear in `@layer base`, and that no `font-size`, `font-weight`, or `letter-spacing` property appears inside bare heading element rules in `@layer base`. It does not merely check for the absence of these strings globally; it scopes the assertion to the correct layer, which is the right level of precision.

**Status: COVERED.**

---

## Edge Case Coverage

| Edge Case | Test ID | Assessment |
|---|---|---|
| Circular `var()` references | EDGE-T01 | Correctly verifies no self-referencing chains |
| `--border` self-reference risk | EDGE-T02 | Correctly verifies `--border` is hex, not `var(--border)` |
| Letter-spacing unit correctness | EDGE-T03 | Verifies `em` units used, not `px` or `rem` |
| `.text-stat` has no `font-size` | EDGE-T04 | Verifies modifier-only pattern is preserved |
| `@layer` block integrity | EDGE-T05 | Verifies each class type is in the correct layer |

All edge cases are covered. EDGE-T02 specifically addresses the most dangerous potential bug in this story: a `--border: var(--border)` self-reference that would cause the entire border color system to collapse. The plan identifies and tests for this correctly.

---

## Database State Verification

Not applicable. This story makes no database changes. Correctly omitted from the plan.

---

## Authorization / Security Tests

Not applicable. No API endpoints, no authentication boundaries. Correctly omitted.

---

## Data Isolation

Not applicable. CSS-only story with no state mutations.

---

## Test Independence

Each CSS-T* test is self-contained and reads only `app/globals.css`. The FE-T* tests each navigate to the application independently and read computed styles without shared state. No test depends on the output of a prior test. Test independence is satisfied.

---

## PMCP Checklist Coverage

The PMCP visual checklist is present and covers:
- Color token rendering (warm vs. cool tone discrimination, brand colors)
- Typography rendering (each class, composition of `.text-stat + .text-h1`)
- tabular-nums rendering (column alignment verification)
- Geist Sans loading at multiple weights
- shadcn/ui integration regression
- Dark mode non-regression

The PMCP checklist is thorough and includes specific, actionable steps rather than generic "does it look right" items. The `.text-stat` composition test (`text-h2 text-stat`) is particularly valuable.

---

## Second Weakness: FE-T01 Through FE-T09 Redundancy

The Playwright FE-T01 through FE-T09 tests read CSS custom property values from `document.documentElement`. This is the same data verified by CSS-T01 through CSS-T15 via static file inspection. The Playwright tier does provide incremental value: it proves the CSS custom properties actually resolve at browser runtime (catching circular references that static inspection might miss). But it does not verify typography class rendering.

This is a design choice the QA agent documented and defended. The defense is adequate for this story's scope. I disagree with calling FE-T01 through FE-T09 a "Playwright computed-style test" for typography when they are actually computed-style tests for color tokens. The section header in the plan could mislead a future reader. This is a documentation clarity issue, not a coverage gap.

---

## Final Assessment

### What This Plan Gets Right

1. The two-tier strategy (static inspection + Playwright computed styles) is the correct approach for a CSS-only story.
2. Every AC clause has at least one test case. The mapping table in the plan is accurate.
3. Regression tests for unchanged properties (`--muted-foreground`, `--loss`, `--destructive`) are present and specific.
4. The EDGE-T* cases address the real failure modes for this type of CSS refactor.
5. The plan correctly draws the "what is NOT tested" scope boundary and provides justification for each exclusion.
6. Programmatic WCAG contrast assertions (FE-T12 through FE-T14) use computed values from the real browser, not hardcoded hex literals.
7. The manual developer verification tests (MANUAL-T01 through MANUAL-T03) are specific, actionable, and tied to concrete documentation output in `cross-story-context.md`.

### Required Developer Acknowledgements

Before this story is closed as "done," the developer must complete:

1. **PMCP visual checklist** in full. The typography AC coverage partially depends on this human verification step. Skipping it leaves a real gap.
2. **MANUAL-T01 and MANUAL-T02**: Document verified contrast ratios for `--text-tertiary` and `--text-muted` in `cross-story-context.md` with explicit usage restrictions.
3. **MANUAL-T03**: Document confirmed Tailwind v4 spacing utility class naming convention in `cross-story-context.md` for Story 1.3.

These are pre-existing requirements in the plan. I am flagging them explicitly so the developer cannot treat them as optional polish.

---

## Verdict: APPROVED

The plan is adequate. It would catch the real bugs: wrong hex values, missing tokens, circular references, dark mode contamination, HTML element style pollution, and missing tabular-nums. The 98 test cases are justified and specific. The scope boundaries are correct.

Proceed to implementation (DEV phase).
