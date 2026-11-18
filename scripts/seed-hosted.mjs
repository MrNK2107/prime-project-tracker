#!/usr/bin/env node
// DEMO DATA for a hosted test deployment. Creates five demo accounts (email or register number + the password
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
  faculty: ["5eed0002-0000-0000-0000-000000000001", `faculty@${DOMAIN}`, "Dr. Meena Iyer", "faculty"],
  asha: ["5eed0001-0000-0000-0000-000000000001", `student@${DOMAIN}`, "Asha Raman", "student", "192110001"],
  karthik: ["5eed0001-0000-0000-0000-000000000002", `student2@${DOMAIN}`, "Karthik Subramanian", "student", "192110002"],
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
  await ok("years", sb.from("student_year").upsert([{ student_id: U.asha[0], year: 2 }, { student_id: U.karthik[0], year: 3 }]));

  const { count } = await sb.from("mentorships").select("id", { count: "exact", head: true });
  if (count && count > 0) return console.log("Demo links and items already present; skipping.");

  const from = "2024-06-01";
  await ok("memberships", sb.from("department_memberships").insert([
    { student_id: U.asha[0], department_id: CSE, valid_from: from },
    { student_id: U.karthik[0], department_id: ECE, valid_from: "2023-06-01" },
  ]));
  await ok("hod", sb.from("hod_assignments").insert({ faculty_id: U.faculty[0], department_id: CSE, valid_from: from }));
  await ok("mentorships", sb.from("mentorships").insert([
    { mentor_id: U.faculty[0], student_id: U.asha[0], valid_from: from },
    { mentor_id: U.faculty[0], student_id: U.karthik[0], valid_from: "2023-06-01" },
  ]));
  await ok("group members", sb.from("group_members").insert([
    { group_id: TEAM, student_id: U.asha[0], valid_from: from },
    { group_id: TEAM, student_id: U.karthik[0], valid_from: from },
  ]));
  await ok("group lead", sb.from("group_leads").insert({ group_id: TEAM, faculty_id: U.faculty[0], valid_from: from }));

  const f = U.faculty[0];
  await ok("items", sb.from("items").insert([
    { id: "5eedc000-0000-0000-0000-000000000001", type: "hackathon", title: "Smart India Hackathon 2026", description: "National round. Tell us how your team placed and attach your certificate.", deadline: days(30), requires_confirmation: true, requires_proof: true, created_by: f },
    { id: "5eedc000-0000-0000-0000-000000000002", type: "event", title: "Google Cloud Study Jam", description: "Free two-hour hands-on session on Saturday.", meeting_url: "https://meet.google.com/abc-defg-hij", deadline: days(10), requires_confirmation: false, requires_proof: false, created_by: f },
    { id: "5eedc000-0000-0000-0000-000000000003", type: "internship", title: "Zoho summer internship drive", description: "Campus drive for second-year students.", deadline: days(20), requires_confirmation: true, requires_proof: false, created_by: f },
  ]));
  const now = new Date().toISOString();
  await ok("invitations", sb.from("invitations").insert([
    { id: "5eedd000-0000-0000-0000-000000000001", item_id: "5eedc000-0000-0000-0000-000000000001", student_id: U.asha[0], status: "joined", responded_at: now },
    { id: "5eedd000-0000-0000-0000-000000000002", item_id: "5eedc000-0000-0000-0000-000000000001", student_id: U.karthik[0], status: "joined", responded_at: now },
    { id: "5eedd000-0000-0000-0000-000000000003", item_id: "5eedc000-0000-0000-0000-000000000002", student_id: U.asha[0], status: "invited" },
    { id: "5eedd000-0000-0000-0000-000000000004", item_id: "5eedc000-0000-0000-0000-000000000002", student_id: U.karthik[0], status: "invited" },
    { id: "5eedd000-0000-0000-0000-000000000005", item_id: "5eedc000-0000-0000-0000-000000000003", student_id: U.asha[0], status: "declined", responded_at: now },
  ]));
  await ok("results", sb.from("results").insert([
    { invitation_id: "5eedd000-0000-0000-0000-000000000001", revision: 1, outcome: "Finalist, national round", details: "Team of four; built a flood-alert dashboard.", status: "confirmed", confirmed_by: f, confirmed_at: now },
    { invitation_id: "5eedd000-0000-0000-0000-000000000002", revision: 1, outcome: "Participated in the national round", details: "Certificate arrives next week.", status: "submitted" },
  ]));
  console.log("Demo accounts, links, items and results created.");
}

await seed();
console.log("Demo sign-in: email or register number (students 192110001 and 192110002) with DEMO_PASSWORD.");
