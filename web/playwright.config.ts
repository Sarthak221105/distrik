import { defineConfig, devices } from "@playwright/test";

// End to end tests for the critical flows (PRD 14, 16). They run against the
// local Supabase stack with seed data and a running dev server:
//   supabase db reset && npm run dev   then   npx playwright test
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /rep\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /rep\.spec/ },
  ],
});
