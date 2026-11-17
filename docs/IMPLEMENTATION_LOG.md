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
