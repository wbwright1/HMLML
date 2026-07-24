/**
 * Dry-run the hub content generation pipeline against the REAL local/prod DB,
 * printing every generated row WITHOUT writing anything (no replaceHubContent).
 *
 * Purpose (issue #110): confirm both paths behave. With ANTHROPIC_API_KEY set,
 * generateContent takes the LLM path and its per-row claim verifier
 * (lib/content-gen/claims.ts) runs; without a key it falls back to the
 * deterministic templates. Either way this proves buildStatsContext resolves
 * against real data (including the new allTimeWinPctRank) and the pipeline runs
 * clean end to end.
 *
 * Usage:
 *   POSTGRES_DRIVER=pg npx tsx scripts/gen-content-dryrun.ts [--seasonType pre|regular|off]
 *
 * Requires POSTGRES_DRIVER=pg locally (node-postgres); reads .env.local.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { buildStatsContext } from "@/lib/content-gen/stats-context";
import { generateContent } from "@/lib/content-gen/generate";
import { getNflState, type NflSeasonType } from "@/lib/queries/nfl-state";

function argVal(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const seasonTypeArg = (argVal("--seasonType") as NflSeasonType | null) ?? "pre";

  const [seasonRow] = await db
    .select({ id: seasons.id, seasonYear: seasons.seasonYear, status: seasons.status })
    .from(seasons)
    .orderBy(desc(seasons.seasonYear))
    .limit(1);

  if (!seasonRow) {
    console.error("[dryrun] no season rows found");
    process.exit(1);
  }

  const nflState = await getNflState();
  const week = nflState?.week && nflState.week >= 1 ? nflState.week : 1;

  console.log(
    `[dryrun] season ${seasonRow.seasonYear} (id ${seasonRow.id}, status ${seasonRow.status}), seasonType=${seasonTypeArg}, week=${week}`,
  );
  console.log(`[dryrun] ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "present -> LLM path" : "ABSENT -> template fallback"}\n`);

  const ctx = await buildStatsContext({
    seasonId: seasonRow.id,
    seasonYear: seasonRow.seasonYear,
    week,
    seasonType: seasonTypeArg,
  });

  // Surface the new field so the ranking the verifier relies on is visible.
  console.log("[dryrun] franchiseHistory (slug / winPct / rank):");
  for (const f of [...ctx.franchiseHistory].sort((a, b) => a.allTimeWinPctRank - b.allTimeWinPctRank)) {
    console.log(`  #${f.allTimeWinPctRank}  ${f.slug.padEnd(28)} ${f.allTimeWinPct}`);
  }
  console.log("");

  const result = await generateContent(ctx);

  console.log(`[dryrun] source=${result.source}`);
  if ("templateFilledKinds" in result && result.templateFilledKinds) {
    console.log(`[dryrun] templateFilledKinds=${result.templateFilledKinds.join(", ") || "(none)"}`);
  }
  if ("diversityStats" in result && result.diversityStats) {
    console.log(`[dryrun] diversityStats=${JSON.stringify(result.diversityStats)}`);
  }
  console.log(`[dryrun] ${result.rows.length} rows:\n`);

  for (const row of result.rows) {
    const tag = row.refKey ? ` [${row.refKey}]` : "";
    console.log(`- (${row.kind})${tag} ${row.body}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("[dryrun] failed:", e);
  process.exit(1);
});
