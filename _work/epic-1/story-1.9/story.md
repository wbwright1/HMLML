# Story 1.9: Stat Callout Component

## Story
As a visitor,
I want stats to be visually prominent and aligned,
So that numbers are easy to read and compare.

## Acceptance Criteria

**Given** a stat value is displayed
**When** the Stat Callout renders
**Then** the number uses bold or black weight with tabular figures
**And** an optional unit suffix appears on the same line (e.g., "2,147 pts")
**And** numbers below 1,000 have no separator; numbers at 1,000+ use comma separators
**And** the component size adapts based on context (larger for hero stats, smaller for inline)

## Notes
- UX-DR33: Stat Callout component spec
