/**
 * One-off diagnostic script: tallies the letter-grade distribution across all
 * gradeable trade sides, BEFORE (points-only, simulating the pre-blend
 * grader) and AFTER (full three-lens blend via getTradeGrades) in one run,
 * plus per-lens availability counts (how many graded sides had a working
 * value lens and/or wins lens). Read-only against the live DB; writes
 * nothing.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/grade-distribution.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { playerWeekPoints, seasons } from "@/lib/db/schema";
import { eq, inArray, ne, sql } from "drizzle-orm";
import { getTrades } from "@/lib/queries/trades";
import {
  computeTradeGrades,
  getTradeGrades,
  type RealizedPointsRow,
  type TradeGrade,
} from "@/lib/queries/trade-grades";

const LETTERS = ["A+", "A", "B+", "B", "C", "D", "F"] as const;

function tally(grades: Map<number, TradeGrade>): {
  counts: Record<string, number>;
  gradedSides: number;
} {
  const counts: Record<string, number> = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  let gradedSides = 0;
  for (const grade of grades.values()) {
    if (!grade.graded) continue;
    for (const side of grade.sides) {
      if (!side.grade) continue;
      gradedSides++;
      counts[side.grade] = (counts[side.grade] ?? 0) + 1;
    }
  }
  return { counts, gradedSides };
}

function printTable(label: string, counts: Record<string, number>, total: number) {
  console.log(`\n${label} (${total} graded sides)`);
  for (const letter of LETTERS) {
    const n = counts[letter] ?? 0;
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${letter.padEnd(2)}  ${String(n).padStart(4)}   ${pct}%`);
  }
  const apf = (counts["A+"] ?? 0) + (counts["F"] ?? 0);
  console.log(`  A+/F combined: ${apf} (${total > 0 ? ((apf / total) * 100).toFixed(1) : "0.0"}%)`);
}

async function main() {
  const trades = await getTrades({});
  console.log(`Fetched ${trades.length} trades (unfiltered).`);

  // --- Mirror getTradeGrades' internal rows/latestPlayedSeason build, so
  // the BEFORE run uses the exact same points data as AFTER. ---
  const playerIds = new Set<string>();
  for (const trade of trades) {
    for (const side of trade.sides) {
      for (const p of side.players) playerIds.add(p.id);
      for (const pick of side.picks) {
        if (pick.became?.id) playerIds.add(pick.became.id);
      }
    }
  }

  const [latestPlayedRow] = await db
    .select({ year: sql<number | null>`max(${seasons.seasonYear})` })
    .from(playerWeekPoints)
    .innerJoin(seasons, eq(playerWeekPoints.seasonId, seasons.id))
    .where(ne(playerWeekPoints.points, 0));
  const latestPlayedSeason = latestPlayedRow?.year ?? 0;

  let rows: RealizedPointsRow[] = [];
  if (playerIds.size > 0) {
    const seasonRows = await db.select({ id: seasons.id, seasonYear: seasons.seasonYear }).from(seasons);
    const yearBySeasonId = new Map(seasonRows.map((s) => [s.id, s.seasonYear]));

    const pointRows = await db
      .select({
        playerId: playerWeekPoints.playerId,
        franchiseId: playerWeekPoints.franchiseId,
        seasonId: playerWeekPoints.seasonId,
        week: playerWeekPoints.week,
        points: playerWeekPoints.points,
        started: playerWeekPoints.started,
      })
      .from(playerWeekPoints)
      .where(inArray(playerWeekPoints.playerId, Array.from(playerIds)));

    rows = pointRows.flatMap((r) => {
      const seasonYear = yearBySeasonId.get(r.seasonId);
      if (seasonYear === undefined) return [];
      return [
        {
          playerId: r.playerId,
          franchiseId: r.franchiseId,
          seasonYear,
          week: r.week,
          points: r.points,
          started: r.started,
        },
      ];
    });
  }

  const now = Date.now();
  const before = computeTradeGrades(trades, rows, now, latestPlayedSeason); // points-only
  const after = await getTradeGrades(trades); // full three-lens blend

  const beforeTally = tally(before);
  const afterTally = tally(after);

  printTable("BEFORE (points-only)", beforeTally.counts, beforeTally.gradedSides);
  printTable("AFTER (three-lens blend)", afterTally.counts, afterTally.gradedSides);

  // Per-lens availability: how many graded sides had a non-zero value/wins
  // share, i.e. that lens actually contributed to the blend for that side.
  let valueActive = 0;
  let winsActive = 0;
  let gradedSidesAfter = 0;
  for (const grade of after.values()) {
    if (!grade.graded) continue;
    for (const side of grade.sides) {
      if (!side.grade) continue;
      gradedSidesAfter++;
      if (side.valueShare > 0) valueActive++;
      if (side.winsShare > 0) winsActive++;
    }
  }
  console.log(
    `\nPer-lens availability (of ${gradedSidesAfter} graded sides): value lens active on ${valueActive}, wins lens active on ${winsActive}.`
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
