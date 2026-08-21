import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

// Which driver getDb() constructed. The two drivers offer atomic multi-
// statement writes through different APIs: node-postgres via db.transaction(),
// neon-http via db.batch() (interactive transactions throw on neon-http). Code
// that needs one row-set replaced atomically branches on this flag.
export type DbDriver = "pg" | "neon-http";

export function getDbDriver(): DbDriver {
  return process.env.POSTGRES_DRIVER === "pg" ? "pg" : "neon-http";
}

// POSTGRES_DRIVER=pg opts into node-postgres over TCP 5432 instead of the
// neon-http driver's HTTPS endpoint. Needed on machines where outbound 443 to
// the Neon endpoint is blocked (local dev/E2E); Vercel keeps the default.
// The two drivers share the Drizzle query API, so the cast is safe for our usage.
/** True for a loopback Postgres host (local dev / E2E). */
function isLocalPostgres(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function createDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.POSTGRES_URL!;
  if (process.env.POSTGRES_DRIVER === "pg") {
    const pool = new Pool({
      connectionString: url.replace("&channel_binding=require", ""),
      // Local Postgres does not serve SSL, and POSTGRES_DRIVER=pg exists
      // precisely for local dev/E2E; requiring it there made the documented
      // local path fail with "The server does not support SSL connections".
      // Anything non-local still requires a verified certificate.
      ssl: isLocalPostgres(url) ? false : { rejectUnauthorized: true },
    });
    return drizzlePg(pool, { schema }) as unknown as NeonHttpDatabase<typeof schema>;
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// For convenience — lazily initialized on first access
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
