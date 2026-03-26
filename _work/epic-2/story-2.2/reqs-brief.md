---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 2.2
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: [CRITICAL: Implementation already exists in codebase; both daily sync and legacy import already resolve co-owner display names. See "Critical Finding" section.]
---

## Story Reference

**Story 2.2: Co-Owner Sync & Legacy Import**
**Epic 2: Co-Owner Recognition**
**Requirement:** FR22 (from epics.md)

> The daily sync and legacy import shall capture co-owner data from Sleeper's `co_owners` roster array and resolve display names.

**Depends on:** Story 2.1 (schema; confirmed complete)

## Restated Acceptance Criteria

Each Given/When/Then from the story is restated below with implementation detail.

| # | Criterion (from story.md) | Implementation Detail | FR/NFR |
|---|---|---|---|
| AC-1 | **Given** the daily sync runs **When** processing roster data from Sleeper **Then** co-owner user IDs from Sleeper's `co_owners` roster array are resolved to display names via the users endpoint | In `syncUsersAndRosters()` within `lib/sync/daily.ts`: after building the `userMap` (user_id to displayName) from `getLeagueUsers()`, iterate `roster.co_owners`, look up each ID in `userMap`, fall back to `"Unknown"` if not found | FR22 |
| AC-2 | **And** the resolved co-owner display name is stored in `franchise_seasons.coOwnerDisplayName` | The resolved string is written to `coOwnerDisplayName` in the `franchiseSeasons` upsert (both `INSERT` values and `ON CONFLICT DO UPDATE` set clause) | FR22 |
| AC-3 | **And** multiple co-owners are joined with " & " separator | Use `.join(" & ")` on the array of resolved display names; per UX-DR11, always " & " separator, never "and", never commas | FR22, UX-DR11 |
| AC-4 | **Given** the legacy import runs for historical seasons **When** processing roster data **Then** co-owner data is backfilled for all historical seasons where co-owners existed | In `importUsersAndRosters()` within `lib/sync/legacy-import.ts`: identical resolution logic applies per season as the chain is traversed oldest-to-newest | FR22 |
| AC-5 | **And** the same resolution and formatting rules apply | Legacy import uses the same `userMap` lookup, `" & "` join, and null-for-empty pattern as daily sync | FR22, UX-DR11 |
| AC-6 | **Given** a roster has no co-owners **When** the sync or import processes it **Then** `coOwnerDisplayName` remains null (not empty string) | When `roster.co_owners` is null, undefined, or an empty array, `coOwnerDisplayName` is set to `null` (not `""`) | FR22 |

## CRITICAL FINDING: Implementation Already Exists

Analysis of the current codebase reveals that **all acceptance criteria for Story 2.2 are already satisfied**:

### Daily Sync (`lib/sync/daily.ts`, lines 241-246)

The `syncUsersAndRosters()` function already:
1. Reads `roster.co_owners` from the Sleeper roster object (line 241)
2. Resolves each co-owner user ID to a display name via `userMap.get(id)?.displayName` with `"Unknown"` fallback (lines 243-244)
3. Joins multiple co-owners with `" & "` separator (line 245)
4. Returns `null` when `co_owners` is falsy or empty (line 246: ternary returns `null`)
5. Writes the resolved value to `coOwnerDisplayName` in both the INSERT and ON CONFLICT UPDATE of the `franchiseSeasons` upsert (lines 294, 307)

### Legacy Import (`lib/sync/legacy-import.ts`, lines 263-268)

The `importUsersAndRosters()` function already:
1. Reads `roster.co_owners` from the Sleeper roster object (line 263)
2. Resolves each co-owner user ID to a display name via `userMap.get(id)?.displayName` with `"Unknown"` fallback (lines 265-266)
3. Joins multiple co-owners with `" & "` separator (line 267)
4. Returns `null` when `co_owners` is falsy or empty (line 268: ternary returns `null`)
5. Writes the resolved value to `coOwnerDisplayName` in both the INSERT and ON CONFLICT UPDATE of the `franchiseSeasons` upsert (lines 317, 331)

### Sleeper Schema (`lib/sleeper-schemas.ts`, line 46)

The `SleeperRosterSchema` already includes `co_owners: z.array(z.string()).nullable().optional()`, meaning the Zod validation already expects and parses the `co_owners` field from the Sleeper API response.

## Database Changes

**None required.** Story 2.1 (the prerequisite) added the `co_owner_display_name` column. Story 2.2 only writes to it; no additional schema changes are needed.

## API Endpoints

No API endpoints are created or modified by this story. The daily sync and legacy import are invoked via:
- `POST /api/sync-daily` (daily cron; calls `runDailySync()`)
- Manual invocation of `runLegacyImport()` (no dedicated API route; run as a one-off script)

Both are internal sync endpoints, not public-facing APIs.

## Validation Schemas

### Existing (no changes needed)

| Schema | Field | Location |
|---|---|---|
| `SleeperRosterSchema` | `co_owners: z.array(z.string()).nullable().optional()` | `lib/sleeper-schemas.ts`, line 46 |

The `co_owners` field is already validated by Zod as part of the roster response. When `co_owners` is present, it is typed as `string[] | null | undefined`. No new Zod schemas are required.

## Business Rules

| Rule | Detail | FR/NFR |
|---|---|---|
| BR-1 | Co-owner user IDs are resolved to display names using the same `/league/{id}/users` endpoint data already fetched during roster sync | FR22 |
| BR-2 | Display name resolution uses `userMap.get(id)?.displayName`; if a co-owner ID is not found in the users response, the fallback is `"Unknown"` | FR22 |
| BR-3 | Multiple co-owners are joined with `" & "` separator; no "and", no commas (per UX-DR11) | FR22, UX-DR11 |
| BR-4 | When `roster.co_owners` is null, undefined, or an empty array, `coOwnerDisplayName` is set to `null` (not empty string `""`) | FR22 |
| BR-5 | The daily sync resolves co-owners for the current season only; the legacy import resolves co-owners for all historical seasons in the chain | FR22 |
| BR-6 | Co-owner resolution does not require additional Sleeper API calls; the users endpoint data is already fetched in parallel with rosters | FR22 |
| BR-7 | The co-owner display name is stored as a pre-formatted string, not as raw user IDs; this avoids runtime resolution on page loads | FR22 |

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Sleeper API discipline (only via `lib/sleeper.ts`) | Satisfied | Co-owner data comes from `getLeagueRosters()` (roster object) and `getLeagueUsers()` (name resolution), both in `lib/sleeper.ts` |
| Zod validation of all Sleeper responses | Satisfied | `SleeperRosterSchema` validates `co_owners` field; `SleeperUserSchema` validates user display names |
| Sync job pattern (verify secret, call API, validate, write in transaction, log) | Satisfied | Co-owner logic is embedded within existing `syncUsersAndRosters()` and `importUsersAndRosters()` functions that follow the pattern |
| Sync logging to `sync_log` | Satisfied | Both functions log via `logSyncStart`/`logSyncComplete`; co-owner processing is part of the "rosters" data type log entry |
| Drizzle ORM for all DB access | Satisfied | Uses Drizzle `insert().onConflictDoUpdate()` pattern |
| Naming conventions (camelCase code, snake_case DB) | Satisfied | `coOwnerDisplayName` in TypeScript, `co_owner_display_name` in Postgres |
| No `"use client"` added | Satisfied | Sync logic is server-side only |
| Rate limiting (under 1,000 API calls/minute) | Satisfied | Legacy import uses `delay(100)` between API calls; daily sync fetches users and rosters in a single parallel batch |
| Atomic writes per data type | Satisfied | Co-owner data is written as part of the franchise_seasons upsert, not as a separate operation |
| Formatting rule UX-DR11 | Satisfied | `" & "` separator used consistently in both daily sync and legacy import |

## NFR Targets

No NFRs are directly assigned to Story 2.2 in the epics document. The following are implicitly relevant:

| NFR | Relevance | Target | Status |
|---|---|---|---|
| NFR6 (no new dependencies) | Co-owner sync must not introduce new libraries | Uses only existing Zod, Drizzle, and Sleeper client | Satisfied |
| Architecture: Correctness over performance | Co-owner resolution must produce correct display names | Fallback to "Unknown" for unresolved IDs prevents null/undefined in the formatted string | Satisfied |
| Architecture: Sync writes atomic per data type | Co-owner writes must not corrupt other roster data | Written in the same upsert as all other franchise_season fields | Satisfied |

## Forward Dependencies

| Downstream Story | Dependency on 2.2 | Notes |
|---|---|---|
| **Story 2.3: Co-Owner Display Across Site** | Requires `coOwnerDisplayName` to be populated in `franchise_seasons` rows so display components can read and render it | FR23, FR24, UX-DR11 |

## Open Questions

1. **Story 2.2 appears to be already complete.** Both the daily sync (`lib/sync/daily.ts`, lines 241-246, 294, 307) and the legacy import (`lib/sync/legacy-import.ts`, lines 263-268, 317, 331) already implement co-owner resolution with all the specified rules. The developer implementing this story should verify that:
   - The daily sync has been run at least once since the co-owner logic was added, confirming `coOwnerDisplayName` is populated for the current season.
   - The legacy import has been run at least once, confirming `coOwnerDisplayName` is backfilled for historical seasons where co-owners existed.
   - Rosters without co-owners have `null` (not empty string) in the `co_owner_display_name` column.
   - If these checks pass, this story may be marked as complete with a verification pass only.

2. **Edge case: co-owner removed between seasons.** If a roster had co-owners in a prior season but not in the current season, the legacy import correctly stores the historical co-owner name for that season while the daily sync correctly stores `null` for the current season. This is the expected behavior (co-owner data is per franchise_season, not per franchise).

3. **Edge case: co-owner ID not in users endpoint.** If a co-owner user ID exists in `roster.co_owners` but is not returned by the `/league/{id}/users` endpoint (e.g., the user left the platform), the current implementation falls back to `"Unknown"`. This is acceptable for Phase 1. A future enhancement could store the raw user IDs separately for forensic lookup.

4. **No conflicts detected.** All acceptance criteria align with architecture decisions and the existing sync job pattern.
