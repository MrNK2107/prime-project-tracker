# UI redesign plan: Saveetha brand refresh

Status: PLAN ONLY, nothing built yet. Direction: "D, college brand refresh" (same structure, Saveetha identity), with the dashboard upgrades from "A" as a second stage.

## Brand sources
- **The logo image you sent** (colours read by eye from it, so confirm with the college's brand sheet if one exists): deep indigo-blue wordmark (about `#2E3192`), sky blue gear ring (about `#27AAE1`), alert red "AUTONOMOUS" tag (about `#E02F2F`), bright yellow "AFFILIATED" band (about `#FFF200`), near-black ink. Motto: "BE THE BEST", est. 2001.
- **saveetha.ac.in** (fetched): the header logo is `https://saveetha.ac.in/wp-content/uploads/2024/03/sec-logo-01as.png`; the site body font is **Poppins**; the page layout is a thin utility row, a logo row, then a main menu. The page CSS mixes plugin colours (purple, pink, amber), so I am NOT copying those; the logo is the brand authority.
- Not available: an official brand sheet or vector logo. Please supply an SVG or high-resolution PNG with a transparent background (the sent image is on black).

## Palette (replaces the tokens in `app/globals.css`, documented in `DESIGN.md`)
| Role | Now | Proposed |
|---|---|---|
| Brand / primary actions, shell | ink-blue `#1f3a6b` | Saveetha indigo `#2E3192`, darker hover `#25287A` |
| Accent / links, focus, highlights | focus blue | sky blue `#27AAE1` (used sparingly, on a deep-enough shade for contrast text `#0B7DB0`) |
| Confirmed seal | teal `#16695a` | keep teal (it must stay distinct from brand blue) |
| Unconfirmed claim | dashed amber | keep dashed amber, nudge toward the logo yellow `#FFF200` tint for the fill |
| Error / "Autonomous" tag | `#b3261e` | `#D62828` |
| Ground | cool off-white | very light blue-grey `#F5F7FC` |
All text/background pairs must pass WCAG AA (4.5:1); yellow and sky blue are decoration or large text only, never body text on white.

## Typography
Poppins for headings and the sign-in wordmark (matches the college site); keep a readable body face (Source Sans 3 or Inter) for dense tables. Drop Source Serif titles.

## Stage 1: identity (small)
1. Add the logo to `public/`, build `components/Brand.tsx` (full wordmark for sign-in, compact seal for the app bar and phone), replace `SealMark` usage.
2. Swap tokens, fonts, favicon and page title; update `DESIGN.md` and `PRODUCT.md`.
3. Sign-in page: indigo brand panel with the logo, "Be the best" motto, the yellow band as a thin accent strip; keep the form unchanged.
4. App bar: logo left, role tabs, user and password and sign-out right; thin yellow or sky-blue underline for the active tab.

## Stage 2: dashboards and student home (medium)
1. Principal Overview, HOD Department and admin Overview: stat cards (confirmed, claims, students), a simple chart of confirmed results by month and by type, clearer confirmed vs claimed treatment.
2. Student home: "Your record" summary strip (confirmed count, awaiting confirmation, open invitations) above the inbox.
3. Tables: sticky headers, search and filters on the Students and Accounts lists (also fixes the large-list follow-up).
4. Empty and loading states in the new style.

## Stage 3: polish (small)
Mobile bottom bar refresh, subtle motion on confirm (respecting reduced motion), print-friendly student profile (useful for records), dark mode only if requested.

## How each stage is checked
Desktop and 390px screenshots of every role's home, contrast check of all colour pairs, existing 403 database / unit / end-to-end tests still passing, and the live-site test after deploy.

## Questions for you
1. Is the logo's blue the correct brand blue, and is there an official brand sheet or SVG logo?
2. Should the "Autonomous", "TNEA code 1216" and "Affiliated to Anna University" lines appear anywhere (sign-in page footer, for example), or only the logo and name?
3. Stage 2 (charts and student summary) in this round, or identity only first?
