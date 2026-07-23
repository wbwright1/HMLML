// ---------------------------------------------------------------------------
// Offseason activity gate
// ---------------------------------------------------------------------------
// The content cron runs weekly year-round, but the owner's instruction for the
// offseason is explicit: "no need to go too in-depth; if things haven't changed
// much, we shouldn't need to run a big update." This gate is what keeps a quiet
// offseason week quiet. Before regenerating offseason content, the route counts
// how many league transactions were synced since the last time offseason
// content was generated; if that count is below a small threshold, the run is
// skipped and the previously published content is kept untouched.
//
// Pure and dependency-free so the rule is unit-testable without a database; the
// route supplies the two counts from lib/queries/content-activity.ts.

/** Default: fewer than this many new transactions since last gen = a quiet week. */
export const DEFAULT_ACTIVITY_THRESHOLD = 2;

export interface ActivityGateInput {
  /** Transactions synced since the last offseason generation for this season. */
  newTransactionCount: number;
  /** Whether any offseason content already exists (the first run must not be gated). */
  hasExistingContent: boolean;
  /** Minimum new transactions to justify a regeneration. Defaults to DEFAULT_ACTIVITY_THRESHOLD. */
  threshold?: number;
}

export type ActivityGateReason = "no-existing-content" | "activity" | "quiet";

export interface ActivityGateResult {
  generate: boolean;
  reason: ActivityGateReason;
}

/**
 * Decides whether an offseason generation run should proceed.
 *
 * - First run (no existing content): always generate, so a fresh season is
 *   never left blank waiting on transaction volume.
 * - Enough new activity (>= threshold): generate.
 * - Otherwise: skip and keep the previously published content.
 */
export function shouldGenerateOffseason(input: ActivityGateInput): ActivityGateResult {
  const threshold = input.threshold ?? DEFAULT_ACTIVITY_THRESHOLD;
  if (!input.hasExistingContent) {
    return { generate: true, reason: "no-existing-content" };
  }
  if (input.newTransactionCount >= threshold) {
    return { generate: true, reason: "activity" };
  }
  return { generate: false, reason: "quiet" };
}

// ---------------------------------------------------------------------------
// Watermark selection (last successful offseason generation)
// ---------------------------------------------------------------------------
// The gate measures transactions synced since the last time OFFSEASON content
// was actually generated. hub_content can't supply that watermark cleanly:
// preseason and offseason both write season-scoped (week-null) rows and share
// the offseason_receipt/hero_dek/smack_post kinds, so a preseason run would
// pollute a hub_content-based watermark. sync_log is the clean source: every
// generate-content run records its seasonType and seasonId, so we pick the most
// recent SUCCESSFUL, NON-SKIPPED "off" run for this season. Pure and
// dependency-free (the query maps rows into this shape) so the scoping rule is
// unit-testable, including the "preseason rows present, must be ignored" case.

/** A generate-content sync_log row reduced to the fields the watermark needs. */
export interface GenerationLogRow {
  /** detailsJson.seasonType for the run. */
  seasonType: unknown;
  /** detailsJson.seasonId for the run. */
  seasonId: unknown;
  /** detailsJson.skipped marker; present (truthy) when the run generated nothing. */
  skipped?: unknown;
  /** completedAt ?? startedAt for the run. */
  at: Date | null;
}

/**
 * The timestamp of the most recent successful offseason GENERATION for a
 * season, ignoring preseason/regular/playoff runs and quiet-skip runs (which
 * produced no content). Input order does not matter: the latest `at` wins.
 * Returns null when this season has never had a real offseason generation.
 */
export function selectLastOffseasonGenerationAt(
  rows: GenerationLogRow[],
  seasonId: number,
): Date | null {
  let best: Date | null = null;
  for (const r of rows) {
    if (r.seasonType !== "off") continue;
    if (Number(r.seasonId) !== seasonId) continue;
    // A skip run kept the previous content; it did not generate, so it must not
    // advance the watermark (activity accrues across quiet weeks until it fires).
    if (r.skipped != null && r.skipped !== "") continue;
    if (!r.at) continue;
    if (best == null || r.at.getTime() > best.getTime()) best = r.at;
  }
  return best;
}
