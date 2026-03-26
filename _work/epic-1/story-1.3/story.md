# Story 1.3: Core Layout Components

## Story
As a visitor,
I want consistent navigation and page structure across all pages,
So that I can navigate the site confidently.

## Acceptance Criteria

**Given** any page on the site
**When** the page renders
**Then** a persistent top nav displays: Hub | Teams | Records | History | Drafts | Players
**And** the nav shows "HMLML" brand text on the left
**And** the nav shows a Seasonal Pill Badge on the right (Preseason/Week N/Playoffs/Offseason)
**And** the nav collapses to a hamburger menu on mobile (< 768px)
**And** the nav bar is fixed/slim on mobile and does not scroll away
**And** a Sync Timestamp component appears in the footer showing last sync time
**And** the Sync Timestamp turns warm color when data is significantly stale
**And** a Section Header component is available (title left, optional "View All" link right)
**And** the root layout constrains content to 1200px max-width on desktop

## Notes
- Nav items: Hub | Teams | Records | History | Drafts | Players (this exact order)
- Seasonal Pill Badge variants: "Preseason" (green-light bg), "Week N" (green-light bg), "Playoffs" (gold-light bg), "Offseason" (neutral bg)
- Sync Timestamp: caption size, tertiary color; turns --accent-warm if data >2hrs stale (hourly) or >26hrs stale (daily)
- Section Header: H3 bold left, optional "View All →" link right in --accent-green
- Mobile hamburger: nav items stack vertically
