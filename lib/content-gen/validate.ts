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

const VERDICTS = new Set(["LOCK", "NO", "UP", "DOWN"]);
const CATEGORIES = new Set(["DRAFT", "TRADE", "WAIVERS", "FIRE_SALE"]);

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
  // The generate-content route skips "post"/"off" entirely (kindsForSeason
  // maps them to no kinds), so no row is ever valid in those states.
  post: [],
  off: [],
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
  if (trimmed.length < BODY_MIN || trimmed.length > BODY_MAX) {
    return { valid: false, reason: `body length ${trimmed.length} outside [${BODY_MIN}, ${BODY_MAX}]` };
  }

  // The row's body is expected to have already been run through noEmDash by
  // the generator/caller; this asserts that actually held. A raw em/en dash
  // still present here means it slipped past cleanup (an LLM row that wasn't
  // scrubbed, or a template bug), and the row is rejected outright rather
  // than silently cleaned a second time.
  if (/[—–]/.test(row.body)) {
    return { valid: false, reason: "em/en dash present in body" };
  }

  const hallucinated = findHallucinatedNames(row.body, ctx);
  if (hallucinated.length > 0) {
    return { valid: false, reason: `possible hallucinated name(s): ${hallucinated.join(", ")}` };
  }

  return { valid: true };
}
