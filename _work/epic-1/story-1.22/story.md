# Story 1.22: Empty State Pattern

## Story
As a visitor viewing a page with no data,
I want a graceful empty state,
So that I understand why there's no data and what I can do next.

## Acceptance Criteria

**Given** any page or section has no data to display
**When** the EmptyState component renders
**Then** it is centered with max-width 400px
**And** an optional icon renders at 48px in text-muted-foreground/50
**And** a title displays in H3 style
**And** a description displays in body style with muted color
**And** an optional action link provides navigation
**And** page-specific variants use appropriate icons (calendar, users, search, trophy, chart, alert)

## Notes
- UX-DR41: Error/empty state patterns
