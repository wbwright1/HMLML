import { db, getDbDriver } from "@/lib/db";
import { hubContent } from "@/lib/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------
// The eight editorial content kinds the hub renders. Kept here (closest to the
// DB) so both the query layer and the generation layer share one source of
// truth without importing from lib/content.ts (which imports THIS module).
export const HUB_CONTENT_KINDS = [
  "division_note",
  "burning_question",
  "bold_prediction",
  "offseason_receipt",
  "matchup_angle",
  "game_of_week_blurb",
  "hero_dek",
  "smack_post",
] as const;

export type HubContentKind = (typeof HUB_CONTENT_KINDS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single published hub_content row, narrowed to the fields consumers read. */
export interface HubContentRow {
  kind: string;
  refKey: string | null;
  body: string;
  extras: Record<string, unknown> | null;
  createdAt: Date | null;
}

/** hub_content rows grouped by kind (each kind's rows in insertion order). */
export type GroupedHubContent = Record<string, HubContentRow[]>;

/** A batch row to insert via replaceHubContent (season/status/generatedBy are set by the caller). */
export interface HubContentInsert {
  week: number | null;
  kind: HubContentKind;
  refKey: string | null;
  body: string;
  extras: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported, unit-tested)
// ---------------------------------------------------------------------------

/**
 * Groups hub_content rows by their `kind`, preserving input order within each
 * group. Pure and dependency-free so the grouping contract can be unit-tested
 * without a database.
 */
export function groupByKind(rows: HubContentRow[]): GroupedHubContent {
  const grouped: GroupedHubContent = {};
  for (const row of rows) {
    (grouped[row.kind] ??= []).push(row);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns published hub_content for a season (and a specific week, or the
 * season-scoped rows when week is null), grouped by kind. Never throws: on any
 * DB error it returns an empty grouping so callers fall back to seeded defaults.
 */
export async function getPublishedHubContent(
  seasonId: number,
  week: number | null,
): Promise<GroupedHubContent> {
  try {
    const rows = await db
      .select({
        kind: hubContent.kind,
        refKey: hubContent.refKey,
        body: hubContent.body,
        extras: hubContent.extras,
        createdAt: hubContent.createdAt,
      })
      .from(hubContent)
      .where(
        and(
          eq(hubContent.seasonId, seasonId),
          week == null
            ? isNull(hubContent.week)
            : eq(hubContent.week, week),
          eq(hubContent.status, "published"),
        ),
      )
      .orderBy(hubContent.id);

    return groupByKind(
      rows.map((r) => ({
        kind: r.kind,
        refKey: r.refKey,
        body: r.body,
        extras: (r.extras as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt,
      })),
    );
  } catch (e) {
    // The hub_content table may not exist yet (pre-migration 0007): that is the
    // one expected, benign read failure, so keep it silent. Any OTHER error
    // (connection, syntax, permissions) is surfaced so a broken read is not
    // mistaken for an empty table.
    if (!isMissingRelationError(e)) {
      console.error("[hub-content] getPublishedHubContent error:", e);
    }
    return {};
  }
}

/**
 * True when a query failed because the relation does not exist (Postgres
 * 42P01), i.e. the hub_content table has not been migrated yet. Drizzle wraps
 * the driver error ("Failed query: ...") and carries the real pg error on
 * `.cause`, so we walk the cause chain checking both the code and the message.
 */
function isMissingRelationError(e: unknown): boolean {
  let cur: unknown = e;
  for (let depth = 0; cur != null && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (code === "42P01") return true;
    const message = (cur as { message?: unknown }).message;
    if (typeof message === "string" && /relation .* does not exist/i.test(message)) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Atomically replaces the hub_content for a (season, week) scope and the given
 * set of kinds: deletes every prior row matching those (season, week, kind)
 * tuples, then inserts the new batch, both in one transaction. Only the listed
 * `kinds` are touched, so kinds not being regenerated this run are left intact.
 * Returns the number of rows inserted.
 *
 * Atomicity is driver-specific: node-postgres uses an interactive
 * db.transaction(); neon-http uses db.batch() (interactive transactions are
 * unsupported there), which runs the delete + insert as a single transaction
 * over one HTTP round trip.
 */
export async function replaceHubContent(
  seasonId: number,
  week: number | null,
  kinds: HubContentKind[],
  rows: HubContentInsert[],
  generatedBy: "auto" | "commish" = "auto",
): Promise<number> {
  if (kinds.length === 0) return 0;

  const weekCond =
    week == null ? isNull(hubContent.week) : eq(hubContent.week, week);

  const deleteQuery = db
    .delete(hubContent)
    .where(
      and(eq(hubContent.seasonId, seasonId), weekCond, inArray(hubContent.kind, kinds)),
    );

  const insertValues = rows.map((r) => ({
    seasonId,
    week: r.week,
    kind: r.kind,
    refKey: r.refKey,
    body: r.body,
    extras: r.extras,
    status: "published" as const,
    generatedBy,
  }));

  if (getDbDriver() === "pg") {
    // node-postgres: interactive transaction.
    await db.transaction(async (tx) => {
      await tx
        .delete(hubContent)
        .where(
          and(
            eq(hubContent.seasonId, seasonId),
            weekCond,
            inArray(hubContent.kind, kinds),
          ),
        );
      if (insertValues.length > 0) {
        await tx.insert(hubContent).values(insertValues);
      }
    });
    return insertValues.length;
  }

  // neon-http: batch runs the statements in a single transaction.
  if (insertValues.length === 0) {
    await deleteQuery;
    return 0;
  }
  await db.batch([deleteQuery, db.insert(hubContent).values(insertValues)]);
  return insertValues.length;
}
