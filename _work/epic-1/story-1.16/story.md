# Story 1.16: Sync Timestamp Component

## Story
As a visitor,
I want to know when data was last updated,
So that I can trust the information I'm seeing.

## Acceptance Criteria

**Given** any page renders
**When** the footer is visible
**Then** a sync timestamp shows "Last updated: [relative time]" in caption/tertiary style
**When** the timestamp is clicked
**Then** it toggles to show the absolute date/time
**When** data is older than 2 hours (hourly sync) or 26 hours (daily sync)
**Then** the timestamp text turns accent-warm color

## Notes
- UX-DR30: Sync Timestamp spec
- FR32: "Last updated" sync timestamp on every page
