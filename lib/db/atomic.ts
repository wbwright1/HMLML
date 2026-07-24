import { getDbDriver, db } from "./index";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "./schema";

type Executor = NeonHttpDatabase<typeof schema>;
type BatchArg = Parameters<Executor["batch"]>[0];

/**
 * Runs a set of write statements atomically, bridging the two Drizzle drivers
 * this app uses (see lib/db/index.ts). The drivers expose atomicity through
 * different APIs:
 *
 *   - node-postgres (POSTGRES_DRIVER=pg, local/E2E): interactive transactions
 *     via db.transaction(). The statements bind to the transaction handle so
 *     they run and roll back together.
 *   - neon-http (default, Vercel/prod): interactive transactions THROW; instead
 *     db.batch([...]) runs the statements in a single implicit transaction over
 *     one HTTP round trip. drizzle-orm ^0.45.x supports this and it is already
 *     in production use in lib/queries/hub-content.ts (replaceHubContent).
 *
 * Hardening intent: a delete+reinsert must never wipe rows and then fail to
 * replace them. Callers lead the returned tuple with the delete, so the delete
 * only commits alongside the inserts. `build` receives the executor so the pg
 * branch binds statements to the transaction handle `tx` (building against the
 * outer `db` would escape the transaction).
 *
 * The returned tuple must be non-empty (neon-http's batch signature requires
 * at least one statement); every call site leads with the delete, so it is.
 */
export async function runAtomic(
  build: (executor: Executor) => BatchArg,
): Promise<void> {
  if (getDbDriver() === "pg") {
    // node-postgres: the cast mirrors lib/db/index.ts:30 (the two drivers share
    // the Drizzle query API, so binding to the tx handle is safe for our usage).
    await db.transaction(async (tx) => {
      const statements = build(tx as unknown as Executor);
      for (const statement of statements) await statement;
    });
    return;
  }
  // neon-http: batch runs the statements in a single transaction.
  await db.batch(build(db));
}
