---
reviewer: CRITIC
scope: UX Polish Initiative (All 6 Epics / Tier 1–7)
reviewedAt: '2026-03-25'
---

# CRITIC Review — UX Polish Initiative

## Orchestrator Summary

**VERDICT: REJECTED**

- **CRITICAL findings:** 3
- **WARNING findings:** 6
- **NITPICK findings:** 5

The implementation is largely solid. The majority of spec requirements are correctly executed: SuperlativeBadge migration is clean, CSS variable system is coherent, franchise color integration is consistent, co-owner display uses correct " & " separator everywhere. However, three issues are disqualifying before ship: (1) a hardcoded `rgba` hex literal on the hero section that bypasses the CSS variable system in a way that's easily fixable, (2) co-owner display is **missing entirely** from the season detail page standings (the spec explicitly requires it), and (3) a dead-code ternary that always evaluates the same branch — indicating the code was not read before being committed.

---

## CRITICAL Findings

### CRITICAL-1 — Hardcoded RGBA Color in Hero Section

**File:** `app/page.tsx`, line 52
**Rule violated:** Architecture Compliance — CSS variables used correctly; spec §3.2 "never hardcoded hex values"

The hero section uses `style={{ backgroundColor: "rgba(45, 90, 61, 0.04)" }}`. The magic numbers `45, 90, 61` are the RGB decomposition of `#2D5A3D` — the `--primary` color — hardcoded in an inline style. This is exactly the pattern Tier 3 was supposed to eradicate.

Tailwind v4 supports opacity modifiers on CSS variables. The correct expression is a Tailwind class: `bg-primary/[0.04]` (or `bg-primary/5` if 5% is close enough). No inline style needed.

**Fix required:** Replace `style={{ backgroundColor: "rgba(45, 90, 61, 0.04)" }}` with Tailwind class `bg-primary/[0.04]` on the `<section>` element. Remove the `style` prop entirely.

---

### CRITICAL-2 — Co-Owner Display Missing from Season Detail Page Standings

**File:** `app/seasons/[seasonYear]/page.tsx`, lines 178–183 (desktop) and lines 265–268 (mobile)
**Rule violated:** Completeness — all AC addressed. Spec §7.4 explicitly lists "Franchise detail page season history cards: show co-owner per season where applicable" and the season standings pages as required co-owner display locations.

The `getSeasonStandings` query already returns `coOwnerDisplayName` (confirmed in `lib/queries/seasons.ts` line 82). The data is present. It is rendered correctly in `app/page.tsx` (lines 270, 320). It is rendered correctly in `app/teams/[franchiseSlug]/page.tsx` (line 169). But `app/seasons/[seasonYear]/page.tsx` ignores it — the owner line at line 179 shows `{entry.ownerDisplayName}` with no co-owner concatenation.

**Fix required:** In both the desktop table (line ~180) and mobile card (line ~266) of `app/seasons/[seasonYear]/page.tsx`, change the owner paragraph from:
```
{entry.ownerDisplayName}
```
to:
```
{entry.ownerDisplayName}{entry.coOwnerDisplayName ? ` & ${entry.coOwnerDisplayName}` : ""}
```

This is already the exact pattern used consistently everywhere else.

---

### CRITICAL-3 — Dead Code Ternary (Always Evaluates Same Branch)

**File:** `app/page.tsx`, line 325
**Rule violated:** Code Quality — no dead code

```tsx
<span className={isLeader ? "font-bold" : "font-bold"}>{entry.wins ?? 0}</span>
```

Both branches of this ternary are identical: `"font-bold"`. This means `isLeader` has no effect on this span. The spec calls for the leader's record to be **bolded** (§1.4: "Bold the top team's record as a visual anchor"), but the implementation bolds *every* team's win count. This makes the feature non-functional — the visual distinction is absent.

The spec intends for the leader's *entire record* (`wins-losses`) to be visually prominent. The ternary here was almost certainly meant to be `isLeader ? "font-bold" : "font-normal"` or `isLeader ? "font-bold" : ""`. In the parallel desktop table at line 275, the record cell correctly uses `isLeader ? "font-bold" : ""`. The mobile card diverges from its own desktop sibling.

**Fix required:** Change line 325 to:
```tsx
<span className={isLeader ? "font-bold" : ""}>{entry.wins ?? 0}</span>
```

---

## WARNING Findings

### WARNING-1 — Homepage Superlative Queries Not Parallelized (Performance)

**File:** `app/page.tsx`, lines 31–42
**Rule violated:** Code Quality — no over-engineering; performance

After the initial `Promise.all` for matchup and season data (lines 19–22), the three subsequent homepage queries run sequentially:

```ts
const superlatives = latestSeason ? await getHomepageSuperlatives(latestSeason.id) : null;
// ...
const lastWeekResults = isInSeason && matchupData ? await getLastWeekResults(...) : null;
const leagueGlance = !isInSeason ? await getLeagueAtAGlance() : null;
```

`getHomepageSuperlatives` and either `getLastWeekResults` or `getLeagueAtAGlance` are independent — they can be fetched in parallel. As written, the server waits for each sequentially before rendering. On cold DB connections this adds meaningful latency to an already data-heavy page.

**Fix required:** Parallelise the conditional fetches with `Promise.all`:
```ts
const [superlatives, lastWeekResults, leagueGlance] = await Promise.all([
  latestSeason ? getHomepageSuperlatives(latestSeason.id) : Promise.resolve(null),
  isInSeason && matchupData ? getLastWeekResults(latestSeason!.id, matchupData.week) : Promise.resolve(null),
  !isInSeason ? getLeagueAtAGlance() : Promise.resolve(null),
]);
```

---

### WARNING-2 — co_owners Field Accessed via Unsafe Type Cast

**Files:** `lib/sync/daily.ts` line 241, `lib/sync/legacy-import.ts` line 263
**Rule violated:** Architecture Compliance — types are correct

Both files access `co_owners` via an unsafe type assertion:
```ts
const coOwners = (roster as { co_owners?: string[] | null }).co_owners;
```

This is unnecessary because `co_owners` was added to `SleeperRosterSchema` in `lib/sleeper-schemas.ts`. The Zod-validated roster objects already carry `co_owners` as a typed field. The cast works around the type system rather than trusting the schema. If the schema changes, this cast silently breaks.

**Fix required:** Remove the type cast and access `roster.co_owners` directly, relying on the inferred Zod type. If the Drizzle-sync plumbing doesn't propagate the full Zod type, fix the type annotations on the roster variable, not the field access.

---

### WARNING-3 — ChampionshipStars Drop Shadow Uses Hardcoded RGBA

**File:** `components/championship-stars.tsx`, line 13
**Rule violated:** Architecture Compliance — CSS variables used correctly; spec §3.2

```tsx
style={shadow ? { filter: "drop-shadow(0 1px 2px rgba(184, 134, 11, 0.3))" } : undefined}
```

`184, 134, 11` is the RGB decomposition of `#B8860B` — the `--gold` CSS variable. This is the same class of violation as CRITICAL-1: hardcoded magic numbers instead of the design token.

**Fix required:** Use a Tailwind drop-shadow with the gold variable, or define a `drop-shadow-gold` utility. Minimally, comment the magic number if it must stay, but the correct fix is:

```tsx
className={shadow ? "drop-shadow-[0_1px_2px_var(--gold-30)]" : ""}
```

Or define `--gold-30: rgba(184, 134, 11, 0.3)` as a design token in `globals.css`. The inline style approach hardcodes a derivative of a design token that already exists.

---

### WARNING-4 — SeasonSelector Fade Indicators Always Visible (Incorrect UX)

**File:** `components/season-selector.tsx`, lines 66–71
**Rule violated:** Frontend discipline — empty/loading/state handled

The left and right fade gradient overlays added for scroll indication are always rendered regardless of whether the content actually overflows. If a league has 2–3 seasons (early in lifecycle), the selector fits without scrolling and the fade gradients appear on non-scrollable content — giving a false signal to the user that more content is hidden.

The spec (§6.4) says "Add subtle fade/gradient indicators on left/right edges **when content overflows** to signal scrollability." The current implementation omits the conditional.

**Fix required:** Use a `useEffect` + `ResizeObserver` or `scroll` event to detect overflow and conditionally show the fade indicators, or use CSS `overflow: clip` with `mask-image` that naturally shows only when content exceeds bounds.

---

### WARNING-5 — Consistent `in_season` and `pre_draft` Badges Not Using SuperlativeBadge

**File:** `app/seasons/page.tsx`, lines 84–93
**Rule violated:** Architecture Compliance — spec §3.4 "unify status badge patterns"

The `status === "complete"` case correctly uses `<SuperlativeBadge text="Complete" variant="green" />` (properly migrated). But `in_season` and `pre_draft` status badges on lines 84–93 still use raw `<span>` elements with inline-style-adjacent Tailwind classes that replicate the SuperlativeBadge pattern manually:

```tsx
<span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full text-primary bg-primary/10">
  In Season
</span>
<span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
  Pre-Draft
</span>
```

These are functionally identical to `SuperlativeBadge` with `green` and `neutral` variants. The spec's intent is a single badge component for all status indicators.

**Fix required:** Replace both spans with:
```tsx
<SuperlativeBadge text="In Season" variant="green" />
<SuperlativeBadge text="Pre-Draft" variant="neutral" />
```

---

### WARNING-6 — Homepage Superlative Row Has No Empty/No-Data State

**File:** `app/page.tsx`, lines 73–115
**Rule violated:** Frontend discipline — loading/empty/error states handled

The superlative row renders `{superlatives && (...)}`. When `superlatives` is non-null but all four sub-values are null (early season with no completed matchups), the inner grid renders 0 `StatHero` cards — an invisible empty section. The `<section className="py-12">` still renders, producing silent whitespace.

**Fix required:** Add a guard: only render the section if at least one superlative exists:
```tsx
{superlatives && (superlatives.highestScore || superlatives.longestStreak || superlatives.closestMatchup || superlatives.mostAllTimeWins) && (
  <ScrollReveal>...</ScrollReveal>
)}
```

---

## NITPICK Findings

### NITPICK-1 — Inline Style Inconsistency: Desktop vs Mobile for Left Border

**File:** `app/page.tsx`, lines 252 vs 303

Desktop row: `style={{ borderLeft: \`3px solid ${...}\` }}`
Mobile card: `style={{ borderLeftWidth: "3px", borderLeftColor: ... }}`

Two syntaxes for the same visual effect. Pick one and be consistent. The shorthand `borderLeft` is fine; the expanded properties are also fine. Mixing them in the same file is noise.

---

### NITPICK-2 — `latestSeason!` Non-Null Assertion Inside an `isInSeason` Guard

**File:** `app/page.tsx`, line 40

```ts
? await getLastWeekResults(latestSeason!.id, matchupData.week)
```

`latestSeason` is already guaranteed non-null here because `isInSeason = latestSeason?.status === "in_season"` — if `latestSeason` were null, `isInSeason` would be `false`, and this branch would not execute. The `!` is unnecessary and signals distrust in the type flow. Use `latestSeason.id` directly (TypeScript should infer non-null inside this block if the condition is structured correctly, or use a null check in the condition: `isInSeason && matchupData && latestSeason`).

---

### NITPICK-3 — Trophies Page: ChampionshipStars Rendered Twice for No Reason

**File:** `app/records/trophies/page.tsx`, lines (reigning champion block)

The featured champion block renders `<ChampionshipStars count={1} variant="hero" />` on both sides of the franchise name link — a decorative flourish, but `count={1}` on both sides means two single-star renders flanking the name. The spec (§5.2) does not specify this treatment. If intentional, a comment explaining the design decision would prevent future "is this a bug?" questions.

---

### NITPICK-4 — Biggest Blowout Logic Rendered Conditionally Inside Already-Conditional Block

**File:** `app/page.tsx`, lines 137–141

```tsx
{lastWeekResults.results.length > 0 && (
  <p className="text-caption text-muted-foreground pt-2">
    Biggest blowout: {lastWeekResults.results[0].winner} by ...
  </p>
)}
```

This inner check (`results.length > 0`) is redundant — the outer block at line 118 already guards `lastWeekResults.results.length > 0`. The inner check is dead logic that adds confusion. Remove it.

---

### NITPICK-5 — `_work/` Directory in Tracked Repo Root

**File:** `_work/` (untracked per git status)

The `_work/` directory is currently untracked but not gitignored. Agent working files should not be committed to the production repo. Verify `.gitignore` covers `_work/` before the next commit.

---

## Patterns to Remember

**[CONVENTION]** Franchise `brandingColor` inline styles are **always** allowed — they are dynamic per-franchise and cannot be predefined in CSS. All other color usage must go through Tailwind classes or CSS variables.

**[CONVENTION]** The `--border` CSS variable is the canonical fallback for missing `brandingColor`. Both spellings found in the codebase (`"var(--border)"` as string in template literal and as object property value) are acceptable, but stick to one syntax per component.

**[CONVENTION]** Co-owner formatting is `{owner} & {coOwner}` with " & " — no "and", no comma. This pattern appears in franchise-identity.tsx, app/page.tsx (standings), and app/teams pages. Any future co-owner display site must use this exact separator.

**[CONVENTION]** `SuperlativeBadge` is the authoritative status badge. Do not create inline `<span>` elements replicating its styling. If a new variant is needed, add it to the `variantClasses` map in `superlative-badge.tsx`.

**[PITFALL]** Sequential `await` chains after an initial `Promise.all` still block the render. Every independent data fetch on a server component should be in the same `Promise.all` or structured to allow parallelism.

**[PITFALL]** `rgba(R, G, B, 0.N)` inline styles where R/G/B are RGB decompositions of a design token color (`--primary`, `--gold`, etc.) are hardcoded hex violations. Always use `bg-TOKEN/opacity` Tailwind class instead (e.g., `bg-primary/5`, `bg-gold/10`).

**[PITFALL]** Ternary expressions where both branches are identical (`isLeader ? "font-bold" : "font-bold"`) pass TypeScript and linting silently. Code review is the only gate. Flag these immediately — they indicate the author lost track of intent.

**[VIOLATION-FIXED]** `SuperlativeBadge` migrated from inline `style` objects with hardcoded hex colors to Tailwind classes using design tokens (`bg-gold/10 text-gold`, `bg-primary/10 text-primary`, `bg-muted text-muted-foreground`). This is the correct approach for any static badge variant.

**[VIOLATION-FIXED]** `LiveIndicator` migrated from `bg-green-500` / `text-green-600` (Tailwind base palette) to `bg-primary` / `text-primary`. Brand-colored elements must reference design tokens, not Tailwind's pre-defined color palette.

**[VIOLATION-FIXED]** `FranchiseLogo` fallback color migrated from `"#6B6560"` (hardcoded hex) to `"var(--muted-foreground)"` (CSS variable reference). Both are valid in inline `backgroundColor` style since this is a non-dynamic fallback, but the CSS variable is correct for theme coherence.
