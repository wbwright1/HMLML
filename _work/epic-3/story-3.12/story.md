# Story 3.12: Weekly Superlative Data Queries

## Story
As a developer,
I want queries that derive weekly superlatives from matchup data,
So that the hub can display this week's standout moments.

## Acceptance Criteria

**Given** matchup data exists for a completed week
**When** superlative queries execute
**Then** closest win is returned (smallest margin of victory with both teams and scores)
**And** biggest blowout is returned (largest margin with winner and loser)
**And** highest scorer is returned (team with most points)
**And** lowest scorer is returned (team with fewest points)
**And** all data comes from existing matchup tables

## Notes
- NFR4: All data served from local cache
