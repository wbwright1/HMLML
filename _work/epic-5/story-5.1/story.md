# Story 5.1: Season Timeline Card Component

## Story
As a visitor exploring league history,
I want each season represented as a rich card,
So that I can quickly see the highlights of any year.

## Acceptance Criteria

**Given** season data is available
**When** a Season Timeline Card renders
**Then** it shows the season year (H2), team count ("12 teams" or "10 teams")
**And** the champion name appears in bold with gold accent
**And** runner-up and most PF are shown
**And** a "View" link navigates to the full season detail
**And** legacy era seasons include a subtle "Legacy Era" badge
**When** the card is tapped
**Then** it navigates to the full season detail page

## Notes
- FR1: Chronological timeline of all HML seasons
- FR3: Navigate to season detail from timeline
- UX-DR19: Season Timeline Card component spec
