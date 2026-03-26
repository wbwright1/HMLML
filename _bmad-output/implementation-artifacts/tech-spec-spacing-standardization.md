---
title: 'App-Wide Spacing Standardization'
slug: 'spacing-standardization'
created: '2026-03-26'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16+', 'Tailwind CSS v4', 'React Server Components']
files_to_modify:
  - 'components/page-section.tsx'
  - 'app/layout.tsx'
  - 'app/globals.css'
  - 'app/page.tsx'
  - 'app/records/page.tsx'
  - 'app/records/head-to-head/page.tsx'
  - 'app/records/rivalries/page.tsx'
  - 'app/records/power-rankings/page.tsx'
  - 'app/records/trophies/page.tsx'
  - 'app/teams/page.tsx'
  - 'app/teams/[franchiseSlug]/page.tsx'
  - 'app/teams/[franchiseSlug]/roster/page.tsx'
  - 'app/teams/[franchiseSlug]/drafts/page.tsx'
  - 'app/drafts/page.tsx'
  - 'app/drafts/[seasonYear]/page.tsx'
  - 'app/history/page.tsx'
  - 'app/matchups/page.tsx'
  - 'app/players/page.tsx'
  - 'app/playoffs/[seasonYear]/page.tsx'
  - 'app/seasons/page.tsx'
  - 'app/seasons/[seasonYear]/page.tsx'
  - 'app/seasons/[seasonYear]/week/[week]/page.tsx'
  - 'components/champion-banner.tsx'
code_patterns:
  - 'PageSection component is the canonical section wrapper'
  - '8px base unit spacing grid'
  - 'Tailwind utility classes for all spacing'
test_patterns:
  - 'Visual regression via Playwright screenshots'
  - 'No unit tests needed for CSS-only changes'
---

# Tech-Spec: App-Wide Spacing Standardization

**Created:** 2026-03-26

## Overview

### Problem Statement

The HMLML app has excessive and inconsistent vertical spacing between content sections. The `PageSection` component uses `py-24` (96px) padding, which creates 192px of dead space between stacked sections (e.g., Team Awards to The Sting Report on the hub, or between Records sections). The Champion Banner sits flush against the nav bar with zero breathing room. Additionally, five pages bypass `PageSection` with inconsistent inline spacing (`space-y-8` vs `space-y-12`), and two sets of spacing CSS tokens in `globals.css` are completely unused dead code.

### Solution

Standardize all vertical spacing across the app by: (1) reducing `PageSection` padding to responsive `py-8 md:py-12` (32/48px), (2) tightening header-to-content gaps to `space-y-6` (24px), (3) adding consistent top padding in the layout for nav-to-content breathing room, (4) aligning inline hero section spacing to match the new standard, and (5) removing unused spacing CSS tokens.

### Scope

**In Scope:**
- Update `PageSection` component spacing values
- Update `layout.tsx` main content top padding for nav breathing room
- Align inline hero section spacing on 5 pages to match new standard
- All pages using `PageSection` automatically inherit new spacing
- Fix ChampionBanner internal padding to align with 8px grid
- Remove unused spacing CSS tokens from `globals.css`
- Validate spacing feels cohesive across hub, records, teams, drafts, history, matchups, players, playoffs, and seasons pages

**Out of Scope:**
- Card-internal spacing (padding within cards, award cards, sting cards, etc.)
- Grid gap changes within sections (gap-4, gap-6 stay as-is)
- Component redesigns or layout restructuring
- Horizontal spacing or max-width changes
- Nav or footer spacing changes (beyond the nav-to-content gap)

## Context for Development

### Codebase Patterns

- `PageSection` (`components/page-section.tsx`) is the canonical section wrapper used across all pages. It renders a `<section>` with a label (caption), title (h2), and children.
- All pages use React Server Components (no `"use client"` except the live score poller).
- The layout root (`app/layout.tsx`) wraps content in `max-w-[1200px]` with `px-4 md:px-6 lg:px-8`. The `<main>` tag has `pt-14 md:pt-0` to clear the sticky mobile nav.
- Five pages use inline `<section>` wrappers instead of `PageSection`. Deep investigation revealed these are **hero sections** (back links, FranchiseIdentity, branding gradients) that lack label/title structure and cannot be directly converted to `PageSection`. They need their `py-24` reduced to match but retain their custom markup.
  - `app/teams/[franchiseSlug]/page.tsx`: Hero with branding gradient `style` prop + `space-y-8`
  - `app/teams/[franchiseSlug]/roster/page.tsx`: Hero with back link + FranchiseIdentity, `space-y-8`
  - `app/teams/[franchiseSlug]/drafts/page.tsx`: Hero with back link + FranchiseIdentity + stats summary, `space-y-8`
  - `app/drafts/[seasonYear]/page.tsx`: Has label/title structure but uses `<h1>` (page hero, not subsection), `space-y-8`
  - `app/playoffs/[seasonYear]/page.tsx`: Uses `pb-24 space-y-12` (bottom-only padding), no label/title
- Two unused spacing token sets exist in `globals.css` (lines 81-101): `--spacing-xs` through `--spacing-4xl` and `--spacing-space-1` through `--spacing-space-24`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `components/page-section.tsx` | Primary section wrapper; single source of section spacing |
| `app/layout.tsx` | Root layout with nav-to-content padding |
| `app/globals.css` | Contains unused spacing tokens to remove |
| `app/page.tsx` | Hub page with 15+ PageSection usages across 4 hub variants |
| `components/champion-banner.tsx` | Banner with `py-10 sm:py-14` (off-grid) |
| `app/records/page.tsx` | Example of two stacked PageSections with excessive gap |
| `app/teams/[franchiseSlug]/page.tsx` | Hero section with branding gradient; update spacing only |
| `app/teams/[franchiseSlug]/roster/page.tsx` | Hero section; update spacing only |
| `app/teams/[franchiseSlug]/drafts/page.tsx` | Hero section with stats; update spacing only |
| `app/drafts/[seasonYear]/page.tsx` | Hero section with h1 label/title; update spacing only |
| `app/playoffs/[seasonYear]/page.tsx` | Uses `pb-24`; update to `pb-8 md:pb-12` |

### Technical Decisions

1. **Responsive section padding (`py-8 md:py-12`)**: UX Analyst validated that 48px is generous on mobile. 32px mobile / 48px desktop keeps things tight without cramping. Between-section gaps become 64px mobile / 96px desktop.

2. **Header-to-content gap reduced to `space-y-6` (24px)**: The label+h2 header block is compact; 32px felt disconnected from its content. 24px maintains visual association while still breathing. Falls back to 32px if too tight after visual testing.

3. **Layout-level top padding (`md:pt-8`) instead of per-component margins**: Adding 32px desktop top padding to `<main>` handles both banner and non-banner pages uniformly. No need for `isFirst` props or conditional logic in `PageSection`.

4. **ChampionBanner `sm:py-14` to `sm:py-16`**: 56px is not on the 8px grid; 64px is. Minor alignment fix.

5. **Delete unused spacing tokens**: Both `--spacing-*` token sets are dead code. Tailwind's spacing scale already maps to 8px multiples. Removing avoids confusion.

6. **Align inline hero sections (not convert to PageSection)**: Deep investigation revealed the 5 inline sections are hero sections with custom markup (branding gradients, back links, FranchiseIdentity, h1 titles). They cannot use `PageSection` but should have their `py-24` reduced to `py-8 md:py-12` and `space-y-8` standardized to `space-y-6` for consistency.

## Implementation Plan

### Tasks

- [x] **Task 1: Update `PageSection` component (foundation)**
  - File: `components/page-section.tsx`
  - Action: Change `className="py-24 space-y-12"` to `className="py-8 md:py-12 space-y-6"`
  - Notes: This is the single highest-impact change. All 15+ pages using `PageSection` inherit the new spacing automatically. Must be done first as it establishes the baseline.

- [x] **Task 2: Update layout top padding for nav breathing room**
  - File: `app/layout.tsx`
  - Action: Change `<main>` class from `pt-14 md:pt-0` to `pt-14 md:pt-8`
  - Notes: Mobile `pt-14` (56px) stays unchanged; it clears the `h-14` sticky nav. Desktop gains 32px top padding for breathing room between nav and first content element. This handles both banner and non-banner pages uniformly.

- [x] **Task 3: Fix ChampionBanner 8px grid alignment**
  - File: `components/champion-banner.tsx`
  - Action: Change `py-10 sm:py-14` to `py-10 sm:py-16` in the inner `<div>` gradient container
  - Notes: `sm:py-14` = 56px is not on the 8px grid. `sm:py-16` = 64px is. Mobile `py-10` (40px = 5x8) is already on-grid.

- [x] **Task 4: Remove unused spacing CSS tokens**
  - File: `app/globals.css`
  - Action: Delete the `/* Spacing tokens */` block containing `--spacing-xs` through `--spacing-4xl` AND the `/* 8px-multiple spacing tokens */` block containing `--spacing-space-1` through `--spacing-space-24` (approximately lines 81-101 in the first `:root` block)
  - Notes: Both token sets have zero usage across the codebase. Tailwind classes already express the 8px grid natively. Removing eliminates dead code and avoids confusion.

- [x] **Task 5a: Align franchise detail hero spacing**
  - File: `app/teams/[franchiseSlug]/page.tsx`
  - Action: Change `className="py-24 space-y-8"` to `className="py-8 md:py-12 space-y-6"` on the `<section>` element (approximately line 72)
  - Notes: Keep the inline `style` prop with the branding gradient intact. Only the Tailwind spacing classes change.

- [x] **Task 5b: Align franchise roster hero spacing**
  - File: `app/teams/[franchiseSlug]/roster/page.tsx`
  - Action: Change `className="py-24 space-y-8"` to `className="py-8 md:py-12 space-y-6"` on the `<section>` element (approximately line 141)
  - Notes: Simple class replacement. No other changes needed.

- [x] **Task 5c: Align franchise drafts hero spacing**
  - File: `app/teams/[franchiseSlug]/drafts/page.tsx`
  - Action: Change `className="py-24 space-y-8"` to `className="py-8 md:py-12 space-y-6"` on the `<section>` element (approximately line 76)
  - Notes: Simple class replacement. No other changes needed.

- [x] **Task 5d: Align draft season detail hero spacing**
  - File: `app/drafts/[seasonYear]/page.tsx`
  - Action: Change `className="py-24 space-y-8"` to `className="py-8 md:py-12 space-y-6"` on the `<section>` element (approximately line 55)
  - Notes: This section has a label/title structure using `<h1>` (not `<h2>` like PageSection). Keep the `<h1>` as-is; only change spacing classes.

- [x] **Task 5e: Align playoffs page section spacing**
  - File: `app/playoffs/[seasonYear]/page.tsx`
  - Action: Change all `pb-24` occurrences to `pb-8 md:pb-12`. Change `pb-24 space-y-12` to `pb-8 md:pb-12 space-y-6`.
  - Notes: This page uses bottom-only padding (`pb-*`) instead of vertical (`py-*`). Maintain that pattern but with the reduced values.

- [x] **Task 6: Build verification**
  - Action: Run `npx tsc --noEmit` and `npm run build` to confirm no type errors or build failures
  - Notes: While these are CSS-only changes, the class string modifications could introduce typos. Build verification catches any issues.

- [x] **Task 7: Visual validation across all pages**
  - Action: Navigate all major pages on desktop (1200px+) and mobile (375px) viewports:
    - Hub page (preseason variant is currently active): verify Champion Banner has breathing room from nav, Team Awards to Sting Report gap is tightened
    - Records page (`/records`): verify two stacked PageSections have reduced gap
    - Records sub-pages (`/records/head-to-head`, `/records/rivalries`, `/records/power-rankings`, `/records/trophies`)
    - Teams index (`/teams`) and franchise detail (`/teams/[slug]`, `/teams/[slug]/roster`, `/teams/[slug]/drafts`)
    - Drafts index (`/drafts`) and season detail (`/drafts/[year]`)
    - History (`/history`), Matchups (`/matchups`), Players (`/players`)
    - Seasons (`/seasons`, `/seasons/[year]`, `/seasons/[year]/week/[week]`)
    - Playoffs (`/playoffs/[year]`)
  - Notes: Focus on: (1) no content clipping or overlap, (2) consistent spacing between sections, (3) mobile card layouts still work, (4) banners have appropriate breathing room from nav

### Acceptance Criteria

- [ ] **AC1:** Given any page with stacked `PageSection` components, when viewed on desktop, then the vertical gap between sections is ~96px (48px bottom + 48px top). And on mobile the gap is ~64px (32px + 32px).

- [ ] **AC2:** Given any page (with or without a banner), when viewed on desktop, then there is 32px of space between the nav bar bottom and the first content element. And on mobile the existing 56px nav clearance is preserved.

- [ ] **AC3:** Given any `PageSection` with a label and title, when rendered, then the gap between the title and the section content is 24px (not 48px).

- [ ] **AC4:** Given the ChampionBanner component, when rendered on sm+ screens, then the vertical padding is 64px (on the 8px grid), not 56px.

- [ ] **AC5:** Given any page with an inline `<section>` hero wrapper, when inspected, then the section uses `py-8 md:py-12` (not `py-24`) and `space-y-6` (not `space-y-8` or `space-y-12`). And no `py-24` class appears on any section element across the entire app.

- [ ] **AC6:** Given `globals.css`, when inspected, then no `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`, `--spacing-2xl`, `--spacing-3xl`, `--spacing-4xl`, or `--spacing-space-*` custom properties exist.

- [ ] **AC7:** Given the full app, when navigating all major pages on both desktop and mobile viewports, then no content is clipped, overlapping, or visually broken. And the spacing feels cohesive and tighter across all pages compared to before.

- [ ] **AC8:** Given the app codebase, when running `npx tsc --noEmit`, then no type errors are reported. And when running `npm run build`, the build succeeds.

## Additional Context

### Dependencies

- No external dependencies. All changes are CSS/Tailwind class modifications.
- No database, API, or runtime changes.
- Tasks 1-4 are independent and can be done in parallel. Tasks 5a-5e depend on establishing the pattern in Task 1 but are independent of each other. Tasks 6-7 depend on all prior tasks being complete.

### Testing Strategy

- **Build verification (Task 6):** Run TypeScript compiler and Next.js build to catch typos or broken class strings.
- **Manual visual review (Task 7):** Navigate all pages on desktop (1200px+) and mobile (375px) viewports. Focus on hub, records, and franchise detail pages where the spacing issues were most noticeable.
- **Playwright smoke tests:** Run existing E2E suite (`npx playwright test`) to catch any layout regressions in automated flows.
- **Grep verification for AC5/AC6:** Run `grep -r "py-24" --include="*.tsx" app/ components/` to confirm no `py-24` remains on section elements. Run `grep "spacing-" app/globals.css` to confirm tokens are removed.
- **No unit tests needed:** These are pure CSS class changes with no logic, state, or data flow changes.

### Notes

- The UX Analyst recommended `space-y-6` (24px) for header-to-content but noted 32px (`space-y-8`) is the fallback if 24px feels too tight after visual testing. This may require a follow-up tweak after Task 7 validation.
- Mobile `<main>` padding (`pt-14` = 56px) currently clears the `h-14` sticky nav exactly. If the nav height changes in the future, this value needs to update in sync.
- All spacing values (32px, 48px, 64px, 96px) are on the 8px grid as required by the design spec.
- The total effective change count is low (8 files modified directly, 15+ pages inherit via PageSection), making this a safe, high-impact polish pass.
- ChampionBanner was adjusted to `sm:py-12` (48px) instead of `sm:py-16` (64px) after adversarial review found the increase was directionally inconsistent with the tightening goal.

## Review Notes

- Adversarial review completed
- Findings: 6 total, 3 fixed (F1, F3, F6), 3 acknowledged (F2 design call, F4 intentional, F5 noise)
- Resolution approach: auto-fix with parallel agents
- F1 (High): 6 missed pages with `pb-24` fixed across seasons, history, records, matchups
- F3 (Medium): ChampionBanner changed to `sm:py-12` (reduce, not increase) for directional consistency
- F6 (Low): Stale QA test plan updated to reflect intentional token removal
