# Story 7.1: Player Search Result Card Component

## Story
As a visitor searching for a player,
I want rich result cards showing all relevant info,
So that I can see ownership, status, and position at a glance.

## Acceptance Criteria

**Given** player search results are available
**When** a Player Search Result Card renders
**Then** it shows a player headshot (circle) with position icon fallback
**And** the player name appears in bold
**And** position and NFL team are shown
**And** a status badge shows current status (Active, IR, Questionable, Out, or Unowned)
**And** the HML owner franchise name is shown as a link to the franchise page
**And** a "Last synced" timestamp appears in caption/tertiary style

## Notes
- FR24: Player search by name
- FR25: Player results with HML owner, status
- UX-DR20: Player Search Result Card component spec
