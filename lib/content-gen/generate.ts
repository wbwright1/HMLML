import { z } from "zod";
import type { HubContentInsert, HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext, StatsTeam } from "@/lib/content-gen/stats-context";
import {
  generateFromTemplates,
  kindsForSeason,
  type GeneratedContent,
} from "@/lib/content-gen/templates";
import { validateRow } from "@/lib/content-gen/validate";
import { verifyClaims, type Claim, type RankableMetric } from "@/lib/content-gen/claims";
import {
  extractAnchors,
  FRANCHISE_UNIQUE_KINDS,
  selectDiverseSubset,
  sharesPrimaryHook,
} from "@/lib/content-gen/dedupe";
import { phaseGuidance, resolveSeasonPhase } from "@/lib/content-gen/season-phase";

// ---------------------------------------------------------------------------
// LLM generation
// ---------------------------------------------------------------------------
// Single Claude request per run. The system prompt is the site-voice style
// guide; the user prompt is the StatsContext plus a strict JSON output spec.
// The response is Zod-validated (one retry on failure); on any failure at all
// (no API key, API error, invalid JSON twice) we fall back to the deterministic
// templates. Per the claude-api skill: @anthropic-ai/sdk, model from
// CONTENT_MODEL (default a current Sonnet-tier model), ANTHROPIC_API_KEY.

const DEFAULT_MODEL = "claude-sonnet-5";

// ---------------------------------------------------------------------------
// LLM call budget (this route runs behind maxDuration = 300 on Vercel)
// ---------------------------------------------------------------------------
// The function MUST NEVER 504: worst case it falls back to deterministic
// templates well inside the 300s budget. Two guards make that true by
// construction:
//  - PER_CALL_TIMEOUT_MS bounds a single messages.create so one stalled call
//    can't eat the whole budget (the SDK default is 10 minutes, which alone
//    exceeds maxDuration).
//  - LLM_DEADLINE_MS bounds the ENTIRE LLM attempt (both callOnce tries +
//    parsing) via an AbortController. On expiry the in-flight request is
//    aborted and the outer catch runs generateFromTemplates, leaving ~80s of
//    headroom before the 300s function limit.
const PER_CALL_TIMEOUT_MS = 100_000;
const LLM_DEADLINE_MS = 220_000;

// Real output is a handful of short editorial items. The largest shape
// (PreseasonSchema) worst-cases at roughly: 3 division_notes + 6
// burning_questions + 6 bold_predictions + 6 offseason_receipts + 1 hero_dek +
// 6 smack_posts, each body <= 400 chars. That is ~11K chars of JSON, on the
// order of ~3.5K output tokens. Thinking is disabled below (constraint-
// following generation; quality control happens in the downstream
// validate/diversity layers), so the entire budget goes to the JSON text
// itself. 8000 leaves comfortable headroom above the ~3.5K worst case while
// still keeping generation fast (the old 16000 cap invited needlessly long,
// budget-eating runs).
const MAX_OUTPUT_TOKENS = 8000;

const SYSTEM_PROMPT = `You are the Site Desk: the editorial voice of a 12-team dynasty fantasy football league history site. Your voice is confident and snarky, "the friend in the group chat who always has the receipts." You roast losses with the same care you celebrate wins.

Hard rules, no exceptions:
- NEVER use em-dashes. Use commas, semicolons, colons, parentheses, or separate sentences.
- Use ONLY the numbers, names, records, and head-to-head values present in the provided STATS JSON. Do not invent stats, scores, trades, injuries, or head-to-head history. If you do not have a number, do not imply one.
- Do not add real-world NFL biography or narrative absent from the STATS JSON: a player's career stage, rookie status, injury history, or team situation. Use only the names, positions, points, rounds, and records provided. This applies to transaction players too: you know only the name and the add/drop, never their position, depth-chart role, or career stage, so never call one "a backup", "a rookie", "quarterback insurance", or similar.
- You are the Site Desk. Smack posts are the site's own editorial voice about the field at large. NEVER put words in a real team's or member's mouth, and never impersonate a franchise.
- Reference teams by the exact names and slugs given, reproducing punctuation exactly. For any keyed field (divisionName, franchiseSlug, pairKey) use ONLY values that appear in the STATS JSON.
- Respect the SEASON PHASE block in the user message. Never claim a result that has not happened yet at that point in the calendar (a win, a division lead or title, a clinch, a championship), and never attribute a past title to a team the STATS JSON does not name as champion.
- Player attribution: name a player ONLY in connection with the franchise the STATS JSON attaches them to (their rosterProjections entry, their offseasonMoves draft/trade entry, or their weekInBooks entry). Never weave a player into a different franchise's storyline, and never name a player who does not appear in the STATS JSON at all.
- Keep each item to one or two punchy sentences. No preamble, no headings.

Output ONLY a single JSON object matching the requested shape. No prose before or after it.`;

// ---------------------------------------------------------------------------
// Response schemas (seasonal)
// ---------------------------------------------------------------------------

const VerdictSchema = z.enum(["LOCK", "NO", "UP", "DOWN"]);
const CategorySchema = z.enum(["DRAFT", "TRADE", "WAIVERS", "FIRE_SALE"]);

// ---------------------------------------------------------------------------
// Comparative/superlative claims (issue #110)
// ---------------------------------------------------------------------------
// Every row that frames a ranking/superlative must attach a Claim, which the
// LLM path (toRows*) then re-verifies against the StatsContext via
// verifyClaims. The STRICT ClaimSchema is the canonical shape (used for the
// prompt spec and the zodOutputFormat build check); the wire variant loosens
// metric/extreme to bare strings so a slightly-off claim can't nuke the whole
// parse (same relaxation rationale as the string .max() wire schemas below).
// A claim that doesn't check out just drops its one row.
const RankableMetricSchema = z.enum([
  "allTimeWinPct",
  "championships",
  "playoffAppearances",
  "projectedStartingPoints",
  "pointsFor",
  "wins",
]);
const ClaimSchema = z.object({
  metric: RankableMetricSchema,
  subject: z.string(),
  rank: z.number().int().positive().optional(),
  extreme: z.enum(["best", "worst"]).optional(),
  value: z.number().optional(),
});
const ClaimWireSchema = z.object({
  metric: z.string().default(""),
  subject: z.string().default(""),
  rank: z.number().optional(),
  extreme: z.string().optional(),
  value: z.number().optional(),
});

/** Normalizes wire/strict claim items (loosely typed as unknown) into verifiable Claim objects. */
function toClaims(raw: readonly unknown[]): Claim[] {
  const claims: Claim[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const c = item as { metric?: unknown; subject?: unknown; rank?: unknown; extreme?: unknown; value?: unknown };
    const claim: Claim = {
      metric: (typeof c.metric === "string" ? c.metric : "") as RankableMetric,
      subject: typeof c.subject === "string" ? c.subject : "",
    };
    if (typeof c.rank === "number" && Number.isFinite(c.rank)) claim.rank = c.rank;
    if (c.extreme === "best" || c.extreme === "worst") claim.extreme = c.extreme;
    if (typeof c.value === "number" && Number.isFinite(c.value)) claim.value = c.value;
    claims.push(claim);
  }
  return claims;
}

// Length caps: generous enough that on-spec output always passes, tight enough
// to reject a runaway model (which then falls back to templates). Bodies are
// one or two sentences; kickers are short labels; questions are one sentence.
// These are the CANONICAL per-field caps: they drive the prompt spec text
// (see preseasonSpec/regularSpec below), the strict schemas used for the
// build-check test, and validate.ts's per-row length enforcement. They are
// deliberately NOT sent to the model as a JSON Schema constraint (see the
// wire-schema note below) -- they're enforced after the fact, per row.
const BODY_MAX = 400;
const KICKER_MAX = 40;
const QUESTION_MAX = 200;
// A pairKey is two franchise slugs joined by "__" (matchupPairKey), echoed
// verbatim from the prompt's list, so it can far exceed KICKER_MAX; membership
// in the real pair set is enforced separately after parse.
const PAIR_KEY_MAX = 160;

// ---------------------------------------------------------------------------
// Strict vs. wire schemas
// ---------------------------------------------------------------------------
// zodOutputFormat() strips .max() string-length constraints from the JSON
// Schema actually sent to the API (the API doesn't support minLength/
// maxLength -- see the claude-api skill's Structured Outputs limitations),
// but STILL re-validates the parsed response against the full Zod schema
// client-side in messages.parse(). That client-side re-validation is
// whole-object: one field one character over its cap fails
// `.safeParse()` for the ENTIRE response, discarding every other otherwise-
// valid row in the same JSON object. Since the model routinely overshoots a
// soft length target by a few characters on exactly one item, this turned
// "one long burning question" into "zero content, fall back to templates"
// twice in a row in prod.
//
// The fix: build the request's output_config.format from a RELAXED "wire"
// schema (same shape, same enums, same array-count caps, but no .max() on
// any string) so parsing succeeds regardless of any single field's length.
// Length is then enforced per row, after parsing, by validateRow (called
// from applyDiversityLayer in generateContent) -- so a single overlong item
// costs exactly that one row, which fillMissingKinds/topUpShortKinds then
// backfills from the templates, instead of nuking the whole response.
//
// The STRICT schemas (PreseasonSchema/RegularSchema) remain the canonical
// shape definition: they're what the prompt spec is generated to match, and
// what the zodOutputFormat-builds-without-throwing test exercises. They are
// no longer what's sent to messages.parse().
function preseasonSchemaShape(
  bodyField: z.ZodString,
  kickerField: z.ZodString,
  questionField: z.ZodString,
  claimSchema: z.ZodTypeAny,
) {
  const claims = z.array(claimSchema).max(4).default([]);
  return z.object({
    division_notes: z
      .array(
        z.object({
          divisionName: z.string().max(KICKER_MAX),
          characterization: kickerField,
          body: bodyField,
          claims,
        }),
      )
      .max(3)
      .default([]),
    burning_questions: z.array(z.object({ text: questionField, claims })).max(6).default([]),
    bold_predictions: z
      .array(z.object({ kicker: kickerField, verdict: VerdictSchema, body: bodyField, claims }))
      .max(6)
      .default([]),
    offseason_receipts: z
      .array(
        z.object({
          franchiseSlug: z.string().max(KICKER_MAX),
          category: CategorySchema,
          body: bodyField,
          claims,
        }),
      )
      .max(6)
      .default([]),
    hero_dek: bodyField.default(""),
    smack_posts: z.array(z.object({ text: bodyField, claims })).max(6).default([]),
  });
}

function regularSchemaShape(bodyField: z.ZodString, claimSchema: z.ZodTypeAny) {
  const claims = z.array(claimSchema).max(4).default([]);
  return z.object({
    matchup_angles: z
      .array(z.object({ pairKey: z.string().max(PAIR_KEY_MAX), body: bodyField, claims }))
      .max(8)
      .default([]),
    game_of_week_blurb: bodyField.default(""),
    hero_dek: bodyField.default(""),
    smack_posts: z.array(z.object({ text: bodyField, claims })).max(6).default([]),
  });
}

// Every array below is over-generated relative to its display target: the
// model is asked for MORE candidates than the hub actually shows, so the
// diversity layer (validateRow + selectDiverseSubset, applied in
// generateContent below) has real room to pick a non-repeating subset
// instead of just truncating in model-output order. Display targets live in
// TARGET_COUNTS_BY_KIND further down.
export const PreseasonSchema = preseasonSchemaShape(
  z.string().max(BODY_MAX),
  z.string().max(KICKER_MAX),
  z.string().max(QUESTION_MAX),
  ClaimSchema,
);
export const RegularSchema = regularSchemaShape(z.string().max(BODY_MAX), ClaimSchema);

// Wire (relaxed) variants: identical shape, no per-string .max() and a loosened
// claim schema. Used only for the actual API request's output_config.format --
// see the note above.
export const PreseasonWireSchema = preseasonSchemaShape(
  z.string(),
  z.string(),
  z.string(),
  ClaimWireSchema,
);
export const RegularWireSchema = regularSchemaShape(z.string(), ClaimWireSchema);

type PreseasonOut = z.infer<typeof PreseasonWireSchema>;
type RegularOut = z.infer<typeof RegularWireSchema>;

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function noEmDash(s: string): string {
  // Defense in depth: strip any stray em/en dash the model slipped in.
  return s.replace(/\s*[—–]\s*/g, ", ");
}

const ZERO_RECORD = /^0-0(-0)?$/;

/**
 * The stats view the LLM actually sees. Before any game has been played, the
 * live-season standings fields are pure noise: every record is 0-0, points
 * are 0, and the "leader"/ordering is arbitrary. Shipping them invites the
 * model to narrate them as results (a claimed division winner at 0-0), so
 * rather than instructing around the temptation the prompt view removes it:
 * current-season records, points, leaders, and ordering are stripped, with an
 * explicit note in their place. Completed facts (lastSeason,
 * franchiseHistory, rosterProjections, offseasonMoves) pass through
 * untouched. Once a single game has been played, the view is the full
 * context, unchanged. Exported (pure) for unit tests.
 */
export function promptStatsView(ctx: StatsContext): unknown {
  const unplayed =
    ctx.leagueStandings.length > 0 &&
    ctx.leagueStandings.every((t) => ZERO_RECORD.test(t.record));
  if (!unplayed) return ctx;

  const bareTeam = (t: StatsTeam) => ({ name: t.name, slug: t.slug });
  return {
    ...ctx,
    statsNote:
      "No games have been played this season. Current-season records, points, leaders, and standings order do not exist yet and are omitted; team order carries no meaning.",
    divisions: ctx.divisions.map((d) => ({
      name: d.name,
      teams: d.teams.map(bareTeam),
    })),
    leagueStandings: ctx.leagueStandings.map(bareTeam),
    // This branch REBUILDS each matchup field by field, so anything added to
    // StatsMatchup has to be listed here too or the model silently loses it in
    // exactly the case (week 1, nothing played) where it matters most. The
    // stripped fields are only the current-season ones; head-to-head history,
    // the title rematch flag and the projected starter are completed or
    // forward-looking facts, and they are the ONLY receipts a week-1 angle has.
    currentMatchups: ctx.currentMatchups.map((m) => ({
      pairKey: m.pairKey,
      home: bareTeam(m.home),
      away: bareTeam(m.away),
      h2h: m.h2h,
      lastMeeting: m.lastMeeting,
      playoffMeetingYears: m.playoffMeetingYears,
      isTitleRematch: m.isTitleRematch,
      topProjected: m.topProjected,
    })),
  };
}

// The claims contract, shared by both specs. Backs the automated verifier in
// lib/content-gen/claims.ts: numbers must be copied verbatim from the STATS
// JSON, and every ranking/superlative must attach a machine-checkable claim or
// the row is dropped.
const CLAIMS_CONTRACT = `CLAIMS CONTRACT (enforced automatically; a violating row is dropped, so a violation shrinks your output):
- NUMBERS: every number in a body must appear VERBATIM in the STATS JSON. Never compute a new number (no sums, differences, averages, or "combined" totals), even if your arithmetic would be correct. If the exact figure is not in the STATS JSON, do not write it.
- CLAIMS: any comparative or superlative ("league-worst", "league-high", "highest", "lowest", "most", "fewest", "only", "dead last", "No. 1", "second-worst", "leads the league", "by a wide margin") MUST attach a claim object in that row's "claims" array. A claim is { "metric": one of ["allTimeWinPct","championships","playoffAppearances","projectedStartingPoints","pointsFor","wins"], "subject": the franchise slug, and one of: "extreme": "best"|"worst", OR "rank": 1-based integer, OR "value": the cited number }. The claim is re-verified by recomputing the FULL ordering from the STATS JSON; a false or off-by-one claim (e.g. calling the second-worst win rate "league-worst") drops the row.
- ALLOWED METRICS ONLY: those six. A superlative about anything the STATS JSON does not let you rank league-wide (a single player's point total, a transaction, a projection you cannot see for every team) is FORBIDDEN: write it without superlative framing, or cut it.
- BUDGET: do not use superlative wording you cannot back with a claim. Every distinct superlative marker in a body must be covered by a verified claim, or the whole row drops. When in doubt, state the plain fact without the superlative.`;

function preseasonSpec(ctx: StatsContext): string {
  const divisionNames = ctx.divisions.map((d) => d.name);
  const slugs = ctx.leagueStandings.map((t) => t.slug);
  return `This is PRESEASON/OFFSEASON content (season-scoped). Produce this exact JSON shape. Character budgets are HARD limits: a field over its budget gets that entire row discarded downstream (the response is not rejected, but that row is), so stay comfortably under, not right at, the number.
{
  "division_notes": [ { "divisionName": <one of ${JSON.stringify(divisionNames)}>, "characterization": "2-3 word vibe, under ${KICKER_MAX} characters", "body": "one snarky line, under ${BODY_MAX} characters", "claims": [] } ]  // one per division, up to 3
  "burning_questions": [ { "text": "question, under ${QUESTION_MAX} characters", "claims": [] }, ... ]  // 5 to 6, MORE than the ~3 that will ship: over-generate so a diverse subset can be picked
  "bold_predictions": [ { "kicker": "short label, under ${KICKER_MAX} characters", "verdict": "LOCK|NO|UP|DOWN", "body": "prediction, under ${BODY_MAX} characters", "claims": [] } ]  // 5 to 6, MORE than the ~4 that will ship. Each verdict must map to a real directional call about the upcoming season: LOCK = will happen, NO = will not happen, UP = will outperform its projection/rank, DOWN = will underperform. Never attach a verdict to a neutral observation (a tie, a truism, a scheduling fact); if it is not a genuine yes/no or over/under call, cut the row. The verdict must be falsifiable by a future season result: if the sentence concedes the outcome is already settled or unknowable ("exactly where a champ should sit", "the only question is whether..."), or states an affirmative expectation under a NO verdict, cut or re-verb the row.
  "offseason_receipts": [ { "franchiseSlug": <one of ${JSON.stringify(slugs)}>, "category": "DRAFT|TRADE|WAIVERS|FIRE_SALE", "body": "teaser, under ${BODY_MAX} characters", "claims": [] } ]  // 5 to 6, MORE than the ~4 that will ship
  "hero_dek": "one-sentence hero subhead for the preseason hub, under ${BODY_MAX} characters. Do NOT mention a specific number of days until kickoff; the live day count is added at render time.",
  "smack_posts": [ { "text": "site desk post, under ${BODY_MAX} characters", "claims": [] }, ... ]  // 5 to 6, MORE than the ~5 that will ship
}

${CLAIMS_CONTRACT}

DATA SOURCES (what each block is for):
- franchiseHistory: all-time record, championships, playoff appearances, seasons played, sustainedDoormat/sustainedContender multi-year flags. Use for all-time and multi-year framing; weigh a sustained multi-year slump more heavily than one bad season for doormat framing. If empty, never reference all-time records or trends.
- rosterProjections: each franchise's projected optimal starting-lineup total for the upcoming season, its league rank, and its top projected player. Use for "projects No. N" framing. If empty, never reference a projection, rank, or projected total.
- offseasonMoves: REAL draft picks (player, position, round, pick number) and REAL trades (acquired vs surrendered) per franchise. Every offseason_receipt MUST cite a real entry when the named franchise has one: name the actual player drafted (with position and round/pick) or the actual assets exchanged. Projection-only framing ("projects No. 1...") is allowed ONLY for a franchise with no offseasonMoves entries. When you state how many picks a franchise spent on a position, count only drafted players whose position field matches, and do not round up. Only call picks "consecutive" or "straight" if their pickNumber values are actually adjacent.
- recentTransactions carry NO franchise attribution. Never build an offseason_receipt from one (a receipt requires a franchiseSlug you cannot know from a transaction), and never guess which franchise made the move. Use them only inside smack_posts as unattributed, league-wide color.

GRADED CHECKLIST (violating rows are discarded downstream, so a violation shrinks your output):
1. Phase fit: every row obeys the SEASON PHASE rules above.
2. Player attribution: a named player must appear in the STATS JSON under the SAME franchise the row ties them to.
3. Comparatives and superlatives: before writing "league-high", "lowest", "most", "fewest", "only", "No. 1", or "by a wide margin", confirm it is true across the FULL relevant array in the STATS JSON. rosterProjections lists only each team's single top player, so you may say "the highest top-projected player in the league" but NEVER a "league-best" or "league-high" point total for a player; you cannot see full rosters. This bars "league-high", "league-best", "highest-scoring player", and "second only to [player]" applied to any player POINT TOTAL. WRONG: "Bijan's 324.9, second only to Josh Allen's league-high 361.5." RIGHT: "Josh Allen's 361.5 is the highest top-projected player total in the league" (a claim scoped to the topProjectedPlayer set). Rank team projectedStartingPoints totals freely; never rank players league-wide.
4. Distinct hooks: every row across every list has its own hook (its own franchise+number, or its own central player). Never restate the same fact in two rows, even across lists (a burning_question must not restate an offseason_receipt's fact).
5. Breadth: the 2-row cap counts EVERY row that identifies a franchise, whether by exact name or by an unambiguous description ("the reigning champion", "the league's worst win rate"), and division_notes count when they name or clearly point at a franchise. No franchise is the subject of more than 2 rows across the ENTIRE response; no player is named in more than 1 offseason_receipt. Touch as many different franchises, players, and positions as the real data supports. smack_posts are EXEMPT from this cap: a smack may name any franchise or player, including one already at its 2-row limit in the other lists, and smacks are encouraged to name a specific franchise or player so the roast has a real target (never impersonating one; you are the Site Desk). Do not let the cap force every smack into franchise-free league-wide color.`;
}

function regularSpec(ctx: StatsContext): string {
  const pairKeys = ctx.currentMatchups.map((m) => m.pairKey);
  const gotwClause = ctx.gameOfWeekPairKey
    ? `the featured Game of the Week, which is the matchup with pairKey ${JSON.stringify(ctx.gameOfWeekPairKey)}`
    : "the marquee matchup of the week";
  return `This is REGULAR SEASON content for week ${ctx.week} (week-scoped). Produce this exact JSON shape. Character budgets are HARD limits: a field over its budget gets that entire row discarded downstream (the response is not rejected, but that row is), so stay comfortably under, not right at, the number.
{
  "matchup_angles": [ { "pairKey": <one of ${JSON.stringify(pairKeys)}>, "body": "trash-talk angle for this matchup, under ${BODY_MAX} characters", "claims": [] } ]  // one per current matchup${
    ctx.week === 1
      ? `. WEEK 1: no team has a current-season record, so NEVER write one (a "0-0" line is an automatic rejection) and never call anyone hot, cold, or slumping. Each angle must hang on a real receipt from that matchup's own JSON: h2h (including its streak, written from the HOME team's perspective), lastMeeting, playoffMeetingYears, isTitleRematch, or topProjected. When h2h is all zeros and lastMeeting is null, say plainly that it is their first meeting; do not invent a rivalry. Every angle must have its OWN hook, so two cards never read the same`
      : ""
  }
  "game_of_week_blurb": "blurb for ${gotwClause}, under ${BODY_MAX} characters",
  "hero_dek": "one-sentence hero subhead for the week, under ${BODY_MAX} characters. Do NOT mention a specific number of days until kickoff; the live day count is added at render time.",
  "smack_posts": [ { "text": "site desk post, under ${BODY_MAX} characters", "claims": [] }, ... ]  // 5 to 6, MORE than the ~5 that will ship: over-generate so a diverse subset can be picked
}

${CLAIMS_CONTRACT}

GRADED CHECKLIST (violating rows are discarded downstream, so a violation shrinks your output):
1. Phase fit: every row obeys the SEASON PHASE rules above.
2. Player attribution: a named player must appear in the STATS JSON under the SAME franchise the row ties them to.
3. Comparatives and superlatives: before writing "league-high", "lowest", "most", "fewest", "only", or "No. 1", confirm it is true across the FULL relevant array in the STATS JSON; never extrapolate a superlative from a partial view of the data.
4. Distinct hooks: every row has its own hook (its own franchise+number, or its own central player). Never restate the same fact in two rows, even across matchup_angles and smack_posts.
5. Breadth: the 2-row cap counts EVERY row that identifies a franchise, by name or unambiguous description. No franchise is the subject of more than 2 rows total across the entire response.`;
}

// Exported for unit tests: the assembled prompt must carry the right phase
// guidance for the seasonType + week it was built from.
export function buildUserPrompt(ctx: StatsContext): string {
  const spec = ctx.seasonType === "regular" ? regularSpec(ctx) : preseasonSpec(ctx);
  const phase = resolveSeasonPhase(ctx.seasonType, ctx.week);
  const guidance = phaseGuidance(phase, ctx);
  return `STATS (the only facts you may use):\n${JSON.stringify(promptStatsView(ctx), null, 2)}\n\n${guidance}\n\n${spec}\n\nReturn only the JSON object.`;
}

// ---------------------------------------------------------------------------
// Conversion (validated LLM output -> DB rows)
// ---------------------------------------------------------------------------

// No `.slice(0, N)` truncation here: the Zod schema `.max()` above already
// bounds each array, and the FULL over-generated set is passed through to
// generateContent's diversity layer (validateRow + selectDiverseSubset),
// which is what actually trims to the display target. Per-field length is
// NOT enforced here either: `out` comes from the relaxed wire schema, so an
// overlong string can reach this function; validateRow (via
// applyDiversityLayer) is what drops that one row. Exported for unit tests.
export function toRowsPreseason(out: PreseasonOut, ctx: StatsContext): HubContentInsert[] {
  const validDivisions = new Set(ctx.divisions.map((d) => d.name));
  const validSlugs = new Set(ctx.leagueStandings.map((t) => t.slug));
  const dropForClaims = makeClaimDropper(ctx);
  const rows: HubContentInsert[] = [];

  for (const d of out.division_notes) {
    if (!validDivisions.has(d.divisionName) || !d.body.trim()) continue;
    if (dropForClaims(d.body, d.claims)) continue;
    rows.push({
      week: null,
      kind: "division_note",
      refKey: d.divisionName,
      body: noEmDash(d.body),
      extras: { characterization: noEmDash(d.characterization) },
    });
  }
  for (const q of out.burning_questions) {
    if (!q.text.trim()) continue;
    if (dropForClaims(q.text, q.claims)) continue;
    rows.push({ week: null, kind: "burning_question", refKey: null, body: noEmDash(q.text), extras: null });
  }
  for (const p of out.bold_predictions) {
    if (!p.body.trim() || !p.kicker.trim()) continue;
    if (dropForClaims(p.body, p.claims)) continue;
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: noEmDash(p.body),
      extras: { kicker: noEmDash(p.kicker), verdict: p.verdict },
    });
  }
  for (const r of out.offseason_receipts) {
    if (!validSlugs.has(r.franchiseSlug) || !r.body.trim()) continue;
    if (dropForClaims(r.body, r.claims)) continue;
    rows.push({
      week: null,
      kind: "offseason_receipt",
      refKey: r.franchiseSlug,
      body: noEmDash(r.body),
      extras: { category: r.category },
    });
  }
  if (out.hero_dek.trim() && !dropForClaims(out.hero_dek, [])) {
    rows.push({ week: null, kind: "hero_dek", refKey: null, body: noEmDash(out.hero_dek), extras: null });
  }
  for (const s of out.smack_posts) {
    if (!s.text.trim()) continue;
    if (dropForClaims(s.text, s.claims)) continue;
    rows.push({ week: null, kind: "smack_post", refKey: null, body: noEmDash(s.text), extras: null });
  }
  return rows;
}

function toRowsRegular(out: RegularOut, ctx: StatsContext): HubContentInsert[] {
  const validPairs = new Set(ctx.currentMatchups.map((m) => m.pairKey));
  const dropForClaims = makeClaimDropper(ctx);
  const rows: HubContentInsert[] = [];

  for (const a of out.matchup_angles) {
    if (!validPairs.has(a.pairKey) || !a.body.trim()) continue;
    if (dropForClaims(a.body, a.claims)) continue;
    rows.push({ week: ctx.week, kind: "matchup_angle", refKey: a.pairKey, body: noEmDash(a.body), extras: null });
  }
  if (out.game_of_week_blurb.trim() && !dropForClaims(out.game_of_week_blurb, [])) {
    rows.push({ week: ctx.week, kind: "game_of_week_blurb", refKey: null, body: noEmDash(out.game_of_week_blurb), extras: null });
  }
  if (out.hero_dek.trim() && !dropForClaims(out.hero_dek, [])) {
    rows.push({ week: ctx.week, kind: "hero_dek", refKey: null, body: noEmDash(out.hero_dek), extras: null });
  }
  for (const s of out.smack_posts) {
    if (!s.text.trim()) continue;
    if (dropForClaims(s.text, s.claims)) continue;
    rows.push({ week: ctx.week, kind: "smack_post", refKey: null, body: noEmDash(s.text), extras: null });
  }
  return rows;
}

/**
 * Builds the per-row claim gate for a context: returns true (DROP this row)
 * when the body's numbers/superlatives don't check out against the STATS via
 * verifyClaims. Dropping is safe: fillMissingKinds/topUpShortKinds backfill the
 * hole from the vetted deterministic templates.
 */
function makeClaimDropper(
  ctx: StatsContext,
): (body: string, rawClaims: readonly unknown[]) => boolean {
  return (body, rawClaims) => {
    const check = verifyClaims(body, toClaims(rawClaims ?? []), ctx);
    if (!check.ok) {
      console.warn(`[content-gen] dropped row: ${check.reason}`);
      return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Per-kind template fill
// ---------------------------------------------------------------------------

/**
 * Guarantees every kind in the run has content. For each kind the LLM produced
 * zero rows for (omitted entirely, or all its items failed validation), the
 * template rows for that kind are appended. Without this, replaceHubContent
 * would delete an omitted kind's previously-published rows and insert nothing,
 * blanking that hub module. Returns the merged rows plus the kinds that fell
 * back, for sync_log observability. Pure and unit-tested.
 */
export function fillMissingKinds(
  kinds: HubContentKind[],
  llmRows: HubContentInsert[],
  ctx: StatsContext,
): { rows: HubContentInsert[]; templateFilledKinds: HubContentKind[] } {
  const produced = new Set(llmRows.map((r) => r.kind));
  const missing = kinds.filter((k) => !produced.has(k));
  if (missing.length === 0) return { rows: llmRows, templateFilledKinds: [] };

  const missingSet = new Set<HubContentKind>(missing);
  const templateRows = generateFromTemplates(ctx).rows.filter((r) =>
    missingSet.has(r.kind),
  );
  return { rows: [...llmRows, ...templateRows], templateFilledKinds: missing };
}

/**
 * Display targets per kind, mirroring the caps generateFromTemplates uses
 * (lib/content-gen/templates.ts), so the LLM path and the template path ship
 * the same shape of content. matchup_angle's target is every current
 * matchup: unlike the other kinds, it must never be trimmed away.
 */
function targetCountsForSeason(ctx: StatsContext): Partial<Record<HubContentKind, number>> {
  if (ctx.seasonType === "regular") {
    return {
      matchup_angle: ctx.currentMatchups.length,
      game_of_week_blurb: 1,
      hero_dek: 1,
      smack_post: 5,
    };
  }
  if (ctx.seasonType === "off") {
    // Lightweight offseason set. trade_verdict is keep-all (one per trade),
    // never trimmed; the LLM path never produces verdicts, so fillMissingKinds
    // backfills them from the deterministic templates.
    return {
      offseason_receipt: 4,
      hero_dek: 1,
      smack_post: 3,
      trade_verdict: ctx.recentTrades.length,
    };
  }
  return {
    division_note: 3,
    burning_question: 3,
    bold_prediction: 6,
    offseason_receipt: 4,
    hero_dek: 1,
    smack_post: 5,
  };
}

/**
 * Validates raw LLM rows (dropping anything that fails validateRow: bad
 * refKey, bad enum, bad length, an em/en dash that slipped through, or a
 * possible hallucinated name) and then picks a diverse, non-repeating subset
 * per kind via selectDiverseSubset, using the same targets/caps the template
 * path uses. This is what makes the ANGLE-DIVERSITY MANDATE in the prompt an
 * enforced contract rather than a suggestion: even if the model restates a
 * fact across two lists, only one survives. Exported (pure) for unit tests.
 */
export function applyDiversityLayer(
  ctx: StatsContext,
  rows: HubContentInsert[],
): {
  rows: HubContentInsert[];
  invalidCount: number;
  diversityStats: { droppedCount: number; relaxedKinds: HubContentKind[] };
} {
  const validRows = rows.filter((r) => validateRow(r, ctx).valid);
  const invalidCount = rows.length - validRows.length;

  const byKind: Partial<Record<HubContentKind, HubContentInsert[]>> = {};
  for (const r of validRows) {
    (byKind[r.kind] ??= []).push(r);
  }

  const { kept, dropped, relaxedKinds } = selectDiverseSubset(byKind, ctx, {
    targetCountsByKind: targetCountsForSeason(ctx),
    kindPriority: Object.keys(byKind) as HubContentKind[],
    franchiseUniqueKinds: FRANCHISE_UNIQUE_KINDS,
  });
  return {
    rows: kept as HubContentInsert[],
    invalidCount,
    diversityStats: { droppedCount: invalidCount + dropped.length, relaxedKinds },
  };
}

/**
 * Tops up any kind that HAS some rows but falls short of its display target
 * (e.g. half its candidates were invalid or deduped away) with template
 * candidates for that same kind. A template candidate is skipped when its
 * refKey collides with a row already present for that kind, OR when it
 * shares a primary hook (same franchise + overlapping number, or same
 * central player, via sharesPrimaryHook) with ANY row already in the set:
 * without that second check a padded template row could restate a kept LLM
 * row's exact angle. Complements fillMissingKinds, which only handles a
 * kind with ZERO rows; this handles the "some but not enough" case so a
 * thin LLM kind doesn't ship under-filled when the deterministic templates
 * have more real material available. Exported (pure) for unit tests.
 */
export function topUpShortKinds(
  kinds: HubContentKind[],
  targets: Partial<Record<HubContentKind, number>>,
  rows: HubContentInsert[],
  ctx: StatsContext,
): HubContentInsert[] {
  const countByKind = new Map<HubContentKind, number>();
  for (const r of rows) countByKind.set(r.kind, (countByKind.get(r.kind) ?? 0) + 1);

  const result = [...rows];
  const resultAnchors = result.map((r) => extractAnchors(r, ctx));
  let templateAll: HubContentInsert[] | null = null;

  for (const kind of kinds) {
    const have = countByKind.get(kind) ?? 0;
    if (have === 0) continue; // fillMissingKinds owns the fully-empty case
    const target = targets[kind] ?? have;
    if (have >= target) continue;

    templateAll ??= generateFromTemplates(ctx).rows;
    const existingRefKeys = new Set(
      result.filter((r) => r.kind === kind).map((r) => r.refKey),
    );
    let added = 0;
    for (const candidate of templateAll) {
      if (candidate.kind !== kind) continue;
      if (have + added >= target) break;
      if (candidate.refKey != null && existingRefKeys.has(candidate.refKey)) continue;
      const candidateAnchors = extractAnchors(candidate, ctx);
      if (resultAnchors.some((a) => sharesPrimaryHook(candidateAnchors, a))) continue;
      result.push(candidate);
      resultAnchors.push(candidateAnchors);
      existingRefKeys.add(candidate.refKey);
      added++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Generates hub content via one Claude request, validated and converted to DB
 * rows. Falls back to generateFromTemplates on any failure (missing API key,
 * API error, JSON that fails validation twice). The returned GeneratedContent
 * carries `source` ("llm" or "template") so the cron can log which path ran.
 */
export async function generateContent(ctx: StatsContext): Promise<GeneratedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const kinds = kindsForSeason(ctx.seasonType);

  if (!apiKey) {
    return generateFromTemplates(ctx);
  }

  try {
    // Import lazily so the SDK is only loaded when the LLM path is actually used.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    // maxRetries: 1 is explicit so the SDK's default retry backoff can't add
    // hidden minutes to the budget; the deadline below is the real ceiling.
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const model = process.env.CONTENT_MODEL || DEFAULT_MODEL;
    const userPrompt = buildUserPrompt(ctx);

    // Bounds the WHOLE LLM attempt. On expiry the signal aborts any in-flight
    // messages.parse so the outer catch can run generateFromTemplates inside
    // the function's 300s budget instead of being killed by a 504.
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), LLM_DEADLINE_MS);

    // Captures the most recent response object for diagnostics, even when the
    // response was received but was unusable (early stop, no parsed output).
    // Reset at the top of every callOnce attempt so a failed attempt never
    // reports stale data from a prior one; stays undefined for a pure network
    // failure, where no response was ever received.
    let lastResponse:
      | { stop_reason?: string | null; usage?: unknown; content?: Array<{ type: string; text?: string }> }
      | undefined;

    const logLlmDiagnostics = (note: string): void => {
      const textBlock = lastResponse?.content?.find((b) => b.type === "text");
      console.warn("[content-gen] LLM diagnostic:", {
        model,
        note,
        stopReason: lastResponse?.stop_reason ?? null,
        usage: lastResponse?.usage ?? null,
        hadTextBlock: Boolean(textBlock),
        textPreview: textBlock?.text ? textBlock.text.slice(0, 500) : null,
      });
    };

    // Truncation/refusal proofing: a response that stopped early or produced
    // no parsed output must not silently ship partial/undefined content. Both
    // are treated as hard failures so the existing retry + template fallback
    // fires, the same as a thrown API error.
    function checkParsedOutput<T>(response: { stop_reason: string | null; parsed_output: T | null }): T {
      if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") {
        logLlmDiagnostics(`stop_reason=${response.stop_reason}`);
        throw new Error(`LLM response stopped early with stop_reason="${response.stop_reason}"`);
      }
      if (response.parsed_output == null) {
        logLlmDiagnostics("parsed_output missing");
        throw new Error("LLM response had no parsed_output");
      }
      return response.parsed_output;
    }

    const callOnce = async (): Promise<HubContentInsert[]> => {
      lastResponse = undefined;
      const requestOptions = { timeout: PER_CALL_TIMEOUT_MS, signal: deadline.signal };
      const baseParams = {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        // Constraint-following generation: structured outputs already enforce
        // the shape, and quality control happens in the downstream
        // validate/diversity layers, so thinking tokens would only eat into
        // MAX_OUTPUT_TOKENS without buying anything.
        thinking: { type: "disabled" as const },
        messages: [{ role: "user" as const, content: userPrompt }],
      };

      if (ctx.seasonType === "regular") {
        const response = await client.messages.parse(
          { ...baseParams, output_config: { format: zodOutputFormat(RegularWireSchema) } },
          requestOptions,
        );
        lastResponse = response;
        return toRowsRegular(checkParsedOutput(response), ctx);
      }
      const response = await client.messages.parse(
        { ...baseParams, output_config: { format: zodOutputFormat(PreseasonWireSchema) } },
        requestOptions,
      );
      lastResponse = response;
      return toRowsPreseason(checkParsedOutput(response), ctx);
    };

    let rows: HubContentInsert[];
    try {
      try {
        rows = await callOnce();
      } catch (firstError) {
        console.warn("[content-gen] LLM attempt 1 failed, retrying once:", firstError);
        try {
          rows = await callOnce();
        } catch (secondError) {
          logLlmDiagnostics("attempt 2 failed");
          console.warn("[content-gen] LLM attempt 2 failed, falling back to templates:", secondError);
          // Rethrow so the outer catch runs generateFromTemplates.
          throw secondError;
        }
      }
    } finally {
      clearTimeout(deadlineTimer);
    }

    // Diversity layer: validate every raw LLM row (refKey/enum/length/dash/
    // hallucination-guard) and pick a diverse, non-repeating subset per kind,
    // the same as the template path. This is where the over-generated
    // candidate pool actually gets trimmed to its display target.
    const { rows: diverseRows, invalidCount, diversityStats } = applyDiversityLayer(ctx, rows);
    if (invalidCount > 0) {
      console.warn(`[content-gen] dropped ${invalidCount} invalid LLM row(s) pre-selection`);
    }

    // Per-kind fill: any kind the LLM omitted (or that lost all its rows to
    // validation/dedup) is backfilled from the templates so no published kind
    // is deleted and left empty. A totally empty LLM response backfills every kind.
    const { rows: filledRows, templateFilledKinds } = fillMissingKinds(kinds, diverseRows, ctx);
    if (templateFilledKinds.length > 0) {
      console.warn(
        "[content-gen] template-filled kinds with no LLM rows:",
        templateFilledKinds.join(", "),
      );
    }

    // Per-row top-up: a kind that survived with SOME rows but fell short of
    // its display target (invalid rows dropped, or deduped away) gets padded
    // out with template candidates for that same kind, so a partially-thin
    // LLM kind doesn't ship visibly sparse when the templates have more real
    // material available.
    const toppedUpRows = topUpShortKinds(kinds, targetCountsForSeason(ctx), filledRows, ctx);
    return { kinds, rows: toppedUpRows, source: "llm", templateFilledKinds, diversityStats };
  } catch (e) {
    console.error("[content-gen] LLM path failed; using templates:", e);
    return generateFromTemplates(ctx);
  }
}
