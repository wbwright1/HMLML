import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { syncLog } from "../../lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Returns a Drizzle DB instance for E2E test seeding.
 * Uses the same POSTGRES_URL as the app.
 */
function getTestDb() {
  const sql = neon(process.env.POSTGRES_URL!);
  return drizzle(sql);
}

/**
 * Seeds a sync_log row with the given parameters.
 * Returns the inserted row's id for cleanup.
 */
export async function seedSyncLogEntry(params: {
  syncType: string;
  dataType: string;
  status: string;
  completedAt: Date;
}): Promise<number> {
  const db = getTestDb();
  const [entry] = await db
    .insert(syncLog)
    .values({
      syncType: params.syncType,
      dataType: params.dataType,
      status: params.status,
      startedAt: new Date(params.completedAt.getTime() - 5000), // 5 seconds before completion
      completedAt: params.completedAt,
      rowCount: 1,
    })
    .returning({ id: syncLog.id });

  return entry.id;
}

/**
 * Removes a sync_log row by id.
 */
export async function cleanupSyncLogEntry(id: number): Promise<void> {
  const db = getTestDb();
  await db.delete(syncLog).where(eq(syncLog.id, id));
}

/**
 * Removes all sync_log rows with the given dataType.
 * Useful for ensuring a clean state before tests.
 */
export async function cleanupSyncLogByDataType(dataType: string): Promise<void> {
  const db = getTestDb();
  await db.delete(syncLog).where(eq(syncLog.dataType, dataType));
}
