# Story 1.5: Empty State & Error Components

## Story
As a visitor,
I want clear, on-brand messaging when data is unavailable,
So that I understand what's happening and don't see a broken page.

## Acceptance Criteria

**Given** a page with no data available
**When** the page renders
**Then** an EmptyState component displays with contextual icon, title, description, and optional action link
**And** the 404 page shows snarky messaging ("This page doesn't exist. Maybe it was traded away.") with links back to Hub and Teams
**And** error boundaries show calm messaging ("Something went wrong. We're showing the last available data.")
**And** empty states never show a blank page; always show last-cached data with timestamp when possible

## Notes
- EmptyState component: centered, max-width 400px, generous vertical padding, Lucide React icon at 48px with muted opacity
- 404 page: custom not-found.tsx with on-brand styling and snarky tone
- Error boundary: error.tsx per the Next.js App Router pattern
- Page-specific empty states defined in UX spec (syncing, no matchups, no players found, etc.)
- Error tone: calm and confident, NEVER "Oops!" style
