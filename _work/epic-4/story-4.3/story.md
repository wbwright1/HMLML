# Story 4.3: Franchise Page Tabs

## Story
As a visitor exploring a franchise,
I want tabs to switch between different views,
So that I can see overview, roster, and draft history without navigating away.

## Acceptance Criteria

**Given** the franchise detail page loads
**When** tabs render below the header
**Then** three tabs appear: Overview, Roster, Drafts
**And** the active tab shows accent-green indicator with bold text
**When** a tab is clicked
**Then** content swaps in place without page navigation
**And** URL state updates to reflect the active tab
**And** focus remains on the tab after switching

## Notes
- UX-DR34: Tab component for franchise pages (Overview/Roster/Drafts)
