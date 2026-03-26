# Story 9.3: Position Color System for Draft Board

## User Story

**As a** visitor viewing the draft board,
**I want** each position to have a distinct, vivid color that is consistent across the entire site,
**So that** I can instantly identify position groups at a glance.

## Acceptance Criteria

**Given** the draft board renders
**When** cells are color-coded by position
**Then** each position has a unique, visually distinct background color:
  - QB: coral/warm (#E8465D or accent-warm variant)
  - RB: teal/green (#2D9B8A or accent-green variant)
  - WR: blue (#4A7FD4)
  - TE: orange/amber (#E09A3D or accent-gold variant)
  - K: grey (surface-muted)
  - DEF: grey (surface-muted)
**And** text on colored backgrounds meets WCAG AA contrast ratios
**And** no red/purple pairing exists (accessibility constraint)

**Given** the PositionBadge component exists at `components/position-badge.tsx`
**When** position colors are updated
**Then** the same color map is used by both PositionBadge and the draft board cells
**And** PositionBadge uses HMLML tokens instead of current shadcn tokens

## Implementation Notes

- Create a shared `lib/position-colors.ts` with the position color map
- Both `components/position-badge.tsx` and `components/draft-board.tsx` import from it
- Current PositionBadge uses shadcn tokens (text-primary, text-gold, text-foreground, bg-muted) that need replacement
- The draft board cells need both bg and text colors; the badge needs both too
- Colors must work on both light cell backgrounds (badge) and as full cell backgrounds (draft board)
- Provide two variants: `badge` (subtle bg + colored text) and `cell` (vivid bg + white text)
