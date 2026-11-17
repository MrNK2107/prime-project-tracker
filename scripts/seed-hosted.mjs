#!/usr/bin/env node
// DEMO DATA for a hosted test deployment. Creates five demo accounts and sample items/results through the
// Supabase admin API, then prints one-time sign-in links (the hosted free tier cannot send the code email).
//
//   node --env-file=.env.deploy.local scripts/seed-hosted.mjs            # seed (safe to re-run) and print links
//   node --env-file=.env.deploy.local scripts/seed-hosted.mjs links       # just print fresh sign-in links
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APP_URL. Delete the demo accounts before real use.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const app = (process.env.APP_URL ?? "https://prime-project-tracker.vercel.app").replace(/\/$/, "");
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const DOMAIN = process.env.DEMO_DOMAIN ?? "college.edu";
const U = {
  admin: ["5eed0003-0000-0000-0000-000000000001", `admin@${DOMAIN}`, "Dr. Kavitha Rao", "admin"],
  principal: ["5eed0004-0000-0000-0000-000000000001", `principal@${DOMAIN}`, "Dr. S. Venkatesan", "principal"],
  faculty: ["5eed0002-0000-0000-0000-000000000001", `faculty@${DOMAIN}`, "Dr. Meena Iyer", "faculty"],
  asha: ["5eed0001-0000-0000-0000-000000000001", `student@${DOMAIN}`, "Asha Raman", "student"],
  karthik: ["5eed0001-0000-0000-0000-000000000002", `student2@${DOMAIN}`, "Karthik Subramanian", "student"],
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
  for (const [id, email, full_name, role] of Object.values(U)) {
    if (!have.has(email)) {
      const { error } = await sb.auth.admin.createUser({ id, email, email_confirm: true });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
    }
    await ok(`profile ${email}`, sb.from("profiles").upsert({ id, email, full_name, role, active: true }));
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

async function links() {
  console.log("\nOne-time sign-in links (each works once and expires in about an hour; re-run `links` for fresh ones):");
  for (const [label, [, email]] of Object.entries(U)) {
    const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw new Error(`link ${email}: ${error.message}`);
    console.log(`${label.padEnd(10)} ${email.padEnd(24)} ${app}/auth/callback?token_hash=${data.properties.hashed_token}`);
  }
}

if (process.argv[2] !== "links") await seed();
await links();
