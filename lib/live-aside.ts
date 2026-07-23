// Pure, deterministic "swing moment" aside for a live matchup card. Given a
// live game's current scores, home win probability, and how many starters each
// side has yet to play, it returns a single short editorial line from a
// centralized set of phrases, or null when nothing interesting is happening.
//
// No I/O and no history: the aside is a function of the current snapshot only,
// so it is safe to unit test and produces the same line for the same inputs on
// every 30s server re-render. IMPORTANT: playersLeft must be the game-status
// based starter count already flowing to the card (from the synced NFL
// schedule), never a points heuristic.

/** The centralized phrase set. Cards render these verbatim. */
export const LIVE_ASIDES = {
  /** Trailer is out of players and buried: the game is effectively decided. */
  DEAD_MAN: "Dead man walking",
  /** Big margin, trailer almost out of players: blowout territory. */
  MERCY_WATCH: "Mercy rule watch",
  /** Trailer is behind but projects to storm back (leader nearly done). */
  COMEBACK: "Comeback brewing",
  /** Near coin-flip with little football left. */
  COIN_FLIP: "Coin flip, late",
} as const;

export type LiveAside = (typeof LIVE_ASIDES)[keyof typeof LIVE_ASIDES];

// --- Thresholds (all named; tuned for a 12-team, ~9-starter league) ---------

/** "Mercy rule watch": leader is up by at least this many points. */
const MERCY_MARGIN = 30;
/** ...and the trailer has at most this many starters left to score. */
const MERCY_TRAILER_PLAYERS_MAX = 2;

/** "Dead man walking": the trailer's win probability is at or below this... */
const LONGSHOT_PROB = 0.08;
// ...and the trailer has zero starters left (checked as === 0 below).

/** "Comeback brewing": the leader has at most this many starters left... */
const COMEBACK_LEADER_PLAYERS_MAX = 1;
/** ...the trailer still has at least this many starters left to score... */
const COMEBACK_TRAILER_PLAYERS_MIN = 3;
/** ...the trailer is behind by at least this many points... */
const COMEBACK_MIN_MARGIN = 10;
/** ...and, despite trailing, projects back to at least this win probability. */
const COMEBACK_TRAILER_PROB_MIN = 0.45;

/** "Coin flip, late": home win prob is within this of 0.50... */
const COINFLIP_BAND = 0.08;
/** ...and the two sides have at most this many starters left combined. */
const COINFLIP_TOTAL_PLAYERS_MAX = 4;

export interface LiveAsideInput {
  homeScore: number;
  awayScore: number;
  /** Home team's win probability in [0, 1]. */
  winProbHome: number;
  /** Starters each side has yet to score (game-status based, never heuristic). */
  playersLeft: { home: number; away: number };
}

/**
 * Returns the editorial aside for a live matchup, or null when no swing
 * condition applies. Conditions are checked most-decisive first so a single,
 * unambiguous line is chosen when several could apply.
 */
export function deriveLiveAside(input: LiveAsideInput): LiveAside | null {
  const { homeScore, awayScore, winProbHome, playersLeft } = input;

  // Orient everything around the current leader / trailer.
  const homeLeads = homeScore >= awayScore;
  const margin = Math.abs(homeScore - awayScore);
  const leaderPlayers = homeLeads ? playersLeft.home : playersLeft.away;
  const trailerPlayers = homeLeads ? playersLeft.away : playersLeft.home;
  const trailerProb = homeLeads ? 1 - winProbHome : winProbHome;
  const totalLeft = playersLeft.home + playersLeft.away;

  // 1. Comeback brewing: trailing on the board but the leader is nearly done
  //    while the trailer still has starters, and the model already projects
  //    the trailer back to competitive-or-favored.
  if (
    margin >= COMEBACK_MIN_MARGIN &&
    leaderPlayers <= COMEBACK_LEADER_PLAYERS_MAX &&
    trailerPlayers >= COMEBACK_TRAILER_PLAYERS_MIN &&
    trailerProb >= COMEBACK_TRAILER_PROB_MIN
  ) {
    return LIVE_ASIDES.COMEBACK;
  }

  // 2. Dead man walking: trailer has no one left and effectively no chance.
  if (trailerPlayers === 0 && trailerProb <= LONGSHOT_PROB) {
    return LIVE_ASIDES.DEAD_MAN;
  }

  // 3. Mercy rule watch: big margin with the trailer nearly out of players.
  if (margin >= MERCY_MARGIN && trailerPlayers <= MERCY_TRAILER_PLAYERS_MAX) {
    return LIVE_ASIDES.MERCY_WATCH;
  }

  // 4. Coin flip, late: near 50/50 with little football left.
  if (
    totalLeft <= COINFLIP_TOTAL_PLAYERS_MAX &&
    Math.abs(winProbHome - 0.5) <= COINFLIP_BAND
  ) {
    return LIVE_ASIDES.COIN_FLIP;
  }

  return null;
}
