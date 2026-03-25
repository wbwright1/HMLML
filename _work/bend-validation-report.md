# BEND Backend Validation Report
**Date:** 2026-03-25
**Reviewer:** BEND (Backend Developer)
**Scope:** UX Polish initiative — post-implementation backend validation

---

## 1. Summary

**Overall Result: PASS with 3 minor findings**

| Section | Result | Issues |
|---|---|---|
| Schema & Migration | PASS | 0 |
| Sync Logic | PASS with findings | 2 minor |
| Homepage Queries | PASS with findings | 1 minor |
| Query Updates | PASS | 0 |

All findings are non-blocking. No data corruption risk, no security vulnerabilities, no breaking changes.

---

## 2. Schema & Migration

**Files reviewed:**
- `lib/db/schema.ts`
- `lib/db/migrations/0000_nice_senator_kelly.sql`
- `lib/db/migrations/0001_known_nebula.sql`

### Findings

**PASS — coOwnerDisplayName is correctly defined as nullable text.**

Schema definition at `lib/db/schema.ts` line 67:
```
coOwnerDisplayName: text("co_owner_display_name"),
```
No `.notNull()` constraint — correct for an optional field. Drizzle will type this as `string | null`.

**PASS — Migration 0001 is correct SQL.**

Migration `0001_known_nebula.sql` applies:
```sql
ALTER TABLE "franchise_seasons" ADD COLUMN "co_owner_display_name" text;
ALTER TABLE "players" ADD COLUMN "points_ppr" real;
ALTER TABLE "players" ADD COLUMN "stats_season" integer;
```

All three `ADD COLUMN` statements are additive. No `NOT NULL` constraints without defaults, no column drops, no index changes on existing columns. Zero breaking risk to existing queries — any query that does not explicitly select `co_owner_display_name` is unaffected.

**PASS — Migration 0000 (baseline) is consistent with schema.ts.**

The original `franchise_seasons` table in 0000 has `owner_display_name text` but no `co_owner_display_name` — confirming 0001 is the correct additive migration. Column naming convention (`snake_case` in SQL, `camelCase` in ORM) is consistent throughout.

**No issues found.**

---

## 3. Sync Logic

**Files reviewed:**
- `lib/sync/daily.ts`
- `lib/sync/legacy-import.ts`

### Co-owner resolution pattern

Both files implement the same pattern (daily.ts lines 241-246, legacy-import.ts lines 263-268):

```typescript
const coOwners = (roster as { co_owners?: string[] | null }).co_owners;
const coOwnerDisplayName = coOwners?.length
  ? coOwners
      .map((id) => userMap.get(id)?.displayName ?? "Unknown")
      .join(" & ")
  : null;
```

**PASS — Both insert and onConflictDoUpdate include coOwnerDisplayName.**
Verified in daily.ts lines 294 and 308, legacy-import.ts lines 318 and 333.

**PASS — Null/empty array handled gracefully.**
`coOwners?.length` is falsy for both `null` and `[]` — returns `null` in both cases. Correct.

**PASS — Multiple co-owners joined with " & ".**
`.join(" & ")` confirmed.

**PASS — userMap lookup falls back to "Unknown".**
`userMap.get(id)?.displayName ?? "Unknown"` — correct fallback for a co-owner whose user ID is not in the league's user list. This could happen for historical seasons where a user left the league. The "Unknown" string is acceptable; it is a display fallback, not a key.

**PASS — Consistency between daily.ts and legacy-import.ts.**
The logic is character-for-character identical in both files. No drift.

### Finding 1 (Minor): Type assertion instead of typed field access

In both sync files, `co_owners` is accessed via a cast:
```typescript
(roster as { co_owners?: string[] | null }).co_owners
```
This works correctly at runtime because `SleeperRosterSchema` in `lib/sleeper-schemas.ts` (line 46) does declare `co_owners: z.array(z.string()).nullable().optional()` — the field IS in the Zod schema and the inferred type. The cast is therefore unnecessary. The sync files could simply use `roster.co_owners` directly through the `SleeperRoster` type.

This is a low-risk code smell — no functional impact. The redundant cast does not cause incorrect behavior.

### Finding 2 (Minor): Daily sync runs all 5 steps in parallel via Promise.allSettled

`runDailySync` (daily.ts lines 777-798) fires `syncLeagueSettings`, `syncUsersAndRosters`, `syncPlayers`, `syncDrafts`, and `syncPlayoffBracket` in parallel. However, `syncUsersAndRosters` and `syncDrafts` both depend on the season record created by `syncLeagueSettings` — they call `getLeague` independently and look up the season. If `syncLeagueSettings` fails or has not yet committed, the others could fail with "Season not found."

In practice this is safe because each step independently calls `getLeague` and queries the season by `seasonYear` — they do not depend on the `logId` returned by the settings step. But if the season row does not exist at all yet (first run), a race condition is possible where `syncUsersAndRosters` queries the season before `syncLeagueSettings` inserts it.

This is a pre-existing architectural concern, not introduced by the UX Polish work. It is not a blocking issue for this validation scope. Flagged for awareness.

---

## 4. Homepage Queries (`lib/queries/homepage.ts`)

**File reviewed:** `lib/queries/homepage.ts` — full review

### 4a. `getHomepageSuperlatives(seasonId: number)`

**Query 1 — Highest score:**
```typescript
db.select(...).from(matchups)
  .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
  .where(and(eq(matchups.seasonId, seasonId), eq(matchups.status, "complete")))
  .orderBy(desc(matchups.points))
  .limit(1)
```
PASS. Correct. Uses `idx_matchups_season_week` index (seasonId is first column). ORDER + LIMIT 1 is efficient.

**Query 2 — Streak calculation:**
Fetches all completed regular-season matchups for the season:
```typescript
db.select({franchiseId, franchiseName, week, isWinner})
  .from(matchups).innerJoin(franchises, ...)
  .where(and(seasonId, status=complete, isPlayoff=false))
  .orderBy(desc(week))
```
PASS — logic is correct. Matchups are returned `desc(week)`, then grouped by `franchiseId`. For each franchise, the streak counter increments on `won=true` and breaks on the first non-win. This correctly computes the *active* (consecutive from most recent week) win streak.

Edge case note: if a franchise has a tie (`isWinner = null`), the condition `m.isWinner === true` is false, so a tie breaks the streak. This is defensible behavior — a tie is not a win. No bug.

**Query 3 — Closest matchup:**
Two sub-queries: first gets `MAX(week)`, then fetches all matchups for that week and groups by `matchupId`. Pairs of length !== 2 are skipped.
PASS. Logic is correct.

**N+1 check:** No N+1 patterns. The function uses 4 total queries (highestScore, allMatchups, latestWeek, weekMatchups, mostWins). `weekMatchups` is only issued if `latestWeek > 0`. Total: 4-5 queries. Acceptable.

**Error handling:** Single try/catch wrapping the entire function. Returns all-null defaults on any error. PASS.

**SQL injection:** All values passed via Drizzle parameterized queries. No raw string interpolation into SQL. PASS.

### 4b. `getLastWeekResults(seasonId: number, currentWeek: number)`

**Guard clause:** Returns `null` if `currentWeek <= 1`. Handles week 1 edge case correctly.

**Query:** Fetches all matchups for `previousWeek = currentWeek - 1`, status complete. Groups by `matchupId`, pairs teams, sorts by margin descending (biggest blowout first).

**PASS.** Logic is sound.

**Finding 3 (Minor): Tie-result pairing edge case.**

In `getLastWeekResults`, winner/loser are assigned as:
```typescript
const winner = pair.find((p) => p.won) ?? pair[0];
const loser = pair.find((p) => !p.won) ?? pair[1];
```
In a tie game, `isWinner` is `null` for both sides. `p.won = r.isWinner === true` will be `false` for both. So `pair.find((p) => p.won)` returns `undefined` — and it falls back to `pair[0]` as "winner" and `pair[1]` as "loser", with a margin of 0. The result is returned with an arbitrary team labeled "winner."

This is cosmetically misleading for a tied game — the UI would display one team as the winner of a 0-margin game. No data is corrupted. Whether ties are possible in the league's scoring configuration is unknown from this codebase, but the edge case exists. Low severity.

**Error handling:** try/catch returns `null` on error. PASS.

### 4c. `getLeagueAtAGlance()`

**4 queries:**
1. Latest champion season (innerJoin — only seasons WITH a champion appear)
2. COUNT of all seasons
3. COUNT of completed matchups
4. Franchise with most championships

**PASS — No champion handled gracefully.**
Query 1 uses `innerJoin` on `seasons.championFranchiseId = franchises.id`. If no season has a champion set, `latestChampSeason` is `undefined` and the returned value is `reigningChampion: null`. Correct.

**PASS — Query correctness.** All aggregates are correct. `COUNT(*)` with GROUP BY for championships is correct SQL semantics.

**PASS — No N+1.** 4 flat queries, no loops issuing queries.

**PASS — Error handling.** try/catch returns all-zero/null defaults.

### Homepage Queries Summary

| Check | Result |
|---|---|
| No N+1 queries | PASS |
| Proper Drizzle ORM patterns | PASS |
| Error handling with sensible defaults | PASS |
| SQL correctness (GROUP BY, ORDER BY, aggregates) | PASS |
| No SQL injection vectors | PASS |
| Efficient query count | PASS (4-5 per function) |
| Streak calculation logic correct | PASS |
| Closest matchup pairing logic correct | PASS |
| getLastWeekResults week 1 edge case | PASS |
| getLeagueAtAGlance no champion case | PASS |
| Tie game display in getLastWeekResults | MINOR FINDING (cosmetic) |

---

## 5. Query Updates

**Files reviewed:**
- `lib/queries/franchises.ts`
- `lib/queries/seasons.ts`

### franchises.ts — getAllFranchises

**PASS — ownerRows query includes coOwnerDisplayName** (line 45).

**PASS — ownerMap correctly stores both owner and coOwner** (lines 52-59):
```typescript
const ownerMap = new Map<string, { owner: string; coOwner?: string }>();
for (const row of ownerRows) {
  if (!ownerMap.has(row.franchiseId) && row.ownerDisplayName) {
    ownerMap.set(row.franchiseId, {
      owner: row.ownerDisplayName,
      coOwner: row.coOwnerDisplayName ?? undefined,
    });
  }
}
```
Logic is correct. Rows are pre-ordered by `desc(seasons.seasonYear)` so the first encountered row per franchise is the most recent season. The guard `!ownerMap.has(row.franchiseId)` ensures only the latest season's owner data is kept. `coOwnerDisplayName ?? undefined` correctly omits the key when null.

**Note on ownerRows query:** The `ownerRows` query fetches ALL franchise seasons from the database ordered by season year, then processes them in JS. For a league with 12 franchises and 10 seasons, this is 120 rows — trivially small. Not a performance concern for this use case.

### franchises.ts — getFranchiseBySlug

**PASS — coOwnerDisplayName included in seasonHistory select** (line 103).

The field is explicitly projected in the select object and returned as part of each season history row. Correct.

### seasons.ts — getSeasonStandings

**PASS — coOwnerDisplayName included** (line 82).

```typescript
coOwnerDisplayName: franchiseSeasons.coOwnerDisplayName,
```
Explicitly projected alongside `ownerDisplayName`. Correct.

**No issues found in either query file.**

---

## 6. Performance Concerns

**Medium-term (not immediate) concern: `getAllFranchises` owner resolution**

`ownerRows` fetches all `franchise_seasons` rows joined to `seasons`, ordered by season year. This is an unbounded query — it will return every season row for every franchise in history. At current scale (~120 rows) it is fast. As the league grows over decades (e.g., 20 seasons × 12 franchises = 240 rows), it remains trivially fast. Not actionable now.

**Potential concern: `getHomepageSuperlatives` streak computation loads all matchups for the season**

For a 14-week regular season with 12 franchises, `allMatchups` returns ~168 rows and processes them in memory. This is fine. The query is filtered to `isPlayoff=false` and `status=complete`. No index gap — `idx_matchups_season_week` covers the `seasonId` filter.

**No performance issues warrant immediate action.**

---

## 7. Edge Cases

### Unhandled / noteworthy

1. **Co-owner whose user ID is not in the league's user list:** Falls back to "Unknown" in the display name. This is correct behavior — it is defensive. However, "Unknown" will appear verbatim in the UI. If this is undesirable, the display could be omitted rather than showing "Unknown." (Out of scope for this validation; flagged for UX consideration.)

2. **Roster with no owner_id (unowned roster):** Both daily.ts and legacy-import.ts explicitly `continue` past rosters where `owner_id` is null (daily.ts line 238, legacy-import.ts line 260). Correct.

3. **Week 0 in getLastWeekResults:** `currentWeek <= 1` guard returns `null`. Correct. Pre-season or week 1 is handled.

4. **Season with no completed matchups for `getHomepageSuperlatives`:** `latestWeek` will be 0, `closestMatchup` will remain null, `highestScore` will be an empty array (returns null via `[0] ?? null`). All nulls are valid return values. Frontend must handle them.

5. **Tie games in `getLastWeekResults`:** As described in Finding 3 — pair[0] is arbitrarily labeled winner with margin 0. Cosmetic issue only.

6. **`getSeasonByYear` uses a separate query to fetch champion name** (seasons.ts lines 56-63), while `getAllSeasons` uses a raw SQL left join alias (`sql\`${franchises} champ\``). This inconsistency is pre-existing and not introduced by the UX Polish work. The `getSeasonByYear` approach (separate query) results in an extra round-trip when a champion exists, but the function is only called for a single season lookup so the impact is negligible.

---

## 8. Final Verdict

**PASS.** All critical checklist items are satisfied. Three minor findings identified:

| # | Finding | Severity | Action Required |
|---|---|---|---|
| 1 | Redundant type cast for `co_owners` in sync files; `SleeperRoster` already types the field | Low | Optional cleanup in a future pass |
| 2 | `runDailySync` parallel execution has theoretical race on first-ever run (pre-existing pattern) | Low | No action needed; pre-existing |
| 3 | Tie game in `getLastWeekResults` arbitrarily labels pair[0] as winner with 0 margin | Low | UI should handle 0-margin display; no data impact |

No blocking issues. Implementation is ready for QA handoff.
