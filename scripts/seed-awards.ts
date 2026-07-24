/**
 * Seed / upsert the commissioner-entered league awards (Regular Season MVP,
 * Championship MVP, Rookie of the Year) into the league_awards table.
 *
 * The seed data lives in lib/awards-seed.ts; franchises + player ids + positions
 * are resolved from the DB at import time (see lib/sync/awards-import.ts).
 *
 * Usage:
 *   npx tsx scripts/seed-awards.ts --dry-run   # reads only; prints resolved table
 *   npx tsx scripts/seed-awards.ts             # upserts into league_awards
 *
 * Requires POSTGRES_DRIVER=pg locally (node-postgres supports the interactive
 * transaction the write path uses; the neon-http driver does not).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { runAwardsImport, type ResolvedAward } from "@/lib/sync/awards-import";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printTable(rows: ResolvedAward[]): void {
  const header = [
    pad("SEASON", 7),
    pad("AWARD", 20),
    pad("PLAYER", 24),
    pad("ID", 8),
    pad("POS", 5),
    pad("FRANCHISE", 26),
    pad("CHAMP-CHECK", 12),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log(
      [
        pad(String(r.seasonYear), 7),
        pad(r.awardType, 20),
        pad(r.playerName, 24),
        pad(r.playerId, 8),
        pad(r.position ?? "-", 5),
        pad(r.franchiseSlug, 26),
        pad(r.championshipSanity, 12),
      ].join(" "),
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[seed-awards] ${dryRun ? "DRY RUN (reads only)" : "LIVE upsert"} — resolving ${"" }league awards...\n`,
  );

  const result = await runAwardsImport(dryRun);

  printTable(result.resolved);

  const mismatches = result.resolved.filter(
    (r) => r.championshipSanity === "mismatch",
  );

  console.log("");
  if (result.errors.length > 0) {
    console.error(`[seed-awards] ${result.errors.length} RESOLUTION ERROR(S):`);
    for (const e of result.errors) console.error(`  - ${e}`);
  }
  if (mismatches.length > 0) {
    console.error(
      `[seed-awards] ${mismatches.length} CHAMPIONSHIP SANITY MISMATCH(ES) — investigate before writing.`,
    );
  }

  console.log(
    `\n[seed-awards] resolved ${result.resolved.length}/${result.resolved.length + result.errors.length} awards; status=${result.status}${dryRun ? " (no writes performed)" : " (upserted)"}`,
  );

  if (result.errors.length > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("[seed-awards] FAILED:", e);
    process.exit(1);
  });
