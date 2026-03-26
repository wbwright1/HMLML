# Story 2.2: Draft Countdown Component

## Story
As a visitor in the preseason,
I want to see a countdown to the draft,
So that I can feel the anticipation building.

## Acceptance Criteria

**Given** the hub is in preseason state and a draft date is set
**When** the Draft Countdown renders
**Then** it shows a centered card with surface background and border
**And** "ROOKIE DRAFT COUNTDOWN" caption appears in accent-green, uppercase
**And** four countdown segments display: days, hours, min, sec in Display/Black weight with tabular figures
**And** unit labels appear below each segment in caption style
**And** the countdown updates every second via client-side interval
**And** aria-label provides context: "N days, N hours, N minutes, N seconds until rookie draft"
**When** the draft begins
**Then** the countdown component disappears from the hub

## Notes
- UX-DR6: Draft Countdown component spec
