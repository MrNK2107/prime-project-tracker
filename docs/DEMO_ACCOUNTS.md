# Demo accounts

Sign in with email, or register number for students, plus password.

Mentor, group lead and head of department are three different people in the demo, so each view can be checked on its own. (In real use one person can hold several capacities; each keeps its own scope.)

| Role | Name | Email | Register no. | Sees |
|---|---|---|---|---|
| Admin | Dr. Kavitha Rao | admin@college.edu | - | everything |
| Principal | Dr. S. Venkatesan | principal@college.edu | - | everything (read only) |
| Faculty, **mentor** | Dr. Meena Iyer | faculty@college.edu | - | mentees: Asha, Karthik |
| Faculty, **group lead** | Dr. Priya Nair | grouplead@college.edu | - | Prime Project Team: Asha, Divya. No department view |
| Faculty, **head of CSE** | Dr. Ramesh Kumar | hod@college.edu | - | CSE students: Asha, Divya, plus the Department page. Not Karthik (ECE) |
| Student (CSE, year 2) | Asha Raman | student@college.edu | 192110001 | own events |
| Student (ECE, year 3) | Karthik Subramanian | student2@college.edu | 192110002 | own events |
| Student (CSE, year 2) | Divya Menon | student3@college.edu | 192110003 | own events |

## Passwords

- **Local** (after `npm run seed:local`): `Demo@1234` for all accounts. This is also in `supabase/dev-seed.sql`.
- **Hosted** (https://prime-project-tracker.vercel.app): the value of `DEMO_PASSWORD` in `.env.deploy.local`, which is git-ignored. It is not copied here on purpose. The hosted data only has the new roster after `npm run demo:seed` is run against it.

These are demo accounts with sample data only. Replace them with the real principal, admin and college email domain before real use (see `docs/deploy.md`).

## Imported learners (local database, from the Prime Project list)

`scripts/import-learners.mjs` loads 81 learners (sign in with the register number) and four mentors. Everyone gets `<name>@saveetha.ac.in` for now (placeholders until real addresses are known; the personal addresses in the source list are never stored). Locally the initial password is `Demo@1234`. On the hosted site every imported account has its own random password, written to a credentials file for hand-out.

| Mentor | Email | Mentees | Authority |
|---|---|---|---|
| Dr. Karthi G | karthi.g@saveetha.ac.in | 20 | Head of AIML (sees the whole department, 24 students), lead of the Prime Project group |
| Dr. Karthika R N | karthika.rn@saveetha.ac.in | 14 | Hackathon and placement coordinator (sees every student, posts to anyone, tracks across the college) and coordinator of the Prime Project group (confirms any result and edits any event that reaches it). Filters: My mentees, Group: Prime Project, All students |
| Ms. Hemadharsana S | hemadharsana.s@saveetha.ac.in | 17 | Mentor only |
| Ms. Nivetha M | nivetha.m@saveetha.ac.in | 30 | Mentor only |
