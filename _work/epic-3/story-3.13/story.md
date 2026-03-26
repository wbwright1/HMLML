# Story 3.13: Standings Snapshot Card Component

## Story
As a visitor outside game windows,
I want a quick glance at the standings,
So that I know who's leading the league.

## Acceptance Criteria

**Given** standings data is available
**When** the Standings Snapshot Card renders on the hub
**Then** a "STANDINGS, WEEK N" caption and "View Full" link are shown
**And** a compact ranked list displays the top 3 teams and bottom 1 team
**And** each entry shows franchise name (bold) and record (tertiary, W-L format)
**And** the leader has optional green accent treatment
**And** the last place team has optional warm accent treatment
**And** "View Full" link navigates to Records > Current Standings showing all 12 teams

## Notes
- UX-DR13: Standings Snapshot Card component spec
