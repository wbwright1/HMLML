// The Book: Tracking tab queries. Season ATS leaderboard, the pick'ems grid,
// and Streak Watch, all read from book_picks joined against the matchups those
// picks were graded against. lib/book/grading.ts does the actual math;
// everything here is assembly and JSON-safe shaping.
//
// Not wrapped in cachedQuery: this backs /book, which is a plain ISR page with
// no searchParams (see lib/cache.ts's rule for which pages need the
// unstable_cache wrapper), so the ISR route cache alone is enough.

import { cache } from "react";
import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookLines,
  bookPicks,
  franchises,
  franchiseSeasons,
  members,
  matchups,
} from "@/lib/db/schema";
import {
  bestWeekOf,
  deriveStreak,
  formatAtsRecord,
  pickOutcome,
  tallyOutcomes,
  type Streak,
  type WeeklyRecord,
} from "@/lib/book/grading";
import { formatSpread } from "@/lib/book/pricing";
import { resolveAbbreviation } from "@/lib/franchise-abbreviations";
import type { BookGame } from "@/lib/book/shared";
import {
  buildPickemsCell,
  groupPickersByDivision,
  type AtsLeaderboardRow,
  type PickemsGridData,
  type PickemsRow,
  type PickerSeed,
  type PickOutcome,
  type StreakTile,
} from "@/lib/book/shared";

// The tracking shapes live in lib/book/shared.ts (the tracking island imports
// them, and anything it touches must not pull lib/db into the browser
// bundle). Re-exported here so the server side keeps one import for "the
// book", matching the pattern lib/queries/book.ts already uses for the board.
export type {
  AtsLeaderboardRow,
  PickemsCell,
  PickemsDivision,
  PickemsGridData,
  PickemsRow,
  PickerColumn,
  StreakTile,
} from "@/lib/book/shared";

// ---------------------------------------------------------------------------
// Shared: who can appear on the Tracking tab, and their graded pick history
// ---------------------------------------------------------------------------

interface Picker {
  memberId: number;
  franchiseId: string;
  displayName: string;
  franchiseSlug: string;
  franchiseName: string;
  franchiseAbbreviation: string | null;
  franchiseColor: string | null;
  /** Null for a season with no divisions at all (legacy era), not an error. */
  divisionName: string | null;
}

/**
 * Every member who owns a franchise: the universe of possible pickers, with
 * the division their franchise sits in THIS season (the grid clusters columns
 * by division, and division membership is versioned per season).
 */
const getPickers = cache(async function getPickers(
  seasonId: number,
): Promise<Map<number, Picker>> {
  const rows = await db
    .select({
      memberId: members.id,
      franchiseId: franchises.id,
      displayName: members.displayName,
      franchiseSlug: franchises.slug,
      franchiseName: franchises.name,
      franchiseAbbreviation: franchises.abbreviation,
      franchiseColor: franchises.brandingColor,
      divisionName: franchiseSeasons.divisionName,
    })
    .from(members)
    .innerJoin(franchises, eq(franchises.id, members.franchiseId))
    .leftJoin(
      franchiseSeasons,
      and(
        eq(franchiseSeasons.franchiseId, franchises.id),
        eq(franchiseSeasons.seasonId, seasonId),
      ),
    );

  const map = new Map<number, Picker>();
  for (const row of rows) {
    map.set(row.memberId, {
      memberId: row.memberId,
      franchiseId: row.franchiseId,
      displayName: row.displayName,
      franchiseSlug: row.franchiseSlug,
      franchiseName: row.franchiseName,
      franchiseAbbreviation: row.franchiseAbbreviation,
      franchiseColor: row.franchiseColor,
      divisionName: row.divisionName,
    });
  }
  return map;
});

interface GradedPickRow {
  memberId: number;
  week: number;
  outcome: PickOutcome;
}

/**
 * Every FINAL graded pick for a season, one row per pick.
 *
 * "Final" means both sides of the matchup have completed, matching the
 * `isFinal` test getBookBoard uses. A live game's cover can still flip, so
 * counting it toward a season record would rewrite results mid-game. No
 * surface grades a live game: the pick'ems grid reveals a pick at kickoff and
 * leaves it ungraded until the game is done.
 */
const getFinalGradedPicks = cache(async function getFinalGradedPicks(
  seasonId: number,
): Promise<GradedPickRow[]> {
  const homeMatchups = alias(matchups, "book_tracking_home_matchups");
  const awayMatchups = alias(matchups, "book_tracking_away_matchups");

  const rows = await db
    .select({
      memberId: bookPicks.memberId,
      week: bookPicks.week,
      side: bookPicks.side,
      spreadAtPick: bookPicks.spreadAtPick,
      homePoints: homeMatchups.points,
      homeStatus: homeMatchups.status,
      awayPoints: awayMatchups.points,
      awayStatus: awayMatchups.status,
    })
    .from(bookPicks)
    .innerJoin(
      bookLines,
      and(
        eq(bookLines.seasonId, bookPicks.seasonId),
        eq(bookLines.week, bookPicks.week),
        eq(bookLines.matchupId, bookPicks.matchupId),
      ),
    )
    .innerJoin(
      homeMatchups,
      and(
        eq(homeMatchups.seasonId, bookPicks.seasonId),
        eq(homeMatchups.week, bookPicks.week),
        eq(homeMatchups.rosterId, bookLines.homeRosterId),
      ),
    )
    .innerJoin(
      awayMatchups,
      and(
        eq(awayMatchups.seasonId, bookPicks.seasonId),
        eq(awayMatchups.week, bookPicks.week),
        eq(awayMatchups.rosterId, bookLines.awayRosterId),
      ),
    )
    .where(eq(bookPicks.seasonId, seasonId));

  const graded: GradedPickRow[] = [];
  for (const row of rows) {
    if (row.homeStatus !== "complete" || row.awayStatus !== "complete") continue;
    const side = row.side === "away" ? "away" : "home";
    graded.push({
      memberId: row.memberId,
      week: row.week,
      outcome: pickOutcome(row.homePoints ?? 0, row.awayPoints ?? 0, {
        side,
        spreadAtPick: row.spreadAtPick,
      }),
    });
  }
  return graded;
});

/**
 * Graded outcomes per member, most recent week first, for members who own a
 * franchise. Both the leaderboard and the grid's per-column record read
 * through this so the two can never disagree about somebody's record: a
 * member the leaderboard skips (no franchise, so no crest to show) is the
 * same member the grid has no column for.
 */
function gradedOutcomesByMember(
  pickers: Map<number, Picker>,
  graded: GradedPickRow[],
): Map<number, GradedPickRow[]> {
  const byMember = new Map<number, GradedPickRow[]>();
  for (const row of graded) {
    if (!pickers.has(row.memberId)) continue;
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }
  for (const list of byMember.values()) list.sort((a, b) => b.week - a.week);
  return byMember;
}

// ---------------------------------------------------------------------------
// Season ATS leaderboard
// ---------------------------------------------------------------------------

/**
 * The season ATS leaderboard: every member with at least one graded pick,
 * ranked by win pct then units. Nobody with zero graded picks gets a
 * fabricated 0-0 row (superlatives rule: absence is fine, fabrication is not).
 */
export async function getSeasonAtsLeaderboard(
  seasonId: number,
): Promise<AtsLeaderboardRow[]> {
  const [pickers, graded] = await Promise.all([
    getPickers(seasonId),
    getFinalGradedPicks(seasonId),
  ]);

  const byMember = gradedOutcomesByMember(pickers, graded);

  const unranked: Omit<AtsLeaderboardRow, "rank" | "isLeader" | "isLast">[] = [];

  for (const [memberId, sortedDesc] of byMember) {
    // gradedOutcomesByMember already dropped anyone without a franchise (no
    // crest to show), so this lookup cannot miss.
    const picker = pickers.get(memberId)!;

    const tally = tallyOutcomes(sortedDesc.map((p) => p.outcome));
    const streak = deriveStreak(sortedDesc.map((p) => p.outcome));

    unranked.push({
      memberId,
      displayName: picker.displayName,
      franchiseSlug: picker.franchiseSlug,
      franchiseName: picker.franchiseName,
      franchiseAbbreviation: picker.franchiseAbbreviation,
      franchiseColor: picker.franchiseColor,
      record: formatAtsRecord(tally),
      streakLabel: streak ? `${streak.type}${streak.length}` : null,
      streakType: streak?.type ?? null,
      units: tally.units,
    });
  }

  // Win pct was folded away by tallyOutcomes above (only the formatted record
  // survives on the row), so it is re-derived from that record here to sort
  // on the same basis the acceptance criteria asks for: win pct, then units.
  const withPct = unranked.map((row) => {
    const [wins, losses] = row.record.split("-").map(Number);
    const decisions = (wins ?? 0) + (losses ?? 0);
    const winPct = decisions > 0 ? (wins ?? 0) / decisions : 0;
    return { row, winPct };
  });

  withPct.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return b.row.units - a.row.units;
  });

  return withPct.map(({ row }, index) => ({
    ...row,
    rank: index + 1,
    isLeader: index === 0,
    isLast: index === withPct.length - 1 && withPct.length > 1,
  }));
}

// ---------------------------------------------------------------------------
// Pick'ems grid
// ---------------------------------------------------------------------------

/**
 * The current week's pick'ems grid: one column per member (clustered under
 * their division), one row per game.
 *
 * Takes the board it should describe rather than fetching its own: /book has
 * already built that exact week for the Board tab, and re-running the whole
 * pipeline (lines, matchups, kickoff states, pick counts) a second time per
 * render bought nothing.
 *
 * Privacy is enforced HERE, at the query, not by hiding it in the client: a
 * pick on a game that has not kicked off yet (`status === "open"`) is never
 * put into the payload for anyone, and the viewer's own open picks are
 * overlaid client-side from their own /api/book/picks call (the anti-tailing
 * rule: you can always see your own slip, nobody else's).
 *
 * Once a game kicks off every pick on it is public, but it stays UNGRADED
 * until the game is final: there is no live cover tracking anywhere in The
 * Book. A final game grades against the spread snapshotted on each pick's own
 * row, which may differ from the line the game ended up carrying.
 */
export async function getPickemsGrid(
  seasonId: number,
  week: number,
  games: BookGame[],
): Promise<PickemsGridData> {
  const [pickers, graded] = await Promise.all([
    getPickers(seasonId),
    getFinalGradedPicks(seasonId),
  ]);

  if (games.length === 0) return { divisions: [], rows: [] };

  const gradedByMember = gradedOutcomesByMember(pickers, graded);

  const seeds: PickerSeed[] = [...pickers.values()].map((picker) => {
    const outcomes = gradedByMember.get(picker.memberId);
    return {
      memberId: picker.memberId,
      displayName: picker.displayName,
      franchiseSlug: picker.franchiseSlug,
      franchiseName: picker.franchiseName,
      // Same word-initial ladder the sync uses when it stamps the column, so
      // a franchise that has not been backfilled still reads like every other
      // crest instead of a blunt three-letter truncation.
      abbreviation:
        picker.franchiseAbbreviation ??
        resolveAbbreviation(picker.franchiseId, picker.franchiseName),
      color: picker.franchiseColor,
      // Empty, never "0-0": a member who has not been graded yet has no
      // record to show, and inventing one is a fabricated claim.
      record: outcomes
        ? formatAtsRecord(tallyOutcomes(outcomes.map((o) => o.outcome)))
        : "",
      divisionName: picker.divisionName,
    };
  });

  const pickRows = await db
    .select({
      memberId: bookPicks.memberId,
      matchupId: bookPicks.matchupId,
      side: bookPicks.side,
      spreadAtPick: bookPicks.spreadAtPick,
    })
    .from(bookPicks)
    .where(and(eq(bookPicks.seasonId, seasonId), eq(bookPicks.week, week)));

  const pickByMemberAndMatchup = new Map<
    string,
    { side: "home" | "away"; spreadAtPick: number }
  >();
  for (const p of pickRows) {
    pickByMemberAndMatchup.set(`${p.memberId}:${p.matchupId}`, {
      side: p.side === "away" ? "away" : "home",
      spreadAtPick: p.spreadAtPick,
    });
  }

  const rows: PickemsRow[] = games.map((game) => {
    const homeAbbreviation = game.home.abbreviation ?? game.home.name;
    const awayAbbreviation = game.away.abbreviation ?? game.away.name;
    const cells: Record<string, ReturnType<typeof buildPickemsCell>> = {};

    for (const picker of pickers.values()) {
      cells[String(picker.memberId)] = buildPickemsCell({
        status: game.status,
        pick:
          pickByMemberAndMatchup.get(`${picker.memberId}:${game.matchupId}`) ??
          null,
        homeAbbreviation,
        awayAbbreviation,
        homePoints: game.home.points,
        awayPoints: game.away.points,
      });
    }

    return {
      matchupId: game.matchupId,
      label: `${homeAbbreviation}/${awayAbbreviation}`,
      homeAbbreviation,
      awayAbbreviation,
      spreadLabel: formatSpread(game.spread),
      status: game.status,
      cells,
    };
  });

  return { divisions: groupPickersByDivision(seeds), rows };
}

// ---------------------------------------------------------------------------
// Streak Watch
// ---------------------------------------------------------------------------

/**
 * Longest active heater, longest active cold streak, and the single best
 * graded week across the whole league. Any tile whose underlying claim is not
 * true or not notable (streak < 2, best week under
 * MIN_PICKS_FOR_BEST_WEEK graded picks) is simply omitted.
 */
export async function getStreakWatch(seasonId: number): Promise<StreakTile[]> {
  const [pickers, graded] = await Promise.all([
    getPickers(seasonId),
    getFinalGradedPicks(seasonId),
  ]);

  const byMember = gradedOutcomesByMember(pickers, graded);

  let heater: { picker: Picker; streak: Streak; startWeek: number } | null = null;
  let iceCold: { picker: Picker; streak: Streak; startWeek: number } | null = null;
  const weeklyRecords: (WeeklyRecord & { picker: Picker })[] = [];

  for (const [memberId, sortedDesc] of byMember) {
    const picker = pickers.get(memberId)!;
    const picks = sortedDesc;

    const streak = deriveStreak(sortedDesc.map((p) => p.outcome));
    if (streak && streak.length >= 2) {
      const startWeek = streakStartWeek(sortedDesc, streak);
      const candidate = { picker, streak, startWeek: startWeek ?? sortedDesc[0].week };
      if (streak.type === "W") {
        if (!heater || streak.length > heater.streak.length) heater = candidate;
      } else if (!iceCold || streak.length > iceCold.streak.length) {
        iceCold = candidate;
      }
    }

    const byWeek = new Map<number, { wins: number; losses: number; pushes: number }>();
    for (const p of picks) {
      const w = byWeek.get(p.week) ?? { wins: 0, losses: 0, pushes: 0 };
      if (p.outcome === "win") w.wins += 1;
      else if (p.outcome === "loss") w.losses += 1;
      else w.pushes += 1;
      byWeek.set(p.week, w);
    }
    for (const [week, w] of byWeek) {
      weeklyRecords.push({ week, ...w, picker });
    }
  }

  const tiles: StreakTile[] = [];

  if (heater) {
    tiles.push({
      kind: "heater",
      kicker: "Longest Heater",
      stat: `W${heater.streak.length}`,
      attribution: `${heater.picker.franchiseName} · hasn't missed since Week ${heater.startWeek}`,
    });
  }

  if (iceCold) {
    tiles.push({
      kind: "ice-cold",
      kicker: "Ice Cold",
      stat: `L${iceCold.streak.length}`,
      attribution: `${iceCold.picker.franchiseName} · cold since Week ${iceCold.startWeek}`,
    });
  }

  const best = bestWeekOf(weeklyRecords);
  if (best) {
    const attribution =
      best.losses === 0
        ? `${best.picker.franchiseName} · Week ${best.week} clean sweep`
        : `${best.picker.franchiseName} · Week ${best.week}`;
    tiles.push({
      kind: "best-week",
      kicker: "Best Single Week",
      stat: `${best.wins}-${best.losses}`,
      attribution,
    });
  }

  return tiles;
}

/** The earliest week among the outcomes that make up an active streak. */
function streakStartWeek(
  historyDesc: GradedPickRow[],
  streak: Streak,
): number | null {
  let count = 0;
  let startWeek: number | null = null;
  for (const row of historyDesc) {
    if (row.outcome === "push") continue;
    const asType: "W" | "L" = row.outcome === "win" ? "W" : "L";
    if (asType !== streak.type) break;
    startWeek = row.week;
    count += 1;
    if (count >= streak.length) break;
  }
  return startWeek;
}
