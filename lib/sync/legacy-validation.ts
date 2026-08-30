import { db } from "@/lib/db";
import {
  seasons,
  franchiseSeasons,
  matchups,
  draftPicks,
  transactions,
} from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeasonValidation {
  seasonYear: number;
  leagueId: string;
  status: string | null;
  franchiseSeasonCount: number;
  matchupCount: number;
  draftPickCount: number;
  transactionCount: number;
  matchupWeeks: number[];
  flags: string[];
}

export interface ValidationReport {
  generatedAt: string;
  totalSeasons: number;
  seasonsWithIssues: number;
  seasonReports: SeasonValidation[];
  summary: {
    totalFranchiseSeasons: number;
    totalMatchups: number;
    totalDraftPicks: number;
    totalTransactions: number;
  };
  dataGaps: string[];
}

// ---------------------------------------------------------------------------
// Validation Logic
// ---------------------------------------------------------------------------

export async function generateValidationReport(): Promise<ValidationReport> {
  const generatedAt = new Date().toISOString();
  const dataGaps: string[] = [];

  // Fetch all seasons ordered by year
  const allSeasons = await db
    .select()
    .from(seasons)
    .orderBy(seasons.seasonYear);

  if (allSeasons.length === 0) {
    return {
      generatedAt,
      totalSeasons: 0,
      seasonsWithIssues: 0,
      seasonReports: [],
      summary: {
        totalFranchiseSeasons: 0,
        totalMatchups: 0,
        totalDraftPicks: 0,
        totalTransactions: 0,
      },
      dataGaps: ["No seasons found in database"],
    };
  }

  // Check for gaps in season years
  const years = allSeasons.map((s) => s.seasonYear);
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] > 1) {
      const gap = [];
      for (let y = years[i - 1] + 1; y < years[i]; y++) {
        gap.push(y);
      }
      dataGaps.push(`Missing season years: ${gap.join(", ")}`);
    }
  }

  const seasonReports: SeasonValidation[] = [];
  let totalFranchiseSeasons = 0;
  let totalMatchups = 0;
  let totalDraftPicks = 0;
  let totalTransactions = 0;

  for (const season of allSeasons) {
    const flags: string[] = [];

    // Count franchise_seasons
    const [fsCount] = await db
      .select({ count: count() })
      .from(franchiseSeasons)
      .where(eq(franchiseSeasons.seasonId, season.id));
    const franchiseSeasonCount = fsCount.count;

    // Count matchups
    const [mCount] = await db
      .select({ count: count() })
      .from(matchups)
      .where(eq(matchups.seasonId, season.id));
    const matchupCount = mCount.count;

    // Get distinct weeks with matchups
    const weekRows = await db
      .selectDistinct({ week: matchups.week })
      .from(matchups)
      .where(eq(matchups.seasonId, season.id))
      .orderBy(matchups.week);
    const matchupWeeks = weekRows.map((r) => r.week);

    // Count draft picks
    const [dpCount] = await db
      .select({ count: count() })
      .from(draftPicks)
      .where(eq(draftPicks.seasonId, season.id));
    const draftPickCount = dpCount.count;

    // Count transactions
    const [txCount] = await db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.seasonId, season.id));
    const transactionCount = txCount.count;

    // Flag checks
    if (franchiseSeasonCount === 0) {
      flags.push("No franchise_seasons records");
    } else if (
      season.totalRosters &&
      franchiseSeasonCount < season.totalRosters
    ) {
      flags.push(
        `Franchise count (${franchiseSeasonCount}) less than expected rosters (${season.totalRosters})`
      );
    }

    if (season.status === "complete" && matchupCount === 0) {
      flags.push("Completed season with no matchup records");
    }

    if (season.status === "complete" && matchupWeeks.length < 13) {
      flags.push(
        `Only ${matchupWeeks.length} weeks of matchup data (expected at least 13 for a complete season)`
      );
    }

    // Check for consecutive weeks - find gaps
    if (matchupWeeks.length > 1) {
      for (let i = 1; i < matchupWeeks.length; i++) {
        if (matchupWeeks[i] - matchupWeeks[i - 1] > 1) {
          const missingWeeks = [];
          for (let w = matchupWeeks[i - 1] + 1; w < matchupWeeks[i]; w++) {
            missingWeeks.push(w);
          }
          flags.push(`Missing matchup data for weeks: ${missingWeeks.join(", ")}`);
        }
      }
    }

    if (season.status === "complete" && draftPickCount === 0) {
      flags.push("Completed season with no draft picks");
    }

    // Accumulate totals
    totalFranchiseSeasons += franchiseSeasonCount;
    totalMatchups += matchupCount;
    totalDraftPicks += draftPickCount;
    totalTransactions += transactionCount;

    seasonReports.push({
      seasonYear: season.seasonYear,
      leagueId: season.leagueId,
      status: season.status,
      franchiseSeasonCount,
      matchupCount,
      draftPickCount,
      transactionCount,
      matchupWeeks,
      flags,
    });
  }

  const seasonsWithIssues = seasonReports.filter(
    (r) => r.flags.length > 0
  ).length;

  return {
    generatedAt,
    totalSeasons: allSeasons.length,
    seasonsWithIssues,
    seasonReports,
    summary: {
      totalFranchiseSeasons,
      totalMatchups,
      totalDraftPicks,
      totalTransactions,
    },
    dataGaps,
  };
}
