# Implementation Log — Prime Project Tracker

This is the running record of the build: what was done, in what order, which decisions were made and why. It is updated after every task. The machine-oriented ledger is `.superpowers/sdd/2026-11-17-prime-project-tracker/progress.md` (git-ignored); this file is the human-readable version.

- Spec: `docs/superpowers/specs/2026-11-17-prime-project-tracker-design.md`
- Plan: `docs/superpowers/plans/2026-11-17-prime-project-tracker.md`
- Method: one fresh subagent per task, a separate reviewer after each task, then a whole-branch review at the end.
- Branch: `build/initial`

## Timeline

### 2026-11-17 — Setup
- Initialised a git repository in the project folder (it was not one before), created branch `build/initial`, committed the spec and plan (`db3d4ef`).
- Toolchain check: git, node 24, npm and Docker are installed. The Supabase CLI is not installed globally, so the build uses `npx supabase` (v3.2.0).
- Docker Desktop was installed but not running. It is needed for the local database, so I started it.
- Ran the pre-flight scan across all 12 tasks and every interface pair; no conflicts. Results are in the ledger.

**Decisions so far**
| Decision | Reason | Cost if wrong |
|---|---|---|
| Use `npx supabase` | CLI not installed | Slower first run |
| Audit log entries for results store ids and status only, never the result text | Admin can read the audit log but must not see results | None; conservative choice |
| Stop before Task 12 step 4 (creating the hosted Supabase project and deploying) and ask you | Creates external resources | n/a |
| Work on a new branch in a new repo | Nothing existed to protect | None |

## Task log
_(one entry per task is added below as it completes: commits, tests run, review result, rulings)_

### Task 1 — Project scaffold and test harness — DONE (review: approved)
- Commit `10c521d`: Next.js (App Router, TypeScript) app, local Supabase stack (`supabase/config.toml`), Vitest and pgTAP harness, `.env.example`, `lib/supabase/server.ts` with `createServerClient()` and `createServiceClient()`.
- Tests: `npm test` 2 passing; `npx supabase test db` smoke passing; `next build` passing. The implementer proved both test runners can fail by breaking an assertion first, then restored it.
- Review: no Critical or Important issues. The service-role client is marked `server-only`, so it cannot be bundled into browser code. No secrets committed; `.env*` is git-ignored.
- Rulings:
  - `createServerClient()` is async (returns a Promise) because Next 16's `cookies()` is async. Every later task must `await` it.
  - Local config has self-signup enabled. Task 7 must turn it off (invite-only login) and enforce the college email domain.
- Minor, not fixed: no unit test for `createServerClient`; env restore in the test replaces the whole object; vitest config prints a harmless CJS warning.

### Task 2 — Identity and relationship schema with `can_see_student` — DONE (review: approved after 1 fix round)
- Commits: `1e7734f` (schema, functions, row-level security, 55 tests), `51d8baa` (fixes after review).
- Built: `profiles` plus 8 relationship tables (departments, student years, department memberships, HOD assignments, groups, group members, group leads, mentorships), all dated. `can_see_student(viewer, student)` is true for the student themself, the principal, an active mentor, a group lead of a group the student is in, or the HOD of the student's department. Ended links, inactive users and nulls give false. Security-sensitive functions are hardened (fixed search path, execute rights limited to signed-in users).
- Tests: 63/63 passing (`npx supabase test db`), asserting exact sets of visible students per role. The implementer proved the tests can fail by breaking the ended-link rule on purpose.
- Review found two Important problems, both fixed in round 1 and verified by a second review:
  1. An admin could edit their own profile, make themselves faculty, and so gain student visibility (confirmed with a test probe). Now admins cannot touch their own row, cannot create or promote admins, and cannot touch other admins.
  2. The spec's "one department per student at a time" was not enforced, so overlapping rows would let two HODs see one student. Now a database constraint rejects overlaps.
- Also hardened: only `valid_to` can be updated on link rows (history cannot be rewritten); TRUNCATE revoked.
- Rulings:
  - Links are active through `valid_to` inclusive. Ending access today means `valid_to = yesterday`.
  - A link created and ended on the same day stays active that day (up to one day of extra access on a mistaken link). The admin screens (Task 8) will validate dates.
  - Admin accounts are created outside the app; the app's create-user action must refuse role `admin` or `principal`.
- Deferred minors: `service_role` cannot call the helper functions (check when building server code); `profiles.email` not tied to the auth email; a few extra test cases (ended group-lead link, ended department with active HOD link).

### Task 3 — Items, invitations and targeting — DONE (review: approved after 1 fix round)
- Commits: `6350722` (items and invitations tables, `create_item`, `respond_to_invitation`, row-level security, 59 tests), `f478502` (read-path performance fix).
- Built: faculty create an item and target it by group, department, year or hand-picked students. The system expands that into one invitation per student, and silently drops any student the faculty member is not allowed to see (spec Decision 4). Students join or decline in place (no duplicate rows), and not after the deadline. Writes only go through the two functions; nobody can write the tables directly. Admin sees no items or invitations; the principal sees everything but cannot create or respond.
- Tests: 135 assertions passing overall (72 in the items file). Includes exact-set checks for the union without duplicates, join after deadline failing, and decline then join reusing the same row.
- Review found no access-control hole. It found one Important problem, now fixed: the read rules checked every invitation in the system for each query, which would slow down badly at a few thousand students. They now use an indexed fast path plus one set-based visibility helper, `visible_student_ids()`. A new test proves it returns exactly the same students as the original rule for nine different users (student, inactive student, mentor, group lead, HOD, faculty with no links, inactive faculty, principal, admin).
- Rulings (the implementer's calls, accepted):
  - The principal sees every item, including ones with no invitations.
  - Inactive students and non-students are never invited, even if named.
  - A deadline already in the past is accepted when creating an item (the screen should warn).
  - Error codes callers can rely on: 42501 (not allowed), 22023 (bad input), P0001 (deadline passed).
  - Until the first real deploy (Task 12), database migration files are edited in place; after it, every change is a new migration.
- Deferred minors: meeting links are not validated (a `javascript:` link would be a risk, so the faculty screen in Task 9 must only render `https` links); a student's status could still be flipped after a result exists (Task 4 will lock that); more test cases for ended and future-dated links.

### Task 4 — Results, confirmation and revisions — DONE (review: approved, no fix round needed)
- Commit: `0f785dd`. (The implementer was cut off by a network error mid-task; I resumed the same implementer, which re-verified and finished.)
- Built: students submit a result for an item they joined, with optional or required proof. Items that do not need confirmation store the result as confirmed straight away. Otherwise only the item's creator or the student's current mentor can confirm or send it back, checked at the moment they act. HODs, group leads, the principal, the admin and the student themself cannot. A sent-back result returns to the student, and each resubmission is a new numbered revision. A confirmed result is locked by a database trigger. A student can request a correction, which becomes a new revision that must be confirmed. The old value keeps counting until then, and is then marked superseded. History can never be deleted. A student can no longer switch from joined to declined once a result exists.
- Tests: 211/211 passing (76 in the new results file), with exact checks on revision and status order, who confirmed, and error codes. The implementer proved the new "no un-join" test fails without its fix.
- Review: no Critical or Important issues. The reviewer traced race conditions (two people confirming at once, two correction requests at once) and found them closed by row locking plus unique rules.
- Rulings:
  - A correction is approved by the same people who can confirm a first result (item creator or current mentor). The spec's wording "the confirmer or the student's mentor" was ambiguous; this is the consistent reading.
  - Extras the implementer added, judged sound: only one confirmed row per invitation (the dashboards need this), sent-back and superseded rows are final, and a correction always goes to review even on items that do not otherwise need confirmation.
- Deferred minors (for the final review): the server-side key (`service_role`) can still truncate or insert into results, bypassing the lock, so server code must be careful and the final review should decide whether to revoke it; the lock does not restrict edits to a still-submitted row; a faculty member demoted to student by an admin would still read results of items they created; a few extra tests.

### Task 5 — Audit log — DONE (review: approved after 1 fix round)
- Commits: `2df2b1b` (audit table, triggers, `logEvent` helper), `cec4ca3` (fix after review).
- Built: an append-only `audit_log`. Every insert and update on the 12 tracked tables (results, items, invitations, profiles and all relationship tables) is recorded automatically with who did it (null for system changes). Updates that change nothing are skipped. The log can be read only by active principal and admin accounts. Nobody can update, delete or truncate it: not signed-in users, not the server-side key, not even the database owner through normal statements. If an audit write fails, the change that triggered it fails too (deliberate: changes must always be logged). `lib/audit.ts` provides `logEvent(...)` for the app-level events (proof views, profile opens). It works out the actor from the session itself and never accepts a caller-supplied actor.
- Privacy: no result text, item title or description, email or full name ever enters the log; it holds ids, changed column names, and old and new values only for non-sensitive columns (status, role, active, dates, requires flags). A test plants distinctive secret strings in results, items and profiles, runs real flows, and searches every column of the log for them.
- Tests: 287/287 database tests and 9/9 Vitest tests passing.
- Review found one Important problem, fixed in round 1 and re-verified: the server-side key could write rows with its own timestamp and id, and could forge rows that look like system-written ones. It is now limited to five columns and to three app actions (`proof_view`, `proof_download`, `profile_open`).
- Rulings and notes:
  - The guard on the server-side key runs as the caller (not the owner), because an owner-run guard can never see which role is calling.
  - The database owner can still disable the guard with admin commands. That is outside anything the app can reach, and accepted.
  - The server-side key can still choose the actor on those three events, so app code must only pass values it worked out on the server.
- **Open question for you:** the admin can read the audit log, and through it can see which students joined which kinds of item and whether their result was confirmed or sent back (never the result text). The spec says the admin sees no results. I left it as is; say if you want the admin's audit view limited to account and link changes.
- Deferred minors: audit view for the admin (above); a few extra test cases; a hardening idea for the guard (check "not the owner" instead of "is service_role").

### Task 6 — Proof storage — DONE (verified on resume; not given a separate reviewer pass)
- Commit: `3866c54`.
- Built: a private `proofs` bucket (PDF, JPG, PNG, 5 MB limit enforced by the Storage service). Students can upload only into their own folder (`{student_id}/{uuid}.{ext}`), and only while active. Nobody can read, update or delete objects directly. `GET /api/proof/[resultId]` checks the caller can read that result (through their own session), writes a `proof_view` audit row, then returns a 60-second signed URL. Anyone else, including the admin, gets 404. If the audit write fails, no URL is returned.
- Tests: 341/341 database tests, 22/22 Vitest unit tests, and 5/5 live Storage API tests (wrong type, oversize, other student's folder all rejected).
- Note: `results.proof_path` must now sit in the student's own folder (enforced in `submit_result` and `request_correction`).

### Task 7 — Invite-only login and session gate — DONE (self-verified; not given a separate reviewer pass)
- Built: email one-time-code login (`app/login`). An address outside `ALLOWED_EMAIL_DOMAIN` is rejected before any code is sent. Hosted signup is off (`enable_signup = false`, checked against the local API: signup and OTP-create both return 422). The login screen gives the same answer whether or not an account exists. `getSessionProfile()` returns null for no session, no `profiles` row, an inactive account, or a query error. `proxy.ts` sends signed-out users to `/login` and each role to its own home (`/student`, `/faculty`, `/admin`, `/overview`), and keeps users out of other roles' sections. `/api` routes are skipped by the proxy because they return 401/404 themselves.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`; I followed the bundled docs, so the plan's file name differs.
- Tests: 36 Vitest tests passing (session gate with mocked client, redirect rules, domain check including lookalike domains such as `evil-college.edu` and `college.edu.evil.com`), 341 database tests passing, types and lint clean. Not yet tested against a running browser; the Task 12 smoke test will cover that.
- Deferred: the role homes (`/student` etc.) do not exist yet (Tasks 8 to 11), so a signed-in user currently lands on a 404. Set `ALLOWED_EMAIL_DOMAIN` in `.env.local` to try the login locally.

### Design system and app shell — DONE (self-verified, finish reviewer not run)
- Direction (user-chosen, "Hall ticket & seal"): cool off-white ground, ink-blue shell and primary actions, teal-green seal for confirmed results, dashed amber for unconfirmed claims, red only for errors. Source Sans 3 body, Source Serif 4 titles. Colours are CSS tokens in `app/globals.css`, so the Saveetha Engineering College logo and colours can be swapped in once supplied (not yet received; the college name is shown as text only).
- Built: `PRODUCT.md`, design tokens and shared classes (buttons, fields, badges, record cards, empty states), a sign-in page (split layout on desktop, stacked on phone, code step with error and a way back), an app shell (top bar with tabs on desktop, bottom tab bar on phones, sign-out, skip link, loading skeleton), and placeholder home pages for the four roles so signed-in users no longer hit a 404.
- Bugs found by looking at the real render: (1) the default Supabase sign-in email had no code, only a link, so the code screen could never work; added `supabase/templates/magic_link.html` and set it in `supabase/config.toml` (hosted Supabase needs the same template pasted in at deploy time). (2) Next 16 Cache Components flagged reading the session during prerender; the shell now reads it behind Suspense with `connection()`.
- Checked: desktop and 390px phone screenshots of sign-in and shell, full sign-in with a real emailed code, types, lint, 36 unit tests, production build, design detector (no findings).
- Carry forward: Tasks 8 to 11 must use these tokens and classes. Pages add nav entries in `lib/nav.ts`.

### Task 8 — Admin screens — DONE (self-verified; no separate reviewer pass)
- Built: `supabase/migrations/0006_admin_ops.sql` (atomic admin functions: assign mentor, add/remove group member, assign HOD, add/remove group lead, move department, set year, promote year; each refuses non-admins with 42501 and runs as the caller so row-level security still applies). `lib/admin/actions.ts` (the server functions from the plan plus `createDepartment`, `createGroup`, `setStudentYear`, `removeGroupLead`), `lib/admin/queries.ts`, and three screens: Accounts (`/admin`: create account, deactivate/reactivate with confirmation, placement shown per student), Links (`/admin/links`: Mentors, Groups, Departments tabs), Years (`/admin/years`: promote one department or all).
- Safety: every action checks for an active admin first, then the database checks again. `createUser` refuses `admin` and `principal` roles and non-college emails, and removes the sign-in account again if the profile insert fails. A same-day second department change is refused with a clear message (history cannot be rewritten). Promotion skips inactive students, students without a year, and never goes past Year 6. The admin functions are not browser-callable "use server" endpoints; only the form wrappers in `app/(app)/admin/form-actions.ts` are.
- Tests: 362/362 database tests (21 new, 60_admin.sql) and 96 Vitest tests (60 new: every action rejects student, faculty, principal and signed-out callers without touching the database). Checked in the browser as admin: created a group, assigned a mentor, desktop and 390px layouts. Production build passes.
- Local dev: `npm run seed:local` loads sample people (admin, principal, faculty, two students; sign in with an emailed code from http://127.0.0.1:54324). Seeding is deliberately not part of `supabase db reset`, because the database tests count whole tables and fail on a seeded database: run `npx supabase db reset` before `npm run test:db`.
- Deferred: the group and department tabs use plain selects (fine for a department, slow for thousands of students; a searchable picker is a later improvement); promotion has no undo beyond setting years by hand; the principal account and first admin for production are created at deploy (Task 12).

### Tasks 9 to 12 — DONE except the hosted deploy (self-verified; no separate reviewer passes)
- **Task 9, faculty screens** (`e58835f`): items list, new item form (type, deadline in IST, https-only meeting link, confirmation and proof toggles, targets by group, department, year or picked students), review queue (confirm, or send back with a required note, with audited proof viewing), students list, student profile (logs `profile_open` best-effort; unseen students give a plain 404). Queries and actions are unit-tested, including: a faculty member with no links gets empty lists, a profile of an unseen student returns null and logs nothing, a non-https meeting link is refused, the review queue only holds results the caller may confirm (item creator or current mentor).
- **Task 10, student screens** (`feat(student)`): inbox grouped into waiting, joined and declined; join/decline; result form with proof upload (type and size checked before upload, saved in the student's own folder, never overwrites); status badges; "fix and resubmit" after a send-back; "request a correction" on confirmed results, with the old value shown as still counting. Tested: 6 MB and `.docx` files are rejected without calling storage, only the caller's rows are returned, non-https links never show.
- **Task 11, dashboards**: `0007_dashboards.sql` (two security-invoker views, confirmed and unconfirmed claims, never mixed), principal Overview, head-of-department Department page (a Department tab appears for faculty who currently head a department). 14 database tests in `70_dashboards.sql` (the plan called it 60; 60 was taken).
- **Task 12**: `supabase/tests/90_access_matrix.sql`: for 9 roles (student, mentor, group lead, HOD, faculty with no links, inactive user with a live link, admin, principal, anonymous) the exact visible row count in all 12 tables plus audit-log readability, with every direct write refused, and named checks that a mentor, a student and an HOD cannot read results outside their relationships. Every hand-derived count matched on the first run. `e2e/smoke.spec.ts` (Playwright, uses installed Chrome) runs the whole story and passes: admin creates a mentor/HOD, a student, a department and links; mentor posts a hackathon needing confirmation and proof; student joins and submits a proof file; mentor confirms; the department dashboard shows exactly 1 confirmed and no claims.
- Totals: 403 database tests, 163 unit tests, 1 end-to-end test, types, lint and production build clean.
- Bugs found by running it: after sign-in the address stayed at `/` instead of the role home (the login action now redirects straight to the home and rejects accounts without an active profile); admin and faculty pages needed Suspense loading states under Next 16 Cache Components; sign-in could be clicked before the page finished loading (the test now retries; real users are unaffected unless they click within the first moment).
- **Not done: step 4, the hosted Supabase project and Vercel deploy.** It needs your accounts and decisions, so it is written up in `docs/deploy.md` rather than run. You need to provide: the real college email domain, the principal's and first admin's email addresses, and an SMTP provider (Supabase's built-in email is too limited for a college). The Vercel CLI is not installed on this machine.
- Reminders: run `npx supabase db reset` before `npm run test:db` if you loaded the sample data with `npm run seed:local`; the end-to-end test needs `npm run seed:local` first (it signs in as `admin@college.edu`).
- Open items for you (from earlier tasks): should the server-side key keep the ability to write or truncate `results`; should the admin's audit view be limited to account and link changes.

### Change request — admin can read everything — DONE
- User decision after the first build: "admin should have access to everything". This reverses the earlier least-privilege rule (admin sees no results or proofs). Interpreted as: the admin reads every student, item, invitation, result, proof file, dashboard and the audit log, as well as managing accounts and links. The admin still cannot confirm results, post items, submit results or write results/items directly (nobody can forge records; confirming stays with the item creator or the student's current mentor).
- Database (edited in place, pre-deploy): `can_see_student` and `visible_student_ids()` treat admin like the principal; `items_select` includes admin. Results, invitations, proofs (through the audited route) and the dashboard views follow from those. Seven test expectations that encoded the old rule were changed to the new numbers; 403/403 database tests pass.
- App: a shared `/students` list and profile (faculty see their own students, admin and principal see all; students are redirected away), an Overview tab for the admin, student names in the dashboards link to profiles. Proof views by the admin are audit-logged like anyone else's. The end-to-end test now ends with the admin opening the student's profile and the overview.
- Docs updated: `PRODUCT.md`, the design spec. Note for the audit trail: reading results is not logged except proof views and profile opens, as before.

### Hosted deployment (test) — DONE
- Created Supabase project `prime-project-tracker` (`qpdecbdiswisgzbrbwzp`, Mumbai) with the Supabase CLI, applied all 7 migrations (`db push --remote`), pushed auth settings (signups off, 6-digit codes, site URL) with `config push` from a minimal auth-only config so nothing else was overwritten. Created Vercel project `prime-project-tracker`, set 4 production variables (service key as a secret), deployed to https://prime-project-tracker.vercel.app.
- Found: the free tier will not let the sign-in email template be changed without a custom email sender, so emailed codes cannot work on the hosted project yet; the demo uses admin-generated one-time links through `/auth/callback` (now checks the account is active and goes straight to the role home).
- Seeded five demo accounts and sample data (`scripts/seed-hosted.mjs`); `npm run demo:links` prints fresh sign-in links; `npm run test:prod` runs 5 tests against the live site, all passing (includes a real proof upload to hosted storage).
- Test runs left two extra "Prod smoke" items and one unconfirmed claim in the hosted demo data (history is never deleted by design).
- Still needed for real use: the real college email domain, the real principal and admin, and a custom SMTP provider (see `docs/deploy.md`).

## Status: RESUMED (was paused at your request)
On resume, the Task 4 implementer had been cut off by a network error and left unfinished, uncommitted files. I resumed the same implementer to verify and finish them rather than starting over. The notes below are the state at the time of the pause.
- Complete and reviewed: Tasks 1, 2, 3 (last committed code: `f478502`; last log commit: `dd1fca4`).
- In flight: Task 4 (results, confirmation, corrections). Its implementer was dispatched before the pause and may finish on its own. Nothing from it has been reviewed or logged yet, so treat Task 4 as unverified until it goes through review.
- Next on resume: review Task 4, then Tasks 5 to 12 in order.
- Will stop and ask you before: Task 12 step 4 (creating the hosted Supabase project and deploying to Vercel).
- Carried-forward rules for later tasks: signup must be turned off and the college email domain enforced (Task 7); the admin create-user action must refuse the roles `admin` and `principal` (Task 8); the faculty screen must only render `https` meeting links (Task 9).
- Machine state: Docker Desktop is running and the local database stack is up. Nothing is deployed anywhere.

### Change request: password sign-in, no codes (18 Nov 2026), DONE and live on the hosted site
- User decision: "remove codes entirely, just email/register no and password sign in". Removed the emailed-code login, the `/auth/callback` link route, the email template and `demo:code`/`demo:links`.
- Database: `0008_register_no.sql` adds `profiles.register_no` (3-30 letters, digits, / or -; unique ignoring case; students only).
- App: the login takes "email or register number" plus password. A register number is resolved to its email on the server (service key); every failure shows the same message. Admin creates accounts with an initial password (students also need a register number), can set a new password for any student or faculty account, and everyone can change their own at /account (current password required). Passwords are 8 to 72 characters.
- Assumptions I made (not yet confirmed): register numbers are for students only; staff sign in with email; admin and principal passwords are set outside the app.
- Tests: 403 database, unit tests incl. new identifier/admin password tests, 2 local end-to-end tests (register-number sign-in, wrong password, admin reset, self change) all pass. Migration 0008 pushed, demo passwords set, redeployed, and the 5 live-site tests pass.
- Local demo sign-in: password `Demo@1234` (`npm run seed:local`), students 192110001 and 192110002.

### Change request: role scopes, "events", and event tracking (18 Nov 2026), DONE locally (not yet on the hosted site)
- User decisions: group leads are separate from heads of department; a mentor sees only their own mentees' progress; only a head of department sees department progress; one person may hold several capacities, each with its own scope; mentors post local events for their mentees and group leads for their group; rename items to events; redesign the events page around tracking (per-event board, per-student progress, department tracking, calendar).
- Data rules were already right in the database (mentor, group lead and HOD links are separate in `can_see_student`), so no migration. What changed is that the app now keeps the capacities apart: `lib/faculty/scope.ts` computes mentees, led groups and headed departments; the Students page has one tab per capacity and a "why you see them" badge; the New event form only offers your own mentees, led groups and headed departments; the Department page and tab exist only for a head.
- Tracking: `lib/tracking.ts` (pure: stage per student, overdue, funnel, phase, calendar day; 10 unit tests), `lib/faculty/tracking.ts` (reads, run as the caller so row-level security still scopes everything). Events page: summary strip, Posted by me / Involving my students, Needs attention / Upcoming / Past / Calendar. Event page (`/faculty/events/[id]`): invited, joined, submitted, confirmed counts, a progress bar that keeps confirmed (solid) apart from awaiting (hatched), and a student-by-student table with filters. Department page: "Event tracking" table with a progress bar per event.
- Renamed items to events in the interface, nav and routes (`/faculty/events/new`, `/faculty/events/[id]`). Database names (`items`, `create_item`) are unchanged on purpose. The old "Event" type is now labelled "Other event".
- Demo data split: faculty@ is mentor only, grouplead@ (Dr. Priya Nair) leads the team, hod@ (Dr. Ramesh Kumar) heads CSE; added student3@ (Divya Menon). Seven events across the three, including an overdue one. See `docs/DEMO_ACCOUNTS.md`.
- Tests: unit tests pass; local browser suite now has 3 tests including one that signs in as the mentor, group lead and HOD and checks who sees whom (and that an unseen student's profile does not exist for them).
- Known limits: "polls" were mentioned in the request and are not built; an event's creator can still read results for students they invited even after the mentorship ends (existing rule); the hosted site still has the old demo roster until `npm run demo:seed` is run.

### Change request: real roster, AIML head, Prime Project group and coordinator (18 Nov 2026), DONE locally
- Imported the "List of Learners with Mentors" PDF: 81 students, 4 mentors, departments from the register-number branch code, study year from year of passing. Parser output is kept outside the repo (personal details); `scripts/import-learners.mjs` loads it and is safe to re-run.
- Dr. Karthi G: head of AIML, lead of the new "Prime Project" group (all 81 learners), mentor of 20. Dr. Karthika R N: coordinator of Prime Project, mentor of 14.
- New migration `0009_coordinator.sql` (a new file, since 0001 to 0008 are on the hosted database): `group_leads.is_coordinator`; `coordinates_student()`; `review_result` now also allows a coordinator of the student's group; new `update_item` lets the creator or a coordinator edit an event's title, description, meeting link, start and reply-by date (who is invited and what it requires never change); `admin_assign_group_lead(group, faculty, coordinator)`. 17 new database tests (`80_coordinator.sql`): an ordinary lead, faculty without links and the admin cannot confirm or edit; the coordinator can only act on students currently in her group.
- App: coordinator badge and checkbox in Admin > Links; Review queue includes coordinated students; "Edit event" page and button (creator or coordinator only); a browser test covers the whole path with the imported people.
- Not on the hosted site yet: it needs migration 0009 pushed and the import run there.

### Change request: placement coordinator role, audience filter, suggestions only (18 Nov 2026), DONE locally
- New role "hackathon and placement coordinator" (`0010_placement_coordinator.sql`, table `placement_coordinators`, granted by the admin in Admin > Links > Placement). While active the person sees every student, so they can post events to anyone and track progress across the college. It adds no confirm or edit authority beyond what other links give. Dr. Karthika R N holds it (and is still coordinator of the Prime Project group).
- Audience filter in priority order on both Students and Events: My mentees (default), Group: ..., Dept: ..., then All students / Everyone. Each person only gets the tabs they hold. The New event form offers any group or department and an "All students" box to a placement coordinator; everyone else only their own.
- The hackathon and internship sheets are suggestions only (`0011_event_suggestions.sql`, table `event_suggestions`, readable by staff, never by students, never written from the app). `scripts/opportunities-to-json.py` + `scripts/import-opportunities.mjs` load 281 of them (42 open hackathons, 239 internships). The New event page shows them with search and a kind filter; "Use this" only fills the form. No event is created and nobody is invited until the person chooses an audience and creates it. The earlier import, which had posted 245 events to 81 students, was removed.
- Found and fixed on the way: the API returns at most 1000 rows per request, and one group event is 81 invitations, so 13 group events would have silently truncated the tracking numbers. Tracking and the review queue now read every page (`lib/supabase/paged.ts`, tested). Checked with 16 extra group events (1296 invitations): every card showed 81.
- Not on the hosted site yet (migrations 0009 to 0011 and the imports).
