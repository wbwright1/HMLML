// The Book: Tracking tab queries. Season ATS leaderboard, the Who Picked Whom
// grid, and Streak Watch, all read from book_picks joined against the matchups
// those picks were graded against. lib/book/grading.ts does the actual math;
// everything here is assembly and JSON-safe shaping.
//
// Not wrapped in cachedQuery: this backs /book, which is a plain ISR page with
// no searchParams (see lib/cache.ts's rule for which pages need the
// unstable_cache wrapper), so the ISR route cache alone is enough.

import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookLines, bookPicks, franchises, members, matchups } from "@/lib/db/schema";
import {
  bestWeekOf,
  deriveStreak,
  formatAtsRecord,
  pickOutcome,
  tallyOutcomes,
  type Streak,
  type WeeklyRecord,
} from "@/lib/book/grading";
import { getBookBoard } from "@/lib/queries/book";
import type {
  AtsLeaderboardRow,
  PickOutcome,
  StreakTile,
  WhoPickedWhomCell,
  WhoPickedWhomData,
  WhoPickedWhomHeader,
  WhoPickedWhomRow,
} from "@/lib/book/shared";

// The tracking shapes live in lib/book/shared.ts (the tracking island imports
// them, and anything it touches must not pull lib/db into the browser
// bundle). Re-exported here so the server side keeps one import for "the
// book", matching the pattern lib/queries/book.ts already uses for the board.
export type {
  AtsLeaderboardRow,
  WhoPickedWhomCell,
  WhoPickedWhomData,
  WhoPickedWhomHeader,
  WhoPickedWhomRow,
  StreakTile,
} from "@/lib/book/shared";

// ---------------------------------------------------------------------------
// Shared: who can appear on the Tracking tab, and their graded pick history
// ---------------------------------------------------------------------------

interface Picker {
  memberId: number;
  displayName: string;
  franchiseSlug: string;
  franchiseName: string;
  franchiseAbbreviation: string | null;
  franchiseColor: string | null;
}

/** Every member who owns a franchise: the universe of possible pickers. */
async function getPickers(): Promise<Map<number, Picker>> {
  const rows = await db
    .select({
      memberId: members.id,
      displayName: members.displayName,
      franchiseSlug: franchises.slug,
      franchiseName: franchises.name,
      franchiseAbbreviation: franchises.abbreviation,
      franchiseColor: franchises.brandingColor,
    })
    .from(members)
    .innerJoin(franchises, eq(franchises.id, members.franchiseId));

  const map = new Map<number, Picker>();
  for (const row of rows) {
    map.set(row.memberId, {
      memberId: row.memberId,
      displayName: row.displayName,
      franchiseSlug: row.franchiseSlug,
      franchiseName: row.franchiseName,
      franchiseAbbreviation: row.franchiseAbbreviation,
      franchiseColor: row.franchiseColor,
    });
  }
  return map;
}

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
 * counting it toward a season record here would rewrite results mid-game; the
 * Who Picked Whom grid is the one surface allowed to grade a live game, and it
 * does so separately by reading current scores off getBookBoard.
 */
async function getFinalGradedPicks(seasonId: number): Promise<GradedPickRow[]> {
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
    getPickers(),
    getFinalGradedPicks(seasonId),
  ]);

  const byMember = new Map<number, GradedPickRow[]>();
  for (const row of graded) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  const unranked: Omit<AtsLeaderboardRow, "rank" | "isLeader" | "isLast">[] = [];

  for (const [memberId, picks] of byMember) {
    const picker = pickers.get(memberId);
    if (!picker) continue; // a picker with no franchise cannot show a crest

    const sortedDesc = [...picks].sort((a, b) => b.week - a.week);
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
// Who Picked Whom grid
// ---------------------------------------------------------------------------

/**
 * The current week's Who Picked Whom grid.
 *
 * Privacy is enforced HERE, at the query, not by hiding it in the client: a
 * pick on a game that has not kicked off yet (`status === "open"`) is never
 * put into the payload for anyone but its own owner, and the owner's own open
 * picks are overlaid client-side from their own /api/book/picks call (the
 * anti-tailing rule: you can always see your own slip, nobody else's). Once a
 * game is live or final every pick on it is public and graded against its
 * OWN snapshotted spread.
 */
export async function getWhoPickedWhomGrid(
  seasonId: number,
  seasonYear: number,
  week: number,
): Promise<WhoPickedWhomData> {
  const [pickers, games] = await Promise.all([
    getPickers(),
    getBookBoard(seasonId, seasonYear, week),
  ]);

  if (games.length === 0) return { header: [], rows: [] };

  const header: WhoPickedWhomHeader[] = games.map((g) => ({
    matchupId: g.matchupId,
    label: `${g.home.abbreviation ?? g.home.name}/${g.away.abbreviation ?? g.away.name}`,
    homeAbbreviation: g.home.abbreviation ?? g.home.name,
    awayAbbreviation: g.away.abbreviation ?? g.away.name,
  }));

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

  const rows: WhoPickedWhomRow[] = [...pickers.values()]
    .sort((a, b) => a.franchiseName.localeCompare(b.franchiseName))
    .map((picker) => {
      const cells: WhoPickedWhomCell[] = games.map((game) => {
        if (game.status === "open") {
          // Never shipped to the browser for anyone: the client overlays the
          // viewer's own open pick locally from their own session-scoped call.
          return { revealed: false, abbreviation: null, outcome: null };
        }

        const pick = pickByMemberAndMatchup.get(
          `${picker.memberId}:${game.matchupId}`,
        );
        if (!pick) return { revealed: true, abbreviation: null, outcome: null };

        const abbreviation =
          pick.side === "home"
            ? (game.home.abbreviation ?? game.home.name)
            : (game.away.abbreviation ?? game.away.name);
        const outcome = pickOutcome(game.home.points, game.away.points, pick);
        return { revealed: true, abbreviation, outcome };
      });

      return {
        memberId: picker.memberId,
        displayName: picker.displayName,
        franchiseSlug: picker.franchiseSlug,
        cells,
      };
    });

  return { header, rows };
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
    getPickers(),
    getFinalGradedPicks(seasonId),
  ]);

  const byMember = new Map<number, GradedPickRow[]>();
  for (const row of graded) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  let heater: { picker: Picker; streak: Streak; startWeek: number } | null = null;
  let iceCold: { picker: Picker; streak: Streak; startWeek: number } | null = null;
  const weeklyRecords: (WeeklyRecord & { picker: Picker })[] = [];

  for (const [memberId, picks] of byMember) {
    const picker = pickers.get(memberId);
    if (!picker) continue;

    const sortedDesc = [...picks].sort((a, b) => b.week - a.week);
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
