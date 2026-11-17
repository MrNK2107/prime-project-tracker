# Prime Project Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app where faculty post targeted items (hackathon, internship, event, meeting), students join and report results, important results are confirmed by faculty, and every role sees only the students it is responsible for.

**Architecture:** Next.js (App Router, TypeScript) front end on Vercel over Supabase Postgres. All access rules live in Postgres row-level security, driven by dated relationship tables (mentorship, group membership, department membership) and one SQL function `can_see_student`. The app never uses the service-role key except in the audit/proof server routes and the admin screens. Access is proven by pgTAP tests per role per table.

**Tech Stack:** Next.js + TypeScript, Supabase (Postgres, Auth, Storage), Supabase CLI migrations, pgTAP (`supabase test db`), Vitest, Playwright (one smoke path).

**Spec:** `docs/superpowers/specs/2026-11-17-prime-project-tracker-design.md`

## Global Constraints

- Roles: `student`, `faculty`, `admin`, `principal`. Faculty responsibilities (mentor, group lead, HOD) come from relationship rows, never from a role value. One faculty member can hold several.
- All relationship rows are dated: `valid_from date not null`, `valid_to date null`. A link is active when `valid_from <= current_date and (valid_to is null or valid_to >= current_date)`. Never delete a link; set `valid_to`.
- Access is enforced by RLS on every table. No table is readable without a policy.
- Admin manages accounts and links only; admin has no read access to `items`, `invitations`, `results`, proof files.
- Principal: single seeded account, read-only, cannot confirm.
- Confirmation: allowed to the item's creator or the student's active mentor, evaluated at the moment of confirming. Record `confirmed_by`.
- A confirmed result is immutable. A correction creates a new revision; the old confirmed value counts until the new one is confirmed.
- Proof files: PDF, JPG or PNG, max 5 MB (5242880 bytes).
- Audit log is append-only. Changes always logged; proof views always logged; profile opens best-effort; list/dashboard reads not logged.
- Dashboards count confirmed results only by default; unconfirmed shown separately as claims.
- Login is invite-only: a session is valid only if a `profiles` row exists with `active = true`.
- Env: `ALLOWED_EMAIL_DOMAIN` (college domain, value supplied by the user at deploy time).

## Review Focus

1. Faculty with no links, or a student with no mentor or group: sees zero other students (empty, not an error).
2. Mentor reassigned while a result is pending: the old mentor can no longer confirm; the new one can.
3. Student re-joins or declines twice, or is invited twice to the same item: no duplicate invitation, no second result.
4. Deactivated user with a still-valid session: every query returns nothing and writes fail.
5. Proof upload of the wrong type, over 5 MB, or reading another student's proof by guessing the path: rejected.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: Next.js app in repo root (`app/`, `package.json`), `supabase/config.toml`, `vitest.config.ts`, `supabase/tests/00_smoke.sql`, `.gitignore`

**Interfaces:**
- Produces: `npm test` (Vitest), `supabase test db` (pgTAP) both runnable and green; `lib/supabase/server.ts` exporting `createServerClient(): SupabaseClient` and `createServiceClient(): SupabaseClient` (service role, server-only).

- [ ] **Step 1:** `git init`; scaffold Next.js (App Router, TypeScript); `supabase init`; add Vitest.
- [ ] **Step 2:** Write `supabase/tests/00_smoke.sql` asserting `select plan(1); select ok(true); select * from finish();`. Run `supabase start` then `supabase test db`. Expected: PASS.
- [ ] **Step 3:** Write `lib/supabase/server.ts` with the two factory functions; service client reads `SUPABASE_SERVICE_ROLE_KEY` and throws if imported from client code (`import "server-only"`).
- [ ] **Step 4:** Run `npm test` with one trivial test. Expected: PASS. Commit.

### Task 2: Identity and relationship schema with `can_see_student`

**Files:**
- Create: `supabase/migrations/0001_identity.sql`, `supabase/tests/10_visibility.sql`

**Interfaces:**
- Produces tables: `profiles(id uuid pk references auth.users, email text unique, full_name text, role user_role, active bool default true)`; `departments(id, name)`; `student_year(student_id, year smallint)`; `department_memberships(student_id, department_id, valid_from, valid_to)`; `hod_assignments(faculty_id, department_id, valid_from, valid_to)`; `groups(id, name)`; `group_members(group_id, student_id, valid_from, valid_to)`; `group_leads(group_id, faculty_id, valid_from, valid_to)`; `mentorships(mentor_id, student_id, valid_from, valid_to)`.
- Produces functions (security definer, stable): `is_active_user() returns bool`; `current_role_of() returns user_role`; `can_see_student(viewer uuid, student uuid) returns bool` — true when viewer = student, or viewer is principal, or an active mentorship, group lead of a group the student is an active member of, or HOD of the student's active department.

- [ ] **Step 1:** Write `10_visibility.sql` pgTAP tests with a fixture of 2 departments, 2 mentors, 1 group "Prime Project", 4 students. Assertions: mentor sees own mentee and not another's; group lead sees all group members plus own mentees; HOD sees only own department; principal sees all; student sees only self; faculty with no links sees 0 rows in `profiles` for students; an ended link (`valid_to` yesterday) grants nothing; inactive user sees 0 rows.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write migration `0001_identity.sql`: enum, tables, `can_see_student`, RLS on all tables. `profiles` select policy: `can_see_student(auth.uid(), id) or id = auth.uid()` for students rows; faculty/admin profile rows readable by authenticated active users (needed to show creator names). Link tables writable only by `admin`.
- [ ] **Step 4:** Run `supabase test db`. Expected: PASS. Commit.

### Task 3: Items, invitations, targeting

**Files:**
- Create: `supabase/migrations/0002_items.sql`, `supabase/tests/20_items.sql`

**Interfaces:**
- Consumes: `can_see_student`, `current_role_of`.
- Produces: `items(id, type item_type, title, description, meeting_url, starts_at, deadline, requires_confirmation bool, requires_proof bool, created_by, created_at)` with `item_type in ('hackathon','internship','event','meeting')`; `invitations(id, item_id, student_id, status invitation_status default 'invited', responded_at)` unique `(item_id, student_id)`, status in `invited, joined, declined`.
- Produces: `create_item(p_item jsonb, p_group_ids uuid[], p_department_ids uuid[], p_years smallint[], p_student_ids uuid[]) returns uuid` — faculty only; inserts the item, expands targets to the union of matching students, **keeps only students for whom `can_see_student(auth.uid(), student)` is true**, inserts invitations, returns item id.
- Produces: `respond_to_invitation(p_invitation_id uuid, p_status invitation_status) returns void` — invited student only, status `joined` or `declined`, rejects after `deadline`.

- [ ] **Step 1:** Write tests: mentor targeting a student outside their mentees creates no invitation for them; targeting group + hand-picked student yields the union with no duplicates; `create_item` by a student fails; student sees only own invitations and the items behind them; student cannot see an item they were not invited to; joining after `deadline` fails; declining then joining again (before deadline) updates the same row, no second invitation; admin sees 0 items.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration and RLS: items readable by creator, by invited students, and by anyone who `can_see_student` of an invited student (visibility rule: relationship to the student, plus creator).
- [ ] **Step 4:** Run `supabase test db`. Expected: PASS. Commit.

### Task 4: Results, confirmation and revisions

**Files:**
- Create: `supabase/migrations/0003_results.sql`, `supabase/tests/30_results.sql`

**Interfaces:**
- Consumes: `invitations`, `items`, `can_see_student`.
- Produces: `results(id, invitation_id, revision int, outcome text, details text, proof_path text null, status result_status, review_note text null, confirmed_by uuid null, confirmed_at timestamptz null, submitted_at timestamptz)` unique `(invitation_id, revision)`; `result_status in ('submitted','sent_back','confirmed','superseded')`.
- Produces: `submit_result(p_invitation_id uuid, p_outcome text, p_details text, p_proof_path text) returns uuid` — joined student only; if `requires_proof` and `p_proof_path` is null, fails; if the item does not require confirmation, stores status `confirmed` with `confirmed_by = null`.
- Produces: `review_result(p_result_id uuid, p_decision text, p_note text) returns void` — `p_decision in ('confirm','send_back')`; caller must be the item creator or an active mentor of the student *now*; principal and admin rejected.
- Produces: `request_correction(p_result_id uuid, p_outcome text, p_details text, p_proof_path text) returns uuid` — student, on a confirmed result, inserts revision n+1 as `submitted`.
- Trigger: rows with status `confirmed` reject any update except `status -> superseded` (done only by the function that confirms the next revision).

- [ ] **Step 1:** Write tests: submit without required proof fails; item without confirmation auto-confirms; creator confirms; current mentor confirms; **old mentor (link ended) cannot confirm, new mentor can**; HOD, principal, admin cannot confirm; send back returns to student and resubmission adds a revision; direct `update` of a confirmed row fails even for the confirmer; correction leaves old row `confirmed` until the new revision is confirmed, then old becomes `superseded`; second correction while one is pending fails.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL.
- [ ] **Step 3:** Implement tables, functions, lock trigger and RLS (results readable by whoever `can_see_student` of the student, plus the item creator; no direct insert/update policy, only via the functions).
- [ ] **Step 4:** Run `supabase test db`. Expected: PASS. Commit.

### Task 5: Audit log

**Files:**
- Create: `supabase/migrations/0004_audit.sql`, `supabase/tests/40_audit.sql`, `lib/audit.ts`

**Interfaces:**
- Produces: `audit_log(id bigserial, at timestamptz default now(), actor_id uuid, action text, entity text, entity_id text, detail jsonb)`; `revoke update, delete` for all roles; select allowed to principal and admin only.
- Produces: SQL triggers writing `action` values `insert`/`update` on `results`, `items`, `invitations`, all link tables and `profiles`.
- Produces: `lib/audit.ts` exporting `logEvent(action: string, entity: string, entityId: string, detail?: Record<string, unknown>): Promise<void>` using the service client; swallows its own errors for profile-open events only (`action = 'profile_open'`), throws for others.

- [ ] **Step 1:** Write tests: confirming a result writes one `audit_log` row with the confirmer as actor; mentor reassignment writes a row; `update audit_log` and `delete from audit_log` fail for every role including service-side app role; mentor cannot select `audit_log`.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL.
- [ ] **Step 3:** Implement migration and `lib/audit.ts`; add a Vitest test that `logEvent('profile_open', ...)` does not throw when the insert fails, and `logEvent('proof_view', ...)` does.
- [ ] **Step 4:** Run both test suites. Expected: PASS. Commit.

### Task 6: Proof storage

**Files:**
- Create: `supabase/migrations/0005_storage.sql`, `app/api/proof/[resultId]/route.ts`, `supabase/tests/50_storage.sql`, `app/api/proof/proof.test.ts`

**Interfaces:**
- Consumes: `results.proof_path`, `can_see_student`, `logEvent`.
- Produces: private bucket `proofs`; object path convention `{student_id}/{uuid}.{pdf|jpg|png}`; storage policies: student uploads only into their own folder, max 5242880 bytes, mime in `application/pdf, image/jpeg, image/png`; no direct select policy for anyone.
- Produces: `GET /api/proof/[resultId]` — verifies the caller `can_see_student` of the result's student (via the user-scoped client), calls `logEvent('proof_view', 'result', resultId)`, returns a 60-second signed URL as `{ url: string }`; 404 otherwise.

- [ ] **Step 1:** Write tests: upload of `.exe`, of a 5242881-byte file, and into another student's folder all fail; the route returns 404 for a user who cannot see the student, and a URL plus one `proof_view` audit row for a mentor who can.
- [ ] **Step 2:** Run `supabase test db` and `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement policies and the route.
- [ ] **Step 4:** Run both suites. Expected: PASS. Commit.

### Task 7: Invite-only login and session gate

**Files:**
- Create: `middleware.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `lib/session.ts`, `lib/session.test.ts`

**Interfaces:**
- Produces: `getSessionProfile(): Promise<{ id: string; role: UserRole; fullName: string } | null>` — null when unauthenticated, no `profiles` row, or `active = false`.
- Middleware redirects null sessions to `/login` and redirects each role to its home: `/student`, `/faculty`, `/admin`, `/overview` (principal).

- [ ] **Step 1:** Write Vitest tests for `getSessionProfile` with a mocked client: no row → null; inactive → null; active student → profile.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement email one-time-code login (Supabase OTP); reject emails outside `ALLOWED_EMAIL_DOMAIN` before sending a code.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 8: Admin screens (accounts, links, year promotion)

**Files:**
- Create: `app/admin/**`, `lib/admin/actions.ts`, `lib/admin/actions.test.ts`, `supabase/migrations/0006_admin_ops.sql`

**Interfaces:**
- Produces server actions in `lib/admin/actions.ts`: `createUser(email: string, fullName: string, role: UserRole): Promise<string>`, `setActive(userId: string, active: boolean): Promise<void>`, `assignMentor(mentorId: string, studentId: string): Promise<void>` (ends the existing active link first), `addToGroup(groupId, studentId)`, `removeFromGroup(groupId, studentId)`, `assignHod(facultyId, departmentId)`, `assignGroupLead(groupId, facultyId)`, `moveDepartment(studentId, departmentId)` (ends current, starts new), `promoteYear(departmentId?: string): Promise<number>` (returns students updated). All callable only when `getSessionProfile().role === 'admin'`; each is audited.
- Produces: `supabase/seed.sql` with the single principal account placeholder.

- [ ] **Step 1:** Write Vitest tests: non-admin calling any action throws; `assignMentor` twice leaves exactly one active link and one ended link; `setActive(false)` is followed by `getSessionProfile` null; `promoteYear` increments only the given department.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement actions and basic tables/forms for each (no design polish).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 9: Faculty screens (create item, review queue, student profile)

**Files:**
- Create: `app/faculty/**`, `lib/faculty/queries.ts`, `lib/faculty/queries.test.ts`

**Interfaces:**
- Consumes: `create_item`, `review_result`, `logEvent`.
- Produces: `listReviewQueue(): Promise<ReviewRow[]>` (submitted results the caller may confirm, via RLS plus the confirm rule); `listVisibleStudents(): Promise<StudentRow[]>`; `getStudentProfile(studentId: string): Promise<StudentProfile | null>` — logs `profile_open` best-effort; null when not visible.

- [ ] **Step 1:** Write tests: `getStudentProfile` for a non-visible student returns null and logs nothing; a faculty member with no links gets `[]` from `listVisibleStudents` and `listReviewQueue`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement queries and pages: item form with target pickers limited to `listVisibleStudents`, the verification and proof toggles, review queue with confirm / send back + note, student profile page.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 10: Student screens (inbox, join, submit, correction)

**Files:**
- Create: `app/student/**`, `lib/student/queries.ts`, `lib/student/queries.test.ts`

**Interfaces:**
- Consumes: `respond_to_invitation`, `submit_result`, `request_correction`, upload to `proofs`.
- Produces: `listMyInvitations(): Promise<InvitationRow[]>`; `uploadProof(file: File): Promise<string>` (returns the storage path, rejects client-side on type or size before upload).

- [ ] **Step 1:** Write tests: `uploadProof` rejects a 6 MB file and a `.docx` without calling storage; `listMyInvitations` returns only the caller's rows.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement queries and pages: inbox with Join / Decline, result form with optional or required proof, status badge (submitted, confirmed, sent back with note), "request correction" on confirmed results.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Commit.

### Task 11: Dashboards (HOD, principal)

**Files:**
- Create: `supabase/migrations/0007_dashboards.sql`, `supabase/tests/60_dashboards.sql`, `app/overview/**`, `app/faculty/department/**`

**Interfaces:**
- Produces views (`security_invoker = true`, so RLS applies): `confirmed_results_by_student(student_id, item_type, count)` and `unconfirmed_claims_by_student(student_id, item_type, count)`; a result with an old confirmed revision and a pending correction counts once, under confirmed.

- [ ] **Step 1:** Write tests: HOD sees only own-department students' rows; principal sees all; a pending correction does not change the confirmed count; claims view excludes confirmed rows.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL.
- [ ] **Step 3:** Implement views and two pages showing confirmed and claims in separate sections.
- [ ] **Step 4:** Run `supabase test db`. Expected: PASS. Commit.

### Task 12: Cross-role access matrix and deploy

**Files:**
- Create: `supabase/tests/90_access_matrix.sql`, `e2e/smoke.spec.ts`, `docs/deploy.md`

- [ ] **Step 1:** Write `90_access_matrix.sql`: for each role (student, mentor, group lead, HOD, principal, admin, inactive user) and each table, assert the exact visible row count against a shared fixture and that writes outside the role's functions fail.
- [ ] **Step 2:** Run `supabase test db`. Expected: PASS; fix any policy that fails.
- [ ] **Step 3:** Write one Playwright path: admin creates mentor and student and link → mentor creates a hackathon item requiring confirmation → student joins, submits with proof → mentor confirms → HOD dashboard shows 1 confirmed. Run `npx playwright test`. Expected: PASS.
- [ ] **Step 4:** Create the Supabase project through the Vercel Marketplace integration, apply migrations, set `ALLOWED_EMAIL_DOMAIN` and keys, deploy to Vercel; record the steps in `docs/deploy.md`. Commit.
