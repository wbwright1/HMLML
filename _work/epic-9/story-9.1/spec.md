# Story 9.1 Combined Spec: Draft Board "Train" View Component

---
## Orchestrator Summary
- **Agent**: REQS + UXA (combined)
- **Story**: 9.1
- **Verdict**: COMPLETE
- **State transition**: analysis -> uxa-complete
- **Flags for orchestrator**: Position color hex values are defined here and must be treated as the canonical source; Story 9.3 spec references the same values. The `lib/position-colors.ts` module is the single source of truth both stories share.
---

---
## Part 1: Requirements Brief (REQS)
---

### Story Reference

Story 9.1: Draft Board "Train" View Component
Source: `_work/epic-9/story-9.1/story.md`, `_work/epic-9/cross-story-context.md`

### Restated Acceptance Criteria

**AC-1** (completed draft, grid structure)
- Given a completed draft exists for a season
- When the visitor navigates to `/drafts/[seasonYear]`
- Then the page renders a grid with teams as columns and rounds as rows
- And each cell is color-coded by the drafted player's position
- And each cell shows the pick number, player last name (or abbreviated name), and position abbreviation

**AC-2** (snake draft order)
- Given a completed draft
- When the grid renders
- Then odd rounds run left-to-right (pick order ascending by column index)
- And even rounds run right-to-left (pick order descending, columns reversed)

**AC-3** (12-team desktop, no horizontal scroll)
- Given the draft has 12 teams and 3 or more rounds
- When rendered on a desktop viewport (1200px+)
- Then all 12 columns are visible simultaneously without any horizontal scroll

**AC-4** (mobile horizontal scroll)
- Given the visitor is on a mobile viewport
- When viewing the draft board
- Then the grid scrolls horizontally
- And team header columns are sticky (do not scroll away)
- And round labels on the left edge remain visible

**AC-5** (QB position color)
- Given a cell's player position is QB
- When rendered
- Then the cell background uses the QB position color, visually distinct from all other positions

### Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `components/draft-board.tsx` | CREATE | New grid component; receives pre-shaped data as props |
| `app/drafts/[seasonYear]/page.tsx` | MODIFY | Replace MobileTableView + round-loop with `<DraftBoard>` |
| `lib/position-colors.ts` | CREATE | Shared color map (also used by Story 9.3); see Story 9.3 spec |

### Data Shape Contract

The component receives already-processed data. The page (`app/drafts/[seasonYear]/page.tsx`) is responsible for shaping the raw `DraftPickWithFranchise[]` into the structure `DraftBoard` expects:

```
interface DraftBoardTeam {
  franchiseId: string
  franchiseName: string | null
  franchiseAbbreviation: string | null
  franchiseBrandingColor: string | null
  franchiseSlug: string | null
  // column index in round 1 (0-based, determines snake order)
  draftPosition: number
}

interface DraftBoardCell {
  pickNumber: number          // overall pick number (1, 2, 3...)
  roundPickNumber: number     // pick within round (1.01, 1.02...)
  playerName: string | null
  playerPosition: string | null
  franchiseId: string | null
  isEmpty: boolean            // true for upcoming/empty cells
}

interface DraftBoardRound {
  roundNumber: number
  // cells in left-to-right display order (snake direction already resolved)
  cells: DraftBoardCell[]
}

interface DraftBoardProps {
  teams: DraftBoardTeam[]     // ordered by draftPosition ascending
  rounds: DraftBoardRound[]
  totalTeams: number          // 10 for legacy era, 12 for modern
  isUpcoming: boolean
}
```

### Business Rules

**BR-1 Snake order resolution:** For each round, if `roundNumber` is odd, teams display left-to-right in ascending `draftPosition` order. If `roundNumber` is even, teams display right-to-left (the cell at column index `N` in an even round belongs to the team that was at column `totalTeams - 1 - N` in round 1). The page/data-shaping layer must output cells in display order so the component renders sequentially.

**BR-2 Player name display:** Show player last name. If the full `playerName` is stored as "First Last", extract the last token. If the name is a single token (legacy data), show it as-is. Truncate to fit the cell width with CSS `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.

**BR-3 Pick number format:** Display as `R.PP` where R = round number and PP = zero-padded pick within round. Examples: `1.01`, `1.12`, `3.07`. This is the `roundPickNumber` field.

**BR-4 Team count:** Legacy era drafts (12 teams that were previously 10) must use `totalTeams: 10` to calculate grid column count and snake reversal logic correctly. The `isLegacyEra` flag from `DraftPickWithFranchise` determines this.

**BR-5 No picks = empty board:** When `isUpcoming` is true, all cells render as empty with pick slot numbers but no player data (Story 9.2 handles the full upcoming draft case; this story delivers the empty-cell visual treatment).

**BR-6 Component purity:** `DraftBoard` must be a React Server Component (no `"use client"`). All data shaping happens in the page server component before passing props.

### Database Changes

None. Story 9.1 reads from existing `draft_picks`, `franchises`, `seasons`, `players` tables via the existing `getDraftBySeasonYear` query.

### API Endpoints

None new. The existing `GET /drafts/[seasonYear]` page route continues to use `getDraftBySeasonYear`.

### Cross-Cutting Concerns Checklist

- [x] No `"use client"` on the component
- [x] All text over colored backgrounds must meet WCAG 2.1 AA (4.5:1 body, 3:1 large text) -- enforced by position color choices in Story 9.3
- [x] No red/purple pairing (accessibility constraint, league member has red/purple color blindness)
- [x] Mobile behavior: horizontal scroll + sticky headers
- [x] Tabular figures on pick numbers (`font-variant-numeric: tabular-nums`)
- [x] Position colors imported from `lib/position-colors.ts` (no inline color logic)
- [x] Component imports from `@/lib/position-colors` not from `@/components/position-badge`

### NFR Targets

- Desktop render: all 12 columns visible at 1200px container width (cell width ~92px accounting for round label column)
- No layout shift on load (server-rendered grid, fixed dimensions)
- Accessible: grid uses proper `role="grid"`, `role="rowheader"`, `role="columnheader"`, `role="gridcell"` ARIA roles

### Forward Dependencies

- Story 9.2 uses `DraftBoard` with `isUpcoming: true` and all-empty cells
- Story 9.3 creates `lib/position-colors.ts`; Story 9.1 imports from it (build order: 9.3 delivers color module first, then 9.1 consumes it)

### Open Questions

None. The reference image (`photos/DraftTrain.png`) resolves all layout ambiguities: teams are columns, rounds are rows, pick number appears small in each cell, player name is the dominant text.

---
## Part 2: UXA Component Spec (UXA)
---

### Reference Image Analysis

The `DraftTrain.png` reference shows:
- Team avatar/logo at the top of each column, then team name below
- Each cell has a vivid solid background (the position color fills the entire cell)
- Player name is the dominant text in the cell (medium weight)
- Pick number appears small in the upper-left corner
- Position abbreviation appears small below the player name
- Cells are approximately square-ish, slightly wider than tall
- Round labels appear as a left-side column header for each row
- Direction arrows are NOT shown in the reference image; snake order is implied by pick numbering

### Component: `DraftBoard`

**File:** `components/draft-board.tsx`
**Tier:** Tier 1 Signature Component (built from scratch)
**Type:** React Server Component

#### Overall Layout Structure

```
[Sticky wrapper: overflow-x-auto on mobile]
  [Grid container: CSS Grid or HTML table]
    [Header row]
      [Round label column header: empty/blank corner]
      [Team header cell × N] (one per team)
    [Round rows × R]
      [Round label cell]
      [Pick cell × N] (one per team in this round)
```

#### Grid Container

- **Desktop (md+):** CSS Grid with `grid-template-columns: 48px repeat(N, 1fr)` where N is `totalTeams`
  - The first column is the round label gutter (48px fixed)
  - Remaining columns divide equally; at 1200px container with 12 teams and 48px gutter: `(1200 - 48) / 12 = 96px` per column. This satisfies the "12 columns visible" requirement.
- **Mobile (< md):** Horizontal scroll. Container uses `overflow-x-auto`. Column widths switch to fixed `minmax(88px, 1fr)` so cells don't collapse below readable size.
- **Implementation:** Use `<div>` with CSS Grid (not `<table>`) for layout flexibility with sticky headers. Apply `role="grid"` to the container.

#### Team Header Row

Each team header cell:
- **Height:** 64px
- **Background:** `--surface` (`#FFFFFF`)
- **Top border accent:** 3px solid stripe using the franchise's `franchiseBrandingColor`. If no `franchiseBrandingColor`, fall back to `--border-strong` (`#D4CFC9`).
- **Content (vertically centered):**
  - Franchise abbreviation in **Caption** style: 12px, Medium (500), uppercase, `0.06em` tracking, color `--text-primary`
  - If abbreviation is null, show first 3 chars of franchise name, uppercased
- **Sticky behavior:** On mobile, the team header row is sticky with `position: sticky; top: 0; z-index: 10`. The corner cell (round label gutter) is also sticky at `left: 0`.
- **Accessibility:** `role="columnheader"` on each team cell; link to `/teams/[franchiseSlug]` if slug is available (wraps abbreviation text in `<a>`)

**[UXA EXTRAPOLATION]** The reference image shows player headshot avatars in the team header. Since this data may not be reliably available and CLAUDE.md specifies headshots as progressive enhancement, the spec uses abbreviation text only. Headshots can be added as enhancement in a future story.

#### Round Label Column

- **Width:** 48px (fixed gutter)
- **Each round label cell:**
  - Height: same as pick cells (52px)
  - Background: `--canvas` (`#FAF8F5`)
  - Content: Round number in **Caption** style: `R1`, `R2`, etc. Color `--text-tertiary`. Rotated 0deg (horizontal text); the narrow column fits 2 chars comfortably.
  - `role="rowheader"` ARIA role
  - On mobile: sticky `left: 0; z-index: 5; background: --canvas` so round labels don't scroll away

#### Pick Cells (Filled)

- **Dimensions:** Width = column width (fluid, ~96px desktop, 88px minimum mobile). Height: 52px fixed.
- **Background:** Position color (vivid, full fill) from `lib/position-colors.ts`, `cell.bg` value
- **Border:** 1px solid `rgba(0,0,0,0.08)` for cell separation (semi-transparent so it works on any color)
- **Padding:** 4px 6px (tight; information density is priority)
- **Content layout (flex column):**
  ```
  [Pick number: top-left]      12px, Regular, white, opacity 0.75, tabular-nums
  [Player last name]           13px, Medium (500), white, truncated with ellipsis
  [Position abbreviation]      11px, Medium (500), white, opacity 0.85, uppercase
  ```
- **Pick number:** `R.PP` format (e.g., `1.01`). Use `font-variant-numeric: tabular-nums`.
- **Player name:** Last name only. Max 1 line. `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. If full name is "Patrick Mahomes", display "Mahomes". If name has only one token, display as-is.
- **Text color:** White (`#FFFFFF`) on all position-colored cell backgrounds. Contrast ratios verified per position (see Story 9.3 spec for exact contrast calculations).
- **`role="gridcell"`** ARIA role. `aria-label` = `"Pick [pickNumber]: [playerName], [position], [franchiseName]"` for screen readers.

#### Pick Cells (Empty / Upcoming)

- **Background:** `--surface-muted` (`#F5F2EE`)
- **Border:** 1px solid `--border` (`#E8E4E0`)
- **Content:**
  ```
  [Pick number: top-left]      12px, Regular, --text-tertiary, tabular-nums
  [TBD text]                   13px, Regular, --text-muted
  ```
- **No position or player name shown**
- `aria-label` = `"Pick [pickNumber]: empty"` or `"Pick [pickNumber]: upcoming"`

#### Snake Direction Indicator

**[UXA EXTRAPOLATION]** The reference image does not show explicit direction arrows. The snake order is self-evident from the pick numbers (odd rounds number left-to-right, even rounds number right-to-left). No visual arrow is needed. The UX spec is silent on this; the implicit approach is adopted.

If the product owner wants explicit direction arrows in the future, a small `←` or `→` icon can be placed in the round label cell for even/odd rounds respectively.

#### Direction: Odd vs. Even Rounds

In the rendered grid, even-round cells appear in reverse visual order (rightmost column = pick 1 of the round, leftmost = last pick of the round). The cells are pre-sorted in display order by the data-shaping layer. The component renders cells in array order without knowing about snake direction.

This means: for an even round, the cell with the lowest pick number within the round appears in the rightmost column. The pick number shown in each cell (`1.07`, `1.08`, etc.) naturally communicates the order to the reader without any additional visual treatment.

#### Visual States

**Initial Load (Server Rendered)**
- No loading spinner. Page is server-rendered. Grid appears fully populated on load.
- If `getDraftBySeasonYear` returns null/empty, the page calls `notFound()` -- the `DraftBoard` component itself never receives empty data.

**Populated State**
- All cells filled with position colors and player data (completed draft)

**Upcoming/Empty State**
- All cells use the empty cell treatment (surface-muted background, TBD text, pick slot number)
- Team headers still appear (teams are known from draft order even pre-draft)
- Handled by `isUpcoming: true` prop; see Story 9.2

**Error State**
- Handled at the page level, not within `DraftBoard`. If the query fails, the page shows the standard site error state (outside scope of this component).

### Layout and Responsive Behavior

| Breakpoint | Column Width | Cell Height | Round Label | Behavior |
|---|---|---|---|---|
| `< 768px` (mobile) | 88px fixed min | 52px | 48px sticky left | Horizontal scroll; sticky header row + sticky round label column |
| `768px - 1199px` (tablet) | ~80px fluid | 52px | 48px | Horizontal scroll permitted |
| `>= 1200px` (desktop) | `(containerWidth - 48) / N` fluid | 52px | 48px | No scroll; all columns visible |

**Sticky implementation on mobile:**
- Outer container: `overflow-x-auto`
- Team header row: `position: sticky; top: 0; z-index: 10; background: --surface`
- Round label cells: `position: sticky; left: 0; z-index: 5; background: --canvas`
- The corner cell (intersection of sticky row and sticky column): `z-index: 15` to layer above both

### Design Tokens Used

All from HMLML brand system:
- `--canvas` (#FAF8F5): page background and round label column
- `--surface` (#FFFFFF): team header cell background
- `--surface-muted` (#F5F2EE): empty cell background
- `--border` (#E8E4E0): empty cell border
- `--border-strong` (#D4CFC9): fallback team header accent
- `--text-primary` (#1A1A1A): team abbreviation text
- `--text-tertiary` (#7A756F): round label text, pick number in empty cells
- `--text-muted` (#9C9590): TBD text in empty cells

Position colors: imported from `lib/position-colors.ts`. See Story 9.3 spec for full palette.

### Accessibility Requirements

1. Container: `role="grid"`, `aria-label="[Year] Draft Board"`
2. Team header cells: `role="columnheader"`, `scope="col"`
3. Round label cells: `role="rowheader"`, `scope="row"`
4. Pick cells: `role="gridcell"`, `aria-label="Pick [N]: [PlayerName], [Position], [Franchise]"`
5. Empty cells: `role="gridcell"`, `aria-label="Pick [N]: upcoming"`
6. Team name links: standard `<a>` with visible focus ring (2px offset, `--accent-green` color)
7. All text-on-color meets WCAG 2.1 AA 4.5:1 minimum (white on position cell backgrounds; see Story 9.3 contrast table)
8. No information conveyed by color alone: position abbreviation text accompanies every color-coded cell
9. No red/purple pairings; position palette explicitly avoids these (see Story 9.3)

### Integration with Existing Page

`app/drafts/[seasonYear]/page.tsx` currently renders a round-by-round loop using `MobileTableView`. The modification:
1. Import `DraftBoard` and the shaping helper
2. Shape `draft.picks` into `DraftBoardProps` (teams, rounds, cells in display order)
3. Replace the existing `rounds.map(...)` block with a single `<DraftBoard ... />`
4. Keep the existing page header (back link, "Draft Board" caption, year title, `SuperlativeBadge` for draft type)
5. Keep the `ScrollReveal` wrapper around the `DraftBoard` if desired (optional, since the grid is the page's primary content and not a card section)

### Extrapolations Log

- **[UXA EXTRAPOLATION 1]** No snake direction arrows. Pick numbers communicate order; arrows are noise at this information density.
- **[UXA EXTRAPOLATION 2]** Team headers use franchise abbreviation text only (no headshots in Phase 1). Progressive enhancement path exists.
- **[UXA EXTRAPOLATION 3]** Cell border uses `rgba(0,0,0,0.08)` semi-transparent black rather than a named token, to maintain visual separation across all position color backgrounds without requiring 6 different border color tokens.
- **[UXA EXTRAPOLATION 4]** Text opacity in cells (0.75 for pick number, 0.85 for position) creates subtle hierarchy within white text on colored backgrounds without needing additional color tokens.
