import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

// POSTGRES_DRIVER=pg opts into node-postgres over TCP 5432 instead of the
// neon-http driver's HTTPS endpoint. Needed on machines where outbound 443 to
// the Neon endpoint is blocked (local dev/E2E); Vercel keeps the default.
// The two drivers share the Drizzle query API, so the cast is safe for our usage.
function createDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.POSTGRES_URL!;
  if (process.env.POSTGRES_DRIVER === "pg") {
    const pool = new Pool({
      connectionString: url.replace("&channel_binding=require", ""),
      ssl: { rejectUnauthorized: true },
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
