import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  matchups,
  playerWeekPoints,
  players,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { loadSeasonRosterPositions } from "@/lib/queries/lineup-efficiency";
import {
  assembleTeamOfWeek,
  pickDud,
  pickTopPerformers,
  type RecapPlayer,
  type TeamOfWeek,
} from "@/lib/hub/week-recap";

// ---------------------------------------------------------------------------
// Types (JSON-safe: no Date, Map or Set, so the shape can be cached later)
// ---------------------------------------------------------------------------

export interface RecapTeam {
  franchiseId: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
  points: number;
}

export interface RecapResult {
  matchupId: number;
  winner: RecapTeam;
  loser: RecapTeam;
  margin: number;
}

export interface WeekRecap {
  week: number;
  /** Every completed pairing, biggest margin first. */
  results: RecapResult[];
  /** Top started scorers league-wide, highest first. */
  topPerformers: RecapPlayer[];
  /** Lowest-scoring started player who was expected to produce. */
  dud: RecapPlayer | null;
  /** The best lineup anyone could have fielded from every rostered player. */
  teamOfWeek: TeamOfWeek | null;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Everything the post-week recap block needs for one COMPLETED fantasy week.
 *
 * Returns null unless the week has matchup rows and every one of them is
 * `complete`: a half-played week would crown a Team of the Week off partial
 * box scores, and the game-state signal is the matchup status field, never a
 * "points are zero" heuristic (lib/queries/week-standouts.ts has the same
 * gate). Crests come from franchise_seasons for that season so a franchise
 * that rebranded since is shown as it looked that week.
 *
 * Throws on a DB error so the page's rethrowUnlessTolerable guard can keep
 * ISR from caching a hollow render; only the "nothing to say" cases are null.
 */
export async function getWeekRecap(
  seasonId: number,
  week: number
): Promise<WeekRecap | null> {
  if (week < 1) return null;

  const rows = await db
    .select({
      matchupId: matchups.matchupId,
      status: matchups.status,
      points: matchups.points,
      isWinner: matchups.isWinner,
      franchiseId: franchises.id,
      name: franchises.name,
      slug: franchises.slug,
      abbreviation: franchises.abbreviation,
      brandingColor: franchises.brandingColor,
      avatarUrl: franchiseSeasons.avatarUrl,
    })
    .from(matchups)
    .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
    .leftJoin(
      franchiseSeasons,
      and(
        eq(franchiseSeasons.franchiseId, matchups.franchiseId),
        eq(franchiseSeasons.seasonId, matchups.seasonId)
      )
    )
    .where(and(eq(matchups.seasonId, seasonId), eq(matchups.week, week)))
    .orderBy(matchups.matchupId);

  if (rows.length === 0) return null;
  if (rows.some((r) => r.status !== "complete")) return null;

  const grouped = new Map<number, RecapTeam[]>();
  const wonBy = new Map<string, boolean>();
  for (const r of rows) {
    const team: RecapTeam = {
      franchiseId: r.franchiseId,
      name: r.name,
      slug: r.slug,
      abbreviation: r.abbreviation,
      brandingColor: r.brandingColor,
      avatarUrl: r.avatarUrl ?? null,
      points: r.points ?? 0,
    };
    const group = grouped.get(r.matchupId) ?? [];
    group.push(team);
    grouped.set(r.matchupId, group);
    wonBy.set(r.franchiseId, r.isWinner === true);
  }

  const results: RecapResult[] = [];
  for (const [matchupId, pair] of grouped) {
    if (pair.length !== 2) continue;
    // Sleeper's is_winner is authoritative (it settles ties by league rule);
    // points only order the pair when neither side carries the flag.
    const flagged = pair.find((t) => wonBy.get(t.franchiseId));
    const winner =
      flagged ?? (pair[0].points >= pair[1].points ? pair[0] : pair[1]);
    const loser = pair[0] === winner ? pair[1] : pair[0];
    results.push({
      matchupId,
      winner,
      loser,
      margin: Math.round(Math.abs(winner.points - loser.points) * 10) / 10,
    });
  }
  results.sort((a, b) => b.margin - a.margin);

  const crestByFranchise = new Map(
    rows.map((r) => [
      r.franchiseId,
      { abbreviation: r.abbreviation, brandingColor: r.brandingColor, avatarUrl: r.avatarUrl ?? null },
    ])
  );

  const [rosterPositions, playerRows] = await Promise.all([
    loadSeasonRosterPositions(seasonId),
    db
      .select({
        playerId: playerWeekPoints.playerId,
        points: playerWeekPoints.points,
        projectedPoints: playerWeekPoints.projectedPoints,
        started: playerWeekPoints.started,
        name: players.fullName,
        position: players.position,
        nflTeam: players.nflTeam,
        franchiseId: franchises.id,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
      })
      .from(playerWeekPoints)
      .leftJoin(players, eq(playerWeekPoints.playerId, players.id))
      .innerJoin(franchises, eq(playerWeekPoints.franchiseId, franchises.id))
      .where(
        and(
          eq(playerWeekPoints.seasonId, seasonId),
          eq(playerWeekPoints.week, week)
        )
      ),
  ]);

  const pool: RecapPlayer[] = playerRows.map((r) => {
    const crest = crestByFranchise.get(r.franchiseId);
    return {
      playerId: r.playerId,
      name: r.name ?? "Unknown",
      position: r.position,
      nflTeam: r.nflTeam,
      points: r.points,
      projectedPoints: r.projectedPoints,
      started: r.started,
      franchiseId: r.franchiseId,
      franchiseName: r.franchiseName,
      franchiseSlug: r.franchiseSlug,
      franchiseAbbreviation: crest?.abbreviation ?? null,
      franchiseBrandingColor: crest?.brandingColor ?? null,
      franchiseAvatarUrl: crest?.avatarUrl ?? null,
    };
  });

  return {
    week,
    results,
    topPerformers: pickTopPerformers(pool, 6),
    dud: pickDud(pool),
    teamOfWeek: assembleTeamOfWeek(rosterPositions, pool),
  };
}
