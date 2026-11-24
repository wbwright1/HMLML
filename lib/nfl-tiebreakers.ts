// NFL tiebreaking procedures, adapted to this league. Pure: no database, no
// network. The league rule is "NFL tiebreakers" for both division titles and
// playoff seeding, with one adaptation the commish set: this league has no
// conferences, so a team's CONFERENCE is its DIVISION. Wherever the NFL rule
// says "conference record" or "conference games", this module reads division
// record and division games.
//
// The procedure (NFL 2-club and 3+-club formats):
//   Division ties: head-to-head, division record, common games, strength of
//   victory, strength of schedule, combined ranking in points scored and
//   allowed (within the conference/division, then league-wide), net points in
//   common games, net points in all games, then a coin toss.
//   (The NFL "conference record" step sits between common games and SOV; with
//   conference = division it repeats division record, so it never changes an
//   outcome and is left out.)
//
//   Seeding and wild-card ties (teams from different divisions): first reduce
//   the tie to the best team in each division by the division procedure, then
//   head-to-head (2 clubs: if they played; 3+ clubs: only a sweep), conference
//   (= division) record, common games (minimum four), SOV, SOS, combined
//   rankings, net points in conference (= division) games, net points in all
//   games, then a coin toss.
//
// Restart rule: whenever a step eliminates some clubs but two or more remain
// tied, the procedure restarts at step 1 for the smaller group (NFL: "reverts
// to step 1 of the two-club format" / "of the three-club format"). The coin
// toss is the commish's call; here it falls back to franchise id so the order
// is always deterministic, and `resolveOrder` reports when that happened.
//
// Net touchdowns (an NFL step) has no fantasy equivalent and is skipped.

export interface TiebreakTeam {
  franchiseId: string;
  wins: number;
  losses: number;
  ties: number;
  /** Division number, or null for legacy seasons without divisions. */
  division: number | null;
}

/** One completed regular-season game, listed once. `winner` null = a tie. */
export interface TiebreakGame {
  teamA: string;
  teamB: string;
  pointsA: number;
  pointsB: number;
  winner: "A" | "B" | null;
}

export interface TiebreakContext {
  games: TiebreakGame[];
}

/** The step that settled a tie, for explaining the order. */
export type TiebreakStep =
  | "record"
  | "head-to-head"
  | "head-to-head sweep"
  | "division record"
  | "common games"
  | "strength of victory"
  | "strength of schedule"
  | "combined ranking (division)"
  | "combined ranking (league)"
  | "net points (common games)"
  | "net points (division games)"
  | "net points (all games)"
  | "coin toss";

interface Rec {
  wins: number;
  losses: number;
  ties: number;
}

function pct(r: Rec): number {
  const g = r.wins + r.losses + r.ties;
  return g > 0 ? (r.wins + r.ties * 0.5) / g : 0;
}

/** Exact-enough equality key for win percentages computed from integers. */
function pctKey(r: Rec): string {
  return pct(r).toFixed(9);
}

interface Played {
  opp: string;
  pf: number;
  pa: number;
  result: "W" | "L" | "T";
}

/** Precomputed per-team game logs and records for one season. */
class Season {
  readonly log = new Map<string, Played[]>();
  readonly divisionOf: Map<string, number | null>;
  readonly allIds: string[];

  constructor(teams: TiebreakTeam[], ctx: TiebreakContext) {
    this.divisionOf = new Map(teams.map((t) => [t.franchiseId, t.division]));
    this.allIds = teams.map((t) => t.franchiseId);
    for (const g of ctx.games) {
      const aRes = g.winner === "A" ? "W" : g.winner === "B" ? "L" : "T";
      const bRes = g.winner === "B" ? "W" : g.winner === "A" ? "L" : "T";
      this.push(g.teamA, { opp: g.teamB, pf: g.pointsA, pa: g.pointsB, result: aRes });
      this.push(g.teamB, { opp: g.teamA, pf: g.pointsB, pa: g.pointsA, result: bRes });
    }
  }

  private push(id: string, p: Played) {
    const list = this.log.get(id) ?? [];
    list.push(p);
    this.log.set(id, list);
  }

  games(id: string, filter?: (opp: string) => boolean): Played[] {
    const all = this.log.get(id) ?? [];
    return filter ? all.filter((p) => filter(p.opp)) : all;
  }

  record(id: string, filter?: (opp: string) => boolean): Rec {
    const r: Rec = { wins: 0, losses: 0, ties: 0 };
    for (const p of this.games(id, filter)) {
      if (p.result === "W") r.wins++;
      else if (p.result === "L") r.losses++;
      else r.ties++;
    }
    return r;
  }

  net(id: string, filter?: (opp: string) => boolean): number {
    return this.games(id, filter).reduce((s, p) => s + p.pf - p.pa, 0);
  }

  sameDivision(a: string, b: string): boolean {
    const da = this.divisionOf.get(a);
    return da != null && da === this.divisionOf.get(b);
  }

  hasDivisions(id: string): boolean {
    return this.divisionOf.get(id) != null;
  }
}

/** Scores per team for one step (higher is better), or null if not applicable. */
type Step = {
  name: TiebreakStep;
  score: (group: string[], s: Season) => Map<string, number> | null;
};

const h2hPct: Step = {
  name: "head-to-head",
  score: (group, s) => {
    const inGroup = new Set(group);
    const out = new Map<string, number>();
    for (const id of group) {
      const r = s.record(id, (o) => inGroup.has(o) && o !== id);
      if (r.wins + r.losses + r.ties === 0) return null; // a pair never met
      out.set(id, pct(r));
    }
    return out;
  },
};

/**
 * 3+ club wild-card head-to-head: applies only when one club beat every other
 * club in the group (it wins the step) or lost to every other (it drops out).
 */
const h2hSweep: Step = {
  name: "head-to-head sweep",
  score: (group, s) => {
    const beatAll = (id: string, want: "W" | "L") =>
      group.every((o) => {
        if (o === id) return true;
        const vs = s.games(id, (x) => x === o);
        return vs.length > 0 && vs.every((p) => p.result === want);
      });
    const sweeper = group.find((id) => beatAll(id, "W"));
    if (sweeper) return new Map(group.map((id) => [id, id === sweeper ? 1 : 0]));
    const swept = group.find((id) => beatAll(id, "L"));
    if (swept) return new Map(group.map((id) => [id, id === swept ? -1 : 0]));
    return null;
  },
};

const divisionRecord: Step = {
  name: "division record",
  score: (group, s) => {
    if (!group.every((id) => s.hasDivisions(id))) return null;
    return new Map(group.map((id) => [id, pct(s.record(id, (o) => s.sameDivision(id, o)))]));
  },
};

function commonOpponents(group: string[], s: Season): Set<string> {
  const inGroup = new Set(group);
  const sets = group.map(
    (id) => new Set<string>(s.games(id).map((p) => p.opp).filter((o) => !inGroup.has(o))),
  );
  if (sets.length === 0) return new Set<string>();
  return new Set<string>([...sets[0]].filter((o) => sets.every((set) => set.has(o))));
}

function commonGames(minGames: number): Step {
  return {
    name: "common games",
    score: (group, s) => {
      const common = commonOpponents(group, s);
      if (common.size === 0) return null;
      const out = new Map<string, number>();
      for (const id of group) {
        const r = s.record(id, (o) => common.has(o));
        if (r.wins + r.losses + r.ties < minGames) return null;
        out.set(id, pct(r));
      }
      return out;
    },
  };
}

/** Combined record of a list of opponents, one entry per game. */
function combinedPct(opps: string[], s: Season): number {
  const total: Rec = { wins: 0, losses: 0, ties: 0 };
  for (const o of opps) {
    const r = s.record(o);
    total.wins += r.wins;
    total.losses += r.losses;
    total.ties += r.ties;
  }
  return pct(total);
}

const strengthOfVictory: Step = {
  name: "strength of victory",
  score: (group, s) =>
    new Map(
      group.map((id) => [
        id,
        combinedPct(
          s.games(id).filter((p) => p.result === "W").map((p) => p.opp),
          s,
        ),
      ]),
    ),
};

const strengthOfSchedule: Step = {
  name: "strength of schedule",
  score: (group, s) => new Map(group.map((id) => [id, combinedPct(s.games(id).map((p) => p.opp), s)])),
};

/** Competition rank (1 = best) of `id` among `pool` by a value. */
function rankAmong(id: string, pool: string[], value: (x: string) => number, higherIsBetter: boolean) {
  const v = value(id);
  return 1 + pool.filter((x) => (higherIsBetter ? value(x) > v : value(x) < v)).length;
}

function combinedRanking(scope: "division" | "league"): Step {
  return {
    name: scope === "division" ? "combined ranking (division)" : "combined ranking (league)",
    score: (group, s) => {
      if (scope === "division" && !group.every((id) => s.hasDivisions(id))) return null;
      const pf = (x: string) => s.games(x).reduce((t, p) => t + p.pf, 0);
      const pa = (x: string) => s.games(x).reduce((t, p) => t + p.pa, 0);
      const out = new Map<string, number>();
      for (const id of group) {
        const pool =
          scope === "division" ? s.allIds.filter((x) => s.sameDivision(id, x)) : s.allIds;
        const sum = rankAmong(id, pool, pf, true) + rankAmong(id, pool, pa, false);
        out.set(id, -sum); // lower combined rank is better
      }
      return out;
    },
  };
}

const netCommon: Step = {
  name: "net points (common games)",
  score: (group, s) => {
    const common = commonOpponents(group, s);
    if (common.size === 0) return null;
    return new Map(group.map((id) => [id, s.net(id, (o) => common.has(o))]));
  },
};

const netDivision: Step = {
  name: "net points (division games)",
  score: (group, s) => {
    if (!group.every((id) => s.hasDivisions(id))) return null;
    return new Map(group.map((id) => [id, s.net(id, (o) => s.sameDivision(id, o))]));
  },
};

const netAll: Step = {
  name: "net points (all games)",
  score: (group, s) => new Map(group.map((id) => [id, s.net(id)])),
};

const DIVISION_STEPS: Step[] = [
  h2hPct,
  divisionRecord,
  commonGames(0),
  strengthOfVictory,
  strengthOfSchedule,
  combinedRanking("division"),
  combinedRanking("league"),
  netCommon,
  netAll,
];

const WILDCARD_TWO_CLUB: Step[] = [
  h2hPct,
  divisionRecord, // NFL "conference record"; conference = division here
  commonGames(4),
  strengthOfVictory,
  strengthOfSchedule,
  combinedRanking("division"),
  combinedRanking("league"),
  netDivision, // NFL "net points in conference games"
  netAll,
];

const WILDCARD_MULTI_CLUB: Step[] = [h2hSweep, ...WILDCARD_TWO_CLUB.slice(1)];

const EPS = 1e-9;

/** Runs a step list with the NFL restart rule; returns the single best club. */
function pickBest(
  group: string[],
  s: Season,
  stepsFor: (size: number) => Step[],
): { id: string; step: TiebreakStep } {
  let current = [...group];
  let decidedBy: TiebreakStep = "coin toss";
  restart: while (current.length > 1) {
    for (const step of stepsFor(current.length)) {
      const scores = step.score(current, s);
      if (!scores) continue;
      const best = Math.max(...current.map((id) => scores.get(id)!));
      const survivors = current.filter((id) => scores.get(id)! >= best - EPS);
      if (survivors.length < current.length) {
        current = survivors;
        decidedBy = step.name;
        continue restart;
      }
    }
    // Every step tied: the coin toss (commish's call), deterministic here.
    return { id: [...current].sort()[0], step: "coin toss" };
  }
  return { id: current[0], step: decidedBy };
}

const divisionSteps = () => DIVISION_STEPS;
const wildcardSteps = (n: number) => (n === 2 ? WILDCARD_TWO_CLUB : WILDCARD_MULTI_CLUB);

/**
 * The best club among teams tied on win%. Same division: division procedure.
 * Mixed divisions: reduce to each division's best first, then the wild-card
 * procedure. Legacy seasons with no divisions use the wild-card procedure,
 * whose division-based steps skip themselves.
 */
function pickTop(group: string[], s: Season): { id: string; step: TiebreakStep } {
  if (group.length === 1) return { id: group[0], step: "record" };
  const divs = new Set(group.map((id) => s.divisionOf.get(id) ?? null));
  if (divs.size === 1 && !divs.has(null)) return pickBest(group, s, divisionSteps);

  const reps: string[] = [];
  let reduceStep: TiebreakStep | null = null;
  const byDiv = new Map<number | null, string[]>();
  for (const id of group) {
    const d = s.divisionOf.get(id) ?? null;
    if (d == null) {
      reps.push(id);
      continue;
    }
    byDiv.set(d, [...(byDiv.get(d) ?? []), id]);
  }
  for (const members of byDiv.values()) {
    if (members.length === 1) reps.push(members[0]);
    else {
      const best = pickBest(members, s, divisionSteps);
      reps.push(best.id);
      reduceStep ??= best.step;
    }
  }
  if (reps.length === 1) return { id: reps[0], step: reduceStep ?? "record" };
  return pickBest(reps, s, wildcardSteps);
}

export interface OrderedTeam<T> {
  team: T;
  /** How this team was placed ahead of the rest of its tie group. */
  decidedBy: TiebreakStep;
}

/**
 * Orders teams best to worst: win% first, then the NFL procedure inside each
 * win% tie, one club at a time (the NFL "repeat the procedure" rule), so the
 * remaining clubs are re-evaluated from step 1 after each pick.
 */
export function resolveOrder<T extends TiebreakTeam>(
  teams: T[],
  ctx: TiebreakContext,
): OrderedTeam<T>[] {
  const s = new Season(teams, ctx);
  const byId = new Map(teams.map((t) => [t.franchiseId, t]));
  const buckets = new Map<string, string[]>();
  for (const t of teams) {
    const k = pctKey(t);
    buckets.set(k, [...(buckets.get(k) ?? []), t.franchiseId]);
  }
  const keys = [...buckets.keys()].sort((a, b) => Number(b) - Number(a));

  const out: OrderedTeam<T>[] = [];
  for (const k of keys) {
    let remaining = buckets.get(k)!;
    while (remaining.length > 0) {
      const { id, step } = pickTop(remaining, s);
      out.push({ team: byId.get(id)!, decidedBy: remaining.length === 1 ? "record" : step });
      remaining = remaining.filter((x) => x !== id);
    }
  }
  return out;
}
