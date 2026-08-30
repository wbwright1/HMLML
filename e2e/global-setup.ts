import { resolveE2eDatabaseUrl, redactDatabaseUrl } from "../lib/e2e-preflight";
import { getSql, closeSql } from "./helpers/sql";

/**
 * Playwright global setup (#251). Fails the whole run fast and loudly when
 * the environment cannot actually reach the real Postgres database, instead
 * of letting individual specs quietly pass or skip against a broken worktree
 * (a fresh `git worktree` does not carry `.env.local`, which is gitignored).
 *
 * Absolute constraint: this file must never write to the database.
 * `.env.local`'s POSTGRES_URL is the LIVE Neon database. Two read-only
 * SELECTs only.
 */
export default async function globalSetup(): Promise<void> {
  const preflight = resolveE2eDatabaseUrl(process.env);
  if (!preflight.ok) {
    throw new Error(preflight.message);
  }

  console.log(`[e2e global-setup] target database: ${redactDatabaseUrl(preflight.url)}`);

  try {
    await getSql()`SELECT 1`;

    const rows = (await getSql()`SELECT COUNT(*)::int AS n FROM seasons`) as {
      n: number;
    }[];
    const seasonCount = rows[0]?.n ?? 0;

    if (seasonCount === 0) {
      throw new Error(
        `Connected to ${redactDatabaseUrl(preflight.url)}, but the "seasons" table is empty. This database has never been synced.`
      );
    }
  } finally {
    await closeSql();
  }
}
