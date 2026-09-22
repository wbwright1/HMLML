// The ONE place a Game of the Week is chosen and described.
//
// Both consumers call resolveGameOfTheWeek: the between-weeks hub RSC
// (components/hub/between-weeks-hub.tsx) and the content generator
// (lib/content-gen/stats-context.ts). They used to each build their own
// candidates, with different inputs (the generator had no projections), so
// the blurb could be written about one game while the hub featured another.
// Now there is one enrichment builder (buildGotwCandidates, pure), one
// selection (selectGameOfTheWeek in lib/hub/between-weeks.ts, pure) and one
// copy pass (stakes + blurb from the pick's reasons, pure). The async loader
// only gathers inputs; callers that already fetched a piece hand it in via
// `prefetched` so nothing is queried twice.

import {
  canFlipDivisionLead,
  gameOfWeekBlurb,
  gotwKickerLead,
  isRecentRematch,
  markTitleRematch,
  selectGameOfTheWeek,
  stakesFromReasons,
  type DivisionRaceTeam,
  type GotwCandidate,
  type GotwH2H,
  type GotwLastMeeting,
  type GotwNamedRivalry,
  type GotwPick,
  type GotwReason,
} from "@/lib/hub/between-weeks";
import {
  buildSeasonLookups,
  seedTeams,
  type DivisionRecord,
  type H2HRecord,
  type SeededTeam,
} from "@/lib/queries/divisions";
import { computeStandingsRaceTags, type PlayoffRaceTag } from "@/lib/queries/playoff-race";
import { getAllSeasons, getTitleGamePair } from "@/lib/queries/seasons";
import { getHeadToHead, getHeadToHeadHistory } from "@/lib/queries/records";
import { getRivalryWeek, rivalryPairKey } from "@/lib/queries/rivalry-week";
import { getPublishedHubContent } from "@/lib/queries/hub-content";
import {
  getWeekStarterPool,
  sumProjectedByFranchise,
  type PoolRow,
} from "@/lib/queries/players-to-watch";
import { getBookBoard, resolveBookWeek, type BookGame } from "@/lib/queries/book";
import { summarizeMeetingHistory, type MeetingHistorySummary } from "@/lib/hub/slate-angle";
import { matchupPairKey } from "@/lib/content";
import { getBowlName } from "@/lib/bowl-names";
import { formatRecord } from "@/lib/format-record";
import type { PairedMatchup } from "@/lib/queries/matchups";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The standings fields the builder reads (getSeasonStandings rows satisfy it). */
export interface GotwStandingRow {
  franchiseId: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  pointsScored: number | string | null;
  division: number | null;
  divisionName: string | null;
}

/** The matchup fields the builder reads (PairedMatchup satisfies it). */
export interface GotwMatchupRef {
  matchupId: number;
  homeTeam: { franchiseId: string; franchiseSlug: string; franchiseName: string };
  awayTeam: { franchiseId: string; franchiseSlug: string; franchiseName: string };
}

export type NamedRivalryLookup = (idA: string, idB: string) => GotwNamedRivalry | null;

/** Everything the pure builder needs, already fetched. */
export interface GotwSource {
  seasonYear: number;
  week: number;
  matchups: GotwMatchupRef[];
  standings: GotwStandingRow[];
  /** Season head-to-head + division records, for the seedTeams tiebreak chain. */
  seasonLookups: {
    h2hLookup: Map<string, H2HRecord>;
    divisionRecord: Map<string, DivisionRecord>;
  };
  /** All-time series per matchupId, from the HOME team's perspective. */
  h2hByMatchup: Map<number, GotwH2H | null>;
  /** Completed-meeting summary per matchupId, HOME team as side A. */
  historyByMatchup: Map<number, MeetingHistorySummary>;
  projectedByFranchise: Map<string, number>;
  titlePair: { seasonYear: number; championFranchiseId: string; runnerUpFranchiseId: string } | null;
  /** rivalryPairKey()s of this week's mutual top rivals. */
  mutualRivalKeys: Set<string>;
  /** Named-rivalry lookup (Stream D wires getNamedRivalries); null = none. */
  namedRivalryOf: NamedRivalryLookup | null;
  /** The Book's home-perspective spread per matchupId, when it trades this week. */
  bookSpreadByMatchup: Map<number, number>;
  /** Franchise slugs of last week's featured game (from its stored ref_key). */
  priorFeaturedSlugs: Set<string>;
  raceTags: Map<string, PlayoffRaceTag>;
}

export interface GotwResolution {
  /** Null only for an empty slate. */
  pick: GotwPick | null;
  /** The picked candidate, fully enriched. */
  candidate: GotwCandidate | null;
  /** matchupPairKey (sorted slugs) of the pick: the stored blurb's ref_key. */
  pairKey: string | null;
  reasons: GotwReason[];
  /** "{lead} · {stakes}" in title case; the card uppercases it. */
  kicker: string | null;
  stakes: string | null;
  /** The reason-derived blurb (template fallback + render-time fallback). */
  blurb: string | null;
  isTitleRematch: boolean;
  bowlName: string | null;
  anyGamesPlayed: boolean;
  /**
   * "1st in {Division}" per franchise that leads its division by the seedTeams
   * tiebreak chain. Empty before any game is played (a 0-0 lead is not one).
   */
  divisionLeaderStatus: Map<string, string>;
  candidates: GotwCandidate[];
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

function toSeeded(s: GotwStandingRow): SeededTeam {
  return {
    franchiseId: s.franchiseId,
    slug: "",
    name: "",
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    ties: s.ties ?? 0,
    pointsScored: Number(s.pointsScored ?? 0),
    division: s.division ?? null,
    divisionName: s.divisionName ?? null,
  };
}

/** 1-based ranks by the seedTeams chain: overall and within each division. */
export function rankStandings(
  standings: GotwStandingRow[],
  lookups: GotwSource["seasonLookups"]
): { overall: Map<string, number>; division: Map<string, number> } {
  const teams = standings.map(toSeeded);
  const overall = new Map<string, number>();
  seedTeams(teams, lookups.h2hLookup, lookups.divisionRecord).forEach((t, i) =>
    overall.set(t.franchiseId, i + 1)
  );

  const division = new Map<string, number>();
  const byDivision = new Map<number, SeededTeam[]>();
  for (const t of teams) {
    if (t.division == null) continue;
    const list = byDivision.get(t.division) ?? [];
    list.push(t);
    byDivision.set(t.division, list);
  }
  for (const list of byDivision.values()) {
    seedTeams(list, lookups.h2hLookup, lookups.divisionRecord).forEach((t, i) =>
      division.set(t.franchiseId, i + 1)
    );
  }
  return { overall, division };
}

/** Enriched candidates for every matchup on the slate. Pure. */
export function buildGotwCandidates(source: GotwSource): GotwCandidate[] {
  const standingBy = new Map(source.standings.map((s) => [s.franchiseId, s]));
  const ranks = rankStandings(source.standings, source.seasonLookups);

  const opponentOf = new Map<string, string>();
  for (const m of source.matchups) {
    opponentOf.set(m.homeTeam.franchiseId, m.awayTeam.franchiseId);
    opponentOf.set(m.awayTeam.franchiseId, m.homeTeam.franchiseId);
  }
  const raceTeams: DivisionRaceTeam[] = source.standings.map((s) => ({
    franchiseId: s.franchiseId,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    ties: s.ties ?? 0,
    division: s.division ?? null,
    opponentId: opponentOf.get(s.franchiseId) ?? null,
  }));

  const team = (id: string) => {
    const s = standingBy.get(id);
    return {
      franchiseId: id,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      ties: s?.ties ?? 0,
      pointsFor: Number(s?.pointsScored ?? 0),
      division: s?.division ?? null,
      divisionRank: ranks.division.get(id) ?? null,
      overallRank: ranks.overall.get(id) ?? null,
      raceTag: source.raceTags.get(id) ?? null,
      projected: source.projectedByFranchise.get(id) ?? 0,
    };
  };

  const candidates: GotwCandidate[] = source.matchups.map((m) => {
    const homeId = m.homeTeam.franchiseId;
    const awayId = m.awayTeam.franchiseId;
    const history = source.historyByMatchup.get(m.matchupId);
    const featured = [m.homeTeam.franchiseSlug, m.awayTeam.franchiseSlug].filter((slug) =>
      source.priorFeaturedSlugs.has(slug)
    ).length;
    return {
      matchupId: m.matchupId,
      teamA: team(homeId),
      teamB: team(awayId),
      canFlipDivisionLead: canFlipDivisionLead(homeId, awayId, raceTeams),
      h2h: source.h2hByMatchup.get(m.matchupId) ?? null,
      lastMeeting: (history?.lastMeeting as GotwLastMeeting | null | undefined) ?? null,
      playoffMeetingYears: history?.playoffMeetingYears ?? [],
      isMutualRival: source.mutualRivalKeys.has(rivalryPairKey(homeId, awayId)),
      namedRivalry: source.namedRivalryOf ? source.namedRivalryOf(homeId, awayId) : null,
      bookSpread: source.bookSpreadByMatchup.get(m.matchupId) ?? null,
      featuredLastWeek: featured,
    };
  });

  return source.week === 1 ? markTitleRematch(candidates, source.titlePair) : candidates;
}

function recordOf(s: GotwStandingRow | undefined): string {
  return formatRecord(s?.wins ?? 0, s?.losses ?? 0, s?.ties ?? 0);
}

/** Picks and describes the Game of the Week from fetched inputs. Pure. */
export function resolveFromSource(source: GotwSource): GotwResolution {
  const anyGamesPlayed = source.standings.some(
    (s) => (s.wins ?? 0) + (s.losses ?? 0) + (s.ties ?? 0) > 0
  );
  const standingBy = new Map(source.standings.map((s) => [s.franchiseId, s]));
  const candidates = buildGotwCandidates(source);

  // Division leaders by the same tiebreak chain the playoff seeding uses, so
  // the "1st in Division N" chip can never disagree with the standings page.
  const divisionLeaderStatus = new Map<string, string>();
  if (anyGamesPlayed) {
    const ranks = rankStandings(source.standings, source.seasonLookups);
    for (const s of source.standings) {
      if (s.division != null && s.divisionName && ranks.division.get(s.franchiseId) === 1) {
        divisionLeaderStatus.set(s.franchiseId, `1st in ${s.divisionName}`);
      }
    }
  }

  const pick = selectGameOfTheWeek(candidates, { week: source.week, anyGamesPlayed });
  const empty: GotwResolution = {
    pick: null,
    candidate: null,
    pairKey: null,
    reasons: [],
    kicker: null,
    stakes: null,
    blurb: null,
    isTitleRematch: false,
    bowlName: null,
    anyGamesPlayed,
    divisionLeaderStatus,
    candidates,
  };
  if (!pick) return empty;

  const candidate = candidates.find((c) => c.matchupId === pick.matchupId)!;
  const matchup = source.matchups.find((m) => m.matchupId === pick.matchupId)!;
  const home = standingBy.get(matchup.homeTeam.franchiseId);
  const away = standingBy.get(matchup.awayTeam.franchiseId);
  const isTitleRematch = pick.reasons.includes("title-rematch");
  const bowlName =
    isTitleRematch && source.titlePair ? getBowlName(source.titlePair.seasonYear) : null;
  const divisionName =
    candidate.teamA.division != null && candidate.teamA.division === candidate.teamB.division
      ? home?.divisionName ?? null
      : null;

  const lead = gotwKickerLead({
    isTitleRematch,
    bowlName,
    divisionName,
    isRecentRematch: isRecentRematch(candidate.lastMeeting, source.seasonYear),
  });
  const stakes = stakesFromReasons(pick.reasons, {
    namedRivalry: candidate.namedRivalry,
    h2h: candidate.h2h,
    playoffMeetingYears: candidate.playoffMeetingYears,
  });
  const blurb = gameOfWeekBlurb({
    reasons: pick.reasons,
    teamA: {
      name: matchup.homeTeam.franchiseName,
      record: recordOf(home),
      raceTag: candidate.teamA.raceTag,
    },
    teamB: {
      name: matchup.awayTeam.franchiseName,
      record: recordOf(away),
      raceTag: candidate.teamB.raceTag,
    },
    divisionName,
    h2h: candidate.h2h ?? null,
    lastMeeting: candidate.lastMeeting ?? null,
    playoffMeetingYears: candidate.playoffMeetingYears ?? [],
    namedRivalry: candidate.namedRivalry ?? null,
    bowlName,
  });

  return {
    ...empty,
    pick,
    candidate,
    pairKey: matchupPairKey(matchup.homeTeam.franchiseSlug, matchup.awayTeam.franchiseSlug),
    reasons: pick.reasons,
    kicker: `${lead} · ${stakes}`,
    stakes,
    blurb,
    isTitleRematch,
    bowlName,
  };
}

// ---------------------------------------------------------------------------
// Async loader
// ---------------------------------------------------------------------------

export interface GotwLoadInput {
  seasonId: number;
  seasonYear: number;
  week: number;
  matchups: PairedMatchup[];
  standings: GotwStandingRow[];
  /** Named-rivalry lookup; omitted until Stream D wires getNamedRivalries. */
  namedRivalryOf?: NamedRivalryLookup | null;
  /** Pieces the caller already fetched, so nothing is queried twice. */
  prefetched?: {
    h2hByMatchup?: Map<number, GotwH2H | null>;
    historyByMatchup?: Map<number, MeetingHistorySummary>;
    pool?: PoolRow[];
    /** The Book board for THIS week, or [] when The Book trades another week. */
    bookGames?: BookGame[];
  };
}

/**
 * Last week's featured pair, from the stored game_of_week_blurb's ref_key
 * (matchupPairKey: sorted slugs joined "__"). Rows written before ref_key was
 * populated carry null, and then there is simply no repeat penalty: guessing
 * by recomputing last week's pick would score it on this week's records.
 */
export function priorFeaturedSlugsFromRefKey(refKey: string | null | undefined): Set<string> {
  if (!refKey) return new Set();
  return new Set(refKey.split("__").filter(Boolean));
}

async function orEmpty<T>(p: Promise<T>, fallback: T): Promise<T> {
  // Genuinely optional enrichment (mutual rivals, race tags, last week's
  // pick, Book lines): absence drops a reason, it never fabricates one, so an
  // empty fallback is a real non-error outcome, not a swallowed failure.
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/**
 * Gathers every input and resolves the Game of the Week. Throws only where its
 * required inputs throw (the caller's standings/matchups are passed in); every
 * enrichment degrades to "no reason" rather than failing the render.
 */
export async function resolveGameOfTheWeek(input: GotwLoadInput): Promise<GotwResolution> {
  const { seasonId, seasonYear, week, matchups, standings } = input;
  const pre = input.prefetched ?? {};
  const divisionOf = new Map(standings.map((s) => [s.franchiseId, s.division ?? null]));

  const [seasonLookups, h2hList, historyList, pool, bookGames, titlePair, mutual, prior, seasons] =
    await Promise.all([
      buildSeasonLookups(seasonId, divisionOf),
      pre.h2hByMatchup
        ? Promise.resolve(null)
        : Promise.all(
            matchups.map((m) =>
              orEmpty(getHeadToHead(m.homeTeam.franchiseId, m.awayTeam.franchiseId), null)
            )
          ),
      pre.historyByMatchup
        ? Promise.resolve(null)
        : Promise.all(
            matchups.map((m) =>
              orEmpty(
                getHeadToHeadHistory(m.homeTeam.franchiseId, m.awayTeam.franchiseId),
                []
              )
            )
          ),
      pre.pool ? Promise.resolve(pre.pool) : orEmpty(getWeekStarterPool(seasonId, week), []),
      pre.bookGames
        ? Promise.resolve(pre.bookGames)
        : orEmpty(
            (async () => {
              const bw = await resolveBookWeek();
              if (!bw || bw.week !== week || bw.seasonYear !== seasonYear) return [];
              return getBookBoard(bw.seasonId, bw.seasonYear, bw.week);
            })(),
            [] as BookGame[]
          ),
      week === 1 ? getTitleGamePair() : Promise.resolve(null),
      getRivalryWeek(matchups),
      week > 1
        ? orEmpty(getPublishedHubContent(seasonId, week - 1), {})
        : Promise.resolve({}),
      orEmpty(getAllSeasons(), []),
    ]);

  const h2hByMatchup =
    pre.h2hByMatchup ??
    new Map(matchups.map((m, i) => [m.matchupId, h2hList?.[i] ?? null]));
  const historyByMatchup =
    pre.historyByMatchup ??
    new Map(
      matchups.map((m, i) => [
        m.matchupId,
        summarizeMeetingHistory(historyList?.[i] ?? [], m.homeTeam.franchiseId),
      ])
    );

  const playoffWeekStart = seasons.find((s) => s.id === seasonId)?.playoffWeekStart ?? null;
  const raceTags = computeStandingsRaceTags(
    standings as Parameters<typeof computeStandingsRaceTags>[0],
    { week, playoffWeekStart }
  );

  const priorRow = (prior as Record<string, { refKey: string | null }[]>).game_of_week_blurb?.[0];

  return resolveFromSource({
    seasonYear,
    week,
    matchups,
    standings,
    seasonLookups,
    h2hByMatchup,
    historyByMatchup,
    projectedByFranchise: sumProjectedByFranchise(pool),
    titlePair,
    mutualRivalKeys: mutual,
    namedRivalryOf: input.namedRivalryOf ?? null,
    bookSpreadByMatchup: new Map(bookGames.map((g) => [g.matchupId, g.spread])),
    priorFeaturedSlugs: priorFeaturedSlugsFromRefKey(priorRow?.refKey),
    raceTags,
  });
}
