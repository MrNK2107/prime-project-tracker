# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Saveetha Engineering College. Four roles, all using the app on both desktop and mobile with equal importance (user-confirmed):
- Students: see items targeted at them, join or decline, submit results with optional proof, request corrections.
- Faculty: create and target items; review and confirm results. One person can be mentor, group lead and HOD at once.
- Admin: manages accounts, relationship links and year promotion, and (user decision, Nov 2026) can read everything: all students, items, results, proof files, dashboards and the audit log. The admin reads but does not confirm results or post items.
- Principal: read-only overview of every student.

## Product Purpose

Faculty track what students do beyond coursework (hackathons, internships, events, Google Meet sessions, achievements). Faculty post an item and target it by group, department, year or hand-picked students. Students join and report a result; important results are confirmed by a mentor or the item's creator before they count. Success: people see exactly the students they are responsible for, and confirmed numbers are trustworthy.

## Positioning

Access is enforced in the database by dated relationships (mentor, group lead, HOD), not by app-side filtering, with an append-only audit trail. Dashboards separate confirmed results from unconfirmed claims.

## Operating Context

Invite-only: accounts are created by an admin, sign-in is by college email or student register number plus a password (the admin sets the first password and can reset it; people change their own under Password). Proof files are PDF, JPG or PNG up to 5 MB and are viewed through short-lived signed links. Hosted on Vercel with Supabase.

## Capabilities and Constraints

- Next.js 16 App Router (`proxy.ts`, not middleware), TypeScript, Supabase. Role homes: `/student`, `/faculty`, `/admin`, `/overview` (principal).
- Data is sensitive student records; the UI must never imply access the user does not have (an empty list is a normal state, not an error).
- Confirmed and unconfirmed (claimed) results must never be visually mixed.
- Meeting links render only if `https`.
- Open decision: college logo and brand colours (user said details would be provided; none received yet).

## Brand Commitments

Institution: Saveetha Engineering College. App name: Prime Project Tracker. Logo, colours and any further identity details are pending from the user and must not be invented.

## Evidence on Hand

No logo or brand files in the repository (`public/` holds only create-next-app defaults). Absent: testimonials, usage metrics.

## Product Principles

- Trust over flash: sensitive records deserve calm, legible, unambiguous screens.
- Show only what the person is responsible for; empty states explain, never alarm.
- Verified and claimed are always visibly different.
- Every screen works equally well on a phone and a desktop, for every role.
- Common tasks (join, submit, confirm) take as few steps as possible.

## Accessibility & Inclusion

Used by a broad college population on mixed devices: meet WCAG AA contrast, keyboard operability and visible focus, touch targets suitable for phones.
