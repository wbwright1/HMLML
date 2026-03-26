# Story 8.2: Draft Order Shows Full First Round on Hub with Link to All Rounds

## User Story

**As a** visitor viewing the preseason hub,
**I want** to see all 12 first-round draft picks in the draft order section,
**So that** every team's first-round position is visible without leaving the hub, with a link to see the full 3-round order.

## Current Problem

- `DraftOrderCard` component defaults to showing only 4 picks (`picks.slice(0, 4)`)
- The "Full Draft Order" link goes to `/drafts` which is the drafts index, not a dedicated draft order view
- Users must click away from the hub to see where their team picks, which violates the "speed-to-stat" design principle

## Acceptance Criteria

**Given** the preseason hub renders the Draft Order section
**When** the page loads
**Then** all 12 first-round picks are visible (not truncated to 4)
**And** a link reading "View Full Draft Order (All 3 Rounds)" appears below the pick list
**And** the link navigates to the full draft detail page for the upcoming season

**Given** the draft order has fewer than 12 entries (edge case: legacy 10-team era)
**When** the page loads
**Then** all available picks are shown without a blank/empty state

**Given** the user is on mobile
**When** viewing the draft order
**Then** all 12 picks are visible in a compact list layout that does not require horizontal scrolling

## Implementation Notes

- **File:** `components/draft-order-card.tsx` - change default display from `picks.slice(0, 4)` to show all picks (first round = all picks passed in)
- **File:** `app/page.tsx` - the hub currently passes `awards.draftOrder` which should already be the full first-round list; verify this
- The link should go to `/drafts/[seasonYear]` for the upcoming draft, not just `/drafts`
- Consider passing the season year as a prop to `DraftOrderCard` for the link target
- Keep the `showAll` prop but change the default truncation to show all first-round picks
