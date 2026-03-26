# Story 1.3: Spacing System Audit & Update

## Story
As a visitor,
I want consistent spacing throughout the site,
So that the layout feels polished and intentional.

## Acceptance Criteria

**Given** the UX spec defines an 8px base spacing unit
**When** the spacing tokens are audited
**Then** tokens exist from 4px (space-1, only sub-8px exception) through 96px (space-24)
**And** content max-width is 1200px centered on desktop
**And** mobile horizontal padding is 16px
**And** no non-8px-multiple spacing values exist (except the 4px exception)

## Notes
- UX-DR3: Implement 8px base spacing system with tokens from 4px to 96px; content max-width 1200px
