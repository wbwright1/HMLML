# Story 1.18: Focus Indicators

## Story
As a keyboard user,
I want visible focus indicators on all interactive elements,
So that I always know where my keyboard focus is.

## Acceptance Criteria

**Given** any interactive element (button, link, tab, input) receives keyboard focus
**When** focus is visible
**Then** a 2px solid accent-green outline with 2px offset is displayed
**And** tab order follows the visual layout (no unexpected jumps)
**And** all interactive elements are reachable via Tab key

## Notes
- UX-DR40: WCAG 2.1 AA compliance, focus indicators (2px green)
