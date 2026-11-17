import { defineConfig } from "@playwright/test";

/** Smoke test against the hosted deployment (no local server). See e2e-prod/prod.spec.ts. */
export default defineConfig({
  testDir: "./e2e-prod",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { channel: "chrome", baseURL: process.env.APP_URL ?? "https://prime-project-tracker.vercel.app", trace: "retain-on-failure" },
});
