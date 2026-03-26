# Story 9.2 Combined Spec: Upcoming Draft Page & Drafts Tab Integration

---
## Orchestrator Summary
- **Agent**: REQS + UXA (combined)
- **Story**: 9.2
- **Verdict**: COMPLETE
- **State transition**: analysis -> uxa-complete
- **Flags for orchestrator**: This story requires fetching draft metadata from the Sleeper API at page-render time (or during a sync job) to know that a draft exists before any picks are made. The current `getDraftBySeasonYear` returns `null` when there are no picks, causing a 404. The fix requires either: (a) storing the draft shell record in Postgres during sync, or (b) calling the Sleeper API live from the page. Option (a) is strongly preferred per CLAUDE.md architecture (no live Sleeper calls from page components). This flag asks the orchestrator to confirm Option (a) is the expected approach before the developer begins DB/sync work.
---

---
## Part 1: Requirements Brief (REQS)
---

### Story Reference

Story 9.2: Upcoming Draft Page & Drafts Tab Integration
Source: `_work/epic-9/story-9.2/story.md`, `_work/epic-9/cross-story-context.md`

### Restated Acceptance Criteria

**AC-1** (drafts index shows upcoming draft)
- Given the latest season has a draft with status `pre_draft` (no picks yet)
- When the visitor navigates to `/drafts`
- Then the upcoming draft appears at the top of the list
- And it displays an "Upcoming" badge
- And it links to `/drafts/[seasonYear]`

**AC-2** (upcoming draft detail page renders, no 404)
- Given the visitor navigates to `/drafts/[seasonYear]` for a season with an upcoming draft (no picks)
- When the page loads
- Then the page does NOT return a 404
- And the draft board renders with team headers
- And each pick slot shows a pick slot number (e.g., `1.01`, `1.12`) but no player name
- And the page title shows "[Year] Draft" with an "Upcoming" badge

**AC-3** (hub link does not 404)
- Given the hub "View Full Draft Order" link points to `/drafts/[seasonYear]` for the current season
- When the visitor clicks it
- Then they reach the upcoming draft page (no 404)

### Root Cause Analysis

**Current bug:** `getDraftBySeasonYear` in `lib/queries/drafts.ts` (line 154) returns `null` when `rows.length === 0`. This causes `app/drafts/[seasonYear]/page.tsx` (line 49) to call `notFound()`. The season record exists in the `seasons` table but no `draft_picks` rows exist yet.

Similarly, `getDraftsByYear` in `lib/queries/drafts.ts` only scans the `draft_picks` table, so a season with no picks is invisible to the drafts index.

### Solution: Draft Shell Record

The preferred fix (per CLAUDE.md: "All data served from local Postgres cache; no page load triggers a live Sleeper API call") is to store a draft shell record during the daily sync. A new `drafts` table (or a new field on `seasons`) stores the Sleeper draft ID, draft type, draft order JSON, and status for the current season before any picks are made.

**Option A (new `drafts` table):** Add a `drafts` table to store the draft shell. This is the cleanest approach and forwards-compatible.

**Option B (extend `seasons`):** Add `currentDraftId`, `currentDraftStatus`, `currentDraftOrder` JSON to the `seasons` table. Lower migration surface but mixes concerns.

**Recommended: Option A.** The orchestrator flag above asks for confirmation before implementing.

### Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `lib/db/schema.ts` | MODIFY | Add `drafts` table (new table for draft shell) |
| `lib/db/migrations/` | CREATE | Drizzle migration for the new `drafts` table |
| `lib/sync/daily.ts` | MODIFY | Sync the draft shell record during daily sync |
| `lib/queries/drafts.ts` | MODIFY | Update both query functions to use `drafts` table |
| `app/drafts/page.tsx` | MODIFY | Show upcoming draft entry with "Upcoming" badge |
| `app/drafts/[seasonYear]/page.tsx` | MODIFY | Handle upcoming draft (no picks) without 404 |
| `components/draft-board.tsx` | MODIFY | Accept `isUpcoming: true` and render empty cells |

### New Database Table: `drafts`

```sql
CREATE TABLE drafts (
  id              SERIAL PRIMARY KEY,
  season_id       INTEGER NOT NULL REFERENCES seasons(id),
  draft_id        TEXT NOT NULL UNIQUE,       -- Sleeper draft_id
  draft_type      TEXT NOT NULL,              -- 'startup' | 'rookie'
  status          TEXT,                       -- 'pre_draft' | 'drafting' | 'complete'
  draft_order     JSONB,                      -- { [roster_id]: pick_position } from Sleeper
  settings_json   JSONB,                      -- raw Sleeper draft settings
  is_legacy_era   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_drafts_season_id ON drafts(season_id);
```

**Drizzle schema variable name:** `drafts` (camelCase in TypeScript: `draftsTable` to avoid collision with the existing `getDraftsByYear` function naming)

**Note:** The existing `draft_picks.draft_id` column already references Sleeper's draft ID. The `drafts.draft_id` becomes the parent record that `draft_picks` rows belong to. No FK enforcement required in Phase 1; the text string match is sufficient.

### Updated Query Logic

**`getDraftsByYear` (updated):**
- Join `drafts` table with `seasons` table
- For each draft, count picks from `draft_picks` (LEFT JOIN, so 0 picks is valid)
- Return drafts with `pickCount: 0` and `status: 'pre_draft'` for upcoming drafts
- Sort order: current/upcoming season first, then descending by year

**`getDraftBySeasonYear` (updated):**
- First check the `drafts` table for this season (not `draft_picks`)
- If no draft record exists: return `null` (404 is correct)
- If a draft record exists but `picks.length === 0`: return the draft shell with empty picks array (NOT null)
- Page logic: change `if (!draftData || draftData.drafts.length === 0)` to only 404 if no draft record exists at all

**New export: `getUpcomingDraftOrder`:**
```typescript
// Returns franchise info ordered by draft position for an upcoming draft
// Used to show team headers on the empty draft board
async function getUpcomingDraftOrder(seasonYear: number): Promise<DraftBoardTeam[]>
```
This queries the `drafts.draft_order` JSON to map roster IDs to franchise info from `franchise_seasons`.

### Sync Changes (Daily Sync)

The daily sync (`lib/sync/daily.ts`) must be updated to:
1. Call `GET /v1/league/{league_id}/drafts` (Sleeper endpoint) to fetch all drafts for the current season
2. For each draft returned, upsert into the `drafts` table (draft_id, draft_type, status, draft_order JSON)
3. Log to `sync_log` with `data_type: 'drafts'`
4. The existing draft picks sync (which calls individual draft endpoints) continues unchanged

**Sleeper API endpoint for draft list:** `GET https://api.sleeper.app/v1/league/{league_id}/drafts`
Returns array of draft objects including `draft_id`, `type`, `status`, `draft_order`, `settings`.

### Validation Schema

Add to `lib/sleeper-schemas.ts`:
```typescript
const SleeperDraftSchema = z.object({
  draft_id: z.string(),
  league_id: z.string(),
  type: z.string(),
  status: z.string(),
  draft_order: z.record(z.string(), z.number()).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
  season: z.string().optional(),
  season_type: z.string().optional(),
  created: z.number().optional(),
  start_time: z.number().optional(),
})
const SleeperDraftListSchema = z.array(SleeperDraftSchema)
```

### Business Rules

**BR-1 Upcoming draft definition:** A draft is "upcoming" when the `drafts.status` is `'pre_draft'` or `'drafting'` AND the `draft_picks` count for that draft_id is 0. If picks have started, it is no longer "upcoming" even if status is still `'drafting'`.

**BR-2 Draft order for upcoming board:** The `draft_order` JSON from Sleeper maps `roster_id` (string) to pick position (integer, 1-based). Use this to assign team columns. If `draft_order` is null (Sleeper hasn't set it yet), order teams by `franchise_seasons.roster_id` ascending as a fallback.

**BR-3 No 404 for upcoming:** The page must NOT call `notFound()` when a `drafts` record exists with 0 picks. It should render the empty board.

**BR-4 "Upcoming" badge:** Uses `SuperlativeBadge` with a new `variant: "upcoming"` (teal/green, distinct from the existing green "Startup" badge). See UXA spec below.

**BR-5 Legacy era:** Upcoming rookie drafts for the current (non-startup) era use `isLegacyEra: false` and `totalTeams: 12`.

### Cross-Cutting Concerns Checklist

- [x] No live Sleeper API calls from page components; all data via Postgres
- [x] Zod validation on `SleeperDraftListSchema` before writing to DB
- [x] Sync writes atomic per data type; draft shell sync logged to `sync_log`
- [x] No `"use client"` on any new or modified page/component
- [x] Drizzle ORM used for all DB access; no raw SQL outside migrations
- [x] The 404 fix preserves existing behavior: seasons with no `drafts` record still 404 correctly

### NFR Targets

- Page load for upcoming draft: same as completed draft (server-rendered, single DB query)
- Sync: `GET /v1/league/{league_id}/drafts` counts as 1 API call per daily sync run (well within 1,000 calls/minute limit)

### Forward Dependencies

- The `DraftBoard` component from Story 9.1 must accept `isUpcoming: true` and render empty cells before this story can complete AC-2
- Build order recommendation: Story 9.3 (color module) -> Story 9.1 (board component) -> Story 9.2 (page integration)

### Open Questions (Flagged for Orchestrator)

**OQ-1:** Confirm Option A (new `drafts` table) vs. Option B (extend `seasons`) is the right approach. Option A is recommended but requires a new migration.

**OQ-2:** If `draft_order` is null in Sleeper (commish hasn't randomized yet), should the board show "TBD" team placeholders or just pick slots with no team? Proposed resolution: show pick slots with no team header (just slot numbers), and note "Draft order not yet set" above the board. This avoids showing misleading team positions.

---
## Part 2: UXA Component Spec (UXA)
---

### Modified Page: `/drafts` (Drafts Index)

#### Upcoming Draft Card

The drafts index renders each draft as a clickable card (`<Link>`). The existing card structure is preserved; the upcoming draft card gets:

**Badge treatment:**
- Replace: `SuperlativeBadge` with variant `"neutral"` for Rookie, `"green"` for Startup
- Add: A new `"upcoming"` variant to `SuperlativeBadge` for the upcoming draft entry

**New `SuperlativeBadge` variant: `"upcoming"`**
```
Background: --accent-green-light (#E8F0EB)
Text color:  --accent-green (#2D5A3D)
Text:        "Upcoming"
```
This uses the existing green token family but distinguishes from the "Startup" badge (which uses `bg-primary/10 text-primary`, which maps to shadcn's primary, not HMLML's accent-green tokens). The upcoming badge should explicitly use HMLML tokens, not shadcn defaults.

**[UXA EXTRAPOLATION]** The story requests the badge say "Upcoming". Using the existing `SuperlativeBadge` component with a new variant keeps the implementation consistent. The "upcoming" variant is visually distinct from "Startup" (green solid vs. green light) while staying within the same green family to signal "current/active" status.

**Card position:** The upcoming draft card renders first (topmost position in the list), sorted before all completed drafts regardless of year. The sort logic in the query places `status = 'pre_draft'` records at the top.

**Pick count line:** Instead of `"[N] picks"`, show `"Draft order set"` if `draft_order` is non-null, or `"Draft order pending"` if null. These are body small text in `--text-tertiary`.

**Visual differentiation:** The upcoming card uses a subtle `--accent-green-light` left border (4px solid) to distinguish it from historical draft cards at a glance.

```
[Card border: 1px --border, hover --border-strong]
[Left accent bar: 4px solid --accent-green-light]
  [Year: H3, --text-primary]
  [SuperlativeBadge: "Upcoming" variant]
  [DraftTypeBadge: "Rookie" neutral]
  [Subline: "Draft order set" OR "Draft order pending" in Body Small --text-tertiary]
[Arrow: →, --text-tertiary]
```

#### States for Drafts Index

**Populated (with upcoming):** Upcoming card at top with green-light accent bar, historical cards below.
**Populated (no upcoming):** Existing behavior unchanged.
**Empty:** Existing `EmptyState` component unchanged.
**Error:** Page-level try/catch already present; existing behavior unchanged.

### Modified Page: `/drafts/[seasonYear]` (Upcoming Draft Detail)

#### Page Header

```
[← All Drafts link]
[Caption: "Draft Board" in --accent-green uppercase]
[H1: "[Year] Draft"]
[Badges row]:
  SuperlativeBadge "Upcoming" (green variant)
  SuperlativeBadge "Rookie" (neutral variant) OR "Startup" (green variant)
```

**[UXA EXTRAPOLATION]** When `isUpcoming` is true, add the "Upcoming" badge alongside the draft type badge. This mirrors the pattern used on the drafts index card.

#### Draft Board (Upcoming State)

The `DraftBoard` component receives `isUpcoming: true`. All cells render as empty cells (see Story 9.1 spec for empty cell visual treatment).

If `draft_order` is null (team columns not yet assigned):
- Show a contextual notice above the board:
  ```
  [Surface card, --accent-green-light border]
  [Text: "Draft order has not been set yet. Team positions will appear here once the commish randomizes the order."]
  [Style: Body Small, --text-secondary]
  ```
- Show the board with anonymous column headers ("Team 1", "Team 2", etc.) using `--text-muted` text

If `draft_order` is set:
- Show team headers with franchise abbreviations and branding color accents (per Story 9.1 spec)
- Each pick slot shows the slot number (`1.01`, `1.02`, etc.) in the empty cell style

#### Stats line (below badges)

For upcoming drafts: `"[N] picks · [R] rounds · [M] teams"` sourced from `drafts.settings_json` (e.g., `picks_per_team` × `total_rosters`).

If settings are unavailable: omit the stats line.

#### States for Draft Detail Page

**Upcoming state (no picks, draft_order set):**
- Team headers with franchise abbreviations
- Empty cells with pick slot numbers
- "Upcoming" badge in header

**Upcoming state (no picks, draft_order null):**
- Notice card above board
- Anonymous team columns
- Empty cells with pick slot numbers

**Completed state:**
- Existing behavior, now using `DraftBoard` (Story 9.1)

**No draft record (404):**
- Existing `notFound()` behavior; only triggered when no `drafts` row exists for the season year

**Error state (DB unavailable):**
- Existing try/catch; existing behavior unchanged (empty/null guard)

### Design Tokens

Same as Story 9.1, plus:
- `--accent-green-light` (#E8F0EB): upcoming badge background, left accent bar on index card, notice card border
- `--accent-green` (#2D5A3D): upcoming badge text
- `--text-muted` (#9C9590): anonymous team column text when draft order not set

### Accessibility Requirements

1. "Upcoming" badge: `aria-label="Upcoming draft"` if the text alone could be ambiguous in context
2. Notice card (when draft order null): `role="status"` so screen readers announce it
3. Draft index cards: existing link pattern preserved; "Upcoming" badge is decorative within the `<Link>` (link text provides context)
4. All interactive elements maintain existing keyboard navigation and focus ring behavior

### Extrapolations Log

- **[UXA EXTRAPOLATION 1]** "Upcoming" SuperlativeBadge variant uses `--accent-green-light` bg + `--accent-green` text, using HMLML tokens (not shadcn defaults). Matches the green semantic meaning (active/live) without conflicting with the "Startup" badge.
- **[UXA EXTRAPOLATION 2]** Left accent bar (4px `--accent-green-light`) on the upcoming card in the drafts index. Not specified in story; added to give the upcoming draft visual prominence without full redesign of the card.
- **[UXA EXTRAPOLATION 3]** "Draft order pending" vs. "Draft order set" copy replaces the "[N] picks" line for upcoming drafts. More informative given that pick count will always be 0.
- **[UXA EXTRAPOLATION 4]** Anonymous column headers ("Team 1", "Team 2") when draft_order is null, with a contextual notice card. Prevents the board from looking broken when order is pending.
