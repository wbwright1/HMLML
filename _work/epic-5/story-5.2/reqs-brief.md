---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 5.2
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: [None]
---

# Story 5.2: Trophy Case Enhancement — Implementation Brief

## Story Reference

- **Epic:** 5 (Championship & Trophy Experience)
- **Story:** 5.2 — Trophy Case Enhancement
- **FRs:** FR19
- **NFRs:** NFR3 (WCAG AA contrast), NFR6 (no new dependencies)
- **UX-DRs:** None directly assigned; inherits UX-DR9 from Story 5.1 (ChampionshipStars)
- **Depends on:** Story 5.1 (ChampionshipStars SVG Upgrade) — marked complete
- **File under modification:** `app/records/trophies/page.tsx`

## Restated Acceptance Criteria

### AC-1: Championship entries with rich visual treatment
**Given** the records page trophy case section
**When** championships exist in the data
**Then** each championship entry shows:
1. Season year
2. Champion FranchiseIdentity component (displaying franchise logo, name, championship stars)
3. A gold SuperlativeBadge with text "League Champion"

**And** the most recent champion gets a larger treatment using StatHero with variant `lg` displaying the season year

**And** historical champions are listed chronologically below the featured champion (descending year order, most recent first, excluding the featured champion)

### AC-2: Multi-championship attribution
**Given** a franchise has multiple championships
**When** viewing the trophy case
**Then** all championship years are visible and attributed to the correct franchise (each year row shows the correct franchise via FranchiseIdentity)

### AC-3: Empty state
**Given** no championships exist in the data
**When** the trophy case renders
**Then** an appropriate empty state is shown (existing empty state treatment is acceptable; if EmptyState component from Epic 6 is available, use it)

## Database Changes

**None.** The existing `getTrophyCase()` query in `lib/queries/records.ts` already returns `TrophyEntry[]` with `seasonYear`, `championFranchiseId`, `championName`, `championSlug`, `runnerUpName`, and `runnerUpSlug`. This data is sufficient.

However, to fully populate the `FranchiseIdentity` component, the query result needs `abbreviation` and `brandingColor` for the champion franchise. The current `TrophyEntry` type lacks these fields.

**Required query change:** Extend `getTrophyCase()` to also select `champ.abbreviation` and `champ.branding_color` from the champion franchise join. Add corresponding fields to the `TrophyEntry` interface:
- `championAbbreviation: string | null`
- `championBrandingColor: string | null`

Similarly, for the runner-up franchise (if displayed with FranchiseIdentity in future), extend with `runnerUpAbbreviation` and `runnerUpBrandingColor`. For this story, only champion fields are strictly required.

Also, to display championship star counts per champion, the page needs each champion's total championship count. The current page already computes `champCounts` from the trophy array. This logic can remain as-is.

## API Endpoints

**None.** This is a server-rendered page (`app/records/trophies/page.tsx`) that calls `getTrophyCase()` directly. No API route is involved.

## Validation Schemas

**None.** Data flows from Postgres via Drizzle ORM (already validated at sync time via Zod). No new external data ingestion.

## Business Rules

1. **Featured champion:** The first entry in the `trophies` array (highest `seasonYear`) that has a non-null `championName` is the featured/reigning champion. It receives the StatHero `lg` treatment.

2. **Historical list:** All remaining entries (index 1+) are rendered as historical champion rows, in descending chronological order (maintained by the query's `ORDER BY season_year DESC`).

3. **FranchiseIdentity usage:** Each champion entry must use the `FranchiseIdentity` component with:
   - `franchise` prop: `{ slug, name, abbreviation, brandingColor }` sourced from the trophy entry's champion fields
   - `championships` prop: total championship count for that franchise (computed from the full trophy list)
   - `variant`: `"standard"` for historical entries; `"hero"` or `"standard"` for the featured champion (implementer's discretion, but the featured section is already visually prominent via StatHero)

4. **SuperlativeBadge:** Each champion entry displays `<SuperlativeBadge text="League Champion" variant="gold" />`. The existing page already does this for the featured champion. Historical entries currently show `text="Champion"`; update to `text="League Champion"` per FR19 wording.

5. **StatHero for featured champion:** The featured champion section uses `<StatHero value={seasonYear} label="Reigning Champion" variant="lg" />`. This is already present in the current implementation.

6. **Runner-up display:** Runner-up information is supplementary context (already displayed as "defeated {runnerUpName}"). No FranchiseIdentity treatment required for runner-ups in this story.

7. **Empty state:** When `trophies.length === 0`, show a centered message. The current implementation already handles this case.

8. **All-Time Championship Leaders section:** The existing "Championship Leaders" section at the top already aggregates multi-championship franchises. This section does not currently use FranchiseIdentity. Consider whether to add it there as well (the section already shows franchise name, championship count badge, and ChampionshipStars). Adding FranchiseIdentity here would satisfy FR19 more thoroughly by ensuring every championship reference uses the component.

## Implementation Approach

The current `page.tsx` is already well-structured. The primary changes are:

1. **Extend `TrophyEntry` type** in `lib/queries/records.ts` to include `championAbbreviation` and `championBrandingColor`.

2. **Update `getTrophyCase()` query** to select `champ.abbreviation` and `champ.branding_color`.

3. **Replace inline champion name rendering** with `FranchiseIdentity` component in:
   - The featured champion section (the large card at the top of the year-by-year list)
   - Each historical champion row
   - Optionally, the All-Time Championship Leaders cards

4. **Ensure gold SuperlativeBadge** reads "League Champion" on all champion entries (featured already says this; historical rows say "Champion" and should be updated).

5. **Preserve all existing functionality:** back link, runner-up display, empty state, ScrollReveal animations, ChampionshipStars in the all-time section.

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Server component (no `"use client"`) | Already compliant | Page is a React Server Component |
| No new dependencies | Compliant | Uses existing FranchiseIdentity, SuperlativeBadge, StatHero, ChampionshipStars |
| WCAG AA contrast (NFR3) | Must verify | Gold badge text on gold-tint background must meet 3:1 for large text, 4.5:1 for body |
| No color-only information (CLAUDE.md) | Compliant | All gold treatments paired with text labels ("League Champion", "Champion") |
| No red/purple pairings | N/A | No red/purple used in this feature |
| Typography conventions | Must follow | Stat numbers use `tabular-nums`; headings use specified weights/sizes |
| Mobile-first (cards over tables) | Already compliant | Trophy entries are card-based, not tabular |
| Naming conventions | Must follow | Any new props/variables in `camelCase`; file stays `kebab-case` |
| Error handling | Already present | `try/catch` around `getTrophyCase()` |
| Drizzle ORM only (no raw SQL outside migrations) | Compliant | Query uses Drizzle with `sql` template for joins (existing pattern) |
| No scroll-triggered animations | Check | `ScrollReveal` is already used; verify it respects `prefers-reduced-motion` per NFR4 |

## NFR Targets

| NFR | Target | Verification |
|---|---|---|
| NFR3 | All text meets WCAG 2.1 AA contrast | Gold badge text (`#B8860B`) on `gold/10` background must be checked; gold on white surface passes at 4.5:1 |
| NFR6 | No new third-party libraries | Only existing project components used |
| Performance | Page loads in <2s on hobby tier | Single query, no additional DB calls beyond existing `getTrophyCase()` |

## Forward Dependencies

- **Story 5.3 (Season Champion Gold Highlight):** Uses similar gold-tint treatment and SuperlativeBadge "League Champion" pattern. Consistency between 5.2 and 5.3 is important.
- **Epic 6 (EmptyState component):** When Story 6.1 delivers the `EmptyState` component, the trophy case empty state should be updated to use it. For now, the inline empty state is acceptable.
- **FranchiseIdentity component:** Already exists and is stable. No changes to the component itself are needed for this story.

## Open Questions

None. All acceptance criteria are clear and map directly to existing components and data. The current page already implements most of the desired behavior; the primary gap is replacing inline franchise name rendering with the `FranchiseIdentity` component and ensuring consistent "League Champion" badge text on all entries.
