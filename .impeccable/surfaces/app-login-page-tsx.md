---
version: 1
slug: "app-login-page-tsx"
primary_target: "app/login/page.tsx"
related_targets: ["app/page.tsx"]
---

# Surface brief: app shell and sign-in (Operate)

Scope: login page plus the shared role shell used by /student, /faculty, /admin, /overview. Visitor mode: Operate. Users: students, faculty, admin, principal; phone and desktop equally.

## Direction contract

THESIS: A college records office rendered as software: calm, ruled, official. Verified versus claimed is the one idea the interface owns, shown by an ink-blue seal on confirmed results and a dashed outline on unconfirmed claims. Refuses the generic SaaS card grid with icon tiles.

OWN-WORLD: Cool off-white ground, white surfaces, hairline rules, deep ink-blue shell and primary actions, a deep teal-green reserved for verified seals, amber reserved for claims, red only for errors. Humanist sans (Source Sans 3) with tabular figures for data; Source Serif 4 only for page titles and the college name. Rules and ticket-style perforation dividers instead of shadows; one soft shadow tier for overlays.

STORY: A student or faculty member signs in with a college email code and lands in a shell that says where they are and what is theirs. Nothing is alarming when empty. They can always tell what counts (sealed) from what is only claimed (dashed).

FIRST VIEWPORT: Sign-in: desktop splits 5/7, left an ink-blue panel with the seal mark, "Saveetha Engineering College" and the product name, right a white form column with a single field and primary button; mobile stacks a compact blue header over the form. App shell: ink-blue top bar (seal mark, product name, user menu with sign out), tab navigation under it on desktop, fixed bottom tab bar on mobile, content max 72rem with a serif page title and one primary action at right.

FORM: Hall ticket and seal, candidate 1 of 3 offered to the user (user-chosen over Library catalogue and Neutral modern product). The roll's assigned airport-yellow direction was set aside because the user pinned a calm, trustworthy, academic feel. seed: seed:79cc7ef5bab235a9

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Saveetha Engineering College logo and brand colours: pending; colours are CSS tokens so they can be swapped. Name shown as text only.
