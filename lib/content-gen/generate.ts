import { z } from "zod";
import type { HubContentInsert, HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext } from "@/lib/content-gen/stats-context";
import {
  generateFromTemplates,
  kindsForSeason,
  type GeneratedContent,
} from "@/lib/content-gen/templates";
import { validateRow } from "@/lib/content-gen/validate";
import { selectDiverseSubset } from "@/lib/content-gen/dedupe";

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

const SYSTEM_PROMPT = `You are the Site Desk: the editorial voice of a 12-team dynasty fantasy football league history site. Your voice is confident and snarky, "the friend in the group chat who always has the receipts." You roast losses with the same care you celebrate wins.

Hard rules, no exceptions:
- NEVER use em-dashes. Use commas, semicolons, colons, parentheses, or separate sentences.
- Use ONLY the numbers, names, records, and head-to-head values present in the provided STATS JSON. Do not invent stats, scores, trades, injuries, or head-to-head history. If you do not have a number, do not imply one.
- You are the Site Desk. Smack posts are the site's own editorial voice about the field at large. NEVER put words in a real team's or member's mouth, and never impersonate a franchise.
- Reference teams by the exact names and slugs given. For any keyed field (divisionName, franchiseSlug, pairKey) use ONLY values that appear in the STATS JSON.
- Keep each item to one or two punchy sentences. No preamble, no headings.

Output ONLY a single JSON object matching the requested shape. No prose before or after it.`;

// ---------------------------------------------------------------------------
// Response schemas (seasonal)
// ---------------------------------------------------------------------------

const VerdictSchema = z.enum(["LOCK", "NO", "UP", "DOWN"]);
const CategorySchema = z.enum(["DRAFT", "TRADE", "WAIVERS", "FIRE_SALE"]);

// Length caps: generous enough that on-spec output always passes, tight enough
// to reject a runaway model (which then falls back to templates). Bodies are
// one or two sentences; kickers are short labels; questions are one sentence.
const BODY_MAX = 400;
const KICKER_MAX = 40;
const QUESTION_MAX = 200;

const bodyStr = z.string().max(BODY_MAX);
const kickerStr = z.string().max(KICKER_MAX);

// Every array below is over-generated relative to its display target: the
// model is asked for MORE candidates than the hub actually shows, so the
// diversity layer (validateRow + selectDiverseSubset, applied in
// generateContent below) has real room to pick a non-repeating subset
// instead of just truncating in model-output order. Display targets live in
// TARGET_COUNTS_BY_KIND further down.
const PreseasonSchema = z.object({
  division_notes: z
    .array(
      z.object({
        divisionName: z.string().max(KICKER_MAX),
        characterization: kickerStr,
        body: bodyStr,
      }),
    )
    .max(3)
    .default([]),
  burning_questions: z.array(z.string().max(QUESTION_MAX)).max(6).default([]),
  bold_predictions: z
    .array(z.object({ kicker: kickerStr, verdict: VerdictSchema, body: bodyStr }))
    .max(6)
    .default([]),
  offseason_receipts: z
    .array(
      z.object({
        franchiseSlug: z.string().max(KICKER_MAX),
        category: CategorySchema,
        body: bodyStr,
      }),
    )
    .max(6)
    .default([]),
  hero_dek: bodyStr.default(""),
  smack_posts: z.array(bodyStr).max(6).default([]),
});

const RegularSchema = z.object({
  matchup_angles: z
    .array(z.object({ pairKey: z.string().max(KICKER_MAX), body: bodyStr }))
    .max(8)
    .default([]),
  game_of_week_blurb: bodyStr.default(""),
  hero_dek: bodyStr.default(""),
  smack_posts: z.array(bodyStr).max(6).default([]),
});

type PreseasonOut = z.infer<typeof PreseasonSchema>;
type RegularOut = z.infer<typeof RegularSchema>;

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function noEmDash(s: string): string {
  // Defense in depth: strip any stray em/en dash the model slipped in.
  return s.replace(/\s*[—–]\s*/g, ", ");
}

function preseasonSpec(ctx: StatsContext): string {
  const divisionNames = ctx.divisions.map((d) => d.name);
  const slugs = ctx.leagueStandings.map((t) => t.slug);
  return `This is PRESEASON/OFFSEASON content (season-scoped). Produce this exact JSON shape:
{
  "division_notes": [ { "divisionName": <one of ${JSON.stringify(divisionNames)}>, "characterization": "2-3 word vibe", "body": "one snarky line" } ]  // one per division, up to 3
  "burning_questions": [ "question", ... ]  // 5 to 6, MORE than the ~3 that will ship: over-generate so a diverse subset can be picked
  "bold_predictions": [ { "kicker": "short label", "verdict": "LOCK|NO|UP|DOWN", "body": "prediction" } ]  // 5 to 6, MORE than the ~4 that will ship
  "offseason_receipts": [ { "franchiseSlug": <one of ${JSON.stringify(slugs)}>, "category": "DRAFT|TRADE|WAIVERS|FIRE_SALE", "body": "teaser" } ]  // 5 to 6, MORE than the ~4 that will ship
  "hero_dek": "one-sentence hero subhead for the preseason hub. Do NOT mention a specific number of days until kickoff; the live day count is added at render time.",
  "smack_posts": [ "site desk post", ... ]  // 5 to 6, MORE than the ~5 that will ship
}

The STATS JSON also includes franchiseHistory (all-time record, championships, playoff appearances, seasons played, and sustainedDoormat/sustainedContender multi-year trend flags), rosterProjections (each franchise's projected optimal starting-lineup total for the upcoming season, its league rank, and its top projected player), plus projectionSeason, AND offseasonMoves: real draft picks (player name, position, round, pick number, projected points) and real offseason trades (acquired vs surrendered players/picks) per franchise. You may cite franchiseHistory and rosterProjections for all-time records, multi-year trends, and projected ranks/totals. Weigh sustained multi-year futility more heavily than a single bad season when deciding who earns the doormat framing. When rosterProjections is empty, do not reference any projection, rank, or projected total; when franchiseHistory is empty, do not reference all-time records or multi-year trends.

OFFSEASON RECEIPTS MUST CITE offseasonMoves WHEN AVAILABLE: name the actual player drafted (with position and round/pick number) or the actual players/picks traded, for the franchise named. Only fall back to projection-only framing ("projects No. 1...") for a franchise with no entries in offseasonMoves.

ANGLE-DIVERSITY MANDATE (this is graded): every single row across every list must have its own distinct hook, meaning its own franchise+number or its own central player; do not restate the same fact (same franchise, same number, or same player) in two different rows, even across different lists (e.g. a burning_question must NOT restate an offseason_receipt or bold_prediction's exact fact). No franchise should be the subject of more than 2 rows total across the ENTIRE response. No player should be named in more than 1 offseason_receipt. Prefer breadth: touch as many different franchises, players, and positions as the real data supports, rather than fixating on one or two teams.`;
}

function regularSpec(ctx: StatsContext): string {
  const pairKeys = ctx.currentMatchups.map((m) => m.pairKey);
  const gotwClause = ctx.gameOfWeekPairKey
    ? `the featured Game of the Week, which is the matchup with pairKey ${JSON.stringify(ctx.gameOfWeekPairKey)}`
    : "the marquee matchup of the week";
  return `This is REGULAR SEASON content for week ${ctx.week} (week-scoped). Produce this exact JSON shape:
{
  "matchup_angles": [ { "pairKey": <one of ${JSON.stringify(pairKeys)}>, "body": "trash-talk angle for this matchup" } ]  // one per current matchup
  "game_of_week_blurb": "blurb for ${gotwClause}",
  "hero_dek": "one-sentence hero subhead for the week. Do NOT mention a specific number of days until kickoff; the live day count is added at render time.",
  "smack_posts": [ "site desk post", ... ]  // 5 to 6, MORE than the ~5 that will ship: over-generate so a diverse subset can be picked
}

ANGLE-DIVERSITY MANDATE (this is graded): every row must have its own distinct hook (its own franchise+number or its own central player); do not restate the same fact in two different rows, even across matchup_angles and smack_posts. No franchise should be the subject of more than 2 rows total across the entire response.`;
}

function buildUserPrompt(ctx: StatsContext): string {
  const spec = ctx.seasonType === "regular" ? regularSpec(ctx) : preseasonSpec(ctx);
  return `STATS (the only facts you may use):\n${JSON.stringify(ctx, null, 2)}\n\n${spec}\n\nReturn only the JSON object.`;
}

// ---------------------------------------------------------------------------
// Conversion (validated LLM output -> DB rows)
// ---------------------------------------------------------------------------

// No `.slice(0, N)` truncation here: the Zod schema `.max()` above already
// bounds each array, and the FULL over-generated set is passed through to
// generateContent's diversity layer (validateRow + selectDiverseSubset),
// which is what actually trims to the display target.
function toRowsPreseason(out: PreseasonOut, ctx: StatsContext): HubContentInsert[] {
  const validDivisions = new Set(ctx.divisions.map((d) => d.name));
  const validSlugs = new Set(ctx.leagueStandings.map((t) => t.slug));
  const rows: HubContentInsert[] = [];

  for (const d of out.division_notes) {
    if (!validDivisions.has(d.divisionName) || !d.body.trim()) continue;
    rows.push({
      week: null,
      kind: "division_note",
      refKey: d.divisionName,
      body: noEmDash(d.body),
      extras: { characterization: noEmDash(d.characterization) },
    });
  }
  for (const q of out.burning_questions) {
    if (q.trim()) rows.push({ week: null, kind: "burning_question", refKey: null, body: noEmDash(q), extras: null });
  }
  for (const p of out.bold_predictions) {
    if (!p.body.trim() || !p.kicker.trim()) continue;
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
    rows.push({
      week: null,
      kind: "offseason_receipt",
      refKey: r.franchiseSlug,
      body: noEmDash(r.body),
      extras: { category: r.category },
    });
  }
  if (out.hero_dek.trim()) {
    rows.push({ week: null, kind: "hero_dek", refKey: null, body: noEmDash(out.hero_dek), extras: null });
  }
  for (const s of out.smack_posts) {
    if (s.trim()) rows.push({ week: null, kind: "smack_post", refKey: null, body: noEmDash(s), extras: null });
  }
  return rows;
}

function toRowsRegular(out: RegularOut, ctx: StatsContext): HubContentInsert[] {
  const validPairs = new Set(ctx.currentMatchups.map((m) => m.pairKey));
  const rows: HubContentInsert[] = [];

  for (const a of out.matchup_angles) {
    if (!validPairs.has(a.pairKey) || !a.body.trim()) continue;
    rows.push({ week: ctx.week, kind: "matchup_angle", refKey: a.pairKey, body: noEmDash(a.body), extras: null });
  }
  if (out.game_of_week_blurb.trim()) {
    rows.push({ week: ctx.week, kind: "game_of_week_blurb", refKey: null, body: noEmDash(out.game_of_week_blurb), extras: null });
  }
  if (out.hero_dek.trim()) {
    rows.push({ week: ctx.week, kind: "hero_dek", refKey: null, body: noEmDash(out.hero_dek), extras: null });
  }
  for (const s of out.smack_posts) {
    if (s.trim()) rows.push({ week: ctx.week, kind: "smack_post", refKey: null, body: noEmDash(s), extras: null });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// JSON extraction + parse
// ---------------------------------------------------------------------------

/** Pulls the first balanced top-level JSON object out of the model's text. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object in response");
  }
  return JSON.parse(text.slice(start, end + 1));
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
 * fact across two lists, only one survives.
 */
function applyDiversityLayer(
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
 * candidates for that same kind, skipping any template candidate whose
 * refKey collides with a row already present. Complements fillMissingKinds,
 * which only handles a kind with ZERO rows; this handles the "some but not
 * enough" case so a thin LLM kind doesn't ship under-filled when the
 * deterministic templates have more real material available.
 */
function topUpShortKinds(
  kinds: HubContentKind[],
  targets: Partial<Record<HubContentKind, number>>,
  rows: HubContentInsert[],
  ctx: StatsContext,
): HubContentInsert[] {
  const countByKind = new Map<HubContentKind, number>();
  for (const r of rows) countByKind.set(r.kind, (countByKind.get(r.kind) ?? 0) + 1);

  const result = [...rows];
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
      result.push(candidate);
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
    const client = new Anthropic({ apiKey });
    const model = process.env.CONTENT_MODEL || DEFAULT_MODEL;
    const userPrompt = buildUserPrompt(ctx);

    const callOnce = async (): Promise<HubContentInsert[]> => {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      const parsed = extractJson(text);
      if (ctx.seasonType === "regular") {
        return toRowsRegular(RegularSchema.parse(parsed), ctx);
      }
      return toRowsPreseason(PreseasonSchema.parse(parsed), ctx);
    };

    let rows: HubContentInsert[];
    try {
      rows = await callOnce();
    } catch (firstError) {
      console.warn("[content-gen] LLM output invalid, retrying once:", firstError);
      rows = await callOnce();
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
