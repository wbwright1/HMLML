import { z } from "zod";
import type { HubContentInsert, HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext } from "@/lib/content-gen/stats-context";
import {
  generateFromTemplates,
  kindsForSeason,
  type GeneratedContent,
} from "@/lib/content-gen/templates";

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
  burning_questions: z.array(z.string().max(QUESTION_MAX)).max(3).default([]),
  bold_predictions: z
    .array(z.object({ kicker: kickerStr, verdict: VerdictSchema, body: bodyStr }))
    .max(4)
    .default([]),
  offseason_receipts: z
    .array(
      z.object({
        franchiseSlug: z.string().max(KICKER_MAX),
        category: CategorySchema,
        body: bodyStr,
      }),
    )
    .max(4)
    .default([]),
  hero_dek: bodyStr.default(""),
  smack_posts: z.array(bodyStr).max(5).default([]),
});

const RegularSchema = z.object({
  matchup_angles: z
    .array(z.object({ pairKey: z.string().max(KICKER_MAX), body: bodyStr }))
    .max(8)
    .default([]),
  game_of_week_blurb: bodyStr.default(""),
  hero_dek: bodyStr.default(""),
  smack_posts: z.array(bodyStr).max(5).default([]),
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
  "burning_questions": [ "question", ... ]  // exactly 3
  "bold_predictions": [ { "kicker": "short label", "verdict": "LOCK|NO|UP|DOWN", "body": "prediction" } ]  // exactly 4
  "offseason_receipts": [ { "franchiseSlug": <one of ${JSON.stringify(slugs)}>, "category": "DRAFT|TRADE|WAIVERS|FIRE_SALE", "body": "teaser" } ]  // exactly 4
  "hero_dek": "one-sentence hero subhead for the preseason hub. Do NOT mention a specific number of days until kickoff; the live day count is added at render time.",
  "smack_posts": [ "site desk post", ... ]  // 3 to 5
}`;
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
  "smack_posts": [ "site desk post", ... ]  // 3 to 5
}`;
}

function buildUserPrompt(ctx: StatsContext): string {
  const spec = ctx.seasonType === "regular" ? regularSpec(ctx) : preseasonSpec(ctx);
  return `STATS (the only facts you may use):\n${JSON.stringify(ctx, null, 2)}\n\n${spec}\n\nReturn only the JSON object.`;
}

// ---------------------------------------------------------------------------
// Conversion (validated LLM output -> DB rows)
// ---------------------------------------------------------------------------

function toRowsPreseason(out: PreseasonOut, ctx: StatsContext): HubContentInsert[] {
  const validDivisions = new Set(ctx.divisions.map((d) => d.name));
  const validSlugs = new Set(ctx.leagueStandings.map((t) => t.slug));
  const rows: HubContentInsert[] = [];

  for (const d of out.division_notes.slice(0, 3)) {
    if (!validDivisions.has(d.divisionName) || !d.body.trim()) continue;
    rows.push({
      week: null,
      kind: "division_note",
      refKey: d.divisionName,
      body: noEmDash(d.body),
      extras: { characterization: noEmDash(d.characterization) },
    });
  }
  for (const q of out.burning_questions.slice(0, 3)) {
    if (q.trim()) rows.push({ week: null, kind: "burning_question", refKey: null, body: noEmDash(q), extras: null });
  }
  for (const p of out.bold_predictions.slice(0, 4)) {
    if (!p.body.trim() || !p.kicker.trim()) continue;
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: noEmDash(p.body),
      extras: { kicker: noEmDash(p.kicker), verdict: p.verdict },
    });
  }
  for (const r of out.offseason_receipts.slice(0, 4)) {
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
  for (const s of out.smack_posts.slice(0, 5)) {
    if (s.trim()) rows.push({ week: null, kind: "smack_post", refKey: null, body: noEmDash(s), extras: null });
  }
  return rows;
}

function toRowsRegular(out: RegularOut, ctx: StatsContext): HubContentInsert[] {
  const validPairs = new Set(ctx.currentMatchups.map((m) => m.pairKey));
  const rows: HubContentInsert[] = [];

  for (const a of out.matchup_angles.slice(0, 8)) {
    if (!validPairs.has(a.pairKey) || !a.body.trim()) continue;
    rows.push({ week: ctx.week, kind: "matchup_angle", refKey: a.pairKey, body: noEmDash(a.body), extras: null });
  }
  if (out.game_of_week_blurb.trim()) {
    rows.push({ week: ctx.week, kind: "game_of_week_blurb", refKey: null, body: noEmDash(out.game_of_week_blurb), extras: null });
  }
  if (out.hero_dek.trim()) {
    rows.push({ week: ctx.week, kind: "hero_dek", refKey: null, body: noEmDash(out.hero_dek), extras: null });
  }
  for (const s of out.smack_posts.slice(0, 5)) {
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

    // Per-kind fill: any kind the LLM omitted (or that lost all its rows to
    // validation) is backfilled from the templates so no published kind is
    // deleted and left empty. A totally empty LLM response backfills every kind.
    const { rows: filledRows, templateFilledKinds } = fillMissingKinds(kinds, rows, ctx);
    if (templateFilledKinds.length > 0) {
      console.warn(
        "[content-gen] template-filled kinds with no LLM rows:",
        templateFilledKinds.join(", "),
      );
    }
    return { kinds, rows: filledRows, source: "llm", templateFilledKinds };
  } catch (e) {
    console.error("[content-gen] LLM path failed; using templates:", e);
    return generateFromTemplates(ctx);
  }
}
