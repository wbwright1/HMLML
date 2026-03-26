# Story 5.7: Leaderboard Table Styling

## Story
As a visitor viewing all-time rankings,
I want a clean, scannable leaderboard,
So that I can see who dominates across all categories.

## Acceptance Criteria

**Given** the leaderboard page loads
**When** franchise data is available
**Then** each row shows rank (muted, bold), team name (primary, medium), stat value right-aligned (bold, tabular)
**And** rows use alternating surface-muted backgrounds for 12+ entries
**And** each row has a left border in the franchise's brandingColor (fallback to --border)
**And** the table switches to card layout on mobile

## Notes
- FR14: All-time leaderboard ranking all franchises by career performance metrics
- UX-DR35: Table component with Press Box typography
