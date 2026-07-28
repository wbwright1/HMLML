// Setup for DB-hitting acceptance tests (*.dbtest.ts). Loads the live DB URL
// from .env.local and forces the node-postgres driver (POSTGRES_DRIVER=pg),
// which is required locally because outbound 443 to the Neon HTTP endpoint is
// blocked here (the neon-http default only works on Vercel). Runs before any
// test file imports @/lib/db, so the lazy connection picks up both values.
import { config } from "dotenv";

config({ path: ".env.local" });
process.env.POSTGRES_DRIVER = "pg";
