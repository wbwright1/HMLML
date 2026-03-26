# Story 2.4: Player Award Card Component

## Story
As a visitor,
I want to see which players were the best at each position,
So that I know who carried their teams.

## Acceptance Criteria

**Given** player award data is available
**When** a Player Award Card renders
**Then** a category label appears (gold accent, uppercase: "BEST QB")
**And** a 64px circular player headshot is centered (or position icon fallback if no headshot)
**And** the player name appears bold and centered
**And** the owning franchise name appears in tertiary color
**And** the stat with unit appears (bold stat: "412.8 pts")
**And** the card has gold-tint background and gold border
**When** no headshot is available
**Then** a position icon fallback renders gracefully

## Notes
- UX-DR7: Player Award Card component spec
