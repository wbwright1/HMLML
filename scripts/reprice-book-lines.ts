/**
 * Manually price (or re-price) The Book's lines for one week.
 *
 * The hourly sync does this on its own; this script exists for the first run of
 * a new week during development and for repricing after a projections backfill,
 * without having to trigger a full hourly sync.
 *
 * Usage:
 *   npx tsx scripts/reprice-book-lines.ts --week 1            # current season
 *   npx tsx scripts/reprice-book-lines.ts --week 1 --season 2026
 *   npx tsx scripts/reprice-book-lines.ts --week 1 --dry-run  # prices, writes nothing
 *
 * Requires POSTGRES_DRIVER=pg locally.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { bookLines, seasons } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { repriceBookLines } from "@/lib/sync/book-lines";
import {
  getRosterKickoffStates,
  getWeekProjectedTotals,
} from "@/lib/queries/book";
import { formatMoneyline, formatSpread } from "@/lib/book/pricing";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const weekArg = arg("week");
  if (!weekArg) {
    console.error("Missing --week <n>");
    process.exit(1);
  }
  const week = Number(weekArg);
  const seasonArg = arg("season");
  const dryRun = process.argv.includes("--dry-run");

  const [season] = seasonArg
    ? await db
        .select()
        .from(seasons)
        .where(eq(seasons.seasonYear, Number(seasonArg)))
    : await db.select().from(seasons).orderBy(desc(seasons.seasonYear)).limit(1);

  if (!season) {
    console.error("No season found");
    process.exit(1);
  }

  console.log(`Season ${season.seasonYear} (id ${season.id}), week ${week}`);

  const projections = await getWeekProjectedTotals(
    season.id,
    season.seasonYear,
    week,
  );
  const kickoffs = await getRosterKickoffStates(
    season.id,
    season.seasonYear,
    week,
  );
  console.log(
    `Projections for ${projections.size} rosters; kickoff data for ${kickoffs.size}.`,
  );

  if (dryRun) {
    console.log("Dry run: no writes.");
    return;
  }

  const result = await repriceBookLines(season.id, season.seasonYear, week);
  console.log(
    `Wrote ${result.rowCount} line(s); ${result.lockedSkipped} already under way; ${result.unpriceable} unpriceable.`,
  );

  const written = await db
    .select()
    .from(bookLines)
    .where(and(eq(bookLines.seasonId, season.id), eq(bookLines.week, week)));

  for (const line of written) {
    console.log(
      `  matchup ${line.matchupId}: home ${line.homeRosterId} ${formatSpread(line.spread)} ` +
        `${formatMoneyline(line.mlHome)} / away ${line.awayRosterId} ${formatMoneyline(line.mlAway)} ` +
        `(proj ${line.homeProjected?.toFixed(1)} vs ${line.awayProjected?.toFixed(1)})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
