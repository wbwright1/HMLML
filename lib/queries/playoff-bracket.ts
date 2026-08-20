// Reads persisted playoff bracket rows and joins them to matchup scores and
// franchise identity, producing render-ready rounds for the bracket page.
//
// THE INVERSION: in the losers bracket the team stored in advancing_roster_id
// is the team that LOST the game. Nothing in this module compares points to
// decide who moved on; advancement always comes from the stored column.

import { cache } from "react";
import { db } from "@/lib/db";
import {
  franchiseSeasons,
  franchises,
  matchups,
  playoffBracketMatches,
  seasons,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import {
  getMatchPlacementLabel,
  getRoundLabel,
  roundToWeek,
  type BracketType,
} from "@/lib/playoff-bracket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BracketTeam {
  rosterId: number;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  avatarUrl: string | null;
  points: number | null;
  /** True when this team moved on. In the Toilet Bowl that means it lost. */
  advanced: boolean;
}

export interface BracketMatchView {
  matchNumber: number;
  bracketType: BracketType;
  round: number;
  /** Null when the season has no playoff_week_start to anchor rounds to. */
  week: number | null;
  placement: number | null;
  /** "Championship" / "3rd Place Game" / "Toilet Bowl Final", or null. */
  placementLabel: string | null;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  /** Where an unfilled slot's occupant comes from, e.g. "Winner of match 3". */
  team1FromMatch: number | null;
  team2FromMatch: number | null;
  /** False while the match has no recorded result. */
  decided: boolean;
}

export interface BracketRound {
  round: number;
  week: number | null;
  label: string;
  matches: BracketMatchView[];
}

export interface SeasonBracket {
  winners: BracketRound[];
  losers: BracketRound[];
  /**
   * True when the bracket could not be read at all (DB unreachable / query
   * threw). Distinct from a season that genuinely has no bracket rows: callers
   * must show a calm "last available data" notice rather than claiming the
   * playoffs never happened.
   */
  unavailable: boolean;
}

/** A franchise identity attributed to one specific season. */
export interface SeasonFranchiseEntry {
  seasonYear: number;
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  avatarUrl: string | null;
}

export type ToiletBowlChampion = SeasonFranchiseEntry;

const EMPTY_BRACKET: SeasonBracket = {
  winners: [],
  losers: [],
  unavailable: false,
};
const UNAVAILABLE_BRACKET: SeasonBracket = {
  winners: [],
  losers: [],
  unavailable: true,
};

// ---------------------------------------------------------------------------
// Season bracket
// ---------------------------------------------------------------------------

/**
 * Both brackets for a season, round by round, oldest round first. Returns
 * empty rounds when the season has no stored bracket (pre-Sleeper legacy
 * seasons) or when the DB is unreachable.
 */
export const getSeasonBracket = cache(async function getSeasonBracket(
  seasonId: number,
  playoffWeekStart: number | null,
  totalRosters: number | null,
): Promise<SeasonBracket> {
  // A null playoffWeekStart is NOT a reason to hide the bracket. It only means
  // rounds cannot be anchored to weeks, so weeks and score joins are skipped
  // and the matches render without their deep links.
  try {
    const bracketRows = await db
      .select()
      .from(playoffBracketMatches)
      .where(eq(playoffBracketMatches.seasonId, seasonId));

    if (bracketRows.length === 0) return EMPTY_BRACKET;

    // Scores and identity in one pass over the season's playoff weeks;
    // matchups stays the single source of truth for points.
    const scoreRows = await db
      .select({
        week: matchups.week,
        rosterId: matchups.rosterId,
        points: matchups.points,
        franchiseId: franchises.id,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(matchups)
      .innerJoin(franchises, eq(matchups.franchiseId, franchises.id))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, matchups.franchiseId),
          eq(franchiseSeasons.seasonId, matchups.seasonId),
        ),
      )
      .where(eq(matchups.seasonId, seasonId));

    // roster_id -> identity (stable across weeks) and (week, roster) -> points.
    const identityByRoster = new Map<string, Omit<BracketTeam, "rosterId" | "points" | "advanced">>();
    const pointsByWeekRoster = new Map<string, number | null>();
    for (const row of scoreRows) {
      if (!identityByRoster.has(row.rosterId)) {
        identityByRoster.set(row.rosterId, {
          franchiseId: row.franchiseId,
          franchiseName: row.franchiseName,
          franchiseSlug: row.franchiseSlug,
          franchiseAbbreviation: row.franchiseAbbreviation,
          franchiseBrandingColor: row.franchiseBrandingColor,
          avatarUrl: row.avatarUrl,
        });
      }
      pointsByWeekRoster.set(`${row.week}:${row.rosterId}`, row.points);
    }

    // Crest fallback: a season with no franchise_seasons.avatar_url of its own
    // falls back to the franchise's most recent crest, matching every peer
    // surface (getTrophyCase, the matchup queries, the awards honor roll).
    const missingAvatarIds = [...identityByRoster.values()]
      .filter((identity) => identity.avatarUrl == null)
      .map((identity) => identity.franchiseId);
    if (missingAvatarIds.length > 0) {
      const fallbacks = await getLatestAvatarUrls(missingAvatarIds);
      for (const identity of identityByRoster.values()) {
        if (identity.avatarUrl == null) {
          identity.avatarUrl = fallbacks.get(identity.franchiseId) ?? null;
        }
      }
    }

    function buildTeam(
      rosterId: number | null,
      week: number | null,
      advancingRosterId: number | null,
    ): BracketTeam | null {
      if (rosterId == null) return null;
      const identity = identityByRoster.get(String(rosterId));
      if (!identity) return null;
      return {
        rosterId,
        ...identity,
        points: week == null ? null : pointsByWeekRoster.get(`${week}:${rosterId}`) ?? null,
        advanced: advancingRosterId != null && advancingRosterId === rosterId,
      };
    }

    function buildSide(type: BracketType): BracketRound[] {
      const sideRows = bracketRows.filter((r) => r.bracketType === type);
      if (sideRows.length === 0) return [];

      const totalRounds = Math.max(...sideRows.map((r) => r.round));
      const byRound = new Map<number, BracketMatchView[]>();

      for (const row of sideRows) {
        const week =
          playoffWeekStart == null
            ? null
            : roundToWeek(row.round, playoffWeekStart);
        const view: BracketMatchView = {
          matchNumber: row.matchNumber,
          bracketType: type,
          round: row.round,
          week,
          placement: row.placement,
          placementLabel: getMatchPlacementLabel(type, row.placement, totalRosters),
          team1: buildTeam(row.team1RosterId, week, row.advancingRosterId),
          team2: buildTeam(row.team2RosterId, week, row.advancingRosterId),
          team1FromMatch: row.team1FromMatch,
          team2FromMatch: row.team2FromMatch,
          decided: row.advancingRosterId != null,
        };
        const list = byRound.get(row.round);
        if (list) list.push(view);
        else byRound.set(row.round, [view]);
      }

      return [...byRound.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, matches]) => ({
          round,
          week:
            playoffWeekStart == null
              ? null
              : roundToWeek(round, playoffWeekStart),
          label: getRoundLabel(type, round, totalRounds),
          matches: matches.sort((a, b) => a.matchNumber - b.matchNumber),
        }));
    }

    return {
      winners: buildSide("winners"),
      losers: buildSide("losers"),
      unavailable: false,
    };
  } catch (e) {
    // Surfaced as "we're showing the last available data", never as "this
    // season had no playoffs".
    console.error("[playoff-bracket] getSeasonBracket error:", e);
    return UNAVAILABLE_BRACKET;
  }
});

// ---------------------------------------------------------------------------
// Season-scoped champions (both ends of the season)
// ---------------------------------------------------------------------------

const CHAMPION_FIELDS = {
  seasonYear: seasons.seasonYear,
  franchiseId: franchises.id,
  franchiseName: franchises.name,
  franchiseSlug: franchises.slug,
  franchiseAbbreviation: franchises.abbreviation,
  franchiseBrandingColor: franchises.brandingColor,
  avatarUrl: franchiseSeasons.avatarUrl,
};

/**
 * Fills in a most-recent crest for any row whose own season had no avatar,
 * matching every peer surface. The season's own crest always wins, so the
 * identity stays season-attributed rather than "whatever they look like now".
 */
async function withAvatarFallback<T extends SeasonFranchiseEntry>(
  rows: T[],
): Promise<T[]> {
  const missing = rows.filter((r) => r.avatarUrl == null).map((r) => r.franchiseId);
  if (missing.length === 0) return rows;
  const fallbacks = await getLatestAvatarUrls(missing);
  return rows.map((row) =>
    row.avatarUrl == null
      ? { ...row, avatarUrl: fallbacks.get(row.franchiseId) ?? null }
      : row,
  );
}

/**
 * The season's league champion, with that season's own crest. Deliberately not
 * sourced from the league-wide getTrophyCase(), whose crest is "the franchise's
 * latest avatar" rather than the one it wore that year.
 */
export const getSeasonChampion = cache(async function getSeasonChampion(
  seasonId: number,
): Promise<SeasonFranchiseEntry | null> {
  try {
    const rows = await db
      .select(CHAMPION_FIELDS)
      .from(seasons)
      .innerJoin(franchises, eq(franchises.id, seasons.championFranchiseId))
      .leftJoin(
        franchiseSeasons,
        and(
          eq(franchiseSeasons.franchiseId, seasons.championFranchiseId),
          eq(franchiseSeasons.seasonId, seasons.id),
        ),
      )
      .where(eq(seasons.id, seasonId));
    const [row] = await withAvatarFallback(rows);
    return row ?? null;
  } catch (e) {
    console.error("[playoff-bracket] getSeasonChampion error:", e);
    return null;
  }
});

const toiletBowlAvatarJoin = and(
  eq(franchiseSeasons.franchiseId, seasons.toiletBowlFranchiseId),
  eq(franchiseSeasons.seasonId, seasons.id),
);

/** The season's Toilet Bowl champion, or null if the final is unplayed. */
export const getToiletBowlChampion = cache(async function getToiletBowlChampion(
  seasonId: number,
): Promise<ToiletBowlChampion | null> {
  try {
    const rows = await db
      .select(CHAMPION_FIELDS)
      .from(seasons)
      .innerJoin(franchises, eq(franchises.id, seasons.toiletBowlFranchiseId))
      .leftJoin(franchiseSeasons, toiletBowlAvatarJoin)
      .where(eq(seasons.id, seasonId));
    const [row] = await withAvatarFallback(rows);
    return row ?? null;
  } catch (e) {
    console.error("[playoff-bracket] getToiletBowlChampion error:", e);
    return null;
  }
});

/** Every crowned Toilet Bowl champion, newest season first. */
export const getAllToiletBowlChampions = cache(
  async function getAllToiletBowlChampions(): Promise<ToiletBowlChampion[]> {
    try {
      const rows = await db
        .select(CHAMPION_FIELDS)
        .from(seasons)
        .innerJoin(franchises, eq(franchises.id, seasons.toiletBowlFranchiseId))
        .leftJoin(franchiseSeasons, toiletBowlAvatarJoin);
      const withAvatars = await withAvatarFallback(rows);
      return withAvatars.sort((a, b) => b.seasonYear - a.seasonYear);
    } catch (e) {
      console.error("[playoff-bracket] getAllToiletBowlChampions error:", e);
      return [];
    }
  },
);

/**
 * Toilet Bowl "wins" per franchise, newest first, for the per-franchise trophy
 * case. Keyed by franchise id.
 */
export const getToiletBowlChampionsByFranchise = cache(
  async function getToiletBowlChampionsByFranchise(
    franchiseId: string,
  ): Promise<number[]> {
    try {
      const rows = await db
        .select({ seasonYear: seasons.seasonYear })
        .from(seasons)
        .where(eq(seasons.toiletBowlFranchiseId, franchiseId));
      return rows.map((r) => r.seasonYear).sort((a, b) => b - a);
    } catch (e) {
      console.error(
        "[playoff-bracket] getToiletBowlChampionsByFranchise error:",
        e,
      );
      return [];
    }
  },
);
