# Story 1.5: Mobile Hamburger Menu

## Story
As a visitor on mobile,
I want a hamburger menu for navigation,
So that I can access all sections without the nav taking up screen space.

## Acceptance Criteria

**Given** the site loads on a mobile viewport (< 768px)
**When** the page renders
**Then** a fixed slim top bar is visible with "HMLML" brand and hamburger button
**And** the hamburger button has aria-label="Open navigation"
**When** the hamburger button is tapped
**Then** nav items stack vertically in a menu overlay
**And** pressing Escape closes the menu
**And** the top bar does not scroll away

## Notes
- UX-DR28: Navigation spec (hamburger on mobile)
- FR38: Persistent navigation element
