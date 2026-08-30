// The Book: the props pricing and grading engine.
//
// Pure math, no I/O, no database. Mirrors lib/book/pricing.ts's discipline:
// everything the Props tab shows and everything the Tuesday grading pass
// writes comes from here, so generation, repricing, and grading can never
// quietly disagree.
//
// The three weekly props (issue #224):
//   1. League Total    - O/U on the combined projected points of every
//                         starting lineup in the league.
//   2. Ceiling Watch    - YES/NO on whether anyone clears a scoring threshold.
//   3. The Mercy Line   - O/U on the week's biggest projected favorite's
//                         margin of victory.
//
// House conventions carried over from pricing.ts:
//  - A real-number LINE is always a half-integer (x.5), never a whole number,
//    so a push is impossible by construction. Ceiling Watch is the exception
//    the issue calls out: it is a YES/NO bet, so its stored "line" is the
//    plain scoring threshold, not a magnitude to straddle.
//  - Where a probability is actually modelled, it goes through pricing.ts's
//    `americanOdds` so every number in The Book prices its vig the same way.

import { americanOdds, SPREAD_ODDS } from "@/lib/book/pricing";

export type PropKind =
  | "league_total"
  | "ceiling_watch"
  | "mercy_line"
  | "player_points"
  | "team_total"
  | "player_matchbet"
  | "franchise_matchbet"
  | "blowout_special"
  | "upset_special";

export type PropSide = "over" | "under";

/**
 * "push" is new to The Book (issue #239): the two matchbet kinds and the
 * Upset Special are settled by comparing two real scores, and two real scores
 * can be exactly equal. Every LINE-based prop still rides a half-integer, so
 * it can still never push. PropSide stays over/under: a member picks a side,
 * never a tie.
 */
export type PropResult = "over" | "under" | "push";

/** Which section of the Props tab a kind belongs to. */
export type PropGroup = "specials" | "players" | "teams" | "h2h";

export const PROP_GROUP: Record<PropKind, PropGroup> = {
  league_total: "specials",
  ceiling_watch: "specials",
  mercy_line: "specials",
  blowout_special: "specials",
  upset_special: "specials",
  player_points: "players",
  team_total: "teams",
  player_matchbet: "h2h",
  franchise_matchbet: "h2h",
};

/**
 * Display order for the slate. Fixed here rather than derived from the
 * database so the tab does not reshuffle itself every time the hourly
 * repricing rewrites a row's updated_at.
 */
export const PROP_ORDER: Record<PropKind, number> = {
  league_total: 0,
  ceiling_watch: 1,
  mercy_line: 2,
  blowout_special: 3,
  upset_special: 4,
  player_points: 5,
  team_total: 6,
  player_matchbet: 7,
  franchise_matchbet: 8,
};

/**
 * The sections of the Props tab, in the order they appear, DERIVED from the two
 * records above rather than hand-mirrored in the island: a group nobody listed
 * would silently drop its cards off the tab while the slip strip still counted
 * them.
 */
export const PROP_GROUP_ORDER: PropGroup[] = [
  ...new Set(
    (Object.keys(PROP_ORDER) as PropKind[])
      .sort((a, b) => PROP_ORDER[a] - PROP_ORDER[b])
      .map((kind) => PROP_GROUP[kind]),
  ),
];

/**
 * How a kind is drawn. The League Total is the one prop about the whole league
 * at once, so it gets the full-width marquee treatment; everything else is a
 * standard card. A lib-side decision rather than a string comparison in the
 * island, so the tab never has to know a kind's name to lay it out.
 */
export type PropDisplay = "marquee" | "card";

export function propDisplay(kind: PropKind): PropDisplay {
  return kind === "league_total" ? "marquee" : "card";
}

/**
 * What a kind's subject_id holds, so the read layer resolves names off one
 * registry rather than two parallel switches that can disagree.
 *
 * "matchup_dog" is the odd one: it reuses the pair encoding to carry a matchup
 * id AND the dog's roster id together, because grading the Upset Special needs
 * both sides of the matchup and needs to know which of them was the dog. Only
 * the roster half names anybody.
 */
export type PropSubjectShape =
  | "none"
  | "player"
  | "franchise"
  | "player_pair"
  | "franchise_pair"
  | "matchup"
  | "matchup_dog";

export const PROP_SUBJECT_SHAPE: Record<PropKind, PropSubjectShape> = {
  league_total: "none",
  ceiling_watch: "none",
  blowout_special: "none",
  mercy_line: "matchup",
  upset_special: "matchup_dog",
  player_points: "player",
  team_total: "franchise",
  player_matchbet: "player_pair",
  franchise_matchbet: "franchise_pair",
};

/** How many props one week may post. Thin weeks simply produce fewer. */
export const MAX_WEEKLY_PROPS = 15;

/**
 * Rounds a non-negative magnitude onto the half-integer grid: the same hook
 * priceSpread uses, extracted here because both the League Total and the
 * Mercy Line need it and neither is a "spread" in pricing.ts's sense (there is
 * no home/away side to sign). Never returns a whole number.
 */
export function toHalfInteger(value: number): number {
  return Math.round(value - 0.5) + 0.5;
}

// ---------------------------------------------------------------------------
// Prop 1: League Total
// ---------------------------------------------------------------------------

/** Fixed per issue #224 ("odds -115/-105 per design"). */
export const LEAGUE_TOTAL_OVER_ODDS = -115;
export const LEAGUE_TOTAL_UNDER_ODDS = -105;

export interface LeagueTotalPrice {
  line: number;
  overOdds: number;
  underOdds: number;
}

/**
 * Prices the League Total: the line is the combined projected starter total
 * across every roster, rounded onto the half-integer grid. The odds are a
 * flat -115/-105 split rather than a modelled probability: a sum this
 * aggregated is close to a true coin flip by construction (independent
 * per-roster projection error averages out across twelve lineups), so
 * inventing a distribution for it would be modelling noise, not signal.
 */
export function priceLeagueTotal(projectedTotals: number[]): LeagueTotalPrice {
  const sum = projectedTotals.reduce((a, b) => a + b, 0);
  return {
    line: toHalfInteger(sum),
    overOdds: LEAGUE_TOTAL_OVER_ODDS,
    underOdds: LEAGUE_TOTAL_UNDER_ODDS,
  };
}

/**
 * How every half-integer LINE grades: over when the number beat it, under
 * otherwise. One function rather than one per kind, because "a line is a line"
 * is the house rule and three byte-identical copies of it could drift apart.
 * Never a push: the line is always a half-integer.
 */
export function gradeOverUnderLine(actual: number, line: number): PropResult {
  return actual > line ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 2: Ceiling Watch
// ---------------------------------------------------------------------------

/**
 * Growth rate of a single team's own scoring uncertainty with its projection.
 * Same shape as win-probability.ts's UNCERTAINTY_SCALE (scale * sqrt(points))
 * but kept independent: that model estimates the spread of a MARGIN between
 * two teams, this one estimates the spread of ONE team's score against a
 * fixed threshold, which is a different quantity with different history to
 * calibrate against.
 */
export const SCORE_UNCERTAINTY_SCALE = 2.1;

/** Used only when there is not enough history to trust a real percentile. */
export const DEFAULT_CEILING_THRESHOLD = 150;
const MIN_HISTORY_FOR_THRESHOLD = 20;

/** Standard normal CDF via the Abramowitz-Stegun erf approximation (~1e-7 max error). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
    t;
  const y = 1 - poly * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * P(one team, projected for `projected` points, scores over `threshold`).
 * Treats the team's final score as approximately Normal around its
 * projection, with uncertainty growing with the size of the projection: a
 * 90-point roster's ceiling is a lot less volatile in absolute terms than a
 * 160-point one's.
 */
function probOverThreshold(projected: number, threshold: number): number {
  const sigma = SCORE_UNCERTAINTY_SCALE * Math.sqrt(Math.max(projected, 1));
  return 1 - normalCdf((threshold - projected) / sigma);
}

/**
 * P(at least one of these teams clears the threshold): a Poisson-ish "any of
 * N independent trials" fold over each team's own probability, per the issue.
 * Fantasy scores are not truly independent (a shared bye week, weather on a
 * whole slate), but nothing in this league's data models that correlation,
 * and the trash-talk stakes do not need it to.
 */
export function probAnyoneOverThreshold(
  projectedTotals: number[],
  threshold: number,
): number {
  return probAnyOf(projectedTotals.map((p) => probOverThreshold(p, threshold)));
}

/** P(at least one of these independent events happens). */
export function probAnyOf(probabilities: number[]): number {
  return 1 - probabilities.reduce((acc, p) => acc * (1 - p), 1);
}

export interface CeilingWatchPrice {
  threshold: number;
  overOdds: number;
  underOdds: number;
}

/** Prices Ceiling Watch from the modelled YES probability, vig included via americanOdds. */
export function priceCeilingWatch(
  projectedTotals: number[],
  threshold: number,
): CeilingWatchPrice {
  const probYes = probAnyoneOverThreshold(projectedTotals, threshold);
  return {
    threshold,
    overOdds: americanOdds(probYes),
    underOdds: americanOdds(1 - probYes),
  };
}

/**
 * Picks the week's ceiling threshold from the league's own history: the
 * trailing-two-seasons P95 of weekly team scores, rounded to the nearest 10.
 * Falls back to 150 (documented default, issue #224) when there is not
 * enough history yet to trust a percentile: a young league, or the very
 * first props ever generated.
 */
export function chooseCeilingThreshold(historicalScores: number[]): number {
  return choosePercentileThreshold(
    historicalScores,
    0.95,
    10,
    DEFAULT_CEILING_THRESHOLD,
  );
}

/**
 * A threshold taken from the league's own history: the `pct` percentile of
 * `values`, rounded to the nearest `roundTo`, or `fallback` when there is not
 * enough history to trust a percentile at all. Shared by Ceiling Watch and the
 * Blowout Special so the two cannot drift into different definitions of "what
 * the league usually does".
 */
export function choosePercentileThreshold(
  values: number[],
  pct: number,
  roundTo: number,
  fallback: number,
): number {
  if (values.length < MIN_HISTORY_FOR_THRESHOLD) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(pct * sorted.length) - 1);
  return Math.round(sorted[idx] / roundTo) * roundTo;
}

/** YES ("over") when the week's highest team score clears the threshold. */
export function gradeCeilingWatch(maxScore: number, threshold: number): PropResult {
  return maxScore >= threshold ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 3: The Mercy Line
// ---------------------------------------------------------------------------

export interface MercyLinePrice {
  line: number;
}

/**
 * Prices the Mercy Line: the line is the week's biggest projected favorite's
 * projected margin, rounded onto the half-integer grid. Odds reuse the
 * house's flat spread juice (pricing.ts's SPREAD_ODDS): a margin-of-victory
 * bet is a spread bet in every way that matters to the vig, so it gets the
 * same one rather than a bespoke model.
 */
export function priceMercyLine(
  favoriteProjected: number,
  dogProjected: number,
): MercyLinePrice {
  return { line: toHalfInteger(Math.abs(favoriteProjected - dogProjected)) };
}

export const MERCY_LINE_OVER_ODDS = SPREAD_ODDS;
export const MERCY_LINE_UNDER_ODDS = SPREAD_ODDS;

/** Never a push: the line is always a half-integer. */
export function gradeMercyLine(actualMargin: number, line: number): PropResult {
  return actualMargin > line ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Finding the week's biggest projected favorite (feeds the Mercy Line)
// ---------------------------------------------------------------------------

export interface ProjectedPairing {
  matchupId: number;
  rosterA: string;
  rosterB: string;
  projA: number;
  projB: number;
}

export interface BiggestFavorite {
  matchupId: number;
  favoriteRosterId: string;
  dogRosterId: string;
  favoriteProjected: number;
  dogProjected: number;
}

/**
 * The week's most lopsided pairing by projected margin: what the Mercy Line
 * prices and what its card copy names as "the projected doormat". An exact
 * tie for the widest margin resolves to whichever pairing appeared first in
 * the input, a predictable choice for something this rare.
 */
export function findBiggestFavorite(
  pairings: ProjectedPairing[],
): BiggestFavorite | null {
  let best: BiggestFavorite | null = null;
  let bestMargin = -Infinity;

  for (const p of pairings) {
    const margin = Math.abs(p.projA - p.projB);
    if (margin <= bestMargin) continue;
    bestMargin = margin;
    best =
      p.projA >= p.projB
        ? {
            matchupId: p.matchupId,
            favoriteRosterId: p.rosterA,
            dogRosterId: p.rosterB,
            favoriteProjected: p.projA,
            dogProjected: p.projB,
          }
        : {
            matchupId: p.matchupId,
            favoriteRosterId: p.rosterB,
            dogRosterId: p.rosterA,
            favoriteProjected: p.projB,
            dogProjected: p.projA,
          };
  }

  return best;
}

// ---------------------------------------------------------------------------
// Prop 4: player over/unders
// ---------------------------------------------------------------------------

/**
 * Growth rate of ONE player's weekly scoring uncertainty with his projection,
 * same sigma = scale * sqrt(projection) shape as the team-level constant above.
 *
 * Educated guess, not a back-test: a single player's week is proportionally far
 * more volatile than a whole starting lineup's (one broken tackle is the
 * difference between 6 and 16), so the scale sits at half the team number
 * against a much smaller projection. It only moves a player prop's odds a few
 * points either side of even, because the line is the rounded projection, so
 * the cost of it being somewhat wrong is small. Worth recalibrating against
 * real player_week_points history once a season of it exists.
 */
export const PLAYER_UNCERTAINTY_SCALE = 1.05;

export interface OverUnderPrice {
  line: number;
  overOdds: number;
  underOdds: number;
}

function priceOverUnder(projected: number, scale: number): OverUnderPrice {
  const line = toHalfInteger(projected);
  const sigma = scale * Math.sqrt(Math.max(projected, 1));
  const probOver = 1 - normalCdf((line - projected) / sigma);
  return {
    line,
    overOdds: americanOdds(probOver),
    underOdds: americanOdds(1 - probOver),
  };
}

/**
 * Prices a single player's points prop. The line is his projection rounded onto
 * the half-integer grid, so the true probability sits within a point or two of
 * even; pricing that residual through americanOdds is what makes the rounding
 * honest instead of pretending both sides are -110.
 */
export function pricePlayerPoints(projected: number): OverUnderPrice {
  return priceOverUnder(projected, PLAYER_UNCERTAINTY_SCALE);
}

// ---------------------------------------------------------------------------
// Prop 5: team totals
// ---------------------------------------------------------------------------

/** One roster's own points O/U, priced off the team-level uncertainty scale. */
export function priceTeamTotal(projected: number): OverUnderPrice {
  return priceOverUnder(projected, SCORE_UNCERTAINTY_SCALE);
}

// ---------------------------------------------------------------------------
// Props 6 and 7: matchbets (player vs player, franchise vs franchise)
// ---------------------------------------------------------------------------

export interface MatchbetPrice {
  overOdds: number;
  underOdds: number;
}

/**
 * Prices "does A outscore B" from the difference of two Normals. `scale`
 * decides which flavour this is: PLAYER_UNCERTAINTY_SCALE for two players,
 * SCORE_UNCERTAINTY_SCALE for two rosters. "over" is always side A.
 */
export function priceMatchbet(
  projA: number,
  projB: number,
  scale: number,
): MatchbetPrice {
  const varA = (scale * Math.sqrt(Math.max(projA, 1))) ** 2;
  const varB = (scale * Math.sqrt(Math.max(projB, 1))) ** 2;
  const sd = Math.sqrt(varA + varB);
  const probA = normalCdf((projA - projB) / sd);
  return { overOdds: americanOdds(probA), underOdds: americanOdds(1 - probA) };
}

/**
 * A matchbet is settled by comparing two real scores, so an exact tie is a
 * genuine outcome and pushes. A hundredth of a point apart is not a tie.
 */
export function gradeMatchbet(pointsA: number, pointsB: number): PropResult {
  if (pointsA === pointsB) return "push";
  return pointsA > pointsB ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 8: the Blowout Special
// ---------------------------------------------------------------------------

export const DEFAULT_BLOWOUT_THRESHOLD = 40.5;

/**
 * The week's blowout threshold from the league's own history: the trailing
 * P90 of weekly matchup margins, rounded to the nearest 5 and then onto the
 * half-integer grid so the bet can never push. Falls back to 40.5 under the
 * same history minimum chooseCeilingThreshold uses.
 */
export function chooseBlowoutThreshold(historicalMargins: number[]): number {
  // toHalfInteger is idempotent on the 40.5 fallback, so the half-integer
  // guarantee holds on both branches without special-casing either.
  return toHalfInteger(
    choosePercentileThreshold(historicalMargins, 0.9, 5, DEFAULT_BLOWOUT_THRESHOLD),
  );
}

/** P(this pairing's margin, either direction, clears the threshold). */
function probMarginOverThreshold(p: ProjectedPairing, threshold: number): number {
  const varA = (SCORE_UNCERTAINTY_SCALE * Math.sqrt(Math.max(p.projA, 1))) ** 2;
  const varB = (SCORE_UNCERTAINTY_SCALE * Math.sqrt(Math.max(p.projB, 1))) ** 2;
  const sd = Math.sqrt(varA + varB);
  const mean = p.projA - p.projB;
  const above = 1 - normalCdf((threshold - mean) / sd);
  const below = normalCdf((-threshold - mean) / sd);
  return above + below;
}

/**
 * Prices "does ANY matchup this week finish outside the threshold", the same
 * any-of-N-independent-trials fold Ceiling Watch uses, with each pairing's
 * margin modelled as a Normal around its projected margin.
 */
export function priceBlowoutSpecial(
  pairings: ProjectedPairing[],
  threshold: number,
): MatchbetPrice {
  const probYes = probAnyOf(
    pairings.map((p) => probMarginOverThreshold(p, threshold)),
  );
  return {
    overOdds: americanOdds(probYes),
    underOdds: americanOdds(1 - probYes),
  };
}

/** YES ("over") when the week's largest margin clears the threshold. */
export function gradeBlowout(maxMargin: number, threshold: number): PropResult {
  return maxMargin > threshold ? "over" : "under";
}

// ---------------------------------------------------------------------------
// Prop 9: the Upset Special
// ---------------------------------------------------------------------------

// It has no pricer or grader of its own: the Upset Special IS a matchbet
// between the two sides of one matchup with the dog as side A, so it calls
// priceMatchbet / gradeMatchbet directly. Its subject comes from
// findBiggestFavorite, whose opponent is by definition the week's biggest dog,
// which is what stops it and the Mercy Line ever disagreeing about who the
// doormat is.

// ---------------------------------------------------------------------------
// Composite subject ids
// ---------------------------------------------------------------------------

/**
 * Matchbets and the Upset Special are ABOUT two things, and book_props stores
 * one subject_id. "~" is the join character because Sleeper player ids are
 * numeric strings, roster ids are numeric strings, and franchise ids are slugs;
 * none of them can contain it.
 */
export function encodePairSubject(a: string, b: string): string {
  return `${a}~${b}`;
}

/** The two halves of a composite subject id, or null on anything malformed. */
export function parsePairSubject(id: string | null): [string, string] | null {
  if (!id) return null;
  const parts = id.split("~");
  if (parts.length !== 2) return null;
  if (parts[0].length === 0 || parts[1].length === 0) return null;
  return [parts[0], parts[1]];
}

// ---------------------------------------------------------------------------
// Sticky subject selection
// ---------------------------------------------------------------------------

/**
 * Which subjects a kind should carry this week, given what is ALREADY posted.
 *
 * The whole point: repricing runs hourly and the natural key includes
 * subject_id, so if Thursday's projections promote a different player than
 * Tuesday's did, a naive regeneration inserts a new row and strands the old
 * one, which a member may already have picked. So every subject already posted
 * for the week is kept, in its existing order, and new candidates only ever
 * FILL up to the target. Nothing is deleted mid-week.
 *
 * That means the result can exceed `target` when more subjects are already
 * posted than the target allows (a target that shrank, a slate assembled under
 * older rules). Keeping a booked prop alive beats honoring the cap.
 */
export function selectStickySubjects(
  existingSubjectIds: string[],
  rankedCandidates: string[],
  target: number,
): string[] {
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const id of existingSubjectIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    chosen.push(id);
  }
  for (const id of rankedCandidates) {
    if (chosen.length >= target) break;
    if (seen.has(id)) continue;
    seen.add(id);
    chosen.push(id);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** "O/U 1,178.5" - thousands-separated, one decimal always shown. */
export function formatOverUnderLine(line: number): string {
  return `O/U ${formatPropNumber(line)}`;
}

/** "1,178.5" - thousands-separated, one decimal always shown. */
export function formatPropNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const YES_NO_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  "ceiling_watch",
  "blowout_special",
  "upset_special",
]);

/** The over/under button labels for one prop kind ("Over"/"Under" or "Yes"/"No"). */
export function propSideLabels(kind: PropKind): { over: string; under: string } {
  return YES_NO_KINDS.has(kind)
    ? { over: "Yes", under: "No" }
    : { over: "Over", under: "Under" };
}

/**
 * The line as the Props tab displays it. Yes/No kinds do not straddle a
 * number, so they say so, except the Blowout Special, whose threshold IS the
 * story and stays on the card.
 */
export function formatPropLine(kind: PropKind, line: number): string {
  if (kind === "blowout_special") return `${formatPropNumber(line)}+`;
  if (kind === "player_matchbet" || kind === "franchise_matchbet") {
    return "HEAD TO HEAD";
  }
  if (YES_NO_KINDS.has(kind)) return "YES / NO";
  return formatOverUnderLine(line);
}

/**
 * What actually happened, as the graded card says it out loud.
 *
 * The stored actual_value means something different per kind (a league total,
 * a single player's points, a signed head-to-head margin), so the sentence
 * that frames it belongs next to the graders that wrote it rather than in the
 * island, where it would drift.
 */
export function formatPropActual(
  kind: PropKind,
  actual: number,
  result: PropResult | null,
): string {
  switch (kind) {
    case "league_total":
      return `Landed ${formatPropNumber(actual)}`;
    case "ceiling_watch":
      return `High was ${formatPropNumber(actual)}`;
    case "mercy_line":
      return `Margin ${formatPropNumber(actual)}`;
    case "blowout_special":
      return `Biggest margin ${formatPropNumber(actual)}`;
    case "player_points":
    case "team_total":
      return `Scored ${formatPropNumber(actual)}`;
    case "player_matchbet":
    case "franchise_matchbet":
    case "upset_special":
      return result === "push"
        ? "Dead even"
        : `Decided by ${formatPropNumber(Math.abs(actual))}`;
  }
}

/** The small Geist unit printed beside the line, so the numeral is not floating. */
export function propLineUnit(kind: PropKind): string | null {
  switch (kind) {
    case "league_total":
    case "player_points":
    case "team_total":
    case "mercy_line":
      return "PTS";
    case "blowout_special":
      return "MARGIN";
    default:
      return null;
  }
}
