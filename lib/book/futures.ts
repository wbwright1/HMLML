// The Book: the futures engine.
//
// Pure math, no I/O, no database, no Sleeper. Everything the four season-long
// markets show (League Champion, Toilet Bowl, League MVP, Rookie of the Year)
// comes from here, so the daily repricing job, the futures board and the
// grading pass all agree.
//
// House conventions, decided once and documented here:
//
//  - Team markets are priced by SIMULATION, not by a closed-form guess. The
//    rest of the season is played out thousands of times from the real
//    remaining schedule; a franchise's championship probability is simply the
//    share of those seasons it wins. That is the only way to price "wins the
//    whole thing" honestly, because making the playoffs and winning the bracket
//    are not independent: the same projection that gets you in is the one that
//    carries you through it.
//  - The simulation is SEEDED. Same inputs, same odds, every run. An
//    unseeded Monte Carlo would jitter every posted number a few points each
//    day for no reason, which reads as the line moving when nothing moved.
//  - The Toilet Bowl is the mirror market, and it is mirrored properly: in this
//    league's consolation bracket you advance by LOSING, so its rounds resolve
//    on the probability of being the LOWER scorer. See simulateBracketWinner's
//    `invert`.
//  - Player markets post a listed top N plus one "The Field" row that carries
//    the entire unlisted remainder. The Field wins when the award goes to
//    anybody not on the board at lock time.
//  - The overround is heavy (see FUTURES_OVERROUND) because a futures book that
//    prices tight is a book that pays out on twelve simultaneous longshots.
//
// Nothing here is denominated in real money. The league bets friendly dollars.

import { computeWinProbability } from "@/lib/win-probability";
import { toAmericanOdds } from "@/lib/book/pricing";

// ---------------------------------------------------------------------------
// The four markets
// ---------------------------------------------------------------------------

export type FuturesMarket = "champion" | "toilet_bowl" | "mvp" | "roty";

export const TEAM_MARKETS: FuturesMarket[] = ["champion", "toilet_bowl"];
export const PLAYER_MARKETS: FuturesMarket[] = ["mvp", "roty"];

export type FuturesSubjectType = "franchise" | "player" | "field";

/**
 * The reserved subject id for the aggregate "The Field" row on player markets.
 * Never a real Sleeper player id, which is why a plain string is safe here.
 */
export const FIELD_SUBJECT_ID = "field";

/**
 * Player futures lock at the first kickoff of week 8: roughly the midpoint of a
 * 14-week regular season. Late enough that the race means something, early
 * enough that picking the leader in week 13 is not a market.
 */
export const WEEK_FUTURES_PLAYER_LOCK = 8;

/**
 * The futures overround. Far heavier than the 1.045 a single game carries,
 * because these markets stay open for months and the book is quoting twelve
 * mutually exclusive outcomes at once; the cut is what keeps the whole board
 * from being a positive-expectation menu.
 */
export const FUTURES_OVERROUND = 1.25;

/**
 * No futures favorite posts shorter than this. A simulation can genuinely
 * return 0.9 for a juggernaut in week 13, and -900 on a season-long market is
 * not a price anybody takes; it is a number that makes the board look broken.
 */
export const MIN_FUTURES_FAVORITE_ODDS = -400;

/** How many candidates each player market lists before "The Field". */
export const MVP_CANDIDATE_COUNT = 10;
export const ROTY_CANDIDATE_COUNT = 8;

/**
 * Softmax temperature for player markets, in fantasy points.
 *
 * It answers "how big a season-points gap makes somebody a clear favorite". At
 * 30, a candidate 30 points clear of the next is about 2.7x likelier to take
 * the award, which matches how these races actually finish: a real lead
 * matters, and nobody is ever locked in with weeks to play.
 */
export const PLAYER_SOFTMAX_TEMPERATURE = 30;

/** Seasons simulated per team market. */
export const FUTURES_SIMULATIONS = 4000;

/**
 * The simulation seed. A fixed constant on purpose (see the header): the same
 * standings and schedule must produce the same price every day.
 */
export const FUTURES_SEED = 0x484d4c;

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------

/**
 * A fair probability, as this book posts it.
 *
 * Same conversion, rounding and posted limits as the weekly board
 * (toAmericanOdds), with the futures overround and the extra favorite floor.
 * The dog side is untouched: a genuine 40-to-1 longshot still tops out at the
 * board's +1900 cap, which is the honest way to say "basically nobody".
 */
export function futuresOdds(prob: number): number {
  const odds = toAmericanOdds(prob * FUTURES_OVERROUND);
  return odds < 0 ? Math.max(odds, MIN_FUTURES_FAVORITE_ODDS) : odds;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

/**
 * mulberry32: a small, fast, well-distributed 32-bit PRNG.
 *
 * Chosen over Math.random for one reason: it takes a seed, so the whole futures
 * board is reproducible. Statistical quality beyond "uniform enough to average
 * four thousand coin flips" is not needed here.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Team markets
// ---------------------------------------------------------------------------

export interface FuturesTeam {
  franchiseId: string;
  rosterId: string;
  wins: number;
  losses: number;
  ties: number;
  /** Points scored so far. The league's standing tiebreak. */
  pointsFor: number;
  /** Expected starting-lineup total per remaining week. */
  projectedPerWeek: number;
  /** Division number, or null for a season with no divisions. */
  division: number | null;
}

/**
 * One remaining regular-season game, as a pairing.
 *
 * The schedule is passed as GAMES, not as per-team opponent lists, and that is
 * load bearing: a per-team list visits every game twice, so a simulation built
 * on it would let both sides of the same matchup win and stop being zero-sum.
 */
export interface FuturesGame {
  rosterA: string;
  rosterB: string;
}

export interface TeamMarketOptions {
  /** Playoff berths, and therefore bracket size. */
  playoffSpots: number;
  simulations?: number;
  seed?: number;
}

interface SimStanding {
  rosterId: string;
  wins: number;
  points: number;
}

/**
 * Ranking comparator for simulated final standings: wins, then points scored,
 * then roster id.
 *
 * The roster-id tail is not cosmetic. Without a total order two teams on
 * identical records could sort differently from one simulation to the next
 * depending on array order, which would leak nondeterminism into a run that is
 * otherwise fully seeded.
 */
function byStanding(a: SimStanding, b: SimStanding): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.points !== a.points) return b.points - a.points;
  return Number(a.rosterId) - Number(b.rosterId);
}

/**
 * The playoff field from a simulated final standings table, in seed order.
 *
 * Mirrors the real rule (lib/queries/divisions.ts buildDivisionalField): the
 * winner of each division qualifies regardless of overall record and takes the
 * top seeds, then the best remaining records fill the wildcards. Falls back to
 * straight top-N when the season carries no divisions, which is what the legacy
 * era looks like.
 *
 * Exported for its own unit test: getting this wrong would quietly hand
 * championship equity to whichever team happened to have the best record, which
 * is not how this league qualifies.
 */
export function playoffFieldFrom(
  ranked: SimStanding[],
  divisionOf: Map<string, number | null>,
  playoffSpots: number,
): string[] {
  const hasDivisions = [...divisionOf.values()].some((d) => d != null);
  if (!hasDivisions) {
    return ranked.slice(0, playoffSpots).map((t) => t.rosterId);
  }

  const seenDivision = new Set<number>();
  const winners: SimStanding[] = [];
  const rest: SimStanding[] = [];

  // `ranked` is already sorted, so the first team seen from a division is that
  // division's winner.
  for (const team of ranked) {
    const division = divisionOf.get(team.rosterId) ?? null;
    if (division != null && !seenDivision.has(division)) {
      seenDivision.add(division);
      winners.push(team);
      continue;
    }
    rest.push(team);
  }

  const wildcards = rest.slice(0, Math.max(0, playoffSpots - winners.length));
  return [...winners, ...wildcards].slice(0, playoffSpots).map((t) => t.rosterId);
}

/**
 * Plays one bracket to its end and returns the roster that comes out of it.
 *
 * `field` is in SEED ORDER (best first). Byes are handled the way a real
 * bracket handles them: the round shrinks the field to the largest power of two
 * BELOW its current size, the lowest seeds play for those spots (highest
 * against lowest), and everybody above them sits. Survivors are re-sorted into
 * seed order each round, so a bye earned by seeding keeps paying off.
 *
 * `invert` is the Toilet Bowl. In this league's consolation bracket you advance
 * by LOSING, so with invert set the probability of advancing is the probability
 * of being OUTSCORED. Reusing the winners-bracket helper unmirrored would price
 * the toilet bowl as a second championship and hand the shortest odds to the
 * best team in the league, which is exactly backwards.
 */
export function simulateBracketWinner(
  field: string[],
  projByRoster: Map<string, number>,
  rng: () => number,
  options: { invert?: boolean } = {},
): string | null {
  if (field.length === 0) return null;

  const seedIndex = new Map(field.map((rosterId, i) => [rosterId, i]));
  let remaining = [...field];

  while (remaining.length > 1) {
    const n = remaining.length;
    // Largest power of two STRICTLY below n: the size this round shrinks to.
    // For a power-of-two field that is n/2 (everybody plays); for 6 it is 4
    // (two byes, seeds 3-6 play).
    const target = 2 ** Math.floor(Math.log2(n - 1));
    const numGames = n - target;
    const byes = remaining.slice(0, n - numGames * 2);
    const playing = remaining.slice(n - numGames * 2);

    const survivors: string[] = [];
    for (let i = 0; i < numGames; i++) {
      const high = playing[i];
      const low = playing[playing.length - 1 - i];
      survivors.push(playRound(high, low, projByRoster, rng, options.invert));
    }

    remaining = [...byes, ...survivors].sort(
      (a, b) => (seedIndex.get(a) ?? 0) - (seedIndex.get(b) ?? 0),
    );
  }

  return remaining[0] ?? null;
}

/** One bracket game. Returns the roster that ADVANCES, mirrored when inverted. */
function playRound(
  a: string,
  b: string,
  projByRoster: Map<string, number>,
  rng: () => number,
  invert = false,
): string {
  const outscoresB = computeWinProbability({
    scoreA: 0,
    scoreB: 0,
    projRemainingA: projByRoster.get(a) ?? 0,
    projRemainingB: projByRoster.get(b) ?? 0,
  });
  const advances = invert ? 1 - outscoresB : outscoresB;
  return rng() < advances ? a : b;
}

export interface TeamMarketProbabilities {
  /** rosterId -> probability of winning the title. Sums to 1. */
  champion: Map<string, number>;
  /** rosterId -> probability of "winning" the Toilet Bowl. Sums to 1. */
  toiletBowl: Map<string, number>;
  /** rosterId -> probability of making the playoffs. Attribution for the card. */
  playoffs: Map<string, number>;
}

/**
 * Prices both team markets from one shared simulation.
 *
 * Both markets come out of the SAME simulated seasons rather than two separate
 * runs, because they are the two ends of one distribution: a season that sends
 * a team to the title game is the same season that keeps it out of the toilet
 * bowl, and pricing them independently would let the two boards disagree about
 * who is good.
 *
 * Each simulated season plays every remaining game (won by the side the
 * win-probability model favors, weighted by the model, not by a coin flip),
 * ranks the final standings, seeds the playoff field, and runs both brackets.
 * Points-for is carried forward deterministically as the standings tiebreak:
 * the sim decides who WINS games, and expected points is the honest estimate of
 * the tiebreak, so randomizing it would add noise without adding information.
 */
export function simulateTeamMarkets(
  teams: FuturesTeam[],
  remainingGames: FuturesGame[],
  options: TeamMarketOptions,
): TeamMarketProbabilities {
  const champion = new Map<string, number>();
  const toiletBowl = new Map<string, number>();
  const playoffs = new Map<string, number>();

  if (teams.length === 0) return { champion, toiletBowl, playoffs };

  const simulations = options.simulations ?? FUTURES_SIMULATIONS;
  const rng = mulberry32(options.seed ?? FUTURES_SEED);

  const projByRoster = new Map(teams.map((t) => [t.rosterId, t.projectedPerWeek]));
  const divisionOf = new Map(teams.map((t) => [t.rosterId, t.division]));

  // Games each team has left, so the points projection lands on the right teams
  // even when the remaining schedule is uneven (a bye week, a partial sync).
  const gamesLeft = new Map<string, number>(teams.map((t) => [t.rosterId, 0]));
  for (const game of remainingGames) {
    gamesLeft.set(game.rosterA, (gamesLeft.get(game.rosterA) ?? 0) + 1);
    gamesLeft.set(game.rosterB, (gamesLeft.get(game.rosterB) ?? 0) + 1);
  }

  for (const team of teams) {
    champion.set(team.rosterId, 0);
    toiletBowl.set(team.rosterId, 0);
    playoffs.set(team.rosterId, 0);
  }

  // Win probabilities are fixed across the season (projections are a per-week
  // expectation), so they are computed once instead of 4000 times per game.
  const gameOdds = remainingGames.map((game) => ({
    ...game,
    probA: computeWinProbability({
      scoreA: 0,
      scoreB: 0,
      projRemainingA: projByRoster.get(game.rosterA) ?? 0,
      projRemainingB: projByRoster.get(game.rosterB) ?? 0,
    }),
  }));

  for (let sim = 0; sim < simulations; sim++) {
    const wins = new Map<string, number>();
    for (const team of teams) wins.set(team.rosterId, team.wins);

    for (const game of gameOdds) {
      const winner = rng() < game.probA ? game.rosterA : game.rosterB;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }

    const standings: SimStanding[] = teams.map((team) => ({
      rosterId: team.rosterId,
      wins: wins.get(team.rosterId) ?? team.wins,
      points:
        team.pointsFor +
        team.projectedPerWeek * (gamesLeft.get(team.rosterId) ?? 0),
    }));
    standings.sort(byStanding);

    const field = playoffFieldFrom(standings, divisionOf, options.playoffSpots);
    const fieldSet = new Set(field);
    for (const rosterId of field) {
      playoffs.set(rosterId, (playoffs.get(rosterId) ?? 0) + 1);
    }

    const champ = simulateBracketWinner(field, projByRoster, rng);
    if (champ) champion.set(champ, (champion.get(champ) ?? 0) + 1);

    // The consolation bracket, over everyone who missed, seeded WORST FIRST:
    // the league's worst team gets the bye it has thoroughly earned.
    const losersField = standings
      .filter((t) => !fieldSet.has(t.rosterId))
      .map((t) => t.rosterId)
      .reverse();
    const toilet = simulateBracketWinner(losersField, projByRoster, rng, {
      invert: true,
    });
    if (toilet) toiletBowl.set(toilet, (toiletBowl.get(toilet) ?? 0) + 1);
  }

  for (const map of [champion, toiletBowl, playoffs]) {
    for (const [rosterId, count] of map) {
      map.set(rosterId, count / simulations);
    }
  }

  return { champion, toiletBowl, playoffs };
}

// ---------------------------------------------------------------------------
// Player markets
// ---------------------------------------------------------------------------

export interface FuturesCandidate {
  playerId: string;
  /** Banked started points plus projected rest-of-season pace. */
  score: number;
}

/**
 * Softmax over a candidate pool, in points.
 *
 * Shifted by the maximum before exponentiating, which is the standard guard
 * against overflowing on a large score; the result is identical and the
 * intermediate values stay small.
 */
export function softmaxProbabilities(
  scores: number[],
  temperature: number,
): number[] {
  if (scores.length === 0) return [];
  const t = temperature > 0 ? temperature : 1;
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) / t));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return scores.map(() => 1 / scores.length);
  return weights.map((w) => w / total);
}

/**
 * A candidate's award score: points already banked in the starting lineup, plus
 * the pace they are on for the rest of the regular season.
 *
 * Rest-of-season is credited ONLY to a player currently in a starting slot. The
 * award is "most points scored while started", so a player riding a bench is
 * not on pace for anything, however good he is.
 */
export function candidateScore(
  bankedPoints: number,
  projectedPerWeek: number,
  weeksRemaining: number,
  isStarter: boolean,
): number {
  const rest = isStarter ? projectedPerWeek * Math.max(0, weeksRemaining) : 0;
  return bankedPoints + rest;
}

export interface FuturesRow {
  subjectType: FuturesSubjectType;
  subjectId: string;
  prob: number;
  odds: number;
}

/**
 * A player market: the listed favorites plus one aggregate "The Field" row.
 *
 * The softmax runs over the WHOLE pool before anything is trimmed, which is the
 * point: The Field's probability is the sum of everybody who did not make the
 * board, and that number only means something if those players were priced.
 * Trimming first and normalizing the survivors would make The Field a made-up
 * remainder rather than a real claim about the rest of the league.
 *
 * A field row is posted only when there is actually somebody unlisted. With a
 * pool no bigger than the board, "the field" is nobody, and a market that pays
 * out on nobody is not a market.
 */
export function buildPlayerMarket(
  candidates: FuturesCandidate[],
  listCount: number,
  temperature = PLAYER_SOFTMAX_TEMPERATURE,
  keepIds: string[] = [],
): FuturesRow[] {
  if (candidates.length === 0) return [];

  const probs = softmaxProbabilities(
    candidates.map((c) => c.score),
    temperature,
  );
  const priced = candidates
    .map((c, i) => ({ playerId: c.playerId, prob: probs[i] }))
    // Ties break on player id so a repriced board never reshuffles for free.
    .sort((a, b) => b.prob - a.prob || a.playerId.localeCompare(b.playerId));

  // A candidate somebody has already bet on stays on the board even after he
  // falls out of the top N. A book does not get to withdraw a market it has
  // taken action on, and the row is also where the pick's grade is written, so
  // dropping it would leave a member holding a ticket nothing ever settles.
  const keep = new Set(keepIds);
  const cut = Math.max(0, listCount);
  const listed = priced.filter((p, i) => i < cut || keep.has(p.playerId));
  const listedIds = new Set(listed.map((p) => p.playerId));

  const rows: FuturesRow[] = listed.map((p) => ({
    subjectType: "player",
    subjectId: p.playerId,
    prob: p.prob,
    odds: futuresOdds(p.prob),
  }));

  const fieldProb = priced
    .filter((p) => !listedIds.has(p.playerId))
    .reduce((sum, p) => sum + p.prob, 0);

  if (fieldProb > 0) {
    rows.push({
      subjectType: "field",
      subjectId: FIELD_SUBJECT_ID,
      prob: fieldProb,
      odds: futuresOdds(fieldProb),
    });
  }

  return rows;
}

/** How many candidates a market lists before The Field. */
export function candidateCountFor(market: FuturesMarket): number {
  return market === "roty" ? ROTY_CANDIDATE_COUNT : MVP_CANDIDATE_COUNT;
}

// ---------------------------------------------------------------------------
// Team market rows
// ---------------------------------------------------------------------------

/**
 * A team market as posted rows, translated from roster ids to franchise ids.
 *
 * The whole league is listed, including a team the simulation never once saw
 * win: the board's dog cap is the honest way to say "this is not happening",
 * and a franchise quietly missing from a market reads as a bug rather than as a
 * price. There is no field row here for the same reason: on a twelve-team
 * market, everybody is already on the board.
 *
 * A roster with no franchise mapping is dropped rather than posted under its
 * numeric id, which would put a nameless row on a public board.
 */
export function buildTeamMarket(
  probByRoster: Map<string, number>,
  franchiseByRoster: Map<string, string>,
): FuturesRow[] {
  const rows: FuturesRow[] = [];
  for (const [rosterId, prob] of probByRoster) {
    const franchiseId = franchiseByRoster.get(rosterId);
    if (!franchiseId) continue;
    rows.push({
      subjectType: "franchise",
      subjectId: franchiseId,
      prob,
      odds: futuresOdds(prob),
    });
  }
  // Ties break on franchise id, so a reprice that moved nothing reorders
  // nothing either.
  return rows.sort((a, b) => b.prob - a.prob || a.subjectId.localeCompare(b.subjectId));
}

// ---------------------------------------------------------------------------
// Locks
// ---------------------------------------------------------------------------

/**
 * The fantasy week a market's picks lock in.
 *
 * Team markets ride until the playoffs actually start: right up to that
 * kickoff, the field is still being decided, so the market is still real.
 * Player markets lock at the documented midpoint instead, because by week 12
 * the scoring leader is mostly just visible.
 *
 * This returns the WEEK. Whether that week has kicked off is a question about
 * real NFL game status (nfl_games), never about the calendar or a clock guess.
 */
export function futuresLockWeek(
  market: FuturesMarket,
  playoffWeekStart: number | null,
): number {
  if (market === "champion" || market === "toilet_bowl") {
    return playoffWeekStart ?? WEEK_FUTURES_PLAYER_LOCK;
  }
  return WEEK_FUTURES_PLAYER_LOCK;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface ScorerRow {
  subjectId: string;
  /** Total points scored while in the starting lineup. */
  points: number;
  /** Weeks the player was actually started. */
  weeksStarted: number;
}

/**
 * The award winner from a season's started-points table.
 *
 * The tiebreak chain is printed on the card, so it is fixed here rather than
 * left to whatever order the database hands back: most points, then the higher
 * per-started-week average (the guy who did it in fewer starts was better),
 * then fewer weeks started, then player id so the answer is never ambiguous.
 */
export function topScorer(rows: ScorerRow[]): string | null {
  if (rows.length === 0) return null;

  const ranked = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const avgA = a.weeksStarted > 0 ? a.points / a.weeksStarted : 0;
    const avgB = b.weeksStarted > 0 ? b.points / b.weeksStarted : 0;
    if (avgB !== avgA) return avgB - avgA;
    if (a.weeksStarted !== b.weeksStarted) return a.weeksStarted - b.weeksStarted;
    return a.subjectId.localeCompare(b.subjectId);
  });

  return ranked[0]?.subjectId ?? null;
}

export type FutureResult = "win" | "loss";

/**
 * Grades one futures row against the outcome.
 *
 * The Field is the only row with a rule of its own: it wins precisely when the
 * winner is not one of the candidates the board listed. Note it is graded
 * against the LISTED ids, not against "is this a known player": somebody who
 * was never on the board is the field, whether or not the database has heard of
 * him.
 */
export function futureResult(
  row: { subjectId: string },
  winnerSubjectId: string | null,
  listedIds: string[],
): FutureResult {
  if (winnerSubjectId == null) return "loss";
  if (row.subjectId === FIELD_SUBJECT_ID) {
    return listedIds.includes(winnerSubjectId) ? "loss" : "win";
  }
  return row.subjectId === winnerSubjectId ? "win" : "loss";
}
