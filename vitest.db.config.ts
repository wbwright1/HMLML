import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for DB-hitting acceptance tests (*.dbtest.ts). These connect
// to the real database (see vitest.db.setup.ts) and are deliberately kept OUT
// of the default `vitest run` (*.test.ts) so the pure unit suite never needs a
// database. Run with: npx vitest run --config vitest.db.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/*.dbtest.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    setupFiles: ["./vitest.db.setup.ts"],
    // One DB, no isolation benefit from parallelism; keep it simple/serial.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
