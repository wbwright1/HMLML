# Story 6.4: Playoffs Hub Layout

## Story
As a visitor during the playoffs,
I want a hub that focuses on the bracket and remaining games,
So that the playoff picture is immediately clear.

## Acceptance Criteria

**Given** the hub state is playoffs
**When** the hub page renders
**Then** components appear in order: Week Banner (playoff variant) > Playoff Bracket (compact, current round) > Remaining Matchup Cards
**And** the layout is responsive

## Notes
- UX-DR25: Hub playoffs state layout
- UX-DR5: Week Banner (round name variant)
- UX-DR14: Playoff Bracket Card
