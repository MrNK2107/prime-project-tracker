import { test, expect, type Page } from "@playwright/test";

/**
 * The whole story: admin sets up people and links; a faculty mentor (who also heads the department)
 * posts a hackathon needing confirmation and proof; the student joins and submits with a proof file;
 * the mentor confirms; the department dashboard shows exactly 1 confirmed result.
 */
const PASSWORD = "Demo@1234"; // password of the local seed accounts (supabase/dev-seed.sql)
const stamp = Date.now().toString(36);
const mentorEmail = `mentor.${stamp}@college.edu`;
const studentEmail = `student.${stamp}@college.edu`;
const studentReg = `E2E${stamp}`.toUpperCase();
const NEW_PASSWORD = "Fresh#Pass99";
const deptName = `E2E Department ${stamp}`;
const itemTitle = `E2E Hackathon ${stamp}`;

/** Signs in with an email or register number and a password (no codes). */
async function signIn(page: Page, identifier: string, home: RegExp, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(async () => {
    await page.getByLabel("Email or register number").fill(identifier);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(home, { timeout: 4000 });
  }).toPass({ timeout: 20_000 });
}

test("admin sets up, mentor posts, student submits, mentor confirms, department shows 1 confirmed", async ({ page }) => {
  // ---- admin: accounts, department, head, placement, year, mentor
  await signIn(page, "admin@college.edu", /\/admin$/);

  for (const [name, email, role] of [
    ["Mentor " + stamp, mentorEmail, "Faculty"],
    ["Student " + stamp, studentEmail, "Student"],
  ]) {
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("College email").fill(email);
    if (role === "Student") await page.getByLabel("Register number (students)").fill(studentReg.toLowerCase());
    await page.getByLabel("Initial password").fill(PASSWORD);
    await page.getByLabel("Role").selectOption({ label: role });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Account created")).toBeVisible();
  }

  await page.goto("/admin/links?tab=departments");
  await page.getByLabel("Department name").fill(deptName);
  await page.getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("Department created")).toBeVisible();

  await page.locator("#hod-dept").selectOption({ label: deptName });
  await page.locator("#hod-faculty").selectOption({ label: "Mentor " + stamp });
  await page.getByRole("button", { name: "Save head of department" }).click();
  await expect(page.getByText("Head of department saved")).toBeVisible();

  await page.locator("#place-student").selectOption({ label: "Student " + stamp });
  await page.locator("#place-dept").selectOption({ label: deptName });
  await page.getByRole("button", { name: "Save department" }).click();
  await expect(page.getByText("Department saved")).toBeVisible();

  await page.locator("#year-student").selectOption({ label: "Student " + stamp });
  await page.locator("#year-value").selectOption({ label: "Year 2" });
  await page.getByRole("button", { name: "Save year" }).click();
  await expect(page.getByText("Year saved")).toBeVisible();

  await page.goto("/admin/links?tab=mentors");
  await page.locator("#m-student").selectOption({ label: "Student " + stamp });
  await page.locator("#m-mentor").selectOption({ label: "Mentor " + stamp });
  await page.getByRole("button", { name: "Save mentor" }).click();
  await expect(page.getByText("Mentor saved")).toBeVisible();

  // ---- mentor: post a hackathon that needs confirmation and proof
  await signIn(page, mentorEmail, /\/faculty$/);
  await page.goto("/faculty/items/new");
  await page.getByLabel("Title").fill(itemTitle);
  await page.getByLabel("Results must be confirmed").check();
  await page.getByLabel("Proof is required").check();
  await page.getByLabel("Student " + stamp).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText("Item created")).toBeVisible();

  // ---- student: join, submit with proof
  // The student signs in with the register number (typed in lower case on purpose).
  await signIn(page, studentReg.toLowerCase(), /\/student$/);
  await expect(page.getByText(itemTitle)).toBeVisible();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Joined/ })).toBeVisible();
  await page.getByText("Submit your result").click();
  await page.getByLabel("Result", { exact: true }).fill("Won first prize");
  await page.getByLabel(/Proof/).setInputFiles({
    name: "certificate.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Submit result" }).click();
  await expect(page.getByText("Awaiting confirmation")).toBeVisible();

  // ---- mentor: confirm
  await signIn(page, mentorEmail, /\/faculty$/);
  await page.goto("/faculty/review");
  await expect(page.getByText("Won first prize")).toBeVisible();
  await page.getByRole("button", { name: "Confirm result" }).click();
  await expect(page.getByText("Nothing to review")).toBeVisible();

  // ---- department dashboard: exactly 1 confirmed, no claims
  await page.goto("/faculty/department");
  await expect(page.getByRole("heading", { name: deptName })).toBeVisible();
  await expect(page.getByText(/1 confirmed across 1 student/)).toBeVisible();
  await expect(page.getByText("No unconfirmed claims.")).toBeVisible();

  // ---- admin reads everything: the student's confirmed result and the school-wide overview
  await signIn(page, "admin@college.edu", /\/admin$/);
  await page.goto("/students");
  await page.getByRole("link", { name: "Student " + stamp }).click();
  await expect(page.getByText("Won first prize")).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await page.goto("/overview");
  await expect(page.getByText(/confirmed across/)).toBeVisible();
});

test("wrong passwords are refused; admin resets a password; the student changes their own", async ({ page }) => {
  await page.goto("/login");
  await expect(async () => {
    await page.getByLabel("Email or register number").fill(studentEmail);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Could not sign in with those details.")).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/login$/);
  // An unknown register number gets the very same answer.
  await page.getByLabel("Email or register number").fill("NOSUCH999");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Could not sign in with those details.")).toBeVisible();

  await signIn(page, "admin@college.edu", /\/admin$/);
  const row = page.locator("tr", { hasText: studentEmail });
  await row.getByLabel(/New password for/).fill(NEW_PASSWORD);
  await row.getByRole("button", { name: "Set password" }).click();
  await expect(row.getByText("Password changed")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, studentReg, /\/student$/, NEW_PASSWORD);
  await page.goto("/account");
  await page.getByLabel("Current password").fill(NEW_PASSWORD);
  await page.locator("#next").fill("Another#Pass77");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  await signIn(page, studentEmail, /\/student$/, "Another#Pass77");
});
