# Story 3.7: Live Matchup Card Live State

## Story
As a visitor during active games,
I want to see which games are live with updating scores,
So that I can follow the action in real time.

## Acceptance Criteria

**Given** a matchup game is in progress
**When** the Live Matchup Card renders in live state
**Then** a green LIVE indicator shows (green dot + "LIVE" text label + CSS pulse)
**And** scores update every 30 seconds from the client-side poller
**And** an optional top scorer callout appears (e.g., "Josh Allen 32.4 pts")
**And** aria-live="polite" is set so screen readers announce score changes

## Notes
- UX-DR11: Live Matchup Card live state
- FR10: Auto-refresh scores during game windows
- FR30: 30s matchup score sync
