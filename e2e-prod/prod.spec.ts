import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Smoke test of the HOSTED deployment, signing in with the demo password (email or register number).
 * Run with: npm run test:prod   (needs DEMO_PASSWORD in .env.deploy.local)
 * It creates one extra item ("Prod smoke <stamp>") and leaves the demo data otherwise as it found it.
 */
const BASE = process.env.APP_URL ?? "https://prime-project-tracker.vercel.app";
const PASSWORD = process.env.DEMO_PASSWORD!;
const stamp = Date.now().toString(36);
const title = `Prod smoke ${stamp}`;

async function as(browser: Browser, identifier: string, home: RegExp): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await expect(async () => {
    await page.getByLabel("Email or register number").fill(identifier);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
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
  expect((await request.get(`${BASE}/api/proof/5eedd000-0000-0000-0000-000000000001`)).status()).toBe(401);
  const signup = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { email: "intruder@college.edu", password: "Passw0rd!!x1" },
  });
  expect(signup.ok()).toBe(false);
});

test("an address outside the college domain and a wrong password are refused", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await expect(async () => {
    await page.getByLabel("Email or register number").fill("someone@gmail.com");
    await page.getByLabel("Password", { exact: true }).fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Use your college email address or your register number.")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel("Email or register number").fill("student@college.edu");
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Could not sign in with those details.")).toBeVisible();
});

test("each role lands on its own home and is kept out of the others", async ({ browser }) => {
  const adminPage = await as(browser, "admin@college.edu", /\/admin$/);
  await expect(adminPage.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(adminPage.getByText("Asha Raman").first()).toBeVisible();
  await adminPage.goto("/faculty");
  await expect(adminPage).toHaveURL(/\/admin$/);
  await adminPage.goto("/overview");
  await expect(adminPage.getByText(/confirmed across/)).toBeVisible();

  const student = await as(browser, "192110001", /\/student$/); // by register number
  await expect(student.getByText("Smart India Hackathon 2026")).toBeVisible();
  await expect(student.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await student.goto("/admin");
  await expect(student).toHaveURL(/\/student$/);
  await student.goto("/students");
  await expect(student).toHaveURL(/\/student$/);

  const principal = await as(browser, "principal@college.edu", /\/overview$/);
  await expect(principal.getByText(/confirmed across 3 students/)).toBeVisible();
  await principal.goto("/admin");
  await expect(principal).toHaveURL(/\/overview$/);
});

test("faculty posts an item needing proof; the student submits a proof file; faculty confirms and opens the proof", async ({ browser }) => {
  const faculty = await as(browser, "faculty@college.edu", /\/faculty$/);
  await faculty.goto("/faculty/events/new");
  await faculty.getByLabel("Title").fill(title);
  await faculty.getByLabel("Results must be confirmed").check();
  await faculty.getByLabel("Proof is required").check();
  await faculty.getByLabel("Asha Raman").check();
  await faculty.getByRole("button", { name: "Create event" }).click();
  await expect(faculty.getByText("Event created")).toBeVisible();

  const student = await as(browser, "student@college.edu", /\/student$/);
  const card = student.locator("article", { hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Join", exact: true }).click();
  const joined = student.locator("article", { hasText: title });
  await joined.getByText("Submit your result").click();
  await joined.getByLabel("Result", { exact: true }).fill("Runner-up");
  await joined.getByLabel(/Proof/).setInputFiles({
    name: "certificate.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await joined.getByRole("button", { name: "Submit result" }).click();
  await expect(student.locator("article", { hasText: title }).getByText("Awaiting confirmation")).toBeVisible();

  await faculty.goto("/faculty/review");
  const review = faculty.locator("article", { hasText: title });
  await expect(review.getByText("Runner-up")).toBeVisible();
  // The proof opens through the audited route as a short-lived signed link.
  const [popup] = await Promise.all([faculty.waitForEvent("popup"), review.getByRole("button", { name: "View proof" }).click()]);
  await popup.waitForURL(/storage\/v1\/object\/sign\/proofs\//);
  await popup.close();
  await review.getByRole("button", { name: "Confirm result" }).click();
  await expect(faculty.getByText(title)).toHaveCount(0);

  // Confirmed numbers update for the principal.
  const principal = await as(browser, "principal@college.edu", /\/overview$/);
  await expect(principal.getByText(/\d+ confirmed across 3 students/)).toBeVisible();
});

test("a student cannot read another student's profile or proofs", async ({ browser }) => {
  const other = await as(browser, "student2@college.edu", /\/student$/);
  const res = await other.request.get(`${BASE}/api/proof/5eedd000-0000-0000-0000-000000000001`);
  expect([404]).toContain(res.status());
});
