import type { StatsContext } from "@/lib/content-gen/stats-context";

// ---------------------------------------------------------------------------
// Comparative / superlative claim verification
// ---------------------------------------------------------------------------
// The LLM path (toRowsPreseason/toRowsRegular in generate.ts) is the ONLY
// caller of this module: templates route through validateRow and legitimately
// emit true superlatives, so claim verification lives here, on the LLM-only
// path, not in validateRow.
//
// The guarantee this module adds (issue #110): a generated body may only assert
// a comparative/superlative ("league-worst", "No. 2", "highest", "most") that
// is (a) attached to a structured Claim the model emitted, and (b) literally
// true when that Claim is recomputed from the StatsContext the model was fed.
// The published "0.414 league-worst" bug was a real number (0.414) welded to a
// false ranking (Of Mice and Mendoza is second-worst, not worst); numeric
// validity alone never caught it, so this checks the RANK, not just the value.
//
// Design bias: DROP over repair. A row whose claims don't check out is dropped
// row-wise (never batch-wise) and the vetted deterministic templates backfill
// the hole (fillMissingKinds/topUpShortKinds). Because a drop is cheap, the
// checks err toward false-drop, not false-pass.
//
// KNOWN LIMITS (acceptable because every drop backfills from vetted templates):
//  - Derived arithmetic is not modeled: a body that computes a NEW number from
//    context values (a correct sum/difference/average) drops, because the token
//    won't match any single known fact. Correct-but-derived copy is sacrificed
//    to keep the false-positive rate at zero.
//  - Small integers (0-31), years (1900-2100), and "No. N"/"Nth" are exempt
//    from the numeric-token check (they are structurally indistinguishable from
//    counts, weeks, and ordinals). A superlative FRAMED around such a number
//    ("No. 1", "the most") is still caught: it trips the citation/claim path
//    (rank claim) or the superlative tripwire.
//  - The tripwire (distinct superlative markers must not outnumber verified
//    claims) can over-fire on idioms ("the only question", "most teams", "led
//    the league in vibes"); those rows drop and backfill. Over-blocking a
//    figure of speech is the accepted cost of never shipping a false one.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The metrics whose full ordering the StatsContext lets us recompute. */
export type RankableMetric =
  | "allTimeWinPct"
  | "championships"
  | "playoffAppearances"
  | "projectedStartingPoints"
  | "pointsFor"
  | "wins";

const RANKABLE_METRICS: ReadonlySet<string> = new Set<RankableMetric>([
  "allTimeWinPct",
  "championships",
  "playoffAppearances",
  "projectedStartingPoints",
  "pointsFor",
  "wins",
]);

/**
 * A structured comparative/superlative assertion the model attaches to a row.
 * `subject` is a franchise slug. Exactly one of the qualifiers is typically
 * present: `extreme` ("best"/"worst"), a 1-based `rank`, and/or a `value`.
 */
export interface Claim {
  metric: RankableMetric;
  /** Franchise slug the claim is about. */
  subject: string;
  /** 1-based rank (1 = best). */
  rank?: number;
  extreme?: "best" | "worst";
  /** A cited value for the subject on this metric. */
  value?: number;
}

/** One franchise's value on a metric, used to build a full ordering. */
export interface RankEntry {
  slug: string;
  value: number;
}

export interface ClaimsCheck {
  ok: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function decimalPlaces(n: number): number {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function roundTo(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** Wins from a "W-L" or "W-L-T" record string; null when unparseable. */
function parseWins(record: string): number | null {
  const m = record.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

/**
 * The full ordering for a metric, best-first (rank 1 = best). Every rankable
 * metric is higher-is-better. Returns [] when the source array is empty (the
 * DB had too little history, projections aren't populated, etc.), which makes
 * every claim on that metric fail closed. Pure; exported for unit tests.
 */
export function rankingFor(metric: RankableMetric, ctx: StatsContext): RankEntry[] {
  let entries: RankEntry[] = [];
  switch (metric) {
    case "allTimeWinPct":
      entries = ctx.franchiseHistory.map((f) => ({ slug: f.slug, value: f.allTimeWinPct }));
      break;
    case "championships":
      entries = ctx.franchiseHistory.map((f) => ({ slug: f.slug, value: f.championships }));
      break;
    case "playoffAppearances":
      entries = ctx.franchiseHistory.map((f) => ({ slug: f.slug, value: f.playoffAppearances }));
      break;
    case "projectedStartingPoints":
      entries = ctx.rosterProjections.map((p) => ({ slug: p.slug, value: p.projectedStartingPoints }));
      break;
    case "pointsFor":
      entries = ctx.leagueStandings.map((t) => ({ slug: t.slug, value: t.pointsFor }));
      break;
    case "wins":
      for (const t of ctx.leagueStandings) {
        const w = parseWins(t.record);
        if (w != null) entries.push({ slug: t.slug, value: w });
      }
      break;
    default:
      return [];
  }
  return [...entries].sort((a, b) => b.value - a.value);
}

/** Whether a cited value matches the subject's actual value, at the citation's precision. */
function valueMatches(claimValue: number, actual: number, metric: RankableMetric): boolean {
  const d = decimalPlaces(claimValue);
  if (roundTo(actual, d) === roundTo(claimValue, d)) return true;
  // Win rate quoted as a percentage (41.4) against a fraction (0.414).
  if (metric === "allTimeWinPct") {
    const asFraction = claimValue / 100;
    const dd = decimalPlaces(asFraction);
    if (roundTo(actual, dd) === roundTo(asFraction, dd)) return true;
  }
  return false;
}

/**
 * True only when the claim is LITERALLY true recomputed from the context:
 *  - unresolvable subject or empty ranking -> false;
 *  - extreme "worst" requires the subject to be STRICTLY last (a tie for last
 *    fails), "best" strictly first;
 *  - rank N requires the subject's computed rank to equal N exactly, and a tie
 *    at the subject's value (ambiguous rank) fails;
 *  - value, if cited, must match the subject's actual value at that precision.
 * Pure; exported for unit tests.
 */
export function verifyClaim(claim: Claim, ctx: StatsContext): boolean {
  if (!RANKABLE_METRICS.has(claim.metric)) return false;
  const ranking = rankingFor(claim.metric, ctx);
  if (ranking.length === 0) return false;

  const idx = ranking.findIndex((e) => e.slug === claim.subject);
  if (idx === -1) return false;
  const subject = ranking[idx];

  if (claim.extreme === "best") {
    if (idx !== 0) return false;
    if (ranking.length > 1 && ranking[1].value === subject.value) return false; // tie for first
  }
  if (claim.extreme === "worst") {
    const last = ranking.length - 1;
    if (idx !== last) return false;
    if (ranking.length > 1 && ranking[last - 1].value === subject.value) return false; // tie for last
  }
  if (claim.rank != null) {
    const higher = ranking.filter((e) => e.value > subject.value).length;
    if (higher + 1 !== claim.rank) return false;
    const tied = ranking.filter((e) => e.value === subject.value).length;
    if (tied > 1) return false; // ambiguous rank
  }
  if (claim.value != null && !valueMatches(claim.value, subject.value, claim.metric)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Numeric-token extraction + verification
// ---------------------------------------------------------------------------

/**
 * Stat-shaped tokens in a body: decimals, thousands-comma numbers, win-rate
 * decimals, percentages, and W-L(-T) records. EXCLUDES bare integers 0-31,
 * years 1900-2100, and "No. N" / "Nth" (those are counts/weeks/ordinals, not
 * citable stat values, and are handled by the claim/superlative path instead).
 * Pure; exported for unit tests.
 */
export function extractStatTokens(body: string): string[] {
  const tokens: string[] = [];
  let s = body;
  const consume = (re: RegExp, keep: boolean): void => {
    s = s.replace(re, (m) => {
      if (keep) tokens.push(m);
      return " ".repeat(m.length);
    });
  };

  // Records first, so their integers aren't re-read as bare ints below.
  consume(/\b\d{1,3}-\d{1,3}(?:-\d{1,3})?\b/g, true);
  // Percentages.
  consume(/\d+(?:\.\d+)?%/g, true);
  // "No. N" and ordinals: excluded (blanked, not kept).
  consume(/\bNo\.?\s*\d+/gi, false);
  consume(/\b\d+(?:st|nd|rd|th)\b/gi, false);
  // Thousands-comma numbers, then plain decimals, then leading-dot win rates.
  consume(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, true);
  consume(/\d+\.\d+/g, true);
  consume(/(?<![\d.])\.\d{2,3}\b/g, true);
  // Remaining bare integers: kept only when NOT 0-31 and NOT a year 1900-2100.
  const bare = s.match(/\d+/g) ?? [];
  for (const m of bare) {
    const n = parseInt(m, 10);
    const isSmall = n >= 0 && n <= 31;
    const isYear = n >= 1900 && n <= 2100;
    if (!isSmall && !isYear) tokens.push(m);
  }
  return tokens;
}

interface KnownNumbers {
  /** Every citable scalar fact as a raw number. */
  values: number[];
  /** allTimeWinPct fractions, kept separately for %<->fraction matching. */
  winRates: number[];
  /** Exact W-L(-T) record strings. */
  records: Set<string>;
}

/**
 * Every citable numeric fact in the context, normalized at natural precisions.
 * The wider this net, the fewer TRUE numbers get false-dropped, so it is
 * deliberately generous. Pure.
 */
function knownNumbers(ctx: StatsContext): KnownNumbers {
  const values: number[] = [];
  const winRates: number[] = [];
  const records = new Set<string>();
  const addRecord = (r: string | null | undefined): void => {
    if (r) records.add(r);
  };

  for (const f of ctx.franchiseHistory) {
    winRates.push(f.allTimeWinPct);
    values.push(f.allTimeWinPct, Math.round(f.allTimeWinPct * 1000) / 10); // 0.414 and 41.4
    values.push(f.championships, f.playoffAppearances, f.seasonsPlayed);
  }
  for (const p of ctx.rosterProjections) {
    values.push(p.projectedStartingPoints, p.leagueRank);
    if (p.topProjectedPlayer) values.push(p.topProjectedPlayer.points);
  }
  for (const t of ctx.leagueStandings) {
    values.push(t.pointsFor);
    addRecord(t.record);
    const w = parseWins(t.record);
    if (w != null) values.push(w);
  }
  for (const m of ctx.currentMatchups) {
    if (m.h2h) {
      values.push(m.h2h.wins, m.h2h.losses, m.h2h.ties);
      records.add(
        m.h2h.ties > 0
          ? `${m.h2h.wins}-${m.h2h.losses}-${m.h2h.ties}`
          : `${m.h2h.wins}-${m.h2h.losses}`,
      );
    }
  }
  const ls = ctx.lastSeason;
  if (ls) {
    for (const team of [ls.champion, ls.doormat, ls.pointMachine]) {
      if (team) {
        values.push(team.pointsFor);
        addRecord(team.record);
      }
    }
  }
  const wib = ctx.weekInBooks;
  if (wib) {
    if (wib.highestScorer) values.push(wib.highestScorer.points);
    if (wib.lowestScorer) values.push(wib.lowestScorer.points);
    if (wib.biggestBlowout) values.push(wib.biggestBlowout.margin);
    if (wib.closestWin) values.push(wib.closestWin.margin);
    if (wib.benchLeader) values.push(wib.benchLeader.pointsLeft);
    if (wib.playerOfWeek) values.push(wib.playerOfWeek.points);
    if (wib.dudStarter) values.push(wib.dudStarter.points);
  }
  for (const m of ctx.offseasonMoves ?? []) {
    for (const dp of m.draftedPlayers) {
      values.push(dp.round, dp.pickNumber);
      if (dp.projectedPoints != null) values.push(dp.projectedPoints);
    }
  }
  for (const t of ctx.recentTrades ?? []) {
    for (const side of t.sides) {
      values.push(side.players.length, side.picks);
    }
  }

  return { values, winRates, records };
}

/**
 * Whether a stat token is backed by a real context number. Records match by
 * exact string; percentages and win-rate decimals cross-match (41.4% <-> 0.414
 * <-> 41.4); other decimals match a known value rounded to the token's own
 * precision (so 2,459.9 matches a stored 2459.9). Pure; exported for tests.
 */
export function numberMatches(token: string, ctx: StatsContext): boolean {
  const known = knownNumbers(ctx);

  if (/^\d+-\d+(?:-\d+)?$/.test(token)) return known.records.has(token);

  const clean = token.replace(/,/g, "");
  if (clean.endsWith("%")) {
    const pct = parseFloat(clean.slice(0, -1));
    if (Number.isNaN(pct)) return false;
    const asFraction = pct / 100;
    const fd = decimalPlaces(asFraction);
    if (known.winRates.some((w) => roundTo(w, fd) === roundTo(asFraction, fd))) return true;
    const pd = decimalPlaces(pct);
    if (known.winRates.some((w) => roundTo(w * 100, pd) === roundTo(pct, pd))) return true;
    return known.values.some((v) => roundTo(v, pd) === roundTo(pct, pd));
  }

  const parsed = parseFloat(clean);
  if (Number.isNaN(parsed)) return false;
  const d = decimalPlaces(parsed);
  if (known.values.some((v) => roundTo(v, d) === roundTo(parsed, d))) return true;
  if (known.winRates.some((w) => roundTo(w, d) === roundTo(parsed, d))) return true; // 0.414 / .414
  return known.winRates.some((w) => roundTo(w * 100, d) === roundTo(parsed, d)); // 41.4
}

/** Stat tokens in the body with no backing context number. Pure. */
export function findUnverifiedNumbers(body: string, ctx: StatsContext): string[] {
  return extractStatTokens(body).filter((t) => !numberMatches(t, ctx));
}

// ---------------------------------------------------------------------------
// Superlative markers + the tripwire
// ---------------------------------------------------------------------------

/**
 * Phrases that assert a comparative/superlative. Every marker present in a body
 * must be backed by a verified Claim (see verifyClaims): the tripwire fails a
 * body carrying more distinct markers than it has verified claims, so a
 * superlative can never ship on unbacked framing alone.
 */
export const SUPERLATIVE_MARKERS =
  /league-worst|league-best|league-high|league-low|worst in the league|best in the league|highest|lowest|\bmost\b|\bfewest\b|\bonly\b|dead last|led the league|tops the league|No\.?\s*\d+|\b\d+(?:st|nd|rd|th)\b|by a wide margin/gi;

/** Distinct (lowercased) superlative markers present in the body. Pure. */
export function findSuperlativeMarkers(body: string): string[] {
  const matches = body.match(SUPERLATIVE_MARKERS) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase().replace(/\s+/g, " ")))];
}

/**
 * The whole-body gate the LLM path runs per row:
 *  1. any stat-shaped number with no backing context fact -> fail;
 *  2. any attached claim that isn't literally true -> fail;
 *  3. tripwire: more distinct superlative markers than verified claims -> fail
 *     (so markers with zero claims always fail).
 * Pure; exported for unit tests.
 */
export function verifyClaims(body: string, claims: Claim[], ctx: StatsContext): ClaimsCheck {
  const unverified = findUnverifiedNumbers(body, ctx);
  if (unverified.length > 0) {
    return { ok: false, reason: `unverified number(s): ${unverified.join(", ")}` };
  }
  for (const claim of claims) {
    if (!verifyClaim(claim, ctx)) {
      const qualifier = claim.extreme ?? (claim.rank != null ? `rank ${claim.rank}` : "value");
      return {
        ok: false,
        reason: `false/unverifiable claim: ${claim.subject} ${claim.metric} ${qualifier}`,
      };
    }
  }
  const markers = findSuperlativeMarkers(body);
  if (markers.length > claims.length) {
    return {
      ok: false,
      reason: `${markers.length} superlative marker(s) but ${claims.length} verified claim(s): ${markers.join(", ")}`,
    };
  }
  return { ok: true };
}
