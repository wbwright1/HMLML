/**
 * Seed / upsert the commissioner-named rivalries into the rivalries table.
 *
 * The seed data lives in lib/rivalries-seed.ts. Each entry runs through the
 * same validator the /commish form uses (lib/rivalry-form.ts), so it is stored
 * in canonical pair order and obeys the same length limits. Idempotent: the
 * upsert is keyed on the franchise pair, so re-running updates in place.
 * Re-running also overwrites any /commish edits to these pairs.
 *
 * Usage:
 *   npx tsx scripts/seed-rivalries.ts --dry-run   # validate only, no writes
 *   npx tsx scripts/seed-rivalries.ts             # upsert into rivalries
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { RIVALRIES_SEED, type RivalrySeed } from "@/lib/rivalries-seed";
import { parseRivalryForm, type RivalryInput } from "@/lib/rivalry-form";

function toForm(seed: RivalrySeed) {
  const fields: Record<string, string> = {
    franchiseOneId: seed.franchiseOneId,
    franchiseTwoId: seed.franchiseTwoId,
    name: seed.name,
    tagline: seed.tagline ?? "",
    origin: seed.origin ?? "",
    originYear: seed.originYear == null ? "" : String(seed.originYear),
    trophyName: seed.trophyName ?? "",
  };
  return { get: (k: string) => fields[k] ?? null };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[seed-rivalries] ${dryRun ? "DRY RUN (validate only)" : "LIVE upsert"}: ${RIVALRIES_SEED.length} rivalries\n`,
  );

  const inputs: RivalryInput[] = [];
  for (const seed of RIVALRIES_SEED) {
    const parsed = parseRivalryForm(toForm(seed));
    if (!parsed.ok) {
      throw new Error(`"${seed.name}" failed validation: ${parsed.error}`);
    }
    inputs.push(parsed.value);
  }

  // Imported after dotenv so the lazily built db client sees POSTGRES_URL.
  const { upsertRivalryByPair } = await import("@/lib/queries/rivalries");

  for (const input of inputs) {
    const label = `${input.name} (${input.franchiseAId} | ${input.franchiseBId})`;
    if (dryRun) {
      console.log(`  valid   ${label}`);
      continue;
    }
    const id = await upsertRivalryByPair(input);
    console.log(`  upserted id=${id} ${label}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed-rivalries] FAILED:", e);
    process.exit(1);
  });
