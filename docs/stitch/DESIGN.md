---
name: Synergy International Inventory
description: Design system for the Synergy ERP item creation and product detail screens.
colors:
  primary: "#004A80"
  on-primary: "#FFFFFF"
  primary-hover: "#003C68"
  primary-soft: "#F0F7FC"
  primary-dark-mode: "#2685C4"
  background: "#FFFFFF"
  surface: "#FFFFFF"
  text: "#363636"
  text-secondary: "#595959"
  text-muted: "#737373"
  border: "#E6E6E6"
  border-strong: "#D4D4D4"
  success: "#059669"
  warning: "#D97706"
  danger: "#DC2626"
  dark-background: "#020617"
  dark-surface: "#0F172A"
  dark-border: "#334155"
  dark-text: "#F8FAFC"
typography:
  page-title:
    fontFamily: "Amazon Ember"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 32px
  section-title:
    fontFamily: "Amazon Ember"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 24px
  body:
    fontFamily: "Amazon Ember"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  field-label:
    fontFamily: "Amazon Ember"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 18px
  data:
    fontFamily: "Amazon Ember"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: 40px
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: 44px
  page-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
---

## Overview

Synergy International is an operational ERP for inventory, purchasing, production, and sales. The item screens serve staff entering technical catalog data and checking stock, BOM, pricing, and vendor information. The visual language should feel reliable, calm, and precise. Density is acceptable when it helps compare data, but every field and table needs a clear place in the hierarchy.

This file defines the visual system. `STITCH_PROMPT.md` in the same folder defines the two screens and their exact content. The four supplied screenshots show the current application shell and creation page; use them as brand and content references, not as a layout to copy.

## Color fidelity and distribution

- **White is the dominant background.** The actual light-theme `--background`, `--card`, and sidebar tokens in `globals.css` are white. Make the page canvas, header, and main reading surfaces white. Do not turn the page into a gray dashboard or fill every section with a gray tint.
- **Synergy blue `#004A80`:** use for the active Inventory navigation, primary action, links, active tab/section indicator, focus, and occasional small structural emphasis such as a slim rule. Use hover blue `#003C68` for the primary button hover. Brand blue must be visible enough to make this recognizably Synergy, but never as giant filled panels or a blue background behind the whole form.
- **Pale blue `#F0F7FC`:** use sparingly for the active navigation item, focused/selected row, or an informative state. It is a tint, not an alternate page background.
- **Text:** use the platform's neutral dark charcoal (`--foreground: oklch(0.250 0 0)`, approximately `#363636`) for headings and values. Secondary text is neutral medium gray. Avoid blue-gray typography across every label or low-contrast light-gray data.
- **Borders:** the platform's `--border: oklch(0.920 0 0)` is a quiet neutral rule. Use it for input outlines, table row separators, and occasional section dividers. No nested card outlines, repeated gray header fills, or decorative dashed boxes around normal content.
- **Semantic colors:** green only for healthy stock, saved state, or success; amber only for warnings, reservations, or low stock; red only for errors and destructive actions.
- **Dark mode:** retain the current dark slate surfaces and `#2685C4` primary. Use the same structure and contrast hierarchy as light mode.
- **Color audit:** from a full-page view, the composition should read as crisp white + dark charcoal + deliberate Synergy blue. Gray should be limited to dividers, control borders, and secondary text. If it reads mainly gray, redesign it.

## Typography

**Font fidelity is mandatory:** the platform uses **Amazon Ember** (spelled Ember, not Amber), self-hosted from `/fonts/amazon-ember/`. Use Amazon Ember for page titles, section headings, labels, buttons, tables, inputs, codes, quantities, and prices. The existing `--font-sans`, `--font-manrope`, and `--font-mono` tokens all resolve to Amazon Ember. Do not substitute Inter, Roboto, Poppins, Manrope, or a new display font. If Stitch cannot load a custom font in its preview, retain `Amazon Ember` as the specified/exported family and treat a system sans-serif as a preview-only fallback. Use tabular numerals for aligned numeric columns. Keep headings in sentence case. Use a clear page title, medium-weight section headings, normal-case field labels, and readable body copy. Avoid dense all-caps text except compact table headings or short metadata labels. Do not invent promotional descriptions or filler text.

## Layout and art direction

Preserve the recognizable Synergy application shell: fixed left navigation for the wider platform, a compact white top bar with notifications and admin profile, and the item content in the main area. The Inventory section is selected in the sidebar. Do not add another full-height sidebar within the item page.

Design with the judgment of a strong enterprise product designer. Seek an original, purposeful composition within the existing brand, not a template-style SaaS dashboard. The creative work is in hierarchy, pacing, alignment, and smart use of white space; it is not in new colors, illustrations, floating tiles, or decorative microcopy. At 1440–1920 px, let the main content breathe but cap form reading width where appropriate. Use a rigorous grid, then vary its rhythm: broad identity fields; a media area that has a real role; a compact pricing/tax arrangement; full-width BOM and variant tables. Avoid making every section the same-sized box.

**Create page composition:** one clean page header and a slim, practical section index below it; then a white editorial form canvas. Major sections are separated with generous vertical space and a single hairline divider. Section titles form a consistent left anchor and actions align at the right edge. The first section uses a purposeful asymmetric split, about two-thirds fields and one-third media at wide widths. Within each section, use aligned field rows rather than boxed subsections. Repeatable rows can have a table header and light horizontal rules. A quiet sticky bottom action bar may keep Cancel and Create/Update available on a long form, without obscuring content. Let sparse sections remain sparse; do not create large empty panels to fill width.

**Detail page composition:** a compact title/action header, then a product hero with contain-fit image gallery on one side and identity, price/stock context, and available attributes on the other. Below it, create a slim metric band with shared baseline and dividers rather than five individual cards. Use an understated tab line; each tab presents one strong table or definition list at a time. A long page should still feel like the same editorial system as the creation form. Saved values should look like data, not disabled inputs.

For desktop, with the app sidebar already taking part of the width, keep tables wide enough to compare numbers. On tablet, reduce columns without losing action visibility. On mobile, stack form fields and hero regions, keep the active section easy to find, and allow data tables to scroll horizontally with clear headers. Use the spacing tokens consistently; do not crowd labels against inputs.

The creation page may use a compact in-page section navigation, but the fields must remain easy to scan and reach. Show a coherent full-page form rather than a mandatory wizard. The detail page should lead with identity, imagery, and key metrics, followed by the five existing content tabs. Keep primary actions easy to locate.

## Originality check for Stitch

Before finalizing, explore at least two distinct compositions on the **same tokens and content**. Choose the one with the clearest reading path and strongest visual rhythm. Reject any option that could be described as “a stack of rounded cards,” “gray dashboard panels,” or “AI-generated admin template.” Show visual craft through proportion, whitespace, precise alignment, table density, and a memorable but restrained use of Synergy blue. Do not solve the problem by deleting fields or moving them behind unexplained controls.

## Elevation & Depth

Use little to no shadow. Reserve a subtle shadow for an overlay, menu, or one top-level surface when necessary. Do not apply a shadow to every section, table, upload area, and nested group. Avoid gradients and decorative glow.

## Shapes

Use mostly 4–8 px corner radii for fields, buttons, and table containers, with at most 12 px on a major surface. Do not use capsules or rounded pills as the primary navigation, section numbering, or metadata treatment. Square and rectangular controls should remain friendly but precise.

## Components

- **Page header:** breadcrumb, clear title, existing draft status where applicable, and right-aligned Back/Reset or Back/Barcode/Edit actions.
- **Section heading:** short meaningful name, one optional action, and optional collapse control. One divider separates major sections.
- **Input:** visible persistent label, 40–44 px control height, clear optional/required status, placeholder only as an example, focus ring in Synergy blue, and inline validation immediately below the field.
- **Search/select:** show the chosen value, search affordance, loading and empty states, and any `+ New` action next to the related label. Do not draw a fake static dropdown.
- **Repeatable row:** name/value or table row with one unambiguous remove action; add action at the group header or end.
- **Data table:** aligned columns, stable headers, right-aligned numbers and currency, row dividers, a compact empty state, and horizontal overflow at narrow widths.
- **Media:** dropzone with accepted formats and limit, thumbnail grid, cover identification, remove/set-cover controls, and an honest empty state.
- **BOM and route:** sequence/order must be visible. Distinguish linked existing records from new editable rows and show totals where applicable.
- **Status:** use text and restrained semantic color; do not invent decorative badges.
- **Actions:** primary button for Create/Update, secondary for Cancel/Back, quiet text or outline actions for Add/Edit/Open, destructive styling only for Remove/Clear/Discard.

## Do's and Don'ts

**Do:** respect the current platform shell and brand; make every existing field discoverable; keep labels exact; align related inputs; provide selected, hover, focus, disabled, loading, validation, empty, saved, and error states; preserve both desktop and mobile legibility; treat quantities and prices as operational data.

**Don't:** copy the current boxes-inside-boxes layout; create a second page sidebar, mandatory stepper, decorative cards, novelty icons, fake analytics, invented product facts, random helper prose, gradients, capsules, or new backend workflows. Do not omit the complex BOM, production route, pricing tiers, variants, vendor sourcing, or inventory ledger merely to make the mockup look clean.

## Product screen relationship

The creation and detail screens must clearly be the same product area. Match breadcrumb patterns, title scale, spacing, data typography, button hierarchy, and table treatment. The detail page should present saved data from the creation fields as read-only information, while retaining the existing detail-only stock, ledger, sourcing, and barcode surfaces. Design a realistic populated state and an empty state for each major repeatable region; avoid fabricated marketing content.
