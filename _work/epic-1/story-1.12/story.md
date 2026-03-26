# Story 1.12: Mobile Table Card Layout

## Story
As a visitor on mobile,
I want tables to transform into card layouts,
So that I can read data without horizontal scrolling.

## Acceptance Criteria

**Given** a table has more than 3 columns
**When** viewed on mobile (< 768px)
**Then** it switches to a card layout
**And** each card shows franchise identity on the left, key stat on the right
**And** the switch activates consistently at the md breakpoint (768px)
**And** no horizontal scrolling occurs

## Notes
- UX-DR35: Table component spec (card layout on mobile >3 columns)
- FR35: Mobile, tablet, desktop responsive
