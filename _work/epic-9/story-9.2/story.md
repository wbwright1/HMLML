# Story 9.2: Upcoming Draft Page & Drafts Tab Integration

## User Story

**As a** visitor,
**I want** to see the upcoming draft on the Drafts tab with an "Upcoming" pill badge and navigate to its draft board page,
**So that** clicking "View Full Draft Order" on the hub leads to a real page (not a 404) and I can see the upcoming draft in the drafts index.

## Acceptance Criteria

**Given** the latest season has a draft with status "pre_draft" (no picks yet)
**When** the visitor navigates to `/drafts`
**Then** the upcoming draft appears at the top of the list with an "Upcoming" badge
**And** it links to `/drafts/[seasonYear]`

**Given** the visitor navigates to `/drafts/[seasonYear]` for an upcoming draft with no picks
**When** the page loads
**Then** the draft board shows empty cells with team headers and pick slot numbers
**And** the page title says "[Year] Draft" with an "Upcoming" badge
**And** the page does NOT 404

**Given** the hub "View Full Draft Order" link points to `/drafts/[seasonYear]`
**When** the visitor clicks it
**Then** they see the upcoming draft page (not a 404)

## Implementation Notes

- The current `getDraftBySeasonYear` returns null when there are no picks, causing a 404
- Need to handle the case where a draft exists (via Sleeper drafts API) but has no picks yet
- For the upcoming draft, fetch the draft_order from Sleeper to show team columns in order
- Each column shows the team; cells show pick slot numbers (1.01, 1.02, etc.) but no player
- The drafts index (`app/drafts/page.tsx`) needs to include upcoming drafts from Sleeper
- Add "Upcoming" SuperlativeBadge variant for the drafts index card
