import { readFileSync } from "node:fs";
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
    await page.getByLabel(/^College email/).fill(email);
    if (role === "Student") await page.getByLabel(/^Register number/).fill(studentReg.toLowerCase());
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

  await page.locator("#place-student").selectOption({ label: `Student ${stamp} (${studentReg})` });
  await page.locator("#place-dept").selectOption({ label: deptName });
  await page.getByRole("button", { name: "Save department" }).click();
  await expect(page.getByText("Department saved")).toBeVisible();

  await page.locator("#year-student").selectOption({ label: `Student ${stamp} (${studentReg})` });
  await page.locator("#year-value").selectOption({ label: "Year 2" });
  await page.getByRole("button", { name: "Save year" }).click();
  await expect(page.getByText("Year saved")).toBeVisible();

  await page.goto("/admin/links?tab=mentors");
  await page.locator("#m-student").selectOption({ label: `Student ${stamp} (${studentReg})` });
  await page.locator("#m-mentor").selectOption({ label: "Mentor " + stamp });
  await page.getByRole("button", { name: "Save mentor" }).click();
  await expect(page.getByText("Mentor saved")).toBeVisible();

  // ---- mentor: post a hackathon that needs confirmation and proof
  await signIn(page, mentorEmail, /\/faculty$/);
  await page.goto("/faculty/events/new");
  await page.getByLabel("Title").fill(itemTitle);
  await page.getByLabel("Results must be confirmed").check();
  await page.getByLabel("Proof is required").check();
  await page.getByLabel("Student " + stamp).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created")).toBeVisible();

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
  await expect(page.locator("article").getByText("Confirmed", { exact: true })).toBeVisible();
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
  const row = page.locator("tr", { hasText: studentReg });
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

// Seeded roster (supabase/dev-seed.sql): mentor Meena -> Asha, Karthik; group lead Priya -> Asha, Divya (team);
// head of CSE Ramesh -> Asha, Divya. Each capacity sees only its own students, and events track progress.
const DIVYA_ID = "5eed0001-0000-0000-0000-000000000003";
const KARTHIK_ID = "5eed0001-0000-0000-0000-000000000002";

test("a mentor, a group lead and a head of department each see only their own students", async ({ page }) => {
  // Mentor: Asha and Karthik, not Divya; no Department tab; Divya's profile does not exist for them.
  await signIn(page, "faculty@college.edu", /\/faculty$/);
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Asha Raman" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Karthik Subramanian" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Divya Menon" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Department", exact: true })).toHaveCount(0);
  await page.goto(`/students/${DIVYA_ID}`);
  await expect(page.getByText("Divya Menon")).toHaveCount(0);
  await expect(page.getByText(/not be found|404/i).first()).toBeVisible();

  // Event tracking board for the mentor's hackathon: one confirmed, one awaiting, funnel numbers shown.
  await page.goto("/faculty");
  await page.getByRole("link", { name: /Smart India Hackathon 2026/ }).first().click();
  const board = page.locator("tr", { hasText: "Asha Raman" });
  await expect(board.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Karthik Subramanian" }).getByText("Awaiting confirmation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Divya Menon" })).toHaveCount(0);

  // Group lead: Asha and Divya (the team), not Karthik, and no Department tab.
  await signIn(page, "grouplead@college.edu", /\/faculty$/);
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Asha Raman" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Divya Menon" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Karthik Subramanian" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Department", exact: true })).toHaveCount(0);
  await page.goto(`/students/${KARTHIK_ID}`);
  await expect(page.getByText("Karthik Subramanian")).toHaveCount(0);
  await expect(page.getByText(/not be found|404/i).first()).toBeVisible();
  // The overdue prep review needs attention.
  await page.goto("/faculty?view=attention");
  await expect(page.getByText("Hackathon prep review")).toBeVisible();

  // Head of department: the CSE students, with the Department page and its event tracking.
  await signIn(page, "hod@college.edu", /\/faculty$/);
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Divya Menon" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Karthik Subramanian" })).toHaveCount(0);
  await page.goto("/faculty/department");
  await expect(page.getByRole("heading", { name: "Event tracking" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSE industry talk" })).toBeVisible();
  // The mentor's Study Jam also invited Karthik (ECE). The head sees the event but only his own department's student on it.
  await page.getByRole("link", { name: "Google Cloud Study Jam" }).click();
  await expect(page.getByRole("link", { name: "Asha Raman" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Karthik Subramanian" })).toHaveCount(0);
});

// Imported learners (scripts/import-learners.mjs): Dr. Karthi G heads AIML, mentors 20 and leads the Prime Project
// group; Dr. Karthika R N is the group's coordinator. Needs `npm run seed:local` and the import (IMPORT_PASSWORD=Demo@1234).
test("a head of department sees mentees, group and department; the coordinator has full authority over group events", async ({ page }) => {
  const title = `Prime review ${stamp}`;

  await signIn(page, "karthi.g@saveetha.ac.in", /\/faculty$/);
  await page.goto("/students");
  await expect(page.getByRole("link", { name: /^My mentees/ })).toContainText("20");
  await expect(page.getByRole("link", { name: /^Group: Prime Project/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Dept: Artificial Intelligence and Machine Learning/ })).toContainText("24");
  await expect(page.getByRole("link", { name: "Department", exact: true })).toBeVisible();

  // He posts an event to the whole group, asking for confirmation.
  await page.goto("/faculty/events/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Results must be confirmed").check();
  await page.getByLabel(/^Prime Project/).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created")).toBeVisible();

  // A student mentored by someone else (Ms. Nivetha M) joins and submits.
  await signIn(page, "212224100013", /\/student$/);
  const card = page.locator("article", { hasText: title });
  await card.getByRole("button", { name: "Join", exact: true }).click();
  const joined = page.locator("article", { hasText: title });
  await joined.getByText("Submit your result").click();
  await joined.getByLabel("Result", { exact: true }).fill("Shortlisted");
  await joined.getByRole("button", { name: "Submit result" }).click();
  await expect(page.locator("article", { hasText: title }).getByText("Awaiting confirmation")).toBeVisible();

  // The student's own mentor sees the event but may not edit it.
  await signIn(page, "nivetha.m@saveetha.ac.in", /\/faculty$/);
  await page.goto("/faculty/events/new");
  await expect(page.getByLabel(/^All students/)).toHaveCount(0); // a mentor cannot post to everyone
  await page.goto("/faculty?view=upcoming");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("link", { name: "Edit event" })).toHaveCount(0);

  // The coordinator did not post it and does not mentor that student, yet reviews it and edits the event.
  await signIn(page, "karthika.rn@saveetha.ac.in", /\/faculty$/);
  await page.goto("/faculty/review");
  const review = page.locator("article", { hasText: title });
  await expect(review.getByText("Shortlisted")).toBeVisible();
  await review.getByRole("button", { name: "Confirm result" }).click();
  await expect(page.locator("article", { hasText: title })).toHaveCount(0);

  await page.goto("/faculty?scope=all&view=upcoming");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await page.getByRole("link", { name: "Edit event" }).click();
  await page.getByLabel("Title").fill(`${title} (final)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: `${title} (final)` })).toBeVisible();
});

test("the hackathon and placement coordinator filters mentees, group and all, and can post to everyone", async ({ page }) => {
  const title = `Campus drive ${stamp}`;
  await signIn(page, "karthika.rn@saveetha.ac.in", /\/faculty$/);

  // Priority order: mentees first (the default), then the group, then everyone.
  await page.goto("/students");
  const tabs = page.getByLabel("Which students").getByRole("link");
  await expect(tabs).toHaveText([/^My mentees\s*14/, /^Group: Prime Project\s*81/, /^All students/]);
  await expect(page.getByLabel("Which students").getByRole("link", { name: /^My mentees/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await page.getByRole("link", { name: /^Group: Prime Project/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(81);
  await page.getByRole("link", { name: /^All students/ }).click();
  await expect(page.locator("tbody tr").nth(80)).toBeVisible(); // everyone, including the demo students

  // She can post to every student, not only the group.
  await page.goto("/faculty/events/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel(/^All students/).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created")).toBeVisible();

  // A demo student outside the group got it.
  await signIn(page, "student@college.edu", /\/student$/);
  await expect(page.locator("article", { hasText: title })).toBeVisible();

  // Her events page has the same three-way filter.
  await signIn(page, "karthika.rn@saveetha.ac.in", /\/faculty$/);
  await page.goto("/faculty?scope=all&view=upcoming");
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
});

test("hackathons and internships are suggestions only: nothing is posted until a faculty member creates the event", async ({ page, request }) => {
  // Load the suggestions the way the daily job does (the database starts without them).
  const secret = process.env.CRON_SECRET ?? /^CRON_SECRET=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1];
  const refreshed = await request.get("/api/cron/refresh-suggestions", { headers: { Authorization: `Bearer ${secret}` }, timeout: 120_000 });
  expect(refreshed.ok()).toBe(true);
  expect(await refreshed.json()).toMatchObject({ ok: true });

  await signIn(page, "212223230072", /\/student$/);
  // The imported sheets created no events or invitations for students.
  await expect(page.locator("article", { hasText: /HackZ|K Hacks|Gemma/ })).toHaveCount(0);

  await signIn(page, "karthika.rn@saveetha.ac.in", /\/faculty$/);
  await page.goto("/faculty/events/new");
  const panel = page.locator("details", { hasText: "Suggestions" });
  await expect(panel).toContainText("nothing is posted until you create the event");

  // Browse, filter and pick an internship: it only fills the form.
  await panel.getByRole("button", { name: "Internships", exact: true }).click();
  await panel.getByLabel("Search suggestions").fill("Salesforce");
  await panel.getByRole("button", { name: "Use this" }).first().click();
  await expect(page.getByLabel("Title")).toHaveValue(/Salesforce/);
  await expect(page.getByLabel("Details (optional)")).not.toHaveValue("");
  await expect(page.getByLabel("Meeting link (optional)")).toHaveValue(/^https:\/\//);
  await expect(page.getByRole("radio", { name: "Internship" })).toBeChecked();
  const picked = await page.getByLabel("Title").inputValue();
  const posted = `${picked} ${stamp}`;
  await page.goto("/faculty?scope=all&view=upcoming");
  await expect(page.getByRole("link", { name: posted })).toHaveCount(0); // picking changed nothing

  // Using one and choosing an audience posts a real event.
  await page.goto("/faculty/events/new");
  const again = page.locator("details", { hasText: "Suggestions" });
  await again.getByLabel("Search suggestions").fill("Salesforce");
  await again.getByRole("button", { name: "Use this" }).first().click();
  await page.getByLabel("Title").fill(posted);
  await page.getByLabel("Prime Project", { exact: true }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created")).toBeVisible();

  await signIn(page, "212223230072", /\/student$/);
  await expect(page.locator("article", { hasText: posted }).first()).toBeVisible();
  await expect(page.getByText("Open registration page").first()).toBeVisible();

  // Students cannot read the suggestion list at all.
  const res = await page.request.get("/faculty/events/new");
  expect(res.url()).not.toMatch(/faculty\/events\/new$/);
});

test("a student needs only a register number: no email asked for, and it signs in", async ({ page }) => {
  const reg = `NOMAIL${stamp}`.toUpperCase();
  await signIn(page, "admin@college.edu", /\/admin$/);
  await page.getByLabel("Full name").fill(`No Email ${stamp}`);
  await page.getByLabel(/^Register number/).fill(reg);
  await page.getByLabel("Initial password").fill(PASSWORD);
  await page.getByLabel("Role").selectOption({ label: "Student" });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();
  // The list identifies the student by register number, not an email.
  await expect(page.locator("tr", { hasText: `No Email ${stamp}` })).toContainText(reg);
  await expect(page.locator("tr", { hasText: `No Email ${stamp}` })).not.toContainText("@");
  await signIn(page, reg.toLowerCase(), /\/student$/);
});

test("tracking by event and by student, and the password lives on the profile page", async ({ page }) => {
  await signIn(page, "karthika.rn@saveetha.ac.in", /\/faculty$/);
  // The header no longer has a Password link; the name opens the profile.
  await expect(page.getByRole("link", { name: "Password", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByText("Hackathon and placement coordinator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();

  // Student-wise tracking: each student with their events and where they stand.
  await page.goto("/faculty?scope=all");
  await page.getByRole("link", { name: "Track by student" }).click();
  await expect(page).toHaveURL(/\/students/);
  await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^All students/ }).click();
  await expect(page).toHaveURL(/scope=all/);
  const asha = page.locator("tr", { hasText: "Asha Raman" });
  await asha.getByText(/^Their events/).click();
  await expect(asha.getByRole("link", { name: "Smart India Hackathon 2026" })).toBeVisible();
  await expect(asha.getByText("Confirmed", { exact: true }).first()).toBeVisible();

  // Event-wise tracking is one click back.
  await page.getByRole("link", { name: "Track by event" }).click();
  await expect(page).toHaveURL(/\/faculty/);
  await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
});
