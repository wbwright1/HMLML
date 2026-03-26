# Story 9.1: Draft Board "Train" View Component

## User Story

**As a** visitor viewing any draft (past or upcoming),
**I want** to see a visual draft board grid ("draft train") showing teams as columns and rounds as rows with position-colored pick cells,
**So that** I can see the full draft at a glance, who picked who and where, with visual position differentiation.

## Reference

See `photos/DraftTrain.png` for the target layout. Key characteristics:
- Teams are columns (12 columns for modern era, 10 for legacy)
- Rounds are rows
- Each cell shows: pick number, player name (truncated), position
- Cells are color-coded by position (QB, RB, WR, TE, K, DEF)
- Team headers at the top with team name/abbreviation
- Snake draft: odd rounds L-to-R, even rounds R-to-L (pick order reverses)
- Compact cells; information density is the priority

## Acceptance Criteria

**Given** a completed draft exists for a season
**When** the visitor navigates to `/drafts/[seasonYear]`
**Then** the draft board renders as a grid with teams as columns and rounds as rows
**And** each cell is color-coded by the drafted player's position
**And** each cell shows the pick number, player last name (or abbreviated name), and position abbreviation
**And** the grid handles snake draft order (even rounds reverse direction)

**Given** the draft has 12 teams and 3 rounds
**When** rendered on desktop
**Then** all 12 columns are visible without horizontal scrolling (cells are compact)

**Given** the visitor is on mobile
**When** viewing the draft board
**Then** the grid scrolls horizontally with sticky team headers and round labels

**Given** a cell's player position is QB
**When** rendered
**Then** the cell background uses the QB position color (distinct from RB, WR, TE, etc.)

## Implementation Notes

- Create `components/draft-board.tsx` as the new component
- Position colors should be vivid and distinct (the image uses: QB=red/coral, RB=green/teal, WR=blue, TE=orange, K/DEF=grey)
- Use HMLML design tokens where possible but position colors can extend the palette since they need to be highly distinct
- Cell dimensions: approximately 100-120px wide, 50-60px tall on desktop
- Player name should truncate to fit: show last name, truncate with ellipsis if needed
- Pick number in small text (top-left or top corner of cell)
- Team header row: show franchise abbreviation (or short name), branding color accent
- Round labels on the left edge
- For upcoming/incomplete drafts, empty cells render as neutral/muted background with "TBD" or pick number only
