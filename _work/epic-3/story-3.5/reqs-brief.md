# Story 3.5: Season Narrative Block -- Implementation Brief

## Orchestrator Summary
**Status:** COMPLETE
**Agent:** REQS (Requirements Analyst)
**Story:** 3.5 -- Season Narrative Block
**Epic:** 3 -- League Hub Homepage
**FRs Covered:** FR5
**Conflicts Found:** None
**Verdict:** Story is already fully implemented. The homepage (`app/page.tsx`) and query layer (`lib/queries/homepage.ts`) contain all code required by every acceptance criterion. This brief documents what exists and what acceptance testing must verify.

---

## 1. Requirements Traceability

### FR5: Homepage contextual season narrative block
The homepage shall display a contextual season narrative block: "Last Week's Results" in-season or "League at a Glance" in offseason.

**Source:** Epics document (Epic 3, Story 3.5); story.md acceptance criteria.

---

## 2. Acceptance Criteria Decomposition

### AC-1: Regular Season -- Last Week's Results

**Given** the homepage during the regular season
**When** previous week results are available
**Then** a "Last Week's Results" section displays completed matchup summaries
**And** winners are shown in bold with scores
**And** the biggest blowout is called out

#### Current Implementation Status: IMPLEMENTED

**Data flow:**
1. `app/page.tsx` (lines 32, 47-49): The `isInSeason` flag is derived from `latestSeason?.status === "in_season"`. When true and `matchupData` is available, `getLastWeekResults(latestSeason.id, matchupData.week)` is called.
2. `lib/queries/homepage.ts` function `getLastWeekResults(seasonId, currentWeek)` (lines 168-224):
   - Returns `null` if `currentWeek <= 1` (no previous week exists).
   - Queries matchups for `previousWeek = currentWeek - 1` with `status = "complete"`.
   - Pairs matchup rows by `matchupId`, identifies winner via `isWinner` flag.
   - Returns `{ week, results }` where results are sorted by margin descending (biggest blowout first).

**Rendering:**
- `app/page.tsx` (lines 143-171): Guarded by `lastWeekResults && lastWeekResults.results.length > 0`.
- Uses `PageSection` with `label="Last Week"` and `title="Week {N} Results"`.
- Each result row: winner in `font-semibold` (bold), loser in `text-muted-foreground`, scores in `tabular-nums`.
- Biggest blowout callout: `results[0]` (first element after descending margin sort) rendered as caption text: "Biggest blowout: {winner} by {margin} pts".

**Verification points for acceptance tests:**
- When `seasons.status = "in_season"` and completed matchups exist for week N-1, the section renders.
- Winner names have `font-semibold` class applied.
- Scores display with one decimal place (`toFixed(1)`).
- The blowout callout references `results[0]` which is the largest margin due to `paired.sort((a, b) => b.margin - a.margin)`.
- Section uses `PageSection` component (FR5 note: "Uses PageSection with label, title, content").

### AC-2: Offseason -- League at a Glance

**Given** the homepage during the offseason
**When** the page loads
**Then** a "League at a Glance" section displays:
  - Reigning champion with ChampionshipStars
  - Total seasons played
  - Total matchups played
  - Franchise with most championships

#### Current Implementation Status: PARTIALLY IMPLEMENTED (see Gap Analysis)

**Data flow:**
1. `app/page.tsx` (lines 50-51): When `!isInSeason`, `getLeagueAtAGlance()` is called.
2. `lib/queries/homepage.ts` function `getLeagueAtAGlance()` (lines 229-280):
   - Queries reigning champion: latest season joined to champion franchise.
   - Queries total season count.
   - Queries total completed matchup count.
   - Queries franchise with most championships (by counting `champion_franchise_id` on seasons).
   - Returns `{ reigningChampion, totalSeasons, totalMatchups, mostChampionships }`.

**Rendering:**
- `app/page.tsx` (lines 173-204): Guarded by `!isInSeason && leagueGlance && leagueGlance.reigningChampion`.
- Uses `PageSection` with `label="Offseason"` and `title="League at a Glance"`.
- Four `StatHero` cards in a `grid-cols-2 md:grid-cols-4` grid:
  1. Reigning champion name, badge "Reigning Champ".
  2. Total seasons, label "Seasons Played".
  3. Total matchups, label "Total Matchups".
  4. Most championships franchise, badge "Most Championships".

**Gap: ChampionshipStars not rendered with reigning champion.**

The acceptance criterion states: "Reigning champion with ChampionshipStars". The current implementation displays the champion name via `StatHero` but does NOT render the `ChampionshipStars` component alongside it. The `ChampionshipStars` component exists at `components/championship-stars.tsx` and accepts `{ count, variant }` props.

### AC-3: No Data Fallback

**Given** no data is available for narrative
**When** the page loads
**Then** the narrative section is not rendered

#### Current Implementation Status: IMPLEMENTED

**Verification:**
- Last Week's Results guard (line 143): `lastWeekResults && lastWeekResults.results.length > 0` -- if null or empty, nothing renders.
- League at a Glance guard (line 173): `!isInSeason && leagueGlance && leagueGlance.reigningChampion` -- if query returns null or no champion, nothing renders.
- `getLastWeekResults` returns `null` when `currentWeek <= 1` or on error.
- `getLeagueAtAGlance` returns `{ reigningChampion: null, ... }` on error.
- Neither path renders a broken/partial section; both fully suppress.

---

## 3. Gap Analysis

### Gap 1: ChampionshipStars Missing from Reigning Champion Display

**Severity:** Minor (functional gap against AC-2 text)

**AC text:** "Reigning champion with ChampionshipStars"

**Current state:** The reigning champion `StatHero` shows the champion name as the `value` prop and "Reigning Champ" as the `badge` prop, but no `ChampionshipStars` component is rendered.

**Required fix:** Add `ChampionshipStars` to the reigning champion display. This requires knowing the championship count for that franchise. Two approaches:
1. **Preferred:** Extend `getLeagueAtAGlance()` to return the reigning champion's total championship count (query `seasons` table for `COUNT(*)` where `champion_franchise_id` matches). Then render `ChampionshipStars` with that count next to or below the champion name.
2. **Alternative:** Derive count from `mostChampionships` if the reigning champion IS the franchise with the most championships. This is unreliable since a different franchise may hold that record.

**Implementation details:**
- Add a `reigningChampionshipCount` field to the return type of `getLeagueAtAGlance()`.
- In the query layer, count seasons where `champion_franchise_id` equals the reigning champion's franchise ID.
- In the render, place `<ChampionshipStars count={leagueGlance.reigningChampionshipCount} variant="inline" />` adjacent to the champion name within the StatHero, or as a sibling element outside StatHero.
- Note: `StatHero` accepts `value` as `ReactNode`, so `ChampionshipStars` could be composed into the value prop.

---

## 4. Component and Query Inventory

### Existing Components Used (no new components needed)
| Component | File | Role in Story 3.5 |
|---|---|---|
| `PageSection` | `components/page-section.tsx` | Section wrapper with label + title |
| `StatHero` | `components/stat-hero.tsx` | Stat display cards for offseason glance |
| `ScrollReveal` | `components/scroll-reveal.tsx` | Scroll-triggered reveal animation wrapper |
| `ChampionshipStars` | `components/championship-stars.tsx` | Gold star icons for championship count (needs integration) |

### Existing Queries Used (no new queries needed)
| Query | File | Role |
|---|---|---|
| `getLastWeekResults` | `lib/queries/homepage.ts` | Fetches previous week completed matchup results |
| `getLeagueAtAGlance` | `lib/queries/homepage.ts` | Fetches offseason summary stats |

### Query Modification Required
| Query | Change | Reason |
|---|---|---|
| `getLeagueAtAGlance` | Add `reigningChampionshipCount` to return value | AC-2 requires ChampionshipStars which needs a count |

---

## 5. Non-Functional Requirements Compliance

### NFR1 (Color not sole identifier): COMPLIANT
- No franchise branding colors used in narrative block. Winners identified by bold text + "def." label + scores.

### NFR3 (WCAG AA contrast): COMPLIANT
- Winner text: `font-semibold` on default foreground (1A1A1A on FAF8F5 = ~16:1).
- Loser text: `text-muted-foreground` (4A4540 on FAF8F5 = ~8.5:1, exceeds 4.5:1 AA).
- Caption text: `text-muted-foreground` for blowout callout.

### NFR5 (Responsive grid): COMPLIANT
- Offseason grid uses `grid-cols-2 md:grid-cols-4` as specified.

### NFR6 (No new dependencies): COMPLIANT
- All components use existing Tailwind, shadcn/ui patterns, and Lucide icons.

---

## 6. Design Token Compliance

- Scores use `tabular-nums` for stat number alignment (per CLAUDE.md: "Tabular figures on all score/stat numbers").
- Section label uses `text-caption uppercase tracking-widest text-primary` (per Caption typography spec).
- Section title uses `text-h2` (per H2 typography spec).
- No hardcoded hex colors; all via Tailwind design token classes.
- No `"use client"` directive; entire block is server-rendered (per architecture mandate).

---

## 7. Positioning and Layout

**Current placement in homepage (app/page.tsx):**
1. Story 3.1: League Identity Hero (lines 76-96)
2. Story 3.2: Superlative Stats Row (lines 99-140)
3. **Story 3.5: Season Narrative Block (lines 142-204)** -- between superlatives and matchups
4. Story 3.3: Full Week Matchups (lines 207-242)
5. Story 3.4: Standings with Personality (lines 244-387)

This matches the epic description: "Add a contextual section between the superlative row and matchups."

---

## 8. Error Handling

- Both query functions wrap in try/catch and return safe fallback values (null or empty objects).
- The homepage wraps the parallel query batch in its own try/catch (lines 44-57).
- Rendering guards prevent partial renders; if any data is null/empty, the section simply does not appear.
- This aligns with the CLAUDE.md error philosophy: "Something went wrong. We're showing the last available data."

---

## 9. Testing Requirements

### E2E Tests (Playwright)
1. **In-season narrative:** Seed a season with `status = "in_season"`, matchup data for weeks 1-3 (week 3 = current). Verify "Week 2 Results" section appears with correct winners bolded, scores displayed, and blowout callout text.
2. **Offseason narrative:** Seed completed seasons with champions. Verify "League at a Glance" section appears with champion name, seasons count, matchup count, most championships franchise.
3. **ChampionshipStars presence:** Verify the reigning champion display includes star icons (once Gap 1 is resolved).
4. **No data fallback:** With empty database, verify neither narrative section renders (no error, no partial content).
5. **Week 1 edge case:** With `currentWeek = 1`, verify Last Week's Results does not render (no week 0 to show).

### What NOT to test (per CLAUDE.md anti-patterns)
- No mocked query tests.
- No component unit tests that mock data fetching.
- All tests against real running Next.js dev server with real Postgres.

---

## 10. Implementation Checklist

- [ ] **Gap 1 fix:** Add `reigningChampionshipCount` to `getLeagueAtAGlance()` return type and query
- [ ] **Gap 1 fix:** Render `ChampionshipStars` in the reigning champion StatHero (offseason view)
- [ ] Verify all three AC scenarios work against real database
- [ ] Run linting and type checking
- [ ] Write E2E tests covering all three AC scenarios
- [ ] Confirm no `"use client"` directives added
- [ ] Confirm no new dependencies introduced
