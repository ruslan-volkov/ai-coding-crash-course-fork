import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dedicated dev server and an isolated SQLite
// file, rebuilt from migrations + the e2e seed before every run. data.db is
// never touched.

const PORT = 5199;
const DATABASE_PATH = "e2e/.data/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  // One shared database: run serially so tests that write can't race.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx scripts/seed-e2e.ts && npx react-router dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_PATH },
  },
});
