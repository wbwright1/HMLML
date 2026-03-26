# Story 4.9: Franchise Card Top Border

## Story
As a visitor browsing the Teams page,
I want each franchise card to show its team color,
So that the grid feels personalized and visually distinct.

## Acceptance Criteria

**Given** the Teams page displays franchise cards
**When** a franchise has a brandingColor
**Then** a 3px top border in that color appears on the card
**Given** a franchise has no brandingColor
**Then** the border falls back to var(--border)
**And** the border is purely decorative; franchise identity is conveyed by name

## Notes
- FR8: Franchise identity persists across ownership changes
