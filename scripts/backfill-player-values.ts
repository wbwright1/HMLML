/**
 * One-time backfill script: populates historical dynasty trade values from
 * DynastyProcess's weekly CSV snapshots, one snapshot per distinct trade date
 * in league history. Values are additive upserts (source='dynastyprocess')
 * alongside the daily FantasyCalc sync (source='fantasycalc'); the two never
 * collide because of the (asset_id, snapshot_date, source) unique index.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/backfill-player-values.ts
 *
 * Set GITHUB_TOKEN to authenticate the commits API (5,000 req/hr vs 60
 * unauthenticated), e.g. GITHUB_TOKEN=$(gh auth token).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { playerValues } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { getTrades } from "@/lib/queries/trades";

const PLAYER_IDS_CSV_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";
const COMMITS_API_URL =
  "https://api.github.com/repos/dynastyprocess/data/commits";
const VALUES_CSV_PATH = "files/values-players.csv";

interface ValuesRow {
  player: string;
  pos: string;
  value_2qb: string;
  scrape_date: string;
  fp_id: string;
}

/** Split an array into chunks of the given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields (which may contain
 * commas and escaped "" quote pairs). Not a full spec implementation (no
 * embedded-newline support), but sufficient for these single-line-record
 * DynastyProcess CSVs. No new dependency: player names contain commas, so a
 * naive split(',') is not viable.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const lines = text.split(/\r\n|\n/);

  for (const line of lines) {
    if (line.length === 0 && !inQuotes) {
      // Blank line outside a quoted field: skip (trailing newline at EOF).
      continue;
    }

    let i = 0;
    if (!inQuotes) {
      field = "";
      row = [];
    }

    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      field += ch;
      i++;
    }

    if (inQuotes) {
      // Embedded newline inside a quoted field: preserve it and continue
      // accumulating on the next line.
      field += "\n";
      continue;
    }

    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvRowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows
    .filter((r) => r.length === header.length)
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((col, i) => {
        obj[col] = r[i];
      });
      return obj;
    });
}

/** Fetches the DynastyProcess player-id crosswalk once, mapping
 * fantasypros_id -> sleeper_id. Skips rows with no sleeper_id; on a duplicate
 * fantasypros_id, keeps the first mapping seen and warns. */
async function fetchFantasyProsToSleeperMap(): Promise<Map<string, string>> {
  const res = await fetch(PLAYER_IDS_CSV_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch db_playerids.csv: HTTP ${res.status}`);
  }
  const text = await res.text();
  const objects = csvRowsToObjects(parseCsv(text));

  const map = new Map<string, string>();
  for (const row of objects) {
    const fpId = row.fantasypros_id;
    const sleeperId = row.sleeper_id;
    if (!fpId || fpId === "NA" || !sleeperId || sleeperId === "NA") continue;
    if (map.has(fpId)) {
      console.warn(
        `[backfill-player-values] Duplicate fantasypros_id ${fpId}; keeping first sleeper_id mapping`
      );
      continue;
    }
    map.set(fpId, sleeperId);
  }
  return map;
}

/** Finds the last commit that touched values-players.csv on or before the
 * given date (YYYY-MM-DD), returning its sha, or null if none found. */
async function findCommitShaForDate(date: string): Promise<string | null> {
  const url = `${COMMITS_API_URL}?path=${encodeURIComponent(VALUES_CSV_PATH)}&until=${date}T23:59:59Z&per_page=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(
      `[backfill-player-values] GitHub commits API returned HTTP ${res.status} for ${date}`
    );
    return null;
  }
  const commits = (await res.json()) as Array<{ sha: string }>;
  return commits[0]?.sha ?? null;
}

async function fetchValuesCsvForSha(sha: string): Promise<ValuesRow[]> {
  const url = `https://raw.githubusercontent.com/dynastyprocess/data/${sha}/${VALUES_CSV_PATH}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch values-players.csv @ ${sha}: HTTP ${res.status}`);
  }
  const text = await res.text();
  return csvRowsToObjects(parseCsv(text)) as unknown as ValuesRow[];
}

/** Weekly dates (every 7 days) from start to end inclusive, YYYY-MM-DD. */
function weeklyDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  while (cursor.getTime() <= endMs) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

async function main() {
  // Two modes: default snapshots at every distinct trade date (then-vs-now
  // trade cards); WEEKLY_START[/WEEKLY_END] snapshots every 7 days in a range
  // (densifies the per-player value-over-time chart). Both upsert by the
  // CSV's own scrape_date, so overlapping runs are idempotent.
  let sortedDates: string[];
  if (process.env.WEEKLY_START) {
    const end =
      process.env.WEEKLY_END ?? new Date().toISOString().slice(0, 10);
    sortedDates = weeklyDates(process.env.WEEKLY_START, end);
    console.log(
      `Weekly mode: ${sortedDates.length} dates from ${process.env.WEEKLY_START} to ${end}`
    );
  } else {
    console.log("Fetching all trades to find distinct trade dates...");
    const trades = await getTrades();
    console.log(`Found ${trades.length} trades`);

    const distinctDates = new Set<string>();
    for (const trade of trades) {
      if (trade.createdAtMs == null) continue;
      const date = new Date(trade.createdAtMs).toISOString().slice(0, 10);
      distinctDates.add(date);
    }
    sortedDates = Array.from(distinctDates).sort();
    console.log(`Distinct trade dates: ${sortedDates.length}`);
  }

  console.log("Fetching DynastyProcess player-id crosswalk...");
  const fpToSleeper = await fetchFantasyProsToSleeperMap();
  console.log(`Loaded ${fpToSleeper.size} fantasypros_id -> sleeper_id mappings`);

  // Cache fetched CSVs by commit sha: many trade dates fall in the same
  // week's snapshot, so this both saves GitHub API calls (60/hr unauth) and
  // avoids redundant parsing/upserts.
  const csvCacheBySha = new Map<string, ValuesRow[]>();
  const shaByDate = new Map<string, string | null>();

  let totalUpserted = 0;
  let datesProcessed = 0;
  let datesSkipped = 0;

  for (const date of sortedDates) {
    console.log(`\n--- Date ${date} ---`);
    const sha = await findCommitShaForDate(date);
    if (!sha) {
      console.log(`  No commit found on or before ${date}; skipping`);
      datesSkipped++;
      continue;
    }
    shaByDate.set(date, sha);

    let csvRows = csvCacheBySha.get(sha);
    if (!csvRows) {
      console.log(`  Fetching values-players.csv @ ${sha}...`);
      csvRows = await fetchValuesCsvForSha(sha);
      csvCacheBySha.set(sha, csvRows);
      console.log(`  Parsed ${csvRows.length} rows from this snapshot`);
    } else {
      console.log(`  Reusing cached snapshot @ ${sha} (${csvRows.length} rows)`);
    }

    const upsertRows = csvRows
      .map((row) => {
        const sleeperId = fpToSleeper.get(row.fp_id);
        if (!sleeperId) return null;
        const value = Number(row.value_2qb);
        if (!Number.isFinite(value)) return null;
        return {
          assetId: sleeperId,
          name: row.player,
          position: row.pos,
          value,
          source: "dynastyprocess",
          snapshotDate: row.scrape_date,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const batches = chunk(upsertRows, 500);
    for (const batch of batches) {
      await db
        .insert(playerValues)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            playerValues.assetId,
            playerValues.snapshotDate,
            playerValues.source,
          ],
          set: {
            name: sql`excluded.name`,
            position: sql`excluded.position`,
            value: sql`excluded.value`,
          },
        });
    }

    console.log(`  Upserted ${upsertRows.length} dynastyprocess value rows`);
    totalUpserted += upsertRows.length;
    datesProcessed++;
  }

  console.log("\n=== Backfill complete ===");
  console.log(`Trade dates processed: ${datesProcessed}`);
  console.log(`Trade dates skipped (no commit found): ${datesSkipped}`);
  console.log(`Distinct snapshots fetched: ${csvCacheBySha.size}`);
  console.log(`Total dynastyprocess rows upserted: ${totalUpserted}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
