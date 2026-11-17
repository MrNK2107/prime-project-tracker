---
name: Prime Project Tracker
description: A college records office rendered as software: calm, ruled, official, with verified work sealed and claimed work dashed.
colors:
  ground: "#f4f6f9"
  surface: "#ffffff"
  surface-quiet: "#f9fafc"
  ink: "#13203a"
  ink-muted: "#46536b"
  ink-faint: "#5f6b82"
  rule: "#dde2ea"
  rule-strong: "#c3cbd8"
  brand: "#1f3a6b"
  brand-hover: "#182f58"
  brand-deep: "#14264a"
  brand-tint: "#e8edf7"
  brand-ink: "#ffffff"
  seal: "#16695a"
  seal-tint: "#e2f1ed"
  claim: "#7a5600"
  claim-tint: "#fbf1d6"
  claim-line: "#c99a2e"
  danger: "#b3261e"
  danger-tint: "#fceceb"
  focus: "#2f6fe0"
typography:
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(1.625rem, 1.3rem + 1.2vw, 2.125rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  label:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.3
rounded:
  sm: "7px"
  md: "10px"
  full: "999px"
spacing:
  xs: "0.375rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.25rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.sm}"
    padding: "0 1.1rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.brand-tint}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 0.875rem"
    height: "48px"
  badge-seal:
    backgroundColor: "{colors.seal-tint}"
    textColor: "{colors.seal}"
    rounded: "{rounded.full}"
    padding: "0.2rem 0.6rem"
  badge-claim:
    backgroundColor: "{colors.claim-tint}"
    textColor: "{colors.claim}"
    rounded: "{rounded.full}"
    padding: "0.2rem 0.6rem"
  badge-neutral:
    backgroundColor: "{colors.brand-tint}"
    textColor: "{colors.brand}"
    rounded: "{rounded.full}"
    padding: "0.2rem 0.6rem"
  record-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1rem 1.125rem"
  error-text:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 0.75rem"
  shell-bar:
    backgroundColor: "{colors.brand-deep}"
    textColor: "{colors.brand-ink}"
    height: "4rem"
---

# Design System: Prime Project Tracker

## Overview

**Creative North Star: "The Hall Ticket and Seal"**

A college records office rendered as software: calm, ruled, official. The system owns one idea, the difference between what is verified and what is only claimed. Verified work carries a solid outline and a deep teal seal; claimed work carries a dashed amber outline. Everything else stays quiet so that single distinction can be read at a glance on a phone or a desktop.

The surface is a cool off-white ground with white sheets, hairline rules, and a deep ink-blue shell. Depth comes from rules, borders, and tint, not shadow. Ticket-style dotted perforation dividers and a double-ruled edge under the ink-blue bar are the world's native ornament. The serif voice is reserved for page titles and the college and product names; the humanist sans carries all data, with tabular figures.

Colours are all tokens defined once in `:root` so the Saveetha Engineering College brand colours and logo can be swapped in later. Neither has been supplied; the blue and the seal mark here are placeholders of the system, not the college identity.

**Key Characteristics:**
- Verified is solid plus teal; claimed is dashed plus amber; errors are red and nothing else is red.
- Ink-blue shell and primary actions on a cool off-white ground.
- Flat surfaces; one soft shadow tier exists for overlays only.
- 44px minimum touch targets, 48px fields, visible 3px focus ring.
- Empty lists are a normal state, not an error.

## Colors

A restrained cool palette: one ink-blue family, three reserved status hues, and blue-grey neutrals.

### Primary
- **Ink Blue** ({colors.brand}): Primary buttons, links, active tab on mobile, caret.
- **Ink Blue Hover** ({colors.brand-hover}): Primary button hover.
- **Chancery Navy** ({colors.brand-deep}): The shell top bar and the sign-in brand panel; avatar glyph colour.
- **Ink Blue Tint** ({colors.brand-tint}): Neutral badge, secondary and ghost hover, selection, empty-state icon disc.

### Secondary
- **Seal Teal** ({colors.seal}) with **Seal Tint** ({colors.seal-tint}): Verified results only.
- **Claim Amber** ({colors.claim}) with **Claim Tint** ({colors.claim-tint}) and **Claim Line** ({colors.claim-line}): Unconfirmed claims only; the line colour draws the dashed border.

### Tertiary
- **Error Red** ({colors.danger}) with **Error Tint** ({colors.danger-tint}): Errors and invalid fields only.
- **Focus Blue** ({colors.focus}): Keyboard focus ring and input focus glow.

### Neutral
- **Cool Ground** ({colors.ground}): Page background.
- **Sheet White** ({colors.surface}): Cards, inputs, the mobile tab bar, the form column.
- **Quiet Sheet** ({colors.surface-quiet}): Defined as a token for alternate fills; not yet used in the built surfaces.
- **Ink** ({colors.ink}): Body text.
- **Ink Muted** ({colors.ink-muted}) and **Ink Faint** ({colors.ink-faint}): Secondary copy, labels, placeholders, hints.
- **Hairline** ({colors.rule}) and **Hairline Strong** ({colors.rule-strong}): Card borders, input borders, perforation dividers, scrollbar thumbs.

### Named Rules
**The Seal Is Earned Rule.** Teal means verified and only verified. Amber means claimed and only claimed. Neither is used decoratively.

**The Red Is Error Rule.** Red appears only on errors and invalid fields.

**The Token Rule.** Every colour comes from a `:root` token so the college brand can replace them in one place. The shell and sign-in currently hard-code white and pale-blue text on navy; that is drift to tokenize, not a pattern to extend.

## Typography

**Display Font:** Source Serif 4 (with Georgia, serif)
**Body Font:** Source Sans 3 (with Segoe UI, system-ui, sans-serif)

**Character:** A humanist sans for working data, with a bookish serif that gives page titles and the college name the weight of a printed record. Tabular figures are on globally.

### Hierarchy
- **Headline** (600, clamp 1.625rem to 2.125rem, 1.2, -0.01em): Page titles (h1), serif.
- **Sign-in title** (600, 1.5rem, 1.2): The form heading on sign-in, serif.
- **Title** (650, 1.1875rem, 1.2): Section headings (h2), sans.
- **Body** (400, 1rem, 1.5): Everything else; paragraphs capped at 68ch.
- **Label** (650, 0.8125rem): Field labels, hints, badges.

### Named Rules
**The Serif Is Rare Rule.** Source Serif 4 appears only on page titles, the sign-in heading, and the college and product names. Data, controls, and navigation are sans.

## Layout

Phone first, with a single breakpoint at 48rem for the app shell and 56rem for sign-in. Content is centred in a 76rem container with 1rem side padding on phones and 1.5rem on wide screens. The top bar is sticky, 4rem minimum height, holding the seal mark, product and college name, tab navigation (wide screens only), and the user menu. On phones the same navigation list renders as a fixed bottom tab bar with 56px targets and safe-area padding, and the main area keeps 6rem bottom padding to clear it.

Sign-in stacks a compact navy header over the form on phones; at 56rem it splits into a 42% navy brand panel and a white form column, with the form capped at 26rem. Spacing is rem-based on a loose rhythm (0.25, 0.375, 0.5, 0.75, 1, 1.25, 1.5, 2.25rem); a page header sits 1.5rem above content with the title left and one primary action right.

## Elevation & Depth

Flat. Depth is conveyed by hairline borders, white-on-ground tonal layering, a double rule under the navy bar, and dotted perforation dividers. The one shadow token, a soft two-layer pop, is reserved for overlays and has no user yet in the built surfaces. The mobile tab bar carries a faint upward shadow to separate it from scrolling content.

### Shadow Vocabulary
- **Overlay Pop** (`box-shadow: 0 8px 24px rgba(19, 32, 58, 0.14), 0 2px 6px rgba(19, 32, 58, 0.08)`): Menus and popovers only.
- **Input Focus Glow** (`box-shadow: 0 0 0 3px rgba(47, 111, 224, 0.28)`): Focus state on fields, paired with an Ink Blue border.

### Named Rules
**The Rules Not Shadows Rule.** Surfaces separate with borders and tint. A shadow appears only on overlays and as the focus glow.

## Shapes

Gently rounded: 7px on buttons, fields, and nav links; 10px on record cards and the empty state; full pills on badges and circles for the avatar and empty-state icon. Borders are 1px hairlines. The signature form language is the border style itself: solid for confirmed, dashed for claimed, dotted 2px for the perforation divider, 3px double for the edge of the navy shell.

## Components

### Buttons
- **Shape:** Gently rounded (7px), 44px minimum height, weight 600.
- **Primary:** Ink Blue fill, white text, hover to Ink Blue Hover; presses down 1px.
- **Secondary:** White fill, Ink Blue text, strong hairline border; hover tints blue and borders in Ink Blue.
- **Ghost:** Transparent, Ink Muted text; hover tints blue.
- **Disabled / loading:** 55% opacity, not-allowed cursor; a 1rem border spinner replaces the icon while pending.

### Inputs / Fields
- **Style:** White, 1px strong hairline, 7px radius, 48px high, label above in 0.8125rem 650 weight Ink Muted.
- **Focus:** Border shifts to Ink Blue with the 3px focus glow.
- **Error:** Border turns Error Red via `aria-invalid`; a message block in Error Tint with an alert icon sits below. The one-time code field is large, centred, and widely letter-spaced.

### Badges and Record Cards
- **Seal badge:** Teal on Seal Tint, solid teal-tinted border, pill.
- **Claim badge:** Amber on Claim Tint, dashed Claim Line border, pill.
- **Neutral badge:** Ink Blue on Ink Blue Tint, no border.
- **Record card:** White, 1px hairline, 10px radius. When claimed, the border becomes dashed Claim Line with a faint amber wash; when sealed, the border takes a teal-tinted hairline.

### Navigation
- **Top tabs (wide):** On navy; pale blue text, hover to a white 10% wash, active with a white 16% wash and a 2px white underline inset. 44px high, 7px radius.
- **Bottom tabs (phone):** White bar with a top hairline; icon over label, 0.75rem 650 weight, Ink Faint; active in Ink Blue with a 3px inset top bar.
- **Focus:** White ring on the navy bar.

### Empty State
A dashed strong-hairline white panel, centred, with a 3rem Ink Blue Tint disc holding an outline icon, a title, and one explanatory line. It states what belongs here and what to do next.

### Seal Mark (signature)
An authored SVG: a double ring (solid outer, dotted inner) around a check, in current text colour. 30px in the shell, 56px on sign-in. Placeholder identity until the college logo is supplied.

## Do's and Don'ts

### Do:
- **Do** show verified work with a solid outline and Seal Teal, and claimed work with a dashed Claim Line outline and Claim Amber.
- **Do** take every colour from a `:root` token so the college brand can be swapped in one place.
- **Do** keep touch targets at 44px or more and fields at 48px.
- **Do** use Source Serif 4 only for page titles, the sign-in heading, and the college and product names.
- **Do** write empty states that say what belongs here and the next step.
- **Do** separate surfaces with hairline borders and tint; use a perforation divider for ticket-style breaks.

### Don't:
- **Don't** use teal, amber, or red for anything but verified, claimed, and error respectively.
- **Don't** build a generic SaaS card grid with icon tiles.
- **Don't** add shadows to resting cards; shadows are for overlays and focus.
- **Don't** invent the Saveetha logo or brand colours; use text and the placeholder seal until supplied.
- **Don't** rely on colour alone for verified versus claimed; the border style and label carry it too.
