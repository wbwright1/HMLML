# Story 6.1: Playoff Bracket Card (Compact)

## Story
As a visitor during playoffs,
I want to see the current playoff round on the hub,
So that I know who's playing and who's advancing.

## Acceptance Criteria

**Given** the hub is in playoff state
**When** the compact Playoff Bracket Card renders
**Then** it shows the current round matchups only
**And** each matchup shows team names, seeds, and scores
**And** the winner advances with bold styling; the loser is grayed
**And** the eventual champion gets gold accent treatment
**And** the bracket structure is conveyed through semantic headings and lists for accessibility

## Notes
- FR12: Playoff bracket results
- UX-DR14: Playoff Bracket Card component spec
- UX-DR25: Hub playoffs state layout
