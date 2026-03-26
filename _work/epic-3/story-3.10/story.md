# Story 3.10: Live Score Poller Integration

## Story
As a visitor on game day,
I want scores to update automatically,
So that I don't have to refresh the page.

## Acceptance Criteria

**Given** the hub shows live matchup cards during a game window
**When** the ScorePoller component is active
**Then** it polls /api/live-scores every 30 seconds
**And** matchup card scores update in place
**When** the poller encounters an error
**Then** scores freeze at last known values and pulse stops
**And** the timestamp shows last successful update
**When** games end
**Then** LIVE badges switch to FINAL and the poller stops

## Notes
- FR10: Auto-refresh scores during game windows
- FR30: 30s matchup score sync
- FR31: NFL state endpoint game window detection
- NFR7: Poller degrades gracefully on errors
