import { db } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Creates a sync_log entry with started_at timestamp.
 * Returns the newly created log entry's id.
 */
export async function logSyncStart(
  syncType: string,
  dataType: string
): Promise<number> {
  const [entry] = await db
    .insert(syncLog)
    .values({
      syncType,
      dataType,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: syncLog.id });

  return entry.id;
}

/**
 * Updates a sync_log entry with completion info:
 * status, row_count, duration_ms, completed_at, and optional error_message.
 */
export async function logSyncComplete(
  id: number,
  status: "success" | "partial" | "failure",
  rowCount: number,
  errorMessage?: string,
  detailsJson?: Record<string, unknown>
): Promise<void> {
  const now = new Date();

  // Fetch the started_at to compute duration
  const [existing] = await db
    .select({ startedAt: syncLog.startedAt })
    .from(syncLog)
    .where(eq(syncLog.id, id));

  const durationMs = existing?.startedAt
    ? now.getTime() - existing.startedAt.getTime()
    : null;

  await db
    .update(syncLog)
    .set({
      status,
      rowCount,
      durationMs: durationMs,
      errorMessage: errorMessage ?? null,
      completedAt: now,
      ...(detailsJson !== undefined ? { detailsJson } : {}),
    })
    .where(eq(syncLog.id, id));
}

/**
 * Gets the most recent sync log entry, optionally filtered by syncType and/or dataType.
 */
export async function getLatestSync(syncType?: string, dataType?: string) {
  const conditions = [];
  if (syncType) conditions.push(eq(syncLog.syncType, syncType));
  if (dataType) conditions.push(eq(syncLog.dataType, dataType));

  const query = db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.startedAt))
    .limit(1);

  if (conditions.length > 0) {
    query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  const [entry] = await query;
  return entry ?? null;
}

/**
 * Gets the most recent successful sync log entry for a given dataType.
 * Useful for the SyncTimestamp component.
 */
export async function getLatestSuccessfulSync(dataType: string) {
  const [entry] = await db
    .select()
    .from(syncLog)
    .where(and(eq(syncLog.dataType, dataType), eq(syncLog.status, "success")))
    .orderBy(desc(syncLog.startedAt))
    .limit(1);

  return entry ?? null;
}
