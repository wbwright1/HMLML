# Story 3.2: Week Banner Game Window State

## Story
As a visitor during active games,
I want the banner to reflect that games are in progress,
So that I know scores are updating live.

## Acceptance Criteria

**Given** the NFL state indicates games are in progress
**When** the Week Banner renders
**Then** the context line shows "N games in progress"
**And** a subtle CSS pulse animation is visible (decorative, aria-hidden)
**And** the pulse does not convey information that isn't also in text

## Notes
- UX-DR5: Week Banner game window active state
- UX-DR38: Animation discipline (pulse allowed for live data)
