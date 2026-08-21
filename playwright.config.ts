import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env.local" });

// Overridable so parallel agents/worktrees can each verify against their own
// server instead of colliding on port 3000's (possibly stale) instance.
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
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
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
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
});
