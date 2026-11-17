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

## Status: RESUMED (was paused at your request)
On resume, the Task 4 implementer had been cut off by a network error and left unfinished, uncommitted files. I resumed the same implementer to verify and finish them rather than starting over. The notes below are the state at the time of the pause.
- Complete and reviewed: Tasks 1, 2, 3 (last committed code: `f478502`; last log commit: `dd1fca4`).
- In flight: Task 4 (results, confirmation, corrections). Its implementer was dispatched before the pause and may finish on its own. Nothing from it has been reviewed or logged yet, so treat Task 4 as unverified until it goes through review.
- Next on resume: review Task 4, then Tasks 5 to 12 in order.
- Will stop and ask you before: Task 12 step 4 (creating the hosted Supabase project and deploying to Vercel).
- Carried-forward rules for later tasks: signup must be turned off and the college email domain enforced (Task 7); the admin create-user action must refuse the roles `admin` and `principal` (Task 8); the faculty screen must only render `https` meeting links (Task 9).
- Machine state: Docker Desktop is running and the local database stack is up. Nothing is deployed anywhere.
