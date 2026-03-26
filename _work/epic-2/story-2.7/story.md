# Story 2.7: Preseason Award Data Queries

## Story
As a developer,
I want server-side queries that return all preseason hub data,
So that the hub components can render without additional API calls.

## Acceptance Criteria

**Given** the previous season's data exists in the database
**When** preseason queries execute
**Then** team awards are returned (most PF, least PA, best record with franchise info)
**And** player awards are returned (best QB, RB, WR, TE with stats and owning franchise)
**And** sting stats are returned (worst record, high PF + low wins, high PA with franchise info)
**And** draft order is returned for the upcoming season
**And** all data comes from existing database tables with no Sleeper API calls at page load

## Notes
- NFR4: All data served from local cache
