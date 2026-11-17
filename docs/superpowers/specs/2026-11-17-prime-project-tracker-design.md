# Prime Project Tracker — Design

Date: 2026-11-17
Status: Draft, awaiting approval

## Intent and why

Faculty want to track what students are doing beyond coursework: hackathons, internships, events, Google Meets and other achievements. Faculty post an item, target it at the right students, students join and report a result, and important results are confirmed by faculty before they count.

The data is sensitive (student records, certificates, placement details). The user's stated priority is a properly structured database, so that people only ever see the students they are responsible for.

Who reads the data: mentors (their mentees), group leads (their group), HODs (their department), the principal (everyone). The user did not give a deeper "why" such as accreditation reporting or placements, so reporting features are not designed in beyond the dashboards below.

## Goals

- Faculty create items and target them precisely (group, department, year, or hand-picked students).
- Students see only items targeted at them, join, and submit results with optional proof.
- Results of important items require confirmation before counting as verified.
- Role-based visibility enforced in the database, not only in app code.
- A full audit trail of who viewed or changed what.

## Non-goals

- Grades, attendance for regular classes, timetabling.
- Running the Google Meet itself (we store the link only).
- Public-facing pages or any access for people outside the college.

## Anti-goals (failure even if it technically works)

- Any student, mentor or lead able to read another person's records outside their relationships.
- A confirmed result silently changed afterwards.
- Dashboards that mix unconfirmed claims with confirmed facts.

## Roles and visibility (user-decided)

```
Principal        → all students, read-only overview
  HOD            → every student in their department
    Mentor       → only their assigned mentees
    Group lead   → everyone in their group (e.g. Prime Project)
                   + their own mentees
Student          → only their own items and results
Admin            → manages accounts and links only; sees no results or proofs
```

Faculty roles combine: one person can be a mentor, a group lead and an HOD at once.

## Constraints

- Platform: Next.js web app on Vercel, with Supabase (Postgres, Auth, Storage) as the data layer.
- Student and faculty accounts are tied to college email addresses.
- Access rules are enforced by Postgres row-level security (RLS), including for file storage.

## Approaches considered

- **A. Postgres with RLS via Supabase (chosen).** Database enforces access, auth and file storage in one place. Trade-off: RLS policies are tricky and must be tested per role; single-vendor dependency.
- **B. Postgres plus custom backend (Neon, Auth.js).** More control, but every endpoint must remember access checks; one miss leaks data. Separate storage and auth to assemble.
- **C. Spreadsheet-style tool.** Fast, but cannot enforce per-person access or give an audit trail. Ruled out.

The user chose A.

## Decisions made together

1. **Access comes from relationships, not job titles.** A mentor sees a student via a mentor-to-student link; a group lead via group membership; an HOD via department membership.
2. **Links are dated.** Reassigning a mentor or removing a student from a group ends access but keeps history.
3. **Targeting expands to a concrete list of students.** An item aimed at a group, department, year or individuals is resolved to explicit invitations, so "who was invited" is always answerable.
4. **Faculty can only target students they can already see.**
5. **Verification is a per-item setting** set by the creating faculty member. Hackathon and internship style items would typically require it; Google Meet attendance would not.
6. **Result lifecycle:**
   ```
   Invited → Joined → Result submitted → (Confirmed | Sent back with a note)
                                          └ skipped if the item does not need confirmation
   ```
7. **Who confirms:** either the item's creator or the student's mentor. The system records who actually confirmed.
8. **Proof upload** (certificate, offer letter) is optional by default and can be required per item.
9. **Confirmed results are locked.** Corrections create a new logged revision rather than overwriting.
10. **Dashboards** for HOD and principal count confirmed results by default and show unconfirmed ones separately as claims.
11. **Audit log** (user: needed, but not strict): records all changes (confirmations, revisions, link changes, role changes) and every view or download of a proof file. Opening a student's profile is logged on a best-effort basis. Individual row reads in lists and dashboards are not logged. Change entries are append-only and cannot be edited by anyone through the app.
12. **Admin role** (user-decided: a separate admin is responsible). The admin creates and deactivates accounts and manages the links (mentor-student, group membership, department, year, HOD and group-lead assignments).

## Builder's calls (made by me, not discussed in depth; please check these)

- **Admin sees no results or proofs.** The admin manages accounts and links only (least privilege). Every admin action is in the audit log. *(My call; the user said "creative freedom" on this.)*
- **Corrections:** a student requests a correction; the confirmer or the student's mentor approves it. The old confirmed value keeps counting in dashboards until the revision is confirmed.
- **Visibility** is scoped by the viewer's current relationship to the student. The item creator also sees participants and results of their own item.
- **Relationships are checked at the moment of action.** A reassigned mentor loses access and can confirm nothing new; history stays in the audit log. A student removed from a group keeps their existing invitations and results.
- **Joining** is an explicit student action. Students can decline. There is no browsing of items not targeted at them. Deadline is an optional field on an item.
- **Sent back** returns the result to the student for resubmission, with no limit; every submission is kept.
- **Department and year:** one department per student at a time (dated); year is stored and promoted annually by the admin.
- **Proof files:** PDF, JPG or PNG, up to 5 MB, readable by anyone who can see that student's result.
- **Principal:** a single seeded account, read-only, no confirmation powers.
- **Scale assumption:** a college of a few thousand students; fits free or low-tier Supabase to start.

## Left to the builder

- Exact table design, naming, and policy structure.
- How department, year and batch are modelled, within the relationship-based approach above.
- Notification mechanism (email or in-app), if any.
- Item types beyond the four named, and their per-type fields.
- UI design and layout.
- Test strategy; at minimum, an automated access test for every role against every table.
- Seed data and onboarding of the first users.
