# Story 4.4: Franchise Hero Gradient

## Story
As a visitor viewing a franchise page,
I want a subtle team-colored gradient in the hero,
So that the page feels like a team homepage.

## Acceptance Criteria

**Given** a franchise has a brandingColor set
**When** the franchise page renders
**Then** the hero section has a background gradient using brandingColor at 5-8% opacity
**And** the gradient fades to transparent below the hero
**Given** a franchise has no brandingColor
**Then** no gradient is applied (clean default background)
**And** all text over the gradient maintains WCAG AA contrast ratios

## Notes
- FR8: Franchise identity (team name, branding) persists across ownership changes
