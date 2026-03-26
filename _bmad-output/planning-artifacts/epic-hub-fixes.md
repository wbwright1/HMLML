# Epic: Hub Season State & Preseason Experience Fixes

**Date:** 2026-03-26
**Priority:** P0 (blocks correct hub rendering for current state)
**Triggered by:** Hub screenshot review showing offseason view when preseason should render

## Problem Statement

The hub currently shows the "Offseason" view with broken data instead of the "Preseason" experience. Three root causes:

1. **Season state detection** maps Sleeper's `season_type: "off"` directly to `"off"` (offseason hub), but the fantasy league is in preseason (post-new-league-year, pre-draft). The NFL offseason IS the fantasy preseason once the league year rolls over.
2. **Offseason recap data** shows "Most Points: Bucky's General Store (0.0)" because the query pulls from the current (2026) season which has no matchup data yet, instead of the last completed season.
3. **Transaction descriptions** show generic "Added 1 player, dropped 1 player" instead of actual player names because the query counts players but never resolves their names from the players table.

## Root Cause Analysis

### State Detection (page.tsx:56)
```typescript
const seasonType = nflState?.seasonType ?? (latestSeason?.status === "in_season" ? "regular" : "off");
```
Sleeper returns `{ season_type: "off", league_season: "2026" }` in March 2026. This maps to `"off"` and renders `OffseasonHub`. The code never checks the DB season status (`"pre_draft"`, `"complete"`) to determine fantasy preseason.

### Recap Data (offseason.ts)
`getOffseasonRecap(seasonId)` receives the latest season's ID. If the latest season is 2026 (just created, no games), it queries empty matchup data. Should fall back to the most recent completed season.

### Transaction Names (offseason.ts:180-191)
The `getRecentTransactions` query fetches `adds` and `drops` as JSON objects (`{ playerId: rosterId }`), counts the keys, but never joins against the `players` table to resolve names.

---

## Story H.1: Fix Hub Season State Detection

**As a** visitor during the NFL offseason (March-August),
**I want** the hub to show the preseason experience,
**So that** I see the champion banner, awards, draft countdown, and draft order instead of a bare offseason recap.

### Acceptance Criteria

**Given** the Sleeper NFL state returns `season_type: "off"`
**And** the latest season in the DB has status `"complete"` or there exists a newer season with status `"pre_draft"`
**When** the hub page renders
**Then** the hub renders the **Preseason** layout (Champion Banner > Draft Countdown > Team Awards > Player Awards > Wall of Shame > Draft Order)

**Given** the Sleeper NFL state returns `season_type: "off"`
**And** the latest season in the DB has status `"in_season"` (edge case: season still in progress but NFL API says off)
**When** the hub page renders
**Then** the hub renders the **Regular Season** layout as a fallback

**Given** the Sleeper NFL state is unavailable (API error)
**And** the latest season status is `"pre_draft"`
**When** the hub page renders
**Then** the hub renders the **Preseason** layout

### Implementation Notes

- Modify the season detection logic in `app/page.tsx` to consider DB season status
- Key logic: if `nflState.seasonType === "off"` AND `latestSeason.status !== "in_season"`, use `"pre"` (preseason)
- If `latestSeason.status === "pre_draft"`, always use `"pre"` regardless of NFL state
- The offseason hub should only render during a very narrow window (if at all in Phase 1); the preseason hub is more useful year-round outside the active season

---

## Story H.2: Fix Offseason/Preseason Recap to Use Completed Season Data

**As a** visitor viewing the hub,
**I want** the recap section to show real stats from the last completed season,
**So that** I see meaningful data like actual points leaders and biggest blowouts, not zeros.

### Acceptance Criteria

**Given** the latest season (2026) has no matchup data
**When** the offseason recap queries execute
**Then** the system identifies the most recent season with status `"complete"` (2025)
**And** returns that season's stats (champion, most PF, biggest blowout, longest streak)
**And** all stat values are non-zero and accurate

**Given** the most recent completed season has a champion
**When** the recap data renders
**Then** the champion name, most points team, biggest blowout details, and longest win streak are all populated

### Implementation Notes

- `getOffseasonRecap` should accept a season ID OR find the most recent completed season
- Add a helper to find the last completed season: `SELECT * FROM seasons WHERE status = 'complete' ORDER BY season_year DESC LIMIT 1`
- The preseason hub's `getPreseasonAwards` already does this correctly (it takes the season ID from the standings query); the issue is the offseason hub passes the wrong season

---

## Story H.3: Show Player Names in Transaction Activity

**As a** visitor viewing recent moves,
**I want** to see actual player names in transaction descriptions,
**So that** I know who was added/dropped, not just a count.

### Acceptance Criteria

**Given** a waiver transaction adds player "Ja'Marr Chase" and drops "Tyler Lockett"
**When** the transaction renders on the hub
**Then** it shows "Added Ja'Marr Chase, dropped Tyler Lockett" (not "Added 1 player, dropped 1 player")

**Given** a trade transaction involves multiple players
**When** the transaction renders
**Then** it shows up to 3 player names, with "+N more" for additional players

**Given** a player ID in the transaction does not exist in the players table
**When** the description is built
**Then** it falls back to "1 player" for that unresolved entry

### Implementation Notes

- In `getRecentTransactions`, the `adds`/`drops` JSON contains `{ playerId: rosterId }` pairs
- Join against `players` table to resolve `playerId -> fullName`
- Batch-fetch all player IDs from all transactions in one query for efficiency
- Format: "Added [Name], dropped [Name]" or "Added [Name1], [Name2], dropped [Name]"
- Truncate at 3 names with "+N more" suffix

---

## Story H.4: Preseason Hub Data Pipeline Verification

**As a** developer,
**I want** to verify the preseason hub data queries work correctly with the current database state,
**So that** the preseason hub shows awards, sting stats, and draft order once state detection is fixed.

### Acceptance Criteria

**Given** the 2025 season data exists in the database
**When** `getPreseasonAwards(season2025Id)` executes
**Then** team awards include Point Machine, Iron Curtain, and Regular Season King with non-zero stats
**And** player awards include BEST QB, RB, WR, TE with actual player names and stats
**And** sting stats include League Doormat, Glass Cannon, and Punching Bag
**And** draft order has 12 entries

### Implementation Notes

- The `PreseasonHub` component already exists and calls `getPreseasonAwards`
- Need to verify it receives the correct (2025 completed) season ID, not the empty 2026 season
- May need to adjust the season lookup: find the most recent completed season for awards, not just `latestSeason`

---

## Story H.5: Draft Countdown Component Integration

**As a** visitor during preseason,
**I want** to see a countdown to the rookie draft,
**So that** I feel the anticipation building toward draft day.

### Acceptance Criteria

**Given** the hub is in preseason state
**And** a draft date is configured
**When** the hub renders
**Then** a Draft Countdown card appears between the Champion Banner and Team Awards
**And** it shows days, hours, minutes, seconds in display-weight typography
**And** the countdown updates every second (client-side interval)
**And** "ROOKIE DRAFT COUNTDOWN" caption appears in accent-green uppercase

**Given** no draft date is configured
**When** the hub renders
**Then** the Draft Countdown component is omitted (no empty/broken state)

### Implementation Notes

- The `DraftCountdown` component already exists (imported in page.tsx) but is not wired to a real date source
- Phase 1: use an environment variable `NEXT_PUBLIC_DRAFT_DATE` (ISO 8601) as the draft date source
- The countdown must be a `"use client"` component (interval-based updates)
- Per UX spec: surface background, border, centered layout, tabular figures

---

## Story H.6: Offseason Hub as Fallback Polish

**As a** visitor in the rare case the offseason hub renders,
**I want** the offseason experience to still look polished with correct data,
**So that** the hub never shows broken or empty content.

### Acceptance Criteria

**Given** the offseason hub renders (fallback case)
**When** the page loads
**Then** the Champion Banner shows at the top (if champion data exists)
**And** "League at a Glance" stats render in proper card format with correct data
**And** the recap section shows stats from the most recent completed season (not zeros)
**And** recent moves show player names

### Implementation Notes

- This story is satisfied by Stories H.2 and H.3 (data fixes) combined with the existing offseason layout
- The offseason hub may rarely render in practice once H.1 is implemented

---

## Dependency Graph

```
H.1 (State Detection) ─── enables ──→ Preseason Hub renders
H.2 (Recap Data Fix)  ─── fixes  ──→ Both Offseason & Preseason recap
H.3 (Player Names)    ─── fixes  ──→ Transaction Activity everywhere
H.4 (Data Verification) ── depends on ──→ H.1 + H.2
H.5 (Draft Countdown) ─── independent ──→ Can parallel with H.1-H.3
H.6 (Offseason Polish) ── depends on ──→ H.2 + H.3
```

## Implementation Order

**Parallel Track A:** H.1 (state detection) + H.2 (recap data) + H.3 (player names)
**Parallel Track B:** H.5 (draft countdown component)
**Sequential:** H.4 (verification) after Track A completes
**Sequential:** H.6 (acceptance) after all above
