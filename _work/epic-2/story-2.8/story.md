# Story 2.8: Hub Seasonal State Detection

## Story
As a visitor,
I want the hub to automatically show the right content for the current football phase,
So that I always see what's relevant without manual switching.

## Acceptance Criteria

**Given** the NFL state endpoint returns the current season phase
**When** the hub page renders
**Then** the correct seasonal state is detected (preseason, regular season, playoffs, offseason)
**And** state detection drives which hub layout and components render
**And** no manual switching or configuration is required
**And** state transitions happen automatically as the NFL calendar progresses

## Notes
- UX-DR27: Hub state detection driven by NFL state endpoint
