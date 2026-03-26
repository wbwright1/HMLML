# Story 6.3: Playoff Bracket Live Integration

## Story
As a visitor during live playoff games,
I want bracket scores to update in real time,
So that I can follow the playoff action live.

## Acceptance Criteria

**Given** playoff games are in progress
**When** the hub or Playoffs page shows bracket cards
**Then** active matchups show the LIVE indicator
**And** scores update via the existing poller every 30 seconds
**And** completed games switch from LIVE to FINAL

## Notes
- UX-DR5: Week Banner component (playoff variant)
- UX-DR14: Playoff Bracket Card with live integration
