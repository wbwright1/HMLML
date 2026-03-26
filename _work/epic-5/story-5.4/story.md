# Story 5.4: Rivalry Card Component

## Story
As a visitor settling an argument,
I want to see head-to-head records in a visually impactful way,
So that the data speaks for itself in the group chat.

## Acceptance Criteria

**Given** H2H data exists between two franchises
**When** a Rivalry Card renders
**Then** it shows centered team names with "vs" (H3)
**And** a display-weight record is shown (e.g., "7 , 3")
**And** "ALL-TIME RECORD" caption appears below
**And** a current streak badge shows (gold if winning, warm if losing)
**And** the last meeting shows date, winner, and score
**And** the card is responsive (stacked mobile, horizontal desktop)
**When** the card is tapped
**Then** it expands to or navigates to season-by-season H2H breakdown

## Notes
- FR15: Head-to-head records between any two franchises
- FR16: Rivalry summaries including win streaks, notable matchups, historical trends
- UX-DR18: Rivalry Card component spec
