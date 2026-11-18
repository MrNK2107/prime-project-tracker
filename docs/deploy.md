# Deploying Prime Project Tracker

## Current state (test deployment, 17 Nov 2026)

- **Live:** https://prime-project-tracker.vercel.app (Vercel project `prime-project-tracker`, public).
- **Database:** Supabase project `prime-project-tracker`, ref `qpdecbdiswisgzbrbwzp`, region Mumbai (`ap-south-1`), migrations 0001-0007 applied (**0008_register_no is NOT yet pushed**: run `npx supabase db push --linked` before deploying the password sign-in). Its keys and database password are in the git-ignored `.env.deploy.local` and in Vercel's environment variables (the service key is stored as a Vercel secret).
- **Auth settings pushed:** new signups off, site URL set to the address above. Sign-in is by email or register number plus a password; no emails are sent, so no SMTP provider is needed to sign in.
- **Demo data:** five demo accounts (`admin@`, `principal@`, `faculty@`, `student@`, `student2@college.edu`) with sample links, items and results, created by `scripts/seed-hosted.mjs`. `ALLOWED_EMAIL_DOMAIN` is set to `college.edu` for the demo. **Before real use:** set the real domain in Vercel, create the real principal and admin (step 4 below), and delete the demo accounts.
- **Signing in to the demo:** `npm run demo:seed` (re-runnable) creates the demo accounts and sets every demo password to `DEMO_PASSWORD` from `.env.deploy.local`. Sign in with the email (for example `admin@college.edu`) or, for students, the register number (`192110001`, `192110002`).
- **Tested against the live site** (`npm run test:prod`, 5 tests): signed-out redirect, signup closed, wrong-domain refusal, every role lands on its own home and is kept out of the others, faculty posts an item needing proof, the student uploads a proof file to hosted storage and submits, faculty opens the proof through a signed link and confirms, the principal's count updates, and another student cannot read the proof.

## Email

Sign-in no longer uses email. An SMTP provider is only needed if you later add password-reset or notification emails. Forgotten passwords are reset by the admin on the Accounts page.

## Steps used (for repeating on another project)

Local development and every test pass without any of this.

## Decide before you start

- **College email domain** for `ALLOWED_EMAIL_DOMAIN` (for example `saveetha.com`; use the real one). Only addresses on this exact domain can sign in with an email (register numbers are looked up in the database).
- **The principal's and the first admin's real email addresses.** These two accounts are created by hand (below); the app never creates them.

## 1. Create the Supabase project

Create a project at supabase.com (or through the Vercel Marketplace Supabase integration, which can add the environment variables to Vercel for you). Choose a region close to the college (for example Mumbai, `ap-south-1`). Note the project ref, URL, publishable (anon) key and secret (service role) key.

## 2. Apply the database

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

This applies `supabase/migrations/0001` to `0007` (tables, row-level security, items, results, audit log, the private `proofs` storage bucket, admin functions, dashboard views).

**From now on every database change is a new migration file. Never edit an applied one.** (During development earlier files were edited in place; that stops at the first deploy.)

Do not run `supabase/dev-seed.sql` against the hosted project. It is for local sample data only.

## 3. Auth settings (Supabase dashboard, Authentication)

- **Sign In / Providers → Email:** enabled. **Allow new users to sign up: OFF** (invite-only). Confirm email: on.
- **Password:** the minimum length is enforced by the app (8 characters); Supabase's own minimum can stay at 6.
- **URL Configuration:** Site URL = the production address.

## 4. Create the first accounts by hand

In the dashboard under Authentication → Users, choose **Add user → Create new user** (tick "Auto Confirm User") for the principal and for the first admin. Then in the SQL editor:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Full Name Here', 'principal' from auth.users where email = 'principal@your-college-domain';

insert into public.profiles (id, email, full_name, role)
select id, email, 'Full Name Here', 'admin' from auth.users where email = 'admin@your-college-domain';
```

The admin then signs in, and creates every other account (faculty, students) from the Accounts page. The app refuses to create `admin` or `principal` accounts.

## 5. Vercel

Create the project from this repository, then set these environment variables for Production (and Preview if you use it):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret (service role) key. Server-only; never expose it |
| `ALLOWED_EMAIL_DOMAIN` | the college domain, without `@` |

Deploy (`vercel --prod`, or push to the production branch).

## 6. Check it works

1. Open the site; you should land on the sign-in page.
2. Sign in as the admin (email and the password you set for it). You land on `/admin`.
3. Create a department, a faculty member and a student; set the student's department, year and mentor on the Links page.
4. Sign in as the faculty member, post an item for the student; sign in as the student, join and submit a result with a proof file; confirm it as the faculty member.
5. Open the principal's Overview: it shows 1 confirmed result.
6. In the Supabase dashboard, Storage: the `proofs` bucket exists and is **private**.

## Times and dates

Times entered and shown in the app are India time (IST, UTC+05:30). Year promotion and link dates use the database's date (UTC), so a change made between midnight and 05:30 IST counts as the previous day.

## Known follow-ups (not blockers)

- A searchable student picker for very large lists on the admin Links page.
- Decide whether to revoke the server-side key's ability to write or truncate `results`, and whether the admin's audit view should be limited to account and link changes (see `docs/IMPLEMENTATION_LOG.md`, Tasks 4 and 5).
- Add the college logo and colours (they are single-place tokens in `app/globals.css`).
