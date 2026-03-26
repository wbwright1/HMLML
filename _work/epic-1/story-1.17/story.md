# Story 1.17: Skip-to-Content Link

## Story
As a keyboard user,
I want a skip-to-content link,
So that I can bypass the navigation and jump directly to main content.

## Acceptance Criteria

**Given** any page loads
**When** the user presses Tab as the first keyboard action
**Then** a "Skip to content" link appears as the first focusable element
**When** activated
**Then** focus moves to the main content area
**And** the link is visually hidden until focused

## Notes
- UX-DR40: WCAG 2.1 AA compliance, keyboard nav, focus indicators
