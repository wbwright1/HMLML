# Story 1.20: Error State Pattern

## Story
As a visitor encountering an error,
I want a calm, confident error message,
So that I'm not alarmed and know data is still available.

## Acceptance Criteria

**Given** a server error occurs
**When** the error boundary renders
**Then** it displays "Something went wrong. We're showing the last available data."
**And** a "Try again" button and "Go home" link are available
**And** no panicked language ("Oops", "Uh oh") appears
**And** the error page matches the site's visual design

## Notes
- UX-DR41: Error states spec (calm confident tone)
