// Shared persistence for Sleeper bracket data. Both the daily sync and the
// legacy import call this, so the two paths cannot drift.

import { db } from "@/lib/db";
import { runAtomic } from "@/lib/db/atomic";
import { playoffBracketMatches, seasons } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  normalizeBracketMatches,
  type NormalizedBracketMatch,
} from "@/lib/playoff-bracket";
import type { SleeperBracketMatch } from "@/lib/sleeper-schemas";

/**
 * Replaces a season's stored bracket with the freshly fetched one and records
 * the Toilet Bowl champion, atomically. Brackets are tiny (7 rows per bracket
 * at most), so a delete-then-insert is simpler and safer than a row-level
 * upsert; runAtomic keeps the delete from committing without its replacement.
 *
 * Advancement is taken from Sleeper's `w` verbatim. In the losers bracket that
 * is the team that LOST the game (see lib/playoff-bracket.ts); nothing here may
 * re-derive it from points.
 *
 * Returns the number of bracket rows written.
 */
export async function persistBracketMatches(
  seasonId: number,
  winners: SleeperBracketMatch[],
  losers: SleeperBracketMatch[],
  toiletBowlFranchiseId: string | null,
): Promise<number> {
  const rows: NormalizedBracketMatch[] = [
    ...normalizeBracketMatches(winners, "winners"),
    ...normalizeBracketMatches(losers, "losers"),
  ];

  const now = new Date();

  const values = rows.map((row) => ({
    seasonId,
    bracketType: row.bracketType,
    round: row.round,
    matchNumber: row.matchNumber,
    placement: row.placement,
    team1RosterId: row.team1RosterId,
    team2RosterId: row.team2RosterId,
    team1FromMatch: row.team1FromMatch,
    team2FromMatch: row.team2FromMatch,
    advancingRosterId: row.advancingRosterId,
    eliminatedRosterId: row.eliminatedRosterId,
    createdAt: now,
    updatedAt: now,
  }));

  // Leads with the delete so it only commits alongside its replacement, per
  // the runAtomic contract.
  await runAtomic((tx) => [
    tx
      .delete(playoffBracketMatches)
      .where(eq(playoffBracketMatches.seasonId, seasonId)),
    ...(values.length > 0
      ? [tx.insert(playoffBracketMatches).values(values)]
      : []),
    tx
      .update(seasons)
      .set({ toiletBowlFranchiseId, updatedAt: now })
      .where(eq(seasons.id, seasonId)),
  ]);

  return rows.length;
}

/** Count of stored bracket rows for a season. Used by the backfill's report. */
export async function countBracketMatches(
  seasonId: number,
  bracketType?: "winners" | "losers",
): Promise<number> {
  const where = bracketType
    ? and(
        eq(playoffBracketMatches.seasonId, seasonId),
        eq(playoffBracketMatches.bracketType, bracketType),
      )
    : eq(playoffBracketMatches.seasonId, seasonId);

  const rows = await db
    .select({ id: playoffBracketMatches.id })
    .from(playoffBracketMatches)
    .where(where);
  return rows.length;
}
