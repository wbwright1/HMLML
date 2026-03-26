# Story 7.3: Player Search Page Layout

## Story
As a visitor looking for a specific player,
I want a clean search experience,
So that I can find any player quickly.

## Acceptance Criteria

**Given** the Players page loads
**When** no search has been performed
**Then** the input shows with warm border and placeholder "Search by player name"
**When** a search is submitted (Enter or button)
**Then** results render server-side as Player Search Result Cards
**And** search is case-insensitive and matches partial names ("allen" finds "Josh Allen", "Keenan Allen")
**When** no results match
**Then** "No players found matching '[query]'" appears in tertiary text
**And** no client-side autocomplete exists in Phase 1

## Notes
- FR24: Player search by name
- FR26: Player status reflects the most recent Sleeper data sync
- UX-DR42: Player search is server-side, case-insensitive partial match, no client autocomplete Phase 1
