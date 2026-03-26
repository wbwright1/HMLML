# Story 3.14: Regular Season Hub Layout (Game Windows)

## Story
As a visitor during active games,
I want the hub focused on live scores,
So that game day is the primary experience.

## Acceptance Criteria

**Given** the hub state is regular season AND games are in progress
**When** the hub page renders
**Then** components appear in order: Week Banner (game window state) > Live Matchups (all 6 matchup cards)
**And** all matchup cards are visible (not limited to top 5)
**And** the layout is responsive (single column mobile, potentially 2-col desktop)

## Notes
- UX-DR23: Hub regular season state (game windows)
- FR9: View weekly matchup scores
- FR10: Auto-refresh scores during game windows
