#!/usr/bin/env node
// Imports the "List of Learners with Mentors" (already parsed to JSON) into the app:
// student accounts (sign in with register number), departments, study years, and mentor links.
//
//   IMPORT_PASSWORD='...' node --env-file=.env.local scripts/import-learners.mjs path/to/learners.json
//
// The JSON is an array of { reg, name, dept, passing, mentor } (keep it outside the repo: it holds students' personal
// details). Personal email addresses and phone numbers in the source list are never read or stored.
//
// Emails: every account gets <name>@saveetha.ac.in for now (students from their name, mentors like karthi.g), with
// the last three digits of the register number added only when two names would collide. They are placeholders until
// the real addresses are known. Students sign in with their register number.
//
// Passwords: IMPORT_PASSWORD gives every new account the same one (fine for a local database). Otherwise set
// IMPORT_CREDENTIALS=path/to/credentials.csv and each new account gets its own random password, written to that
// file (one row per person) for you to hand out. Passwords are never printed.
// Safe to re-run: existing accounts are matched by register number and left alone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedPassword = process.env.IMPORT_PASSWORD;
const credentialsFile = process.env.IMPORT_CREDENTIALS;
const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/import-learners.mjs learners.json");
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (sharedPassword ? sharedPassword.length < 8 : !credentialsFile) throw new Error("Set IMPORT_PASSWORD (8+ characters, same for everyone) or IMPORT_CREDENTIALS=path/to/credentials.csv (a random password each)");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const MENTOR_DOMAIN = process.env.MENTOR_DOMAIN ?? "saveetha.ac.in";
const STUDENT_DOMAIN = process.env.STUDENT_DOMAIN ?? "saveetha.ac.in";
const FROM = process.env.IMPORT_FROM ?? "2026-07-20"; // enrolment date in the sheet
const THIS_YEAR = Number(process.env.IMPORT_ACADEMIC_YEAR ?? 2026); // academic year starting in July 2026
const DEPT_NAME = {
  "AI&DS": "Artificial Intelligence and Data Science",
  AIML: "Artificial Intelligence and Machine Learning",
  CSE: "Computer Science and Engineering",
  Cybersecurity: "Cybersecurity",
  IoT: "Internet of Things",
  IT: "Information Technology",
};
const MENTOR_EMAIL = {
  "Dr. Karthi G": "karthi.g",
  "Dr. Karthika R N": "karthika.rn",
  "Ms. Hemadharsana S": "hemadharsana.s",
  "Ms. Nivetha M": "nivetha.m",
};

const rows = JSON.parse(readFileSync(file, "utf8"));
// Names as people write them: "SARAVANAN PV" -> "Saravanan PV", "A.RANEN JOSEPH SOLOMON" -> "A Ranen Joseph Solomon".
// Initials stay capitals; a word that is all capitals or all lower case is capitalised; mixed case is left as written.
const tidy = (n) =>
  n.replace(/\./g, " ").replace(/\s+/g, " ").trim().split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w === w.toUpperCase() || w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
const slug = (n) => n.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike characters
const generate = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const credentials = [];
async function ok(label, p) {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function allUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) byEmail.set(u.email, u.id);
    if (data.users.length < 200) return byEmail;
  }
}

async function ensureUser(users, email, who) {
  if (users.has(email)) return { id: users.get(email), created: false };
  const password = sharedPassword ?? generate();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  users.set(email, data.user.id);
  credentials.push({ ...who, email, password });
  return { id: data.user.id, created: true };
}

const users = await allUsers();

// Departments (by name).
const existingDepts = await ok("departments", sb.from("departments").select("id, name"));
const deptId = new Map(existingDepts.map((d) => [d.name, d.id]));
for (const code of new Set(rows.map((r) => r.dept))) {
  const name = DEPT_NAME[code];
  if (!name) throw new Error(`Unknown department code ${code}`);
  if (!deptId.has(name)) {
    const [d] = await ok("department", sb.from("departments").insert({ name }).select("id, name"));
    deptId.set(name, d.id);
  }
}

// Mentors (faculty).
const mentorId = new Map();
let mentorsCreated = 0;
for (const label of new Set(rows.map((r) => r.mentor))) {
  const email = `${MENTOR_EMAIL[label]}@${MENTOR_DOMAIN}`;
  const { id, created } = await ensureUser(users, email, { name: label, reg: "", role: "Mentor" });
  mentorsCreated += created ? 1 : 0;
  await ok(`mentor ${label}`, sb.from("profiles").upsert({ id, email, full_name: label, role: "faculty", active: true }));
  mentorId.set(label, id);
}

// Students, then their year, department and mentor links (only for students without them yet).
const have = async (table, ids) => new Set((await ok(table, sb.from(table).select("student_id").in("student_id", ids))).map((r) => r.student_id));
let created = 0;
const ids = [];
const existingByReg = new Map();
for (let i = 0; i < rows.length; i += 40) {
  for (const p of await ok("existing students", sb.from("profiles").select("id, email, register_no").in("register_no", rows.slice(i, i + 40).map((r) => r.reg)))) existingByReg.set(p.register_no, p);
}
for (const r of rows) {
  const name = tidy(r.name);
  const have = existingByReg.get(r.reg);
  let email = have?.email;
  if (!email) {
    email = `${slug(name)}@${STUDENT_DOMAIN}`;
    if (users.has(email)) email = `${slug(name)}.${r.reg.slice(-3)}@${STUDENT_DOMAIN}`;
  }
  const u = await ensureUser(users, email, { name, reg: r.reg, role: "Student" });
  created += u.created ? 1 : 0;
  await ok(`profile ${r.reg}`, sb.from("profiles").upsert({ id: u.id, email, full_name: name, role: "student", active: true, register_no: r.reg }));
  ids.push({ ...r, id: u.id });
}
const sids = ids.map((r) => r.id);
const [hasYear, hasDept, hasMentor] = await Promise.all([have("student_year", sids), have("department_memberships", sids), have("mentorships", sids)]);
const newYear = ids.filter((r) => !hasYear.has(r.id)).map((r) => ({ student_id: r.id, year: Math.min(6, Math.max(1, 5 - (r.passing - THIS_YEAR))) }));
// Passing 2027 is in the final year (4) of the 2026-27 academic year; 2028 is year 3; 2029 is year 2.
if (newYear.length) await ok("years", sb.from("student_year").insert(newYear));
const newDept = ids.filter((r) => !hasDept.has(r.id)).map((r) => ({ student_id: r.id, department_id: deptId.get(DEPT_NAME[r.dept]), valid_from: FROM }));
if (newDept.length) await ok("memberships", sb.from("department_memberships").insert(newDept));
const newMentor = ids.filter((r) => !hasMentor.has(r.id)).map((r) => ({ mentor_id: mentorId.get(r.mentor), student_id: r.id, valid_from: FROM }));
if (newMentor.length) await ok("mentorships", sb.from("mentorships").insert(newMentor));

// Structure: heads of department, and the Prime Project group (every listed learner) with its leads.
// Dr. Karthi G heads AIML and leads the group; Dr. Karthika R N is the group's coordinator (highest authority over
// its events: she can confirm any result and edit any event that reaches it).
const HODS = { AIML: "Dr. Karthi G" };
const GROUP = { name: "Prime Project", leads: [{ mentor: "Dr. Karthi G", coordinator: false }, { mentor: "Dr. Karthika R N", coordinator: true }] };
const active = (rowsArr) => rowsArr.filter((l) => l.valid_to === null || l.valid_to >= new Date().toISOString().slice(0, 10));

let hodsAdded = 0;
for (const [code, label] of Object.entries(HODS)) {
  if (!label || !deptId.get(DEPT_NAME[code])) continue;
  const d = deptId.get(DEPT_NAME[code]);
  const cur = active(await ok("hod", sb.from("hod_assignments").select("faculty_id, valid_to").eq("department_id", d)));
  if (!cur.some((h) => h.faculty_id === mentorId.get(label))) {
    await ok("hod add", sb.from("hod_assignments").insert({ faculty_id: mentorId.get(label), department_id: d, valid_from: FROM }));
    hodsAdded++;
  }
}
let [g] = await ok("group", sb.from("groups").select("id").eq("name", GROUP.name));
if (!g) [g] = await ok("group add", sb.from("groups").insert({ name: GROUP.name }).select("id"));
const inGroup = new Set(active(await ok("members", sb.from("group_members").select("student_id, valid_to").eq("group_id", g.id))).map((m) => m.student_id));
const newMembers = sids.filter((id) => !inGroup.has(id)).map((id) => ({ group_id: g.id, student_id: id, valid_from: FROM }));
if (newMembers.length) await ok("members add", sb.from("group_members").insert(newMembers));
const curLeads = active(await ok("leads", sb.from("group_leads").select("faculty_id, is_coordinator, valid_to").eq("group_id", g.id)));
let leadsAdded = 0;
for (const l of GROUP.leads) {
  if (curLeads.some((c) => c.faculty_id === mentorId.get(l.mentor) && c.is_coordinator === l.coordinator)) continue;
  await ok("lead add", sb.from("group_leads").insert({ group_id: g.id, faculty_id: mentorId.get(l.mentor), valid_from: FROM, is_coordinator: l.coordinator }));
  leadsAdded++;
}

// Hackathon and placement coordinator: sees every student, posts to anyone, tracks across the college.
let placementAdded = 0;
for (const label of ["Dr. Karthika R N"]) {
  const id = mentorId.get(label);
  const cur = active(await ok("placement", sb.from("placement_coordinators").select("faculty_id, valid_to").eq("faculty_id", id)));
  if (cur.length === 0) {
    await ok("placement add", sb.from("placement_coordinators").insert({ faculty_id: id, valid_from: FROM }));
    placementAdded++;
  }
}

console.log(`${placementAdded} placement coordinator(s).`);
console.log(`${hodsAdded} head(s) of department, group "${GROUP.name}": ${newMembers.length} members and ${leadsAdded} leads added.`);
console.log(`Students: ${rows.length} (${created} new accounts). Mentors: ${mentorId.size} (${mentorsCreated} new). Links added: ${newYear.length} years, ${newDept.length} departments, ${newMentor.length} mentorships.`);

if (credentialsFile && credentials.length) {
  const csv = ["Name,Register number,Sign in with,Initial password,Role"]
    .concat(credentials.map((c) => [c.name, c.reg, c.reg || c.email, c.password, c.role].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
    .join("\n");
  mkdirSync(dirname(credentialsFile), { recursive: true });
  writeFileSync(credentialsFile, csv + "\n", { mode: 0o600 });
  console.log(`Initial passwords for ${credentials.length} new accounts written to ${credentialsFile}`);
}
