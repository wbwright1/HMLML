---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 2.3
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: [CRITICAL: All acceptance criteria are already implemented in the codebase. FranchiseIdentity component already handles coOwnerName prop, and all four target pages already display co-owner data with the correct " & " separator. See "Critical Finding" section.]
---

## Story Reference

**Story 2.3: Co-Owner Display Across Site**
**Epic 2: Co-Owner Recognition**
**Requirements:** FR23, FR24, UX-DR11 (from epics.md)

> Update the FranchiseIdentity component to accept and render `coOwnerName` prop. Update homepage standings, franchise detail page, season history cards, and teams overview to pass and display co-owner data. Formatting: always " & " separator.

**Depends on:** Story 2.1 (schema; confirmed complete), Story 2.2 (sync; confirmed complete)

## Restated Acceptance Criteria

Each Given/When/Then from the story is restated below with implementation detail and current codebase status.

| # | Criterion (from story.md) | Implementation Detail | FR/NFR | Status |
|---|---|---|---|---|
| AC-1 | **Given** the FranchiseIdentity component **When** a `coOwnerName` prop is provided **Then** the hero variant displays "Owned by {owner} & {coOwner}" | The `FranchiseIdentity` component (`components/franchise-identity.tsx`) must accept an optional `coOwnerName?: string` prop. In the hero variant, when both `ownerName` and `coOwnerName` are present, render `Owned by {ownerName} & {coOwnerName}`. When only `ownerName` is present, render `Owned by {ownerName}`. | FR23 | DONE |
| AC-2 | **And** the standard variant displays the combined owner in the caption | In the standard variant, the caption below the franchise name should display `{ownerName} & {coOwnerName}` when both are present, or just `{ownerName}` when no co-owner exists. | FR23 | DONE |
| AC-3 | **Given** any page displaying owner information (homepage standings, franchise detail, season history, teams overview) **When** a franchise has a co-owner for that season **Then** the co-owner is displayed alongside the primary owner | Four pages must pass `coOwnerName`/`coOwnerDisplayName` data through to their rendering: (1) homepage standings, (2) `/teams` overview, (3) `/teams/[franchiseSlug]` detail, (4) `/seasons/[seasonYear]` detail | FR24 | DONE |
| AC-4 | **And** the formatting is always " & " separator (no "and", no commas) | Every location that renders co-owner data must use the template `{owner} & {coOwner}` with exactly ` & ` as separator (space-ampersand-space). No "and" word, no comma-separated lists. | FR24, UX-DR11 | DONE |
| AC-5 | **Given** a franchise with no co-owner **When** the page renders **Then** only the primary owner is shown (no trailing " & " or empty space) | All rendering must use the conditional pattern: `{ownerName}{coOwnerName ? \` & ${coOwnerName}\` : ""}`. When `coOwnerName` is `undefined` or `null`, only the primary owner name renders with no trailing separator. | FR24 | DONE |

## CRITICAL FINDING: Implementation Already Exists

Analysis of the current codebase reveals that **all acceptance criteria for Story 2.3 are already satisfied** across every target location.

### 1. FranchiseIdentity Component (`components/franchise-identity.tsx`)

The component already:
- Accepts `coOwnerName?: string` in its props interface (line 13)
- **Hero variant** (lines 55-59): Renders `Owned by {ownerName}{coOwnerName ? \` & ${coOwnerName}\` : ""}` inside a `<p>` tag with `text-body-sm text-muted-foreground` styling
- **Standard variant** (lines 82-85): Renders `{ownerName}{coOwnerName ? \` & ${coOwnerName}\` : ""}` inside a `<p>` tag with `text-caption text-muted-foreground` styling
- **Compact variant** (lines 24-38): Does not display owner info (by design; compact is for inline contexts like standings table rows)

**AC-1, AC-2, AC-5 satisfied.**

### 2. Homepage Standings (`app/page.tsx`)

The homepage standings section already:
- Reads `coOwnerDisplayName` from the `getSeasonStandings()` query result (the query at `lib/queries/seasons.ts` line 82 selects this column)
- **Desktop table** (line 295): Renders `{entry.ownerDisplayName}{entry.coOwnerDisplayName ? \` & ${entry.coOwnerDisplayName}\` : ""}`
- **Mobile card view** (line 345): Same rendering pattern

**AC-3, AC-4, AC-5 satisfied for homepage.**

### 3. Teams Overview (`app/teams/page.tsx`)

The teams page already:
- Passes `coOwnerName={franchise.coOwnerName}` to `FranchiseIdentity` (line 59)
- The `getAllFranchises()` query (`lib/queries/franchises.ts`, lines 43-46, 69) already fetches and returns `coOwnerDisplayName` from the most recent season's franchise_seasons row
- The `FranchiseIdentity` standard variant handles the display

**AC-3, AC-4, AC-5 satisfied for teams overview.**

### 4. Franchise Detail (`app/teams/[franchiseSlug]/page.tsx`)

The franchise detail page already:
- Extracts `currentCoOwner` from the most recent season history entry (lines 58-61)
- Passes `coOwnerName={currentCoOwner ?? undefined}` to `FranchiseIdentity` hero variant (line 95)
- **Season history cards** (line 172): Each card renders `{season.ownerDisplayName}{season.coOwnerDisplayName ? \` & ${season.coOwnerDisplayName}\` : ""}` showing the per-season co-owner
- The `getFranchiseBySlug()` query (`lib/queries/franchises.ts`, line 102) already selects `coOwnerDisplayName` in the season history join

**AC-3, AC-4, AC-5 satisfied for franchise detail.**

### 5. Season Detail (`app/seasons/[seasonYear]/page.tsx`)

The season detail page already:
- **Desktop standings table** (line 180): Renders `{entry.ownerDisplayName}{entry.coOwnerDisplayName ? \` & ${entry.coOwnerDisplayName}\` : ""}`
- **Mobile card view** (line 267): Same rendering pattern
- The `getSeasonStandings()` query (`lib/queries/seasons.ts`, line 82) already selects `coOwnerDisplayName`

**AC-3, AC-4, AC-5 satisfied for season detail.**

## Data Flow (Already Wired)

```
franchise_seasons.co_owner_display_name (DB)
    |
    v
lib/queries/franchises.ts  -->  getAllFranchises()       --> app/teams/page.tsx (FranchiseIdentity standard)
                                getFranchiseBySlug()     --> app/teams/[slug]/page.tsx (FranchiseIdentity hero + season cards)
lib/queries/seasons.ts      -->  getSeasonStandings()    --> app/page.tsx (homepage standings)
                                                         --> app/seasons/[year]/page.tsx (season standings)
```

## Database Changes

**None.** Story 2.1 added the column. Story 2.2 populates it. Story 2.3 only reads and displays it.

## API Endpoints

**None.** All pages are React Server Components that query the database directly via `lib/queries/`. No API routes are involved.

## Validation Schemas

**None required.** The data flows from Postgres through Drizzle ORM (type-safe) to React Server Components. No external API responses to validate in this story.

## Business Rules

| Rule | Detail | FR/NFR |
|---|---|---|
| BR-1 | Co-owner display uses exactly ` & ` as separator (space, ampersand, space). No "and" word, no commas. | FR24, UX-DR11 |
| BR-2 | When `coOwnerName`/`coOwnerDisplayName` is null or undefined, only the primary owner renders. No trailing separator, no empty space. | FR24 |
| BR-3 | The FranchiseIdentity compact variant intentionally does not display owner information (used in standings table team cells where owner info is shown separately). | FR23 |
| BR-4 | Co-owner data is per-season (from `franchise_seasons`), not per-franchise. A franchise may have different co-owners in different seasons. The franchise detail page correctly shows per-season owners in the season history cards. | FR24 |
| BR-5 | The "current" co-owner (shown in the franchise hero and teams overview) is determined from the most recent season's `franchise_seasons` row. | FR24 |

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| FR23: FranchiseIdentity coOwnerName prop | Satisfied | Hero and standard variants both handle it; compact variant excluded by design |
| FR24: Co-owner display across all pages | Satisfied | Homepage standings, teams overview, franchise detail (hero + season cards), season detail (desktop + mobile) |
| UX-DR11: " & " separator rule | Satisfied | All 8 rendering locations use the same `{name}{coOwner ? \` & ${coOwner}\` : ""}` pattern |
| NFR3: WCAG AA contrast | Satisfied | Co-owner text uses `text-muted-foreground` or `text-body-sm text-muted-foreground`, same as existing owner text; no new color introduced |
| No `"use client"` added | Satisfied | All rendering is in React Server Components |
| No new dependencies | Satisfied | Uses only existing component props and query results |
| Drizzle ORM for DB access | Satisfied | All queries use Drizzle select/join; no raw SQL |
| Naming conventions | Satisfied | `coOwnerName` (prop), `coOwnerDisplayName` (DB/query field), both camelCase |

## NFR Targets

| NFR | Relevance | Status |
|---|---|---|
| NFR1 (color is decorative only) | Co-owner text does not introduce any new color-only indicators | Satisfied |
| NFR3 (WCAG AA contrast) | Co-owner text inherits muted foreground styling with adequate contrast | Satisfied |
| NFR6 (no new dependencies) | No new libraries introduced | Satisfied |

## Pages and Files Inventory

| File | Role | Co-Owner Handling |
|---|---|---|
| `components/franchise-identity.tsx` | Shared component, hero + standard + compact variants | Accepts `coOwnerName` prop; renders in hero and standard variants |
| `app/page.tsx` | Homepage with standings section | Desktop (line 295) and mobile (line 345) render co-owner inline with owner |
| `app/teams/page.tsx` | Teams overview grid | Passes `coOwnerName` to FranchiseIdentity standard variant (line 59) |
| `app/teams/[franchiseSlug]/page.tsx` | Franchise detail page | Hero variant (line 95) + per-season cards (line 172) |
| `app/seasons/[seasonYear]/page.tsx` | Season detail page | Desktop table (line 180) and mobile cards (line 267) |
| `lib/queries/franchises.ts` | `getAllFranchises()` and `getFranchiseBySlug()` | Both queries select and return `coOwnerDisplayName` |
| `lib/queries/seasons.ts` | `getSeasonStandings()` | Selects `coOwnerDisplayName` from `franchiseSeasons` join |

## Forward Dependencies

None. Story 2.3 is the final story in Epic 2. No downstream stories depend on it.

## Open Questions

1. **Story 2.3 appears to be already complete.** All acceptance criteria are satisfied in the current codebase. The developer assigned to this story should verify:
   - The database has been synced (daily sync or legacy import has run) so that `co_owner_display_name` is populated for franchises that have co-owners.
   - Visually confirm on at least one franchise with a known co-owner that the " & " formatting appears correctly on all four page types.
   - If these checks pass, this story may be marked as complete with a verification pass only.

2. **No conflicts detected.** All acceptance criteria align with architecture decisions and project conventions. The ` & ` separator pattern is used consistently across all 8 rendering locations (2 in homepage, 1 in teams overview via FranchiseIdentity, 2 in franchise detail, 2 in season detail, plus the FranchiseIdentity component itself).

3. **Consistency note:** The homepage standings and season detail pages render co-owner text directly inline (not via FranchiseIdentity), because these pages use the compact variant of FranchiseIdentity for the team name/logo and display owner info in a separate `<p>` tag below. This is intentional and correct: compact variant is for inline team identity, owner info is a separate line item in standings contexts.
