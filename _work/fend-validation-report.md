# FEND Validation Report — UX Polish Initiative
**Reviewer:** FEND (Frontend Developer)
**Date:** 2026-03-25
**Scope:** All 6 epics — 20 files reviewed

---

## 1. Summary

**Overall: CONDITIONAL PASS**

| Severity | Count |
|---|---|
| HIGH (crash risk / a11y blocker) | 2 |
| MEDIUM (quality / correctness defect) | 5 |
| LOW (polish / cleanup) | 4 |
| INFO (pre-existing, not introduced by this work) | 1 |

The implementation is largely solid. Design token compliance is excellent — zero hardcoded hex values in app or component files (with one justified rgba exception). Tailwind migration is complete. Accessibility patterns are well-executed across all new components. Two issues require fixes before shipping: unguarded async calls on the homepage that will throw an unhandled exception when the DB is unavailable, and a meaningless conditional in the standings mobile card view.

---

## 2. Component Findings

### `components/superlative-badge.tsx` — PASS
- Inline-to-Tailwind migration is complete and correct.
- `variantClasses` record is clean; fallback to `neutral` via nullish coalescing is correct.
- `text-caption uppercase tracking-wide font-medium` matches design system conventions.
- All five variants (`gold`, `silver`, `green`, `neutral`, `brown`) align with `getPlayoffBadgeVariant` enum — no variant mismatch.
- No TypeScript issues. No dead code.

### `components/live-indicator.tsx` — PASS
- Brand color alignment to `bg-primary` / `text-primary` is correct (was previously hardcoded green).
- `aria-label="Live"` on the outer span and `aria-hidden="true"` on the decorative dot are correct.
- `motion-safe:animate-ping` properly respects `prefers-reduced-motion`. Note: globals.css also forces zero animation duration for `prefers-reduced-motion` at the `*` level — the `motion-safe:` guard is therefore redundant but harmless and is the more semantically correct approach.

### `components/franchise-logo.tsx` — PASS
- Fallback color fix is correct: `brandingColor ?? "var(--muted-foreground)"` replaces what was apparently a hardcoded value.
- `decorative` prop controls `alt=""` vs. `alt={name}` correctly.
- `aria-hidden="true"` on the fallback div is appropriate since it is behind the `<Image>`.
- **LOW:** The `style={{ width: px, height: px }}` inline style for sizing is legitimately necessary (dynamic values), but note `shrink-0` is applied on the wrapper, not enforced by container context — callers must not constrain this element or the logo will clip. Acceptable for the current usage patterns.

### `components/franchise-identity.tsx` — PASS
- `coOwnerName` prop is correctly typed as `string | undefined` and rendered safely.
- All three variants (`compact`, `standard`, `hero`) render co-owner display consistently with `{ownerName} & {coOwnerName}` pattern.
- `compact` variant uses `decorative` on `FranchiseLogo`, which is correct since the franchise name text provides the accessible label.
- `standard` variant also passes `decorative` to the logo — correct, the name span beside it is the label.
- `hero` variant does NOT pass `decorative` — logo gets `alt={name}`. This is intentional and correct since the h1 text is the heading, not a label for the image. Minor concern: both the h1 and the image alt now say the same franchise name, which causes screen readers to announce the name twice. Consider passing `decorative` in `hero` variant as well.

  **LOW (a11y):** In `hero` variant, `FranchiseLogo` is not passed `decorative`, causing the franchise name to be announced by both the image alt text and the `<h1>` immediately below it. Impact is minor (not a failure) but redundant SR verbosity.

### `components/h2h-hero.tsx` — PASS
- Hex values fully eliminated. `text-primary` and `text-loss` tokens used correctly.
- `srText` hidden div provides a complete accessible description of the record.
- `aria-hidden="true"` on the visual record display is correct since `srText` covers it.
- The `leader` detection logic is correct — `leader` is set to `teamA.name` or `teamB.name`, and the `srText` construction re-derives which team leads from `leader`'s value. The logic is correct but unnecessarily convoluted; acceptable.
- `streak` renders via `SuperlativeBadge variant="green"` — consistent with the design system.

### `components/matchup-row.tsx` — PASS
- Team color accent bars use `backgroundColor: homeTeam.franchiseBrandingColor ?? "var(--border)"` — CSS var fallback is correct.
- `aria-hidden="true"` on both accent bars is correct.
- `role="group"` with `aria-label` constructed from team names and scores is solid WCAG 2.1 AA practice.
- `homeWins` / `awayWins` logic correctly uses `variant === "final"` guard.
- `preview` variant hides scores — correct. Center divider shows "vs" for preview, `LiveIndicator` for live, "Final" for complete.
- `overflow-hidden` on the card wrapper prevents the accent bars from bleeding outside the rounded border.

### `components/championship-stars.tsx` — PASS with note
- SVG star path is correct. `aria-label` and `role="img"` on the wrapper make the component screen-reader accessible.
- `aria-hidden="true"` on individual `StarIcon` instances is appropriate since the wrapper communicates the full count.
- Returns `null` for `count <= 0` — correct guard.
- **LOW:** The `shadow` prop in `StarIcon` uses `rgba(184, 134, 11, 0.3)` — this is a hardcoded RGBA derivation of `--gold` (#B8860B). Not a CSS variable usage. While technically acceptable for a `drop-shadow` filter (CSS variables cannot be used directly in SVG filter strings in all browsers), this is an inconsistency worth noting. The color value is semantically correct (matches --gold exactly) but is a maintenance coupling risk.

  **MEDIUM (token coupling):** `rgba(184, 134, 11, 0.3)` in `championship-stars.tsx` is a hardcoded derivation of `--gold`. If the gold token changes, this shadow will drift. Document or replace with a named CSS custom property for the shadow value.

### `components/season-selector.tsx` — PASS
- `role="tablist"` / `role="tab"` / `aria-selected` pattern is correct.
- Arrow key navigation is implemented correctly with wrap-around.
- `tabIndex` management (active = 0, inactive = -1) follows roving tabindex pattern correctly.
- Auto-scroll to active tab on `activeSeason` change via `useEffect` is correct.
- Fade indicators via `pointer-events-none` gradient overlays are a clean UX pattern.
- `scrollbar-thin` utility class usage is fine if the project has a scrollbar plugin; if not, it is a no-op (not a bug).
- `px-6` padding on the tablist provides buffer before the fade indicators.

### `components/empty-state.tsx` — PASS
- All 6 icon keys (`calendar`, `users`, `search`, `alert`, `trophy`, `chart`) are valid Lucide imports.
- `icon` prop is typed as `keyof typeof iconMap` — type-safe.
- `actionLabel` / `actionHref` are both required to render the action link (guarded by `&&`) — no partial render bug.
- `aria-hidden="true"` on the icon is correct since the title text is the accessible label.
- `max-w-[400px] mx-auto` caps width and centers the empty state — appropriate.
- `py-16` provides generous vertical breathing room.
- **LOW:** `EmptyState` does not expose a `role` prop. In some usages (e.g. inside a `<table>` rendering context) this could cause HTML validation issues. Current usages all appear to be outside table elements, so not a bug today, but worth noting for future extensibility.

---

## 3. Page Findings

### `app/page.tsx` — FAIL (HIGH severity)

**Issue 1 (HIGH) — Unguarded async calls outside try/catch:**
```
// Lines 32–42: THREE awaited DB calls outside the try/catch block
const superlatives = latestSeason
  ? await getHomepageSuperlatives(latestSeason.id)
  : null;
const lastWeekResults = isInSeason && matchupData
  ? await getLastWeekResults(latestSeason!.id, matchupData.week)
  : null;
const leagueGlance = !isInSeason ? await getLeagueAtAGlance() : null;
```
If the database is unavailable (development, staging cold start, or transient failure), `latestSeason` will be `null` (caught by try/catch), but `leagueGlance = !isInSeason ? await getLeagueAtAGlance() : null` will still execute because `!isInSeason` is `true` when `latestSeason` is null (`latestSeason?.status === "in_season"` → `undefined === "in_season"` → `false`). This will throw an unhandled exception and crash the page render. The try/catch on lines 18–29 does not protect lines 32–42.

**Fix:** Move all three calls inside the try/catch block or wrap each in their own try/catch.

**Issue 2 (MEDIUM) — Dead conditional in mobile standings card:**
Line 325: `className={isLeader ? "font-bold" : "font-bold"}` — both branches are identical. The wins value is always `font-bold` regardless of `isLeader`. This is either a copy-paste error (the non-leader branch should be `font-normal`) or the conditional is dead and should be removed.

**Issue 3 (MEDIUM) — Hero section inline rgba color:**
Line 52: `style={{ backgroundColor: "rgba(45, 90, 61, 0.04)" }}` — this is a hardcoded RGBA derivation of `--primary` (#2D5A3D). Should be replaced with `bg-primary/[0.04]` Tailwind utility or `var(--primary)` with opacity.

**Other observations:**
- Hero section renders gracefully with no data — `latestSeason && matchupData` guards are correct.
- Standings leader detection `i === 0` is correct.
- `ScorePoller` placement after the matchup list is correct.
- All `EmptyState` usages are appropriate.
- Desktop table `borderLeft` inline style on `<tr>` is justified (dynamic branding color).

### `app/teams/page.tsx` — PASS with note

- `EmptyState` with `icon="users"` used correctly for the loading state.
- `FranchiseIdentity` receives `coOwnerName={franchise.coOwnerName}` — correct.
- `borderTopWidth: "3px", borderTopColor: franchise.brandingColor ?? "var(--border)"` — CSS var fallback correct, dynamic value justifies inline style.
- `hover:border-primary/40` on franchise cards is a nice interactive cue.
- **INFO (pre-existing):** Page metadata title reads "Harambe Memorial League Memorial League" — "Memorial League" is duplicated. This is a systemic naming issue present in `layout.tsx` and every page across the app. It predates this UX Polish work. Flagged here for awareness but not attributed to this initiative.

### `app/teams/[franchiseSlug]/page.tsx` — PASS

- Hero gradient `linear-gradient(to bottom, ${franchise.brandingColor}0F, transparent 60%)` — `0F` hex alpha (≈6% opacity) is a clever inline hex-alpha trick. It is technically a CSS string construction using a dynamic brand color rather than a hardcoded hex, so it is not a design token violation. This is the correct pattern for dynamic-color gradients.
- `coOwnerName={currentCoOwner ?? undefined}` is correctly passed to `FranchiseIdentity`.
- Co-owner display in season history rows uses `{season.coOwnerDisplayName ? \` & ${season.coOwnerDisplayName}\` : ""}` — consistent with other pages.
- `notFound()` guard for missing franchise is correct.
- **MEDIUM:** `getSeasonStandings` and other dependent calls from `[franchiseSlug]/page.tsx` are NOT included in the try/catch but are only executed when `franchise` is not null. However, these aren't called at all in this page — the query used is `getFranchiseBySlug` which returns embedded season history. No issue.
- Season detail table shows `standingsFinish` position numbers which are conditionally styled with `text-gold` for top-3 finishers — this is carried from the season detail page pattern, not this page, but the season history cards here just render the `PlayoffBadge`. Looks correct.

### `app/seasons/page.tsx` — PASS

- `EmptyState icon="calendar"` for zero-seasons state is correct.
- `SuperlativeBadge text="Complete" variant="green"` for complete seasons — consistent.
- **MEDIUM:** Status badges for `in_season` and `pre_draft` at lines 84–93 are rendered as hand-coded `<span>` elements with inline-equivalent Tailwind classes, rather than using `SuperlativeBadge`. The `Complete` status (line 82) correctly uses `SuperlativeBadge`. This inconsistency means `in_season` and `pre_draft` styles could diverge from the badge system in future. Should use `SuperlativeBadge` throughout or not at all for status badges on this page.

### `app/seasons/[seasonYear]/page.tsx` — PASS

- Champion card with `border-gold/30 bg-gold/5` is correct token usage.
- `ChampionshipStars count={1} variant="hero"` inside the champion card is correct.
- Standings top-3 rank numbers styled `text-gold` — correct token usage.
- Standings border-left accent `borderLeft: \`3px solid ${entry.franchiseBrandingColor ?? "var(--border)"}\`` — CSS var fallback correct.
- **MEDIUM:** Season detail standings table does NOT display `coOwnerDisplayName`. The desktop table cell at line 178 renders `entry.ownerDisplayName` only, without co-owner. The mobile card at line 265 also renders `entry.ownerDisplayName` only. By contrast, `app/page.tsx` (homepage standings) and `app/teams/page.tsx` both render co-owner. This is an inconsistency — the season detail page is the logical place to show co-owners.
- `PlayoffBadge` local helper (lines 355–365) returns a `<span>` with "—" text when no result, rather than `null`. This is correct for table cell contexts where an empty cell would render oddly.
- Week-by-week grid uses `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9` — clean responsive progression, no overflow risk.

### `app/records/head-to-head/page.tsx` — PASS

- Hex values eliminated; `text-primary` and `text-loss` tokens used for win/loss coloring in game log.
- Two `EmptyState` instances are correctly differentiated: `icon="users"` for no franchise data, `icon="search"` for no selection.
- `aria-label` on the total points comparison div is thorough.
- `bothSelected && record &&` guard before rendering `H2HHero` is correct null safety.

### `app/records/head-to-head/franchise-selector.tsx` — CONDITIONAL PASS

- CSS variables used throughout (`var(--border)`, `var(--foreground)`, `var(--muted-foreground)`, `var(--primary)`, `var(--primary-foreground)`, `var(--muted)`) — CSS var migration is complete.
- `<label htmlFor>` elements are correctly associated with both selects.
- **MEDIUM (a11y):** Both `<select>` elements and the position filter `<button>` elements in `player-table.tsx` use inline `style` objects extensively when equivalent Tailwind classes are available. In `franchise-selector.tsx`, the select wrapper `div` uses `style={{ position: "relative", display: "inline-block", flex: 1 }}`. The `flex: 1` value cannot be expressed as a Tailwind class without a custom value, so the style is partially justified — but `position: "relative"` and `display: "inline-block"` could be `relative inline-block` Tailwind classes. The mixed pattern is inconsistent with the rest of the codebase's Tailwind-first approach.
- The custom SVG chevron for the select is a clean cross-browser approach; `aria-hidden="true"` is correct.
- Focus styles: the `<select>` has `outline: "none"` in its inline style, which removes the browser default focus ring. There is no compensating `focus-visible` style. This is an **accessibility failure for keyboard navigation** — users tabbing to the select dropdown will see no focus indicator on the select element itself.

  **HIGH (a11y) — Keyboard focus ring missing on `<select>` elements:** `outline: "none"` at lines 83 and 161 (franchise-selector.tsx) and line 349 (`player-table.tsx` roster select) removes the browser focus ring with no replacement. This violates WCAG 2.1 AA 2.4.7 (Focus Visible). The global `:focus-visible` rule in `globals.css` targets standard elements and may be overridden by the inline style. Fix: remove `outline: "none"` from the inline styles and add `focus-visible:ring-2 focus-visible:ring-ring` via Tailwind, or apply `className` with focus styles and remove the `outline` from inline.

### `app/records/trophies/page.tsx` — PASS

- `border-gold/30 bg-gold/5` on the reigning champion featured card — correct token usage, consistent with season detail page.
- `ChampionshipStars` used for both all-time leaders and the featured champion card — visually consistent.
- `SuperlativeBadge variant="gold"` for champion badges — correct.
- Empty state uses inline card pattern (`rounded-xl border border-border bg-card p-8 text-center`) rather than `EmptyState` component — inconsistent with other pages that use `EmptyState`. Not a bug, but a missed opportunity for component consistency.
- Trophy history correctly distinguishes champion (primary-tinted) from no-champion (neutral border) rows.

### `app/records/power-rankings/page.tsx` — PASS

- `flex-wrap` added to the stats row (`flex flex-wrap items-center gap-4`) — fixes the reported flex-wrap issue.
- Negative points differential correctly uses `text-muted-foreground` rather than `text-loss`. While `text-loss` might be more semantically appropriate for a negative differential, the current choice is valid — negative point diff is not the same as a loss record.
- Empty state uses inline card pattern rather than `EmptyState` component — same inconsistency as trophies page.
- Gold rank styling for top-3 (`text-gold`) is correct.

### `app/players/player-table.tsx` — PASS with concerns

- `EmptyState icon="search"` for filtered empty state — correct.
- CSS variables used throughout inline styles (not raw hex).
- `aria-sort` on `SortHeader` is correctly set to `"ascending"` / `"descending"` / `"none"`.
- `role="button"` + `tabIndex={0}` + `onKeyDown` on `<th>` elements provides keyboard-accessible sort — correct implementation.
- `role="radiogroup"` / `role="radio"` / `aria-checked` on position filter pills — correct ARIA pattern.
- **MEDIUM (a11y):** The search input at line 283 has `outline: "none"` in its inline style, removing the focus ring. Same issue as the select elements — no compensating focus-visible style. Applies to the roster `<select>` at line 349 as well.
- Position filter `<button>` elements have no `focus-visible` ring (they use inline style for active/inactive states with no focus handling). Since these are `<button>` elements (not custom divs), the browser default focus ring may appear unless the inline style suppresses it — but the explicit `border: "none"` could interfere in some browsers.
- `StatusIndicator` uses `text-orange-400 bg-orange-500/15` and `text-amber-400 bg-amber-500/15` — these are raw Tailwind color utilities, not design tokens. Pre-existing pattern from before this initiative; not a regression introduced by this work.

---

## 4. Accessibility Audit

### Passing Items
- `LiveIndicator`: `aria-label="Live"`, animated dot `aria-hidden="true"` — correct.
- `ChampionshipStars`: `role="img"` + `aria-label="{n} championship(s)"`, individual stars `aria-hidden="true"` — correct.
- `MatchupRow`: `role="group"` + descriptive `aria-label` with team names and scores — correct.
- `H2HHero`: Full `sr-only` text summary with `aria-hidden` on visual display — excellent pattern.
- `SeasonSelector`: Full roving tabindex keyboard navigation with arrow-key support — correct.
- `SortHeader` (`player-table.tsx`): `aria-sort` attribute, keyboard Enter/Space handling — correct.
- `EmptyState`: Icon `aria-hidden="true"`, meaningful title and description text — correct.
- `FranchiseSelectorSelector`: `<label>` elements correctly associated with selects via `htmlFor`.
- `globals.css`: `:focus-visible` global rule provides 2px solid primary outline — correct baseline.

### Failing Items

**[HIGH-A1] Missing focus ring on `<select>` and `<input>` elements in `franchise-selector.tsx` and `player-table.tsx`**

The inline `style` objects in these "use client" components apply `outline: "none"` which overrides the global `:focus-visible` rule in `globals.css`. This removes the visible focus indicator for keyboard users on:
- `franchise-selector.tsx` lines 83 and 161: both `<select>` elements
- `player-table.tsx` line 283: search `<input>`
- `player-table.tsx` line 349: roster `<select>`

WCAG 2.1 SC 2.4.7 (Focus Visible) — Level AA.

**Fix for each:** Remove `outline: "none"` from the inline style. Add `className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"` or rely on the global `:focus-visible` rule by simply not suppressing outline.

**[LOW-A2] Redundant franchise name announcement in `FranchiseIdentity` hero variant**

In the `hero` variant, `FranchiseLogo` is rendered without `decorative={true}`, so the image has `alt={name}`. Immediately below is `<h1 className="text-h1 font-bold">{franchise.name}</h1>`. Screen readers will announce the franchise name twice in quick succession. Not a WCAG failure, but degrades screen reader experience. Fix: pass `decorative` in hero variant.

**[INFO-A3] Color as sole indicator for win/loss in standings scores**

In `MatchupRow`, winning team score is `text-foreground font-bold` and losing team is `text-muted-foreground font-normal`. Color is not the sole indicator here — font weight also differentiates. This is WCAG compliant.

In `H2HHero` record display, the winning side number is `text-primary` and losing side is `text-loss`. The aria-hidden guard with `sr-only` text coverage means this is compliant.

---

## 5. Responsive Design Assessment

### Passing
- `MatchupRow`: No mobile/desktop split needed — single layout works at all sizes. `overflow-hidden` on the card prevents accent bar bleed.
- `FranchiseIdentity`: All three variants use `flex` with `min-w-0` + `truncate` for name overflow — correct mobile text handling.
- `SeasonSelector`: `overflow-x-auto` + `flex-nowrap` + `scroll-smooth` — horizontal scroll works at mobile with fade indicators.
- `app/page.tsx` standings: Full desktop table hidden on mobile (`hidden md:block`), mobile card view shown on mobile (`md:hidden`) — breakpoint is consistent.
- `app/seasons/[seasonYear]/page.tsx` standings: Same `hidden md:block` / `md:hidden` pattern — consistent with homepage.
- `app/teams/page.tsx`: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` — correct mobile-first grid.
- `H2HHero`: `flex-col md:flex-row` — stacks vertically on mobile, side-by-side on desktop.
- Power rankings: `flex-wrap items-center gap-4` fix addresses the reported overflow issue.
- Week-by-week grid: `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9` — no overflow risk.

### Concerns
- **LOW:** `FranchisePairSelector` uses `style={{ display: "inline-block", flex: 1 }}` on the wrapper divs. Mixing `display: inline-block` with `flex: 1` inside a flex parent is technically valid but unusual — `flex: 1` on an `inline-block` element works because the browser promotes it to `block` inside a flex container. The intent is clear but the style is semantically redundant. This does not cause visual breakage.
- **LOW:** `player-table.tsx` desktop table is `hidden md:block` and mobile cards are `md:hidden`. At exactly 768px (Tailwind `md` breakpoint), both switch simultaneously — correct and consistent with other pages.

---

## 6. Design Token Compliance

### Summary: NEAR-COMPLETE

| Check | Result |
|---|---|
| Hardcoded hex values in components | 0 found |
| Hardcoded hex values in app pages | 0 found |
| `--loss` token used for loss/negative color | Correct — `text-loss` in h2h-hero, h2h page game log |
| `--gold` token used for championship/trophy | Correct — `text-gold`, `bg-gold/5`, `border-gold/30` throughout |
| CSS var fallbacks for dynamic brand colors | Correct — `?? "var(--border)"` or `?? "var(--muted-foreground)"` |
| `--primary` for brand green | Correct throughout |

### Known Token Deviations

**[MEDIUM-T1] `rgba(184, 134, 11, 0.3)` in `championship-stars.tsx` line 13**
The `drop-shadow` filter value hard-codes the numeric RGB values of `--gold` (#B8860B = rgb(184, 134, 11)). This is technically unavoidable in a CSS `filter: drop-shadow()` string because CSS variables cannot be interpolated inside `drop-shadow()` in standard CSS. The value is semantically correct. Recommendation: add a comment `/* --gold at 30% opacity */` so future maintainers know to update this if the gold token changes. Alternatively, define `--gold-shadow` as a complete filter string in globals.css.

**[MEDIUM-T2] `rgba(45, 90, 61, 0.04)` in `app/page.tsx` line 52**
The hero section background uses `style={{ backgroundColor: "rgba(45, 90, 61, 0.04)" }}` — a hardcoded RGBA version of `--primary` (#2D5A3D) at 4% opacity. This can be replaced with the Tailwind class `bg-primary/[0.04]` or, since Tailwind doesn't support arbitrary opacity with semantic color tokens in all configurations, `className="bg-primary/5"` (5% would be visually equivalent) or inline `style={{ backgroundColor: "color-mix(in srgb, var(--primary) 4%, transparent)" }}`. The current value works but breaks the token contract.

**[INFO-T3] `text-orange-400`, `bg-orange-500/15`, `text-amber-400`, `bg-amber-500/15` in `player-table.tsx`**
`StatusIndicator` uses raw Tailwind color scale values for injury status badges, not design tokens. This predates this UX Polish initiative. Not a regression, but worth adding `--injury-warning` and `--injury-danger` tokens in a future pass.

---

## 7. Issues Requiring Fix Before Ship

### HIGH Priority (fix required)

**BUG-1: Unguarded DB calls on homepage (app/page.tsx lines 32–42)**

`getHomepageSuperlatives`, `getLastWeekResults`, and `getLeagueAtAGlance` are called outside the try/catch block. In a DB-down scenario, `latestSeason` will be `null` (caught), but `leagueGlance = !isInSeason ? await getLeagueAtAGlance() : null` will still execute (`!isInSeason` is `true` when `latestSeason?.status` is undefined) and throw, crashing the page with an unhandled error.

**Fix:**
```tsx
// Wrap lines 32–42 in their own try/catch block, or move inside the existing try/catch:
let superlatives = null;
let lastWeekResults = null;
let leagueGlance = null;

if (latestSeason) {
  try {
    superlatives = await getHomepageSuperlatives(latestSeason.id);
    if (isInSeason && matchupData) {
      lastWeekResults = await getLastWeekResults(latestSeason.id, matchupData.week);
    }
  } catch { /* fall through */ }
}

if (!isInSeason) {
  try {
    leagueGlance = await getLeagueAtAGlance();
  } catch { /* fall through */ }
}
```

**BUG-2: Missing focus ring on `<select>` and `<input>` (franchise-selector.tsx, player-table.tsx)**

`outline: "none"` inline style removes keyboard focus indicators. WCAG 2.1 AA 2.4.7 violation.

**Fix:** Remove `outline: "none"` from inline styles on:
- `franchise-selector.tsx` lines 83 and 161 (both selects)
- `player-table.tsx` line 283 (search input)
- `player-table.tsx` line 349 (roster select)

The global `:focus-visible` rule in globals.css will then apply correctly.

### MEDIUM Priority (fix before ship, not blocking)

**BUG-3: Dead conditional in homepage mobile standings (app/page.tsx line 325)**
`className={isLeader ? "font-bold" : "font-bold"}` — both branches are identical. Either remove the conditional and always apply `font-bold`, or apply `font-normal` for non-leaders (the likely intent).

**BUG-4: Season detail page missing co-owner display (app/seasons/[seasonYear]/page.tsx)**
Standings rows do not render `coOwnerDisplayName`. Other pages (homepage standings, teams page) do. This is an inconsistency in the co-owner rollout.

**BUG-5: Inconsistent status badge implementation on seasons list page (app/seasons/page.tsx lines 84–93)**
`in_season` and `pre_draft` status indicators are hand-coded `<span>` elements. `complete` uses `SuperlativeBadge`. All three should use `SuperlativeBadge` for consistency, or none should.

### LOW Priority (post-ship backlog)

**POLISH-1:** `FranchiseIdentity` hero variant — pass `decorative` to `FranchiseLogo` to prevent double-announcement of franchise name by screen readers.

**POLISH-2:** `championship-stars.tsx` — add comment to `rgba(184, 134, 11, 0.3)` documenting it as `--gold at 30% opacity` for future token maintenance.

**POLISH-3:** `app/page.tsx` hero section — replace `rgba(45, 90, 61, 0.04)` with `bg-primary/5` Tailwind class.

**POLISH-4:** Trophies and power rankings empty states — use `EmptyState` component instead of inline card patterns for consistency across all pages.

---

## 8. Pre-existing Issues (Not Introduced by This Work)

**INFO — "Memorial League Memorial League" title duplication**

`layout.tsx` defines the root site title as "Harambe Memorial League Memorial League" which duplicates "Memorial League". This cascades to every page's `<title>` tag. This is present in pre-existing pages (`drafts`, `matchups`, `records`, etc.) that were not modified by this initiative. Flagged here for awareness; tracked separately from UX Polish scope.
