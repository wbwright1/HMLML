import { HUB_CONTENT_KINDS, type HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext } from "@/lib/content-gen/stats-context";

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------
// A single, pure gate every generated row (LLM or template) passes through
// before it can ship: right kind for the season, a refKey that actually
// resolves to something real, enum-valid extras, sane lengths, no em/en
// dashes, and (for LLM output especially) no invented capitalized names that
// don't trace back to a real franchise/division/player in the STATS context.

export const BODY_MIN = 24;
export const BODY_MAX = 400;
const KICKER_MAX = 40;
export const QUESTION_MAX = 200;

const VERDICTS = new Set(["LOCK", "NO", "UP", "DOWN"]);
const CATEGORIES = new Set(["DRAFT", "TRADE", "WAIVERS", "FIRE_SALE"]);

// burning_question has its own, tighter cap than the generic body range (one
// sentence, not one-or-two): mirrors generate.ts's QUESTION_MAX. Every other
// kind uses the generic [BODY_MIN, BODY_MAX] range checked below. This map
// only needs to override the MAX side; nothing currently needs a tighter min.
const BODY_MAX_BY_KIND: Partial<Record<HubContentKind, number>> = {
  burning_question: QUESTION_MAX,
};

// Kept independent of templates.ts's kindsForSeason to avoid a
// validate.ts <-> templates.ts circular import (templates.ts routes its
// output through validateRow). The set of kinds per season type is the same
// contract kindsForSeason encodes; if that set ever changes, update both.
const KINDS_BY_SEASON: Record<string, HubContentKind[]> = {
  pre: [
    "division_note",
    "burning_question",
    "bold_prediction",
    "offseason_receipt",
    "hero_dek",
    "smack_post",
  ],
  regular: ["matchup_angle", "game_of_week_blurb", "hero_dek", "smack_post"],
  // Offseason is a lightweight, activity-gated pass (see kindsForSeason("off")):
  // season-scoped receipts/dek/smack plus per-trade verdicts.
  off: ["offseason_receipt", "hero_dek", "smack_post", "trade_verdict"],
  // The generate-content route skips "post" (the playoffs) entirely
  // (kindsForSeason maps it to no kinds), so no row is ever valid there.
  post: [],
};

export interface ValidatableRow {
  kind: HubContentKind;
  refKey: string | null;
  body: string;
  extras: Record<string, unknown> | null;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Defense in depth: strip any stray em/en dash. Mirrors generate.ts's noEmDash. */
export function noEmDash(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ");
}

// ---------------------------------------------------------------------------
// Name-hallucination guard
// ---------------------------------------------------------------------------

// Multi-word capitalized phrases that show up in legitimate copy but aren't
// franchise/division/player names. Conservative and short on purpose: the
// guard is built to under-block, not over-block.
const COMMON_ALLOWLIST = new Set([
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Labor Day", "Memorial Day", "New Year", "New Year's",
  "Week One", "Week Zero", "Site Desk", "Group Chat",
]);

function knownNames(ctx: StatsContext): string[] {
  const names = new Set<string>();
  for (const t of ctx.leagueStandings) names.add(t.name);
  for (const d of ctx.divisions) names.add(d.name);
  for (const p of ctx.rosterProjections) {
    if (p.topProjectedPlayer) names.add(p.topProjectedPlayer.name);
  }
  for (const m of ctx.offseasonMoves ?? []) {
    for (const dp of m.draftedPlayers) names.add(dp.playerName);
    for (const tr of m.trades) {
      for (const n of tr.acquired.players) names.add(n);
      for (const n of tr.surrendered.players) names.add(n);
    }
  }
  for (const t of ctx.recentTrades ?? []) {
    for (const side of t.sides) {
      if (side.franchiseName) names.add(side.franchiseName);
      for (const p of side.players) names.add(p.name);
    }
  }
  if (ctx.lastSeason) {
    if (ctx.lastSeason.champion) names.add(ctx.lastSeason.champion.name);
    if (ctx.lastSeason.doormat) names.add(ctx.lastSeason.doormat.name);
    if (ctx.lastSeason.pointMachine) names.add(ctx.lastSeason.pointMachine.name);
  }
  for (const m of ctx.currentMatchups) {
    names.add(m.home.name);
    names.add(m.away.name);
  }
  if (ctx.weekInBooks?.playerOfWeek) names.add(ctx.weekInBooks.playerOfWeek.name);
  if (ctx.weekInBooks?.dudStarter) names.add(ctx.weekInBooks.dudStarter.name);
  if (ctx.weekInBooks?.highestScorer) names.add(ctx.weekInBooks.highestScorer.franchiseName);
  if (ctx.weekInBooks?.lowestScorer) names.add(ctx.weekInBooks.lowestScorer.franchiseName);
  return [...names].filter(Boolean);
}

/**
 * Finds capitalized multi-word sequences (candidate proper nouns) in the body
 * that don't trace back to any known name in the STATS context, and aren't a
 * common non-name phrase (month/day names, "Labor Day", etc). A match is
 * considered "known" if it is a substring of a known name, or a known name is
 * a substring of it (handles the model appending/prepending an extra word).
 * Conservative by design: prefers under-blocking a real name over
 * over-blocking a hallucination.
 */
export function findHallucinatedNames(body: string, ctx: StatsContext): string[] {
  const names = knownNames(ctx);
  // Word chars deliberately exclude ".": including it let a sentence-ending
  // period fuse onto the next sentence's capitalized word (e.g. "Labor Day."
  // + "All-in" read as one bogus match "Labor Day. All-in").
  const matches = body.match(/\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)+\b/g) ?? [];
  const flagged: string[] = [];
  for (const m of matches) {
    if (COMMON_ALLOWLIST.has(m)) continue;
    const known = names.some((n) => n && (n.includes(m) || m.includes(n)));
    if (!known) flagged.push(m);
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// Position-claim guard
// ---------------------------------------------------------------------------
// Catches copy that mislabels a player's position ("four-pick receiver haul"
// listing two RBs). Deliberately conservative, two narrow patterns only:
//  1. A position label directly attached to a known player ("receiver Nick
//     Singleton", "Nick Singleton (WR)") must match that player's stored
//     position.
//  2. A sentence with exactly ONE position term and an adjacent comma-list of
//     two or more known players ("receiver haul (A, B, C, D)") requires every
//     listed player to match that position.
// Anything more ambiguous (multiple position terms, players scattered through
// the sentence, unknown players) is skipped: under-block, never over-block.

const POSITION_TERMS: Array<{ pos: string; re: RegExp }> = [
  { pos: "QB", re: /\bQBs?\d?\b|\bquarterbacks?\b/i },
  { pos: "RB", re: /\bRBs?\d?\b|\brunning ?backs?\b/i },
  { pos: "WR", re: /\bWRs?\d?\b|\bwide receivers?\b|\breceivers?\b|\bwideouts?\b/i },
  { pos: "TE", re: /\bTEs?\d?\b|\btight ends?\b/i },
];

const LABEL_WORD_TO_POS: Array<{ pos: string; re: string }> = [
  { pos: "QB", re: "QB\\d?|quarterback" },
  { pos: "RB", re: "RB\\d?|running ?back" },
  { pos: "WR", re: "WR\\d?|wide receiver|receiver|wideout" },
  { pos: "TE", re: "TE\\d?|tight end" },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every player name in the context whose position is known. */
function knownPlayerPositions(ctx: StatsContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of ctx.offseasonMoves ?? []) {
    for (const dp of m.draftedPlayers) {
      if (dp.position) map.set(dp.playerName, dp.position);
    }
  }
  for (const p of ctx.rosterProjections) {
    if (p.topProjectedPlayer?.position) {
      map.set(p.topProjectedPlayer.name, p.topProjectedPlayer.position);
    }
  }
  if (ctx.weekInBooks?.playerOfWeek?.position) {
    map.set(ctx.weekInBooks.playerOfWeek.name, ctx.weekInBooks.playerOfWeek.position);
  }
  if (ctx.weekInBooks?.dudStarter?.position) {
    map.set(ctx.weekInBooks.dudStarter.name, ctx.weekInBooks.dudStarter.position);
  }
  return map;
}

/**
 * Finds position labels in the body that contradict a known player's stored
 * position. Returns human-readable mismatch descriptions (empty = clean).
 * Pure; exported for unit tests.
 */
export function findPositionMismatches(body: string, ctx: StatsContext): string[] {
  const positions = knownPlayerPositions(ctx);
  if (positions.size === 0) return [];
  const flagged: string[] = [];

  // Pattern 1: label directly attached to a name, either "label Name" or
  // "Name (LABEL" — the tightest possible attribution.
  for (const [name, actual] of positions) {
    if (!body.includes(name)) continue;
    for (const { pos, re } of LABEL_WORD_TO_POS) {
      if (pos === actual) continue;
      const before = new RegExp(`\\b(?:${re})\\s+${escapeRegExp(name)}`, "i");
      const after = new RegExp(`${escapeRegExp(name)}\\s*\\(\\s*(?:${re})\\b`, "i");
      if (before.test(body) || after.test(body)) {
        flagged.push(`${name} labeled ${pos} but is ${actual}`);
      }
    }
  }

  // Pattern 2: one position term + an adjacent list of >=2 known players in
  // the same sentence -> every listed player must hold that position.
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    const terms = POSITION_TERMS.filter((t) => t.re.test(sentence));
    if (terms.length !== 1) continue;
    const claimed = terms[0].pos;

    // Locate known names and group consecutive ones (separated only by
    // commas/"and"/parens) into list runs.
    const hits: Array<{ name: string; start: number; end: number }> = [];
    for (const name of positions.keys()) {
      const idx = sentence.indexOf(name);
      if (idx !== -1) hits.push({ name, start: idx, end: idx + name.length });
    }
    hits.sort((a, b) => a.start - b.start);
    let run: string[] = [];
    const runs: string[][] = [];
    for (let i = 0; i < hits.length; i++) {
      if (run.length === 0) {
        run = [hits[i].name];
      } else {
        const gap = sentence.slice(hits[i - 1].end, hits[i].start);
        if (/^[\s,()]*(?:and\s+)?$/.test(gap)) {
          run.push(hits[i].name);
        } else {
          runs.push(run);
          run = [hits[i].name];
        }
      }
    }
    if (run.length > 0) runs.push(run);

    for (const listRun of runs) {
      if (listRun.length < 2) continue;
      for (const name of listRun) {
        const actual = positions.get(name);
        if (actual && actual !== claimed) {
          flagged.push(`${name} listed under ${claimed} but is ${actual}`);
        }
      }
    }
  }

  return [...new Set(flagged)];
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

function refKeyValid(row: ValidatableRow, ctx: StatsContext): boolean {
  switch (row.kind) {
    case "division_note":
      return row.refKey != null && ctx.divisions.some((d) => d.name === row.refKey);
    case "offseason_receipt":
      return row.refKey != null && ctx.leagueStandings.some((t) => t.slug === row.refKey);
    case "matchup_angle":
      return row.refKey != null && ctx.currentMatchups.some((m) => m.pairKey === row.refKey);
    case "trade_verdict":
      // refKey is the trade's transaction id; it must resolve to a real recent trade.
      return row.refKey != null && ctx.recentTrades.some((t) => String(t.id) === row.refKey);
    case "burning_question":
    case "bold_prediction":
    case "hero_dek":
    case "smack_post":
    case "game_of_week_blurb":
      return row.refKey == null;
    default:
      return false;
  }
}

function extrasValid(row: ValidatableRow): boolean {
  const extras = row.extras;
  if (row.kind === "bold_prediction") {
    if (!extras || typeof extras.kicker !== "string" || !extras.kicker.trim()) return false;
    if (extras.kicker.length > KICKER_MAX) return false;
    if (!VERDICTS.has(String(extras.verdict))) return false;
    return true;
  }
  if (row.kind === "offseason_receipt") {
    if (!extras || !CATEGORIES.has(String(extras.category))) return false;
    return true;
  }
  if (row.kind === "division_note") {
    if (!extras || typeof extras.characterization !== "string" || !extras.characterization.trim()) {
      return false;
    }
    if (extras.characterization.length > KICKER_MAX) return false;
    return true;
  }
  return true; // other kinds carry no extras contract
}

/**
 * Validates a single generated row (LLM or template output) against the
 * STATS context. Pure: no DB, no network. Returns the first failure reason
 * found; callers that want every failure should call this per-row (it always
 * has been, one row at a time) rather than expecting a multi-error report.
 */
export function validateRow(row: ValidatableRow, ctx: StatsContext): ValidationResult {
  if (!HUB_CONTENT_KINDS.includes(row.kind)) {
    return { valid: false, reason: `unknown kind: ${row.kind}` };
  }
  const allowedKinds = KINDS_BY_SEASON[ctx.seasonType] ?? [];
  if (!allowedKinds.includes(row.kind)) {
    return { valid: false, reason: `kind ${row.kind} not valid for seasonType ${ctx.seasonType}` };
  }
  if (!refKeyValid(row, ctx)) {
    return { valid: false, reason: `refKey does not resolve for kind ${row.kind}: ${row.refKey}` };
  }
  if (!extrasValid(row)) {
    return { valid: false, reason: `extras invalid for kind ${row.kind}` };
  }

  const trimmed = row.body.trim();
  const bodyMax = BODY_MAX_BY_KIND[row.kind] ?? BODY_MAX;
  if (trimmed.length < BODY_MIN || trimmed.length > bodyMax) {
    return { valid: false, reason: `body length ${trimmed.length} outside [${BODY_MIN}, ${bodyMax}]` };
  }

  // The row's body is expected to have already been run through noEmDash by
  // the generator/caller; this asserts that actually held. A raw em/en dash
  // still present here means it slipped past cleanup (an LLM row that wasn't
  // scrubbed, or a template bug), and the row is rejected outright rather
  // than silently cleaned a second time.
  if (/[—–]/.test(row.body)) {
    return { valid: false, reason: "em/en dash present in body" };
  }

  // A "0-0" in a matchup angle is always the absence of a fact dressed up as
  // one: at week 1 nobody has played, and from week 2 on nobody is 0-0 (they
  // are 0-1, 0-2, ...). The deterministic builder cannot emit it; this stops
  // the LLM path from reintroducing it behind the builder's back.
  if (row.kind === "matchup_angle" && /\b0-0\b/.test(row.body)) {
    return { valid: false, reason: "matchup angle cites a 0-0 record" };
  }

  const hallucinated = findHallucinatedNames(row.body, ctx);
  if (hallucinated.length > 0) {
    return { valid: false, reason: `possible hallucinated name(s): ${hallucinated.join(", ")}` };
  }

  const positionMismatches = findPositionMismatches(row.body, ctx);
  if (positionMismatches.length > 0) {
    return { valid: false, reason: `position mismatch: ${positionMismatches.join("; ")}` };
  }

  return { valid: true };
}
