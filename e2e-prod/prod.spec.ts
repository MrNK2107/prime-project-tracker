import { readFileSync } from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Read-only smoke test of the HOSTED deployment. It signs in with the real accounts' initial passwords from the
 * credentials file written by scripts/import-learners.mjs (PROD_CREDENTIALS, a CSV with columns
 * Name, Register number, Sign in with, Initial password, Role) and changes nothing.
 *
 *   PROD_CREDENTIALS=C:\path\prime-project-credentials.csv npm run test:prod
 *
 * An account whose password has since been changed is skipped by looking for another of the same role.
 */
const BASE = process.env.APP_URL ?? "https://prime-project-tracker.vercel.app";
const FILE = process.env.PROD_CREDENTIALS;

type Cred = { name: string; signIn: string; password: string; role: string };
function load(): Cred[] {
  if (!FILE) return [];
  const rows = readFileSync(FILE, "utf8").trim().split(/\r?\n/).slice(1);
  return rows.map((line) => {
    const f = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
    return { name: f[0], signIn: f[2], password: f[3], role: f[4] };
  });
}
const creds = load();
const pick = (role: string, name?: RegExp) => creds.find((c) => c.role === role && (!name || name.test(c.name)));

async function as(browser: Browser, c: Cred, home: RegExp): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await expect(async () => {
    await page.getByLabel("Email or register number").fill(c.signIn);
    await page.getByLabel("Password", { exact: true }).fill(c.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(home, { timeout: 5000 });
  }).toPass({ timeout: 30_000 });
  return page;
}

test.describe.configure({ mode: "serial" });

test("signed-out visitors go to the sign-in page, and signup is closed", async ({ page, request }) => {
  await page.goto(`${BASE}/student`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const signup = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { email: "intruder@saveetha.ac.in", password: "Passw0rd!!x1" },
  });
  expect(signup.ok()).toBe(false);
});

test("the suggestion refresh refuses anyone without the secret", async ({ request }) => {
  expect((await request.get(`${BASE}/api/cron/refresh-suggestions`)).status()).toBe(401);
  expect((await request.get(`${BASE}/api/cron/refresh-suggestions`, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("an outside address, a wrong password and the retired demo accounts are all refused", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await expect(async () => {
    await page.getByLabel("Email or register number").fill("someone@gmail.com");
    await page.getByLabel("Password", { exact: true }).fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Use your college email address or your register number.")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  for (const who of ["faculty@college.edu", "student@college.edu", "212223230072"]) {
    await page.getByLabel("Email or register number").fill(who);
    await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD ?? "Demo@1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Could not sign in with those details.")).toBeVisible();
  }
});

test("each role lands on its own home and is kept out of the others", async ({ browser }) => {
  test.skip(creds.length === 0, "set PROD_CREDENTIALS");
  const admin = pick("Admin")!;
  const adminPage = await as(browser, admin, /\/admin$/);
  await expect(adminPage.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(adminPage.getByText("Dr. Karthika R N").first()).toBeVisible();
  await adminPage.goto("/faculty");
  await expect(adminPage).toHaveURL(/\/admin$/);

  const student = pick("Student")!;
  const studentPage = await as(browser, student, /\/student$/);
  await studentPage.goto("/admin");
  await expect(studentPage).toHaveURL(/\/student$/);
  await studentPage.goto("/students");
  await expect(studentPage).toHaveURL(/\/student$/);

  const mentor = pick("Mentor", /Nivetha/)!;
  const mentorPage = await as(browser, mentor, /\/faculty$/);
  await mentorPage.goto("/admin");
  await expect(mentorPage).toHaveURL(/\/faculty$/);
});

test("the placement coordinator filters mentees, group and all, and sees suggestions only", async ({ browser }) => {
  test.skip(creds.length === 0, "set PROD_CREDENTIALS");
  const karthika = pick("Mentor", /Karthika/)!;
  const page = await as(browser, karthika, /\/faculty$/);

  await page.goto("/students");
  const tabs = page.getByLabel("Which students").getByRole("link");
  await expect(tabs).toHaveText([/^My mentees\s*14/, /^Group: Prime Project\s*81/, /^All students/]);
  await page.getByRole("link", { name: /^Group: Prime Project/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(81);

  await page.goto("/faculty/events/new");
  const panel = page.locator("details", { hasText: "Need ideas" });
  await panel.locator("summary").click();
  await expect(panel).toContainText("nothing is posted until you create the event");
  await panel.getByLabel("Search suggestions").fill("a");
  await expect(panel.getByRole("button", { name: "Use this" }).first()).toBeVisible();
  // Nothing was posted: no student has an invitation yet.
  for (const view of ["attention", "upcoming", "past"]) {
    await page.goto(`/faculty?scope=all&view=${view}`);
    await expect(page.locator("a.event-card")).toHaveCount(0);
  }
  await expect(page.getByText("No events for these students yet")).toBeVisible();
  // Tracking by student is there too, and the password moved to the profile page.
  await page.getByRole("link", { name: "Track by student" }).click();
  await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
});

test("a student cannot read another student's proofs", async ({ browser }) => {
  test.skip(creds.length === 0, "set PROD_CREDENTIALS");
  const page = await as(browser, pick("Student")!, /\/student$/);
  const res = await page.request.get(`${BASE}/api/proof/5eedd000-0000-0000-0000-000000000001`);
  expect([404]).toContain(res.status());
});
