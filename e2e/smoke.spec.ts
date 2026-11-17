import { test, expect, type Page } from "@playwright/test";

/**
 * The whole story: admin sets up people and links; a faculty mentor (who also heads the department)
 * posts a hackathon needing confirmation and proof; the student joins and submits with a proof file;
 * the mentor confirms; the department dashboard shows exactly 1 confirmed result.
 */
const MAILPIT = "http://127.0.0.1:54324/api/v1";
const stamp = Date.now().toString(36);
const mentorEmail = `mentor.${stamp}@college.edu`;
const studentEmail = `student.${stamp}@college.edu`;
const deptName = `E2E Department ${stamp}`;
const itemTitle = `E2E Hackathon ${stamp}`;

type Mail = { messages: { ID: string; To: { Address: string }[] }[] };

async function mailIds(email: string): Promise<Set<string>> {
  const list = (await (await fetch(`${MAILPIT}/messages`)).json()) as Mail;
  return new Set(list.messages.filter((m) => m.To.some((t) => t.Address === email)).map((m) => m.ID));
}

/** Waits for a sign-in email that was not in the inbox before we asked for the code. */
async function newCode(email: string, before: Set<string>): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/messages`)).json()) as Mail;
    const msg = list.messages.find((m) => !before.has(m.ID) && m.To.some((t) => t.Address === email));
    if (msg) {
      const body = (await (await fetch(`${MAILPIT}/message/${msg.ID}`)).json()) as { Text: string };
      const code = body.Text.match(/[0-9]{6}/)?.[0];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no new sign-in code arrived for ${email}`);
}

async function signIn(page: Page, email: string, home: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("College email").fill(email);
  const before = await mailIds(email);
  // The dev page may not be hydrated yet; click again until the code step appears.
  await expect(async () => {
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  const code = await newCode(email, before);
  await page.getByLabel("One-time code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(home);
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
  await signIn(page, studentEmail, /\/student$/);
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
