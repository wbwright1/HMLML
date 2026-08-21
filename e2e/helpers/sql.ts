import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

/**
 * Driver-aware tagged-template SQL for the e2e fixtures.
 *
 * The fixtures used to call neon() directly, which speaks Neon's HTTPS
 * endpoint and cannot talk to a local Postgres at all. That silently made
 * every member/smack spec unrunnable against `POSTGRES_DRIVER=pg`, the very
 * setup the repo documents for local E2E, so those specs could only ever run
 * against the live database.
 *
 * This mirrors the driver branch in lib/db/index.ts and exposes the same
 * tagged-template call shape neon() provides, so the fixtures keep their
 * existing `sql\`SELECT ...\`` syntax unchanged.
 */
export type SqlRows = Record<string, unknown>[];

export interface TaggedSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<SqlRows>;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.POSTGRES_URL!;
    pool = new Pool({
      connectionString: url.replace("&channel_binding=require", ""),
      ssl: isLocalHost(url) ? false : { rejectUnauthorized: true },
      // Without this an idle pooled connection keeps the Playwright worker
      // alive after the run finishes.
      allowExitOnIdle: true,
    });
  }
  return pool;
}

/** Local Postgres does not serve SSL; anything remote must still require it. */
function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Returns a tagged-template SQL function for the configured driver.
 *
 * Interpolations become bound parameters in both drivers, so the fixtures are
 * parameterized exactly as before; nothing is string-concatenated into SQL.
 */
export function getSql(): TaggedSql {
  if (process.env.POSTGRES_DRIVER === "pg") {
    return async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // Rebuild the statement with $1..$n placeholders where neon would have
      // bound its own parameters.
      const text = strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
        ""
      );
      const result = await getPool().query(text, values);
      return result.rows as SqlRows;
    };
  }

  const sql = neon(process.env.POSTGRES_URL!);
  return sql as unknown as TaggedSql;
}

/** Releases the pg pool, if one was opened. Safe to call unconditionally. */
export async function closeSql(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
