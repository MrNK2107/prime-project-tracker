import { defineConfig } from "@playwright/test";

/**
 * One smoke path through the real app, against the local Supabase stack.
 * Needs: `npx supabase start`, `npm run seed:local` (admin@college.edu exists), and
 * ALLOWED_EMAIL_DOMAIN=college.edu in .env.local. Uses the installed Google Chrome, so no browser download.
 * Reset the database afterwards (`npx supabase db reset`) before running `npm run test:db`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
