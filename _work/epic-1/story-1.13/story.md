# Story 1.13: Tab Component

## Story
As a visitor on pages with multiple sections,
I want tabs that switch content smoothly,
So that I can explore different views without page reloads.

## Acceptance Criteria

**Given** a tabbed interface renders
**When** the active tab is selected
**Then** it shows accent-green indicator with bold text
**And** inactive tabs show text-tertiary with regular weight
**When** a tab is clicked
**Then** content swaps in place without page navigation
**And** focus remains on the tab (not the content)
**And** tabs scroll horizontally on mobile if more than 3 items

## Notes
- UX-DR34: Tab component spec
