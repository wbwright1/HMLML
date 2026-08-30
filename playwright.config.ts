import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env.local" });

// Overridable so parallel agents/worktrees can each verify against their own
// server instead of colliding on port 3000's (possibly stale) instance.
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000";

// Two additional dev servers, pinned to a forced NFL_STATE_OVERRIDE, so the
// hub-state specs (hub-preseason, hub-between-weeks, book-hub) run
// deterministically instead of guessing what the real calendar happens to be
// doing (#249, #244). These MUST be `next dev`, not `next start`: app/page.tsx
// declares `revalidate = 3600`, so the hub HTML is prerendered during
// `next build` with whatever env the build saw, and a start-time override
// would be ignored until that ISR entry expired. `next dev` re-renders per
// request, so the override takes effect immediately. Both still hit the real
// Postgres behind POSTGRES_URL/POSTGRES_DRIVER, so this stays a real-stack
// test, not a mock.
const PRESEASON_PORT = process.env.PLAYWRIGHT_PRESEASON_PORT ?? "3101";
const IN_SEASON_PORT = process.env.PLAYWRIGHT_IN_SEASON_PORT ?? "3102";

// Specs pinned to a forced NFL_STATE_OVERRIDE run against the two dev servers
// above, not the shared default server, and are excluded from the
// chromium/firefox/webkit projects that follow the real calendar.
const STATE_FORCED = /(hub-preseason|hub-between-weeks|book-hub)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: STATE_FORCED,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: STATE_FORCED,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: STATE_FORCED,
    },
    {
      name: "hub-preseason",
      testMatch: /hub-preseason\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PRESEASON_PORT}` },
    },
    {
      name: "hub-in-season",
      testMatch: /(hub-between-weeks|book-hub)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${IN_SEASON_PORT}` },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run start",
      url: BASE_URL,
      // Only reuse a server the caller deliberately pointed us at. The previous
      // `!CI` default silently adopted whatever was already listening on port
      // 3000, so `npm run build && npm run start` never ran and a run could pass
      // or fail against stale code (or a different database) with no indication.
      // Unset PLAYWRIGHT_TEST_BASE_URL now means "build and start a fresh one",
      // and a port already in use fails loudly instead of being absorbed.
      reuseExistingServer:
        Boolean(process.env.PLAYWRIGHT_TEST_BASE_URL) && !process.env.CI,
    },
    {
      command: `npx next dev --turbopack -p ${PRESEASON_PORT}`,
      url: `http://localhost:${PRESEASON_PORT}`,
      // NEXT_DIST_DIR: Next's dev lock file is keyed per build directory, not
      // per port, so two concurrent `next dev` processes on the default .next
      // would collide even on different ports. See next.config.ts.
      env: { NFL_STATE_OVERRIDE: "pre:1", NEXT_DIST_DIR: ".next-preseason" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `npx next dev --turbopack -p ${IN_SEASON_PORT}`,
      url: `http://localhost:${IN_SEASON_PORT}`,
      // ":force" makes isWeekOneLeadWindowActive true, which suppresses
      // resolveHubSeasonType's "everyone is 0-0" demotion back to preseason.
      // Without it this project would silently render the preseason hub.
      env: { NFL_STATE_OVERRIDE: "regular:1:force", NEXT_DIST_DIR: ".next-in-season" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
