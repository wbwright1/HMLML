# Story 7.2: Player Status Badges

## Story
As a visitor viewing player information,
I want clear status indicators,
So that I know a player's availability at a glance.

## Acceptance Criteria

**Given** a player has a status
**When** the status badge renders
**Then** "Active" shows green badge with "Active" text
**And** "IR" shows warm badge with "IR" text
**And** "Questionable" shows warm badge with "Questionable" text
**And** "Out" shows warm badge with "Out" text
**And** unowned free agents show neutral badge with "Unowned" text
**And** every badge includes its text label; never relies on color alone

## Notes
- FR25: Player results display status designation
- FR36: All color-coded information has secondary indicators
