/**
 * Season schedule generator (pure, no I/O).
 *
 * League shape: 12 teams, 3 divisions of 4, 14-game regular season.
 * Each team plays its 3 division rivals TWICE and each of the 8 teams in the
 * other two divisions ONCE (6 + 8 = 14).
 *
 * Construction (provably correct, no search):
 *   - 11 "mixed" weeks = a standard 12-team single round-robin: every team
 *     plays every other exactly once. Covers all cross-division games (once)
 *     and the FIRST division meeting of every rivalry.
 *   - 3 "divisional" weeks = the SECOND division meeting. A 4-team division
 *     (K4) decomposes into exactly 3 perfect pairings; divisional week i takes
 *     pairing i from each division (2 games x 3 divisions = 6 games).
 *
 * Every week is an independent perfect pairing, so weeks reorder freely: the
 * finals rematch is pinned to week 1 and the divisional weeks land at chosen
 * positions.
 */

/** An unordered pairing of two team ids for one game. */
export type Pair = [string, string];

/** One week's slate: 6 pairings covering all 12 teams. */
export type Round = Pair[];

export type Game = {
  a: string;
  b: string;
  sameDivision: boolean;
};

export type Week = {
  week: number;
  kind: "mixed" | "divisional";
  label: string | null;
  games: Game[];
};

export type AssembleInput = {
  /** The 3 divisions, each a list of 4 team ids. */
  divisions: string[][];
  /** [teamId, teamId] for last year's finals; pinned to week 1. */
  finalists: Pair;
  /** Week numbers (1-based) that become all-divisional weeks. Exactly 3, none = 1. */
  divisionalWeeks: number[];
  /** Which of the divisional weeks is the primetime showcase. */
  primetimeWeek: number;
};

export const TEAMS_PER_DIVISION = 4;
export const DIVISION_COUNT = 3;
export const TEAM_COUNT = TEAMS_PER_DIVISION * DIVISION_COUNT; // 12
export const TOTAL_WEEKS = 14;
export const GAMES_PER_WEEK = TEAM_COUNT / 2; // 6

// ---------------------------------------------------------------------------
// Round-robin (circle method)
// ---------------------------------------------------------------------------

/**
 * Single round-robin for an even number of teams via the circle method.
 * Returns n-1 rounds; for 12 teams that's 11 rounds of 6 pairings, and every
 * unordered pair of teams appears in exactly one round.
 */
export function buildRoundRobin(teamIds: string[]): Round[] {
  const n = teamIds.length;
  if (n % 2 !== 0) {
    throw new Error(`round-robin needs an even team count, got ${n}`);
  }

  // Fix the first team; rotate the rest.
  const fixed = teamIds[0];
  let rotating = teamIds.slice(1);
  const rounds: Round[] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: Round = [];
    round.push([fixed, rotating[0]]);
    for (let i = 1; i < rotating.length - i; i++) {
      round.push([rotating[i], rotating[rotating.length - i]]);
    }
    rounds.push(round);
    // Rotate: move the last element to the front of the rotating list.
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return rounds;
}

// ---------------------------------------------------------------------------
// Divisional weeks (1-factorization of each division's K4)
// ---------------------------------------------------------------------------

/** The 3 perfect pairings of a 4-team group [a,b,c,d]. */
export function divisionFactors(division: string[]): [Pair, Pair][] {
  if (division.length !== TEAMS_PER_DIVISION) {
    throw new Error(`division must have ${TEAMS_PER_DIVISION} teams`);
  }
  const [a, b, c, d] = division;
  return [
    [
      [a, b],
      [c, d],
    ],
    [
      [a, c],
      [b, d],
    ],
    [
      [a, d],
      [b, c],
    ],
  ];
}

/**
 * The 3 all-divisional rounds. Round i is factor i from every division, so the
 * three rounds together cover all 6 within-division pairings of each division
 * exactly once (the second meeting).
 */
export function buildDivisionalWeeks(divisions: string[][]): Round[] {
  const factorsByDivision = divisions.map(divisionFactors);
  const rounds: Round[] = [];
  for (let i = 0; i < DIVISION_COUNT; i++) {
    const round: Round = [];
    for (const factors of factorsByDivision) {
      round.push(factors[i][0], factors[i][1]);
    }
    rounds.push(round);
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function roundHasPair(round: Round, finalists: Pair): boolean {
  const target = pairKey(finalists[0], finalists[1]);
  return round.some(([a, b]) => pairKey(a, b) === target);
}

export function assembleSchedule(input: AssembleInput): Week[] {
  const { divisions, finalists, divisionalWeeks, primetimeWeek } = input;

  const teamIds = divisions.flat();
  validateConfig(input, teamIds);

  const divisionOf = new Map<string, number>();
  divisions.forEach((div, idx) => div.forEach((t) => divisionOf.set(t, idx)));
  const sameDivision = (a: string, b: string) =>
    divisionOf.get(a) === divisionOf.get(b);

  const rrRounds = buildRoundRobin(teamIds);
  const divRounds = buildDivisionalWeeks(divisions);

  // Pull the round-robin round that contains the finals pairing; it opens the
  // season. (Cross-division finalists meet only here; same-division finalists
  // meet here first and again in a divisional week.)
  const week1Idx = rrRounds.findIndex((r) => roundHasPair(r, finalists));
  if (week1Idx === -1) {
    throw new Error(
      "finals pairing not found in the round-robin; are both finalists in the team list?",
    );
  }
  const week1Round = rrRounds[week1Idx];
  const remainingRr = rrRounds.filter((_, i) => i !== week1Idx);

  const divisionalSet = new Set(divisionalWeeks);
  const weeks: Week[] = [];
  let rrCursor = 0;

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    let round: Round;
    let kind: Week["kind"];
    let label: string | null = null;

    if (w === 1) {
      round = week1Round;
      kind = "mixed";
      label = "Finals rematch";
    } else if (divisionalSet.has(w)) {
      // Divisional weeks consume divRounds in order.
      round = divRounds[divisionalWeeks.indexOf(w)];
      kind = "divisional";
      label = w === primetimeWeek ? "Divisional — Primetime" : "Divisional";
    } else {
      round = remainingRr[rrCursor++];
      kind = "mixed";
    }

    weeks.push({
      week: w,
      kind,
      label,
      games: round.map(([a, b]) => ({ a, b, sameDivision: sameDivision(a, b) })),
    });
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateConfig(input: AssembleInput, teamIds: string[]): void {
  const { divisions, finalists, divisionalWeeks, primetimeWeek } = input;

  if (divisions.length !== DIVISION_COUNT) {
    throw new Error(`expected ${DIVISION_COUNT} divisions, got ${divisions.length}`);
  }
  for (const div of divisions) {
    if (div.length !== TEAMS_PER_DIVISION) {
      throw new Error(`each division needs ${TEAMS_PER_DIVISION} teams`);
    }
  }
  if (teamIds.length !== TEAM_COUNT) {
    throw new Error(`expected ${TEAM_COUNT} teams, got ${teamIds.length}`);
  }
  if (new Set(teamIds).size !== TEAM_COUNT) {
    throw new Error("duplicate team ids across divisions");
  }
  if (divisionalWeeks.length !== DIVISION_COUNT) {
    throw new Error(`expected ${DIVISION_COUNT} divisional weeks`);
  }
  if (new Set(divisionalWeeks).size !== divisionalWeeks.length) {
    throw new Error("duplicate divisional weeks");
  }
  for (const w of divisionalWeeks) {
    if (!Number.isInteger(w) || w < 2 || w > TOTAL_WEEKS) {
      throw new Error(`divisional week ${w} must be an integer in 2..${TOTAL_WEEKS} (week 1 is the finals rematch)`);
    }
  }
  if (!divisionalWeeks.includes(primetimeWeek)) {
    throw new Error("primetime week must be one of the divisional weeks");
  }
  const [f1, f2] = finalists;
  if (f1 === f2) {
    throw new Error("finalists must be two different teams");
  }
  if (!teamIds.includes(f1) || !teamIds.includes(f2)) {
    throw new Error("both finalists must be in the team list");
  }
}

/**
 * Independent post-hoc checker: re-derives every constraint from the produced
 * schedule and throws on any violation. Deliberately does not trust the
 * builder, so a broken construction is caught.
 */
export function validateSchedule(
  weeks: Week[],
  divisions: string[][],
  finalists: Pair,
): void {
  const teamIds = divisions.flat();
  const divisionOf = new Map<string, number>();
  divisions.forEach((div, idx) => div.forEach((t) => divisionOf.set(t, idx)));

  if (weeks.length !== TOTAL_WEEKS) {
    throw new Error(`expected ${TOTAL_WEEKS} weeks, got ${weeks.length}`);
  }

  const meetings = new Map<string, number>();

  for (const week of weeks) {
    if (week.games.length !== GAMES_PER_WEEK) {
      throw new Error(`week ${week.week} has ${week.games.length} games, expected ${GAMES_PER_WEEK}`);
    }
    // Every team appears exactly once this week.
    const seen = new Set<string>();
    for (const g of week.games) {
      for (const t of [g.a, g.b]) {
        if (!teamIds.includes(t)) throw new Error(`week ${week.week}: unknown team ${t}`);
        if (seen.has(t)) throw new Error(`week ${week.week}: team ${t} plays twice`);
        seen.add(t);
      }
      const key = pairKey(g.a, g.b);
      meetings.set(key, (meetings.get(key) ?? 0) + 1);
    }
    if (seen.size !== TEAM_COUNT) {
      throw new Error(`week ${week.week}: only ${seen.size} teams scheduled`);
    }
    // Divisional weeks contain only intra-division games.
    if (week.kind === "divisional") {
      for (const g of week.games) {
        if (divisionOf.get(g.a) !== divisionOf.get(g.b)) {
          throw new Error(`week ${week.week} is divisional but ${g.a} vs ${g.b} crosses divisions`);
        }
      }
    }
  }

  // Meeting counts: within-division pairs exactly 2x, cross-division exactly 1x.
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const a = teamIds[i];
      const b = teamIds[j];
      const count = meetings.get(pairKey(a, b)) ?? 0;
      const expected = divisionOf.get(a) === divisionOf.get(b) ? 2 : 1;
      if (count !== expected) {
        throw new Error(`${a} vs ${b}: met ${count} times, expected ${expected}`);
      }
    }
  }

  // Week 1 is the finals rematch.
  const target = pairKey(finalists[0], finalists[1]);
  const week1HasFinals = weeks[0].games.some((g) => pairKey(g.a, g.b) === target);
  if (!week1HasFinals) {
    throw new Error("week 1 does not contain the finals rematch");
  }
}
