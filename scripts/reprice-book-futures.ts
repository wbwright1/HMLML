/**
 * Manually price (or re-price) The Book's season-long player futures markets
 * (MVP, ROTY) from the live database, without writing anything.
 *
 * The daily sync does this on its own via repriceFutures/lib/sync/book-futures.ts;
 * this script exists to eyeball a reprice against real synced data after a
 * projections backfill or a pricing-model change, the same way
 * reprice-book-lines.ts does for the weekly board.
 *
 * Usage:
 *   npx tsx scripts/reprice-book-futures.ts               # current season
 *   npx tsx scripts/reprice-book-futures.ts --season 2026
 *
 * Requires POSTGRES_DRIVER=pg locally. Always a dry run: prices and prints,
 * never writes to book_futures.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  buildPlayerMarket,
  candidateScore,
  lineupShareRatio,
  replacementSwingRatio,
  teamImpactMultiplier,
  candidateCountFor,
  type FuturesCandidate,
} from "@/lib/book/futures";
import {
  getFuturesPricingInputs,
  resolveFuturesSeason,
  type PlayerCandidateRow,
} from "@/lib/queries/book-futures";
import { resolveBookWeek } from "@/lib/queries/book";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const seasonArg = arg("season");

  const [seasonRow] = seasonArg
    ? await db
        .select()
        .from(seasons)
        .where(eq(seasons.seasonYear, Number(seasonArg)))
    : await db.select().from(seasons).orderBy(desc(seasons.seasonYear)).limit(1);

  if (!seasonRow) {
    console.error("No season found");
    process.exit(1);
  }

  const season = await resolveFuturesSeason();
  if (!season || season.seasonYear !== seasonRow.seasonYear) {
    console.error("resolveFuturesSeason did not match the requested season");
    process.exit(1);
  }

  const bookWeek = await resolveBookWeek();
  const week =
    bookWeek && bookWeek.seasonId === season.seasonId ? bookWeek.week : 1;

  console.log(
    `Season ${season.seasonYear} (id ${season.seasonId}), week ${week}, finalRegularWeek ${season.finalRegularWeek}`,
  );

  const inputs = await getFuturesPricingInputs(season, week);
  console.log(
    `weeksRemaining=${inputs.weeksRemaining}, candidate pool=${inputs.candidates.length}`,
  );

  for (const market of ["mvp", "roty"] as const) {
    const pool = inputs.candidates.filter((c) =>
      market === "roty" ? c.isRookie : true,
    );
    console.log(`\n=== ${market.toUpperCase()} (pool ${pool.length}) ===`);
    if (pool.length === 0) {
      console.log("  (empty pool)");
      continue;
    }

    const detailById = new Map<string, PlayerCandidateRow>(
      pool.map((c) => [c.playerId, c]),
    );
    const candidates: FuturesCandidate[] = pool.map((c) => ({
      playerId: c.playerId,
      score: candidateScore({
        bankedPoints: c.bankedPoints,
        projectedPerWeek: c.projectedPerWeek,
        weeksRemaining: inputs.weeksRemaining,
        startShare: c.startShare,
        lineupProjectedPerWeek: c.lineupProjectedPerWeek,
        bestAlternativePerWeek: c.bestAlternativePerWeek,
      }),
    }));

    const rows = buildPlayerMarket(candidates, candidateCountFor(market));

    for (const row of rows) {
      if (row.subjectType === "field") {
        console.log(
          `  Field  ${(row.prob * 100).toFixed(1)}%  ${formatOdds(row.odds)}`,
        );
        continue;
      }
      const c = detailById.get(row.subjectId);
      const shareRatio = c
        ? lineupShareRatio(c.projectedPerWeek, c.lineupProjectedPerWeek)
        : 0;
      const swingRatio = c
        ? replacementSwingRatio(c.projectedPerWeek, c.bestAlternativePerWeek)
        : 0;
      const leverage = c ? teamImpactMultiplier(shareRatio, swingRatio) : 0;
      console.log(
        `  ${(row.prob * 100).toFixed(2)}%  ${formatOdds(row.odds)}  ` +
          `${(c?.fullName ?? row.subjectId).padEnd(22)} ${(c?.position ?? "").padEnd(3)} ${(c?.nflTeam ?? "").padEnd(4)}  ` +
          `proj/wk ${c?.projectedPerWeek.toFixed(1).padStart(6)}  banked ${c?.bankedPoints.toFixed(1).padStart(6)}  ` +
          `startShare ${c?.startShare.toFixed(2)}  leverage ${leverage.toFixed(2)}  score ${candidates.find((x) => x.playerId === row.subjectId)?.score.toFixed(1)}`,
      );
    }
  }

  console.log("\nDry run only: no rows written to book_futures.");
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
