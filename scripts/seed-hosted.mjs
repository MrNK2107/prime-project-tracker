#!/usr/bin/env node
// DEMO DATA for a hosted test deployment. Creates eight demo accounts (email or register number + the password
// in DEMO_PASSWORD) and sample items/results through the Supabase admin API. Safe to re-run: it also resets the
// demo passwords to DEMO_PASSWORD.
//
//   node --env-file=.env.deploy.local scripts/seed-hosted.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (8+ characters). Delete the demo accounts before real use.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) throw new Error("Set DEMO_PASSWORD (8+ characters) in .env.deploy.local");
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const DOMAIN = process.env.DEMO_DOMAIN ?? "college.edu";
const U = {
  admin: ["5eed0003-0000-0000-0000-000000000001", `admin@${DOMAIN}`, "Dr. Kavitha Rao", "admin"],
  principal: ["5eed0004-0000-0000-0000-000000000001", `principal@${DOMAIN}`, "Dr. S. Venkatesan", "principal"],
  faculty: ["5eed0002-0000-0000-0000-000000000001", `faculty@${DOMAIN}`, "Dr. Meena Iyer", "faculty"], // mentor only
  lead: ["5eed0005-0000-0000-0000-000000000001", `grouplead@${DOMAIN}`, "Dr. Priya Nair", "faculty"], // group lead only
  hod: ["5eed0006-0000-0000-0000-000000000001", `hod@${DOMAIN}`, "Dr. Ramesh Kumar", "faculty"], // head of CSE only
  asha: ["5eed0001-0000-0000-0000-000000000001", `student@${DOMAIN}`, "Asha Raman", "student", "192110001"],
  karthik: ["5eed0001-0000-0000-0000-000000000002", `student2@${DOMAIN}`, "Karthik Subramanian", "student", "192110002"],
  divya: ["5eed0001-0000-0000-0000-000000000003", `student3@${DOMAIN}`, "Divya Menon", "student", "192110003"],
};
const CSE = "5eedaaaa-0000-0000-0000-000000000001";
const ECE = "5eedaaaa-0000-0000-0000-000000000002";
const TEAM = "5eedbbbb-0000-0000-0000-000000000001";
const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

async function ok(label, p) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function seed() {
  const existing = await sb.auth.admin.listUsers({ perPage: 200 });
  const have = new Set((existing.data?.users ?? []).map((u) => u.email));
  for (const [id, email, full_name, role, register_no] of Object.values(U)) {
    if (!have.has(email)) {
      const { error } = await sb.auth.admin.createUser({ id, email, password, email_confirm: true });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
    } else {
      const { error } = await sb.auth.admin.updateUserById(id, { password });
      if (error) throw new Error(`password ${email}: ${error.message}`);
    }
    await ok(`profile ${email}`, sb.from("profiles").upsert({ id, email, full_name, role, active: true, register_no: register_no ?? null }));
  }
  await ok("departments", sb.from("departments").upsert([{ id: CSE, name: "Computer Science and Engineering" }, { id: ECE, name: "Electronics and Communication Engineering" }]));
  await ok("groups", sb.from("groups").upsert({ id: TEAM, name: "Prime Project Team" }));
  await ok("years", sb.from("student_year").upsert([{ student_id: U.asha[0], year: 2 }, { student_id: U.karthik[0], year: 3 }, { student_id: U.divya[0], year: 2 }]));

  // Role split (Nov 2026): mentor, group lead and head of department are three different people.
  // Older demo databases had one faculty member in all three roles; end those two extra links (history is kept).
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await ok("end old hod", sb.from("hod_assignments").update({ valid_to: yesterday }).eq("faculty_id", U.faculty[0]).is("valid_to", null));
  await ok("end old lead", sb.from("group_leads").update({ valid_to: yesterday }).eq("faculty_id", U.faculty[0]).is("valid_to", null));

  const { count } = await sb.from("hod_assignments").select("id", { count: "exact", head: true }).eq("faculty_id", U.hod[0]);
  if (count && count > 0) return console.log("Role-split demo links and events already present; skipping.");

  const from = "2024-06-01";
  const have2 = async (table, col, val) => (await sb.from(table).select("id", { count: "exact", head: true }).eq(col, val)).count > 0;
  if (!(await have2("department_memberships", "student_id", U.divya[0]))) {
    await ok("memberships", sb.from("department_memberships").insert([{ student_id: U.divya[0], department_id: CSE, valid_from: from }]));
  }
  if (!(await have2("department_memberships", "student_id", U.asha[0]))) {
    await ok("memberships a", sb.from("department_memberships").insert([
      { student_id: U.asha[0], department_id: CSE, valid_from: from },
      { student_id: U.karthik[0], department_id: ECE, valid_from: "2023-06-01" },
    ]));
  }
  if (!(await have2("mentorships", "mentor_id", U.faculty[0]))) {
    await ok("mentorships", sb.from("mentorships").insert([
      { mentor_id: U.faculty[0], student_id: U.asha[0], valid_from: from },
      { mentor_id: U.faculty[0], student_id: U.karthik[0], valid_from: "2023-06-01" },
    ]));
  }
  await ok("hod", sb.from("hod_assignments").insert({ faculty_id: U.hod[0], department_id: CSE, valid_from: from }));
  // The team is Asha and Divya now; Karthik leaves it (his membership ends, never deleted).
  await ok("end karthik group", sb.from("group_members").update({ valid_to: yesterday }).eq("student_id", U.karthik[0]).is("valid_to", null));
  if (!(await have2("group_members", "student_id", U.divya[0]))) {
    await ok("group members", sb.from("group_members").insert([{ group_id: TEAM, student_id: U.divya[0], valid_from: from }]));
  }
  await ok("group lead", sb.from("group_leads").insert({ group_id: TEAM, faculty_id: U.lead[0], valid_from: from }));

  const [m, g, h] = [U.faculty[0], U.lead[0], U.hod[0]];
  const t = (n) => `5eedc000-0000-0000-0000-00000000000${n}`;
  const i = (n) => `5eedd000-0000-0000-0000-0000000000${n}`;
  await ok("items", sb.from("items").upsert([
    { id: t(1), type: "hackathon", title: "Smart India Hackathon 2026", description: "National round. Tell us how your team placed and attach your certificate.", starts_at: days(40), deadline: days(30), requires_confirmation: true, requires_proof: true, created_by: m },
    { id: t(2), type: "event", title: "Google Cloud Study Jam", description: "Free two-hour hands-on session on Saturday.", meeting_url: "https://meet.google.com/abc-defg-hij", starts_at: days(12), deadline: days(10), requires_confirmation: false, requires_proof: false, created_by: m },
    { id: t(3), type: "internship", title: "Zoho summer internship drive", description: "Campus drive for second-year students.", deadline: days(20), requires_confirmation: true, requires_proof: false, created_by: m },
    { id: t(4), type: "meeting", title: "Team sprint demo", description: "Show what your sub-team built this sprint.", meeting_url: "https://meet.google.com/xyz-demo-team", starts_at: days(7), deadline: days(5), requires_confirmation: false, requires_proof: false, created_by: g },
    { id: t(5), type: "event", title: "Hackathon prep review", description: "Submit your prep notes before the review.", starts_at: days(-1), deadline: days(-2), requires_confirmation: true, requires_proof: false, created_by: g },
    { id: t(6), type: "event", title: "CSE industry talk", description: "Guest lecture from an industry speaker.", starts_at: days(14), deadline: days(12), requires_confirmation: false, requires_proof: false, created_by: h },
    { id: t(7), type: "internship", title: "NPTEL certification drive", description: "Enrol in one NPTEL course and upload the certificate.", deadline: days(25), requires_confirmation: true, requires_proof: true, created_by: h },
  ], { onConflict: "id", ignoreDuplicates: true }));
  const now = new Date().toISOString();
  await ok("invitations", sb.from("invitations").upsert([
    { id: i("01"), item_id: t(1), student_id: U.asha[0], status: "joined", responded_at: now },
    { id: i("02"), item_id: t(1), student_id: U.karthik[0], status: "joined", responded_at: now },
    { id: i("03"), item_id: t(2), student_id: U.asha[0], status: "invited" },
    { id: i("04"), item_id: t(2), student_id: U.karthik[0], status: "invited" },
    { id: i("05"), item_id: t(3), student_id: U.asha[0], status: "declined", responded_at: now },
    { id: i("06"), item_id: t(4), student_id: U.asha[0], status: "joined", responded_at: now },
    { id: i("07"), item_id: t(4), student_id: U.divya[0], status: "invited" },
    { id: i("08"), item_id: t(5), student_id: U.asha[0], status: "joined", responded_at: now },
    { id: i("09"), item_id: t(5), student_id: U.divya[0], status: "invited" },
    { id: i("0a"), item_id: t(6), student_id: U.asha[0], status: "joined", responded_at: now },
    { id: i("0b"), item_id: t(6), student_id: U.divya[0], status: "joined", responded_at: now },
    { id: i("0c"), item_id: t(7), student_id: U.asha[0], status: "joined", responded_at: now },
    { id: i("0d"), item_id: t(7), student_id: U.divya[0], status: "joined", responded_at: now },
  ], { onConflict: "id", ignoreDuplicates: true }));
  const hasResult = async (inv) => (await sb.from("results").select("id", { count: "exact", head: true }).eq("invitation_id", inv)).count > 0;
  const results = [
    [i("01"), "Finalist, national round", "Team of four; built a flood-alert dashboard.", "confirmed", m],
    [i("0c"), "Completed: Cloud Computing", "Elite certificate, 82 percent.", "confirmed", h],
    [i("02"), "Participated in the national round", "Certificate arrives next week.", "submitted"],
    [i("0d"), "Completed: Data Structures", "Passed with 76 percent.", "submitted"],
  ];
  for (const [inv, outcome, details, status, by] of results) {
    if (await hasResult(inv)) continue;
    await ok("result", sb.from("results").insert({ invitation_id: inv, revision: 1, outcome, details, status, ...(by ? { confirmed_by: by, confirmed_at: now } : {}) }));
  }
  console.log("Demo accounts, links, items and results created.");
}

await seed();
console.log("Demo sign-in: email or register number (students 192110001, 192110002 and 192110003) with DEMO_PASSWORD.");
