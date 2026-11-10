# MASTER PROMPT: Rebrand to "Plinth" and rebuild the UI in an ERPNext-style design language

You are a senior frontend and full-stack engineer. Execute the phases below IN ORDER, autonomously, without asking questions. Where a decision is not specified, choose the most conventional option and record it in `REFACTOR_LOG.md`. Do not stop until every acceptance criterion in Phase 10 passes.

## 0. Hard constraints
1. Work on a new branch `refactor/plinth-ui`. Commit after each phase with message `phase-N: <summary>`.
2. Do NOT change business logic, API contracts, database schema, permissions, or tests' intent. This is a presentation and naming refactor only. If a rename touches a DB column or API field, STOP renaming it and leave it, unless it is a client-specific string (see Phase 7).
3. Do NOT copy code, CSS, icons, fonts, images, or text from ERPNext/Frappe. Reproduce the LAYOUT PATTERNS and visual feel only, using our own components and tokens. Never use the words "ERPNext", "Frappe", or their logos anywhere.
4. After every phase run: typecheck, lint, unit tests, and build. Fix all failures before moving on.
5. Keep every screen responsive down to 360px width and keyboard-accessible.

## 1. Phase 1: Audit (no code changes)
1. Inventory every route/page, shared component, layout, theme file, global CSS, Tailwind config, and hardcoded colour (hex/rgb/hsl and Tailwind color classes).
2. Inventory every occurrence of client, company, or brand-specific strings (see Phase 7 search list).
3. Write findings to `REFACTOR_LOG.md` with counts per category.

## 2. Phase 2: Design tokens (single source of truth)
Create `design/tokens` (CSS variables + Tailwind theme extension). Remove the old two-colour theme completely (primary/secondary variables, gradients, coloured sidebars, coloured headers). Replace with:

Surfaces and neutrals (NO coloured backgrounds anywhere in the app shell):
- `--bg-page: #FFFFFF`, `--bg-surface: #FFFFFF`
- `--bg-muted: #F4F5F6` (filled inputs, table header, hover rows), `--bg-hover: #F8F8F8`
- `--border: #EDEDED`, `--border-strong: #D9D9D9`
- `--text-primary: #171717`, `--text-secondary: #525252`, `--text-muted: #8D8D8D`, `--text-placeholder: #A3A3A3`
- Primary action button: background `#171717`, text `#FFFFFF`, hover `#2E2E2E` (black, like the reference). Secondary button: `--bg-muted` fill, `--text-primary`, no border.
- Focus ring: 2px `#7C7C7C` offset 1px (keyboard only).

Semantic colours (used ONLY for statuses, charts, alerts, progress, tags). Each has `bg` (soft tint), `text`, and `solid` values:
- green: bg `#E4F5E9`, text `#18794E`, solid `#30A46C`
- red: bg `#FFF0F0`, text `#C62828`, solid `#E5484D`
- orange: bg `#FFF2E5`, text `#B54708`, solid `#F76808`
- amber: bg `#FFF8DB`, text `#946800`, solid `#F5B800`
- blue: bg `#EAF3FF`, text `#1D5FBF`, solid `#3E63DD`
- purple: bg `#F3EEFF`, text `#6B3FC4`, solid `#8E4EC6`
- teal: bg `#E3F7F5`, text `#0F766E`, solid `#12A594`
- pink: bg `#FFEEF7`, text `#B3256B`, solid `#D6409F`
- grey: bg `#F1F1F1`, text `#525252`, solid `#8D8D8D`

Chart palette (ordered, colour-blind-aware): blue, teal, orange, purple, green, pink, amber, red solids.

Type, shape, spacing:
- Font: Inter (self-hosted via the framework's font loader, with system-ui fallback). Base 14px/20px; page title 24px semibold; section title 16px semibold; table text 13px; labels 12px `--text-secondary`.
- Radius: inputs/buttons 8px, cards 12px, pills 999px. Shadows: none by default; dropdowns/popovers `0 6px 24px rgba(0,0,0,.08)`.
- Spacing scale 4px base. Row height in lists: 44px. Control height: 32px (compact), 36px (default).

## 3. Phase 3: App shell
1. Page background pure white. Remove any coloured sidebar/top bar. Layout: collapsible left navigation (white, 1px right border, grouped modules with simple monochrome line icons, active item = `--bg-muted` fill with `--text-primary` semibold), thin top bar with global search (Ctrl/Cmd+K), notifications, and user menu.
2. Page header pattern on every screen: hamburger (collapses sidebar) + page title (24px semibold) on the left; on the right, a toolbar: view switcher dropdown ("List View", "Report", "Kanban" where supported), refresh icon button, "..." overflow menu, and a primary black button "+ Add <Document>".
3. Breadcrumbs only on detail/form pages.

## 4. Phase 4: List view pattern (apply to EVERY document list: Purchase Order, GRN, Work Order, Item, Party, Invoice, etc.)
Build ONE reusable `<ListView>` and migrate all lists onto it. Layout:
1. Left filter sidebar (width 240px, collapsible, hidden below 1024px into a drawer):
   - "Filter By" heading; dropdown pickers: Assigned To, Created By, Tags (with a "Show Tags" link beneath).
   - "Edit Filters" link.
   - "Save Filter" section: text input "Filter Name" that saves the current filters; below it a "Hide Saved" toggle link and the list of saved filters/reports as removable chips (name + x).
2. Main content inside a bordered card (radius 12px):
   - Standard filter row: filled grey inputs (`--bg-muted`, no border, radius 8px) for ID and the document's 2-4 key fields (e.g. Supplier, Supplier Name, Company) plus a Status select. On the right: a "Filter" button showing active-filter count with an inline clear (x), and a sort control (direction toggle + field select, default "Last Updated On").
   - Table header: rounded grey bar (`--bg-muted`), select-all checkbox, column titles in 12px medium `--text-secondary`, and at the far right the result counter "20 of 37" plus a heart/like filter icon.
   - Rows: 44px, bottom border `--border`, hover `--bg-hover`, first column bold name, checkbox on left. Right-aligned money columns with tabular numerals. Truncate with ellipsis but show a tooltip with full value.
   - Percentage columns (e.g. % Billed, % Received) render as a thin 6px rounded progress bar: track `--bg-muted`, fill green solid. Partial values fill proportionally.
   - Far-right meta cluster: relative time since last update (e.g. "8 M", "1 y"), comment count with speech-bubble icon, and a like/heart toggle.
   - Footer: "Load more" / page-size control (20, 100, 500) and keyboard navigation (j/k, space to select).
3. Bulk actions: selecting rows replaces the header with an action bar (Actions dropdown: Delete, Export, Assign To, Add Tags).
4. Empty, loading (skeleton rows), and error states for every list.

## 5. Phase 5: Status system
1. Create one `<StatusPill status tone>` component: soft tint background, coloured text, 12px medium, padding 2px 8px, fully rounded. No borders, no icons.
2. Central map `statusTones.ts`; every document status in the app MUST resolve through it. Defaults:
   - Draft: red. To Receive / To Receive and Bill: orange. To Bill: orange. Partly Received: amber. Partly Paid: amber. In Progress / In Process: blue. Submitted / Open: blue. On Hold: purple. Completed / Paid / Closed / Approved: green. Cancelled / Rejected / Overdue / Failed: red. Not Started / Unpaid-new: grey. Unknown: grey.
3. Replace every ad-hoc coloured badge in the codebase with this component.

## 6. Phase 6: Forms, detail pages, and components
1. Form pages: sticky header with title + status pill on the left and the primary action ("Save" / "Submit") on the right; body in a white card with a 2-column responsive field grid, section headings (16px semibold) with 1px dividers, collapsible sections, and a right-side collapsible panel for Activity (comments, version history, assignments) and Attachments.
2. Inputs: filled grey (`--bg-muted`), 8px radius, no border; focus shows a white fill with a `--border-strong` outline. Labels above, 12px. Required marker: a small red dot. Inline validation messages in red under the field.
3. Child tables (line items): bordered, grey header row, add-row button, row drag-to-reorder, totals block right-aligned beneath.
4. Modals, drawers, toasts, tabs, tooltips, dropdowns, date pickers, and empty states all consume the tokens only. Zero hardcoded colours.

## 7. Phase 7: Dashboards and charts
1. Home/dashboard: white page, responsive grid of cards (radius 12px, 1px border, no shadow). Number cards: label (12px muted), value (24px semibold), delta chip using green/red tones.
2. Charts use ONLY the chart palette tokens; thin gridlines in `--border`, no chart-area background fill, rounded bar corners (4px), line width 2px, area fills at 12% opacity, legends below, tooltips as white popovers. Provide a shared `<ChartTheme>` wrapper so every chart (bar, line, area, donut, funnel) picks up the theme.
3. Colourful is welcome inside cards and charts; the page chrome stays white and neutral.

## 8. Phase 8: Rebrand to "Plinth"
1. Create `config/brand.ts` exporting `PRODUCT_NAME = "Plinth"`, tagline, support email placeholder, and logo component. Use it everywhere the product name appears: page `<title>` ("Plinth"), meta tags, favicon, login and signup screens, sidebar header, emails, PDF/print headers and footers, exports, onboarding text, error pages, README, package names, docs, and notification templates.
2. Search the ENTIRE repo (source, config, seeds, fixtures, tests, docs, env examples, CI files, migrations' comments, assets, PDF templates, email templates) case-insensitively for: `Synergy`, `Aelyx`, `International`, any client/customer company names, personal names, client domains and emails, client phone numbers and addresses, client GSTIN/PAN and other registration numbers, and old product names. Replace product-level mentions with the `brand.ts` value. Replace client data with neutral placeholders (e.g. "Acme Industries", "demo@plinth.example").
3. DO NOT hardcode "Plinth" into tenant data. The tenant's own company name, logo, address, and tax IDs must come from tenant settings. Plinth appears only as the PRODUCT brand (and optionally "Powered by Plinth" in footers, behind a feature flag).
4. Replace the logo and favicon with a simple text wordmark "Plinth" (Inter semibold) as a placeholder component. Remove old logo assets.
5. Rename package/app identifiers (`name` in package.json, docker image names, localStorage/cookie key prefixes, `.env.example` names) to `plinth-*`. Keep a one-time migration for renamed storage keys so existing sessions do not break.
6. Do NOT rename domain terms (PO, GRN, BOM, Work Order, Job Work, etc.). Make terminology go through an i18n/terminology layer so tenants can relabel them later.

## 9. Phase 9: Formats and generic defaults
1. Dates: default display `DD-MM-YYYY`, stored as ISO; all formatting through one `formatDate()` helper reading tenant settings. Times in the tenant's timezone.
2. Currency: stored per document with its ISO code; formatted by one `formatMoney(amount, currency, locale)` helper using the tenant locale (Indian digit grouping for en-IN, e.g. 5,73,334.65). The symbol always matches the document's own currency. Never show a mixed or wrong symbol; if a list contains mixed currencies, show the ISO code in a muted suffix.
3. Numbers: tabular numerals, right-aligned, quantity and rate precision configurable per tenant.
4. Document numbering: prefixes (e.g. `PO-.YYYY.-.####`, `GRN-`, `WO-`) are tenant-configurable settings with neutral defaults; remove any client-specific prefixes from seeds.
5. Replace client-specific seed and demo data with a generic, industry-neutral demo dataset (20+ items, 10 parties, sample POs in every status) so every status colour and chart is visible in demos.

## 10. Phase 10: QA and acceptance criteria (all must pass)
- No hex/rgb/hsl colour literals remain outside `design/tokens` (enforce with a lint rule or a grep check in CI).
- Zero occurrences of the Phase 8 search terms anywhere in the repo (excluding git history). Provide the grep output as proof in `REFACTOR_LOG.md`.
- Every list screen uses `<ListView>`; every status uses `<StatusPill>`; every chart uses `<ChartTheme>`.
- The app background is white on every route, with no coloured sidebars, headers, or gradients.
- Lighthouse accessibility score ≥ 90 on list, form, and dashboard pages; colour contrast AA for all text and status pills.
- Visual regression: add Playwright screenshots (1440px and 390px) for: login, dashboard, three list views, one form, one report. Commit baselines.
- Typecheck, lint, unit tests, and build all pass.
- Final deliverables: `REFACTOR_LOG.md` (what changed, decisions made, anything intentionally left alone), updated README with the new design system usage, and a short `DESIGN.md` documenting tokens, components, and status mapping.

Begin now with Phase 0.

## ADDENDUM: Decisions (these override anything above that conflicts)

1. Git: repo initialised by the owner, sensitive artifacts already moved out. Never re-add *.sql, backups, output/ PDFs, or real client data. Work on `refactor/plinth-ui`.
2. Verification: `scripts/verify.sh` wraps the four turbo tasks (typecheck, lint, test, build) plus ratchet gates for hardcoded colours and banned terms. Gates may never increase. STRICT=1 (zero allowed) applies only in Phase 10.
3. Dark mode: ship LIGHT-ONLY. Force light theme, hide ThemeToggle, delete the `.dark` token block. Leave existing `dark:` classes inert (do not mass-delete them); remove them in a separate cleanup commit after Phase 10.
4. Fonts: use Inter via `next/font/google`. Remove all Amazon Ember files and the font-face rules (proprietary font, must not ship in a product). Remove Orbitron. Keep Material Symbols only where used, preferably replace with lucide-react.
5. Stale files: delete `apps/web/output.css`, the dead `gs-*` and `synergy` colour scales in `tailwind.config.js`, and unused gradient components after confirming no imports.
6. Scope: backend presentation code is IN scope. Create `packages/tokens` (plain TS constants + CSS variables output) consumed by web, the PDF components, the email services, and `dashboard.service.ts` chart palette. The three blue palettes collapse into the Plinth tokens.
7. Lists: build `<ListView>` on top of the GenericList descriptor engine. Phase 4 runs in sub-phases (4a: ListView + Purchase Order only, STOP for owner review; then one module per sub-phase). Duplicate lists (clients vs customers, two vendor lists): do NOT merge or change routes; keep both, migrate both, and record the duplication in REFACTOR_LOG.md.
8. Status: seed `statusTones.ts` from the existing `StatusBadge.tsx` map; delete the 11 local badge clones and swap ad-hoc chips. Keep the same status semantics, only tones change per Phase 5.
9. Rename: rename `@synergy/*` to `@plinth/*` using a scripted codemod in one dedicated commit (imports, package.json names, turbo config, Dockerfiles, scripts), regenerate package-lock via npm install, then require a full green verify. Rename cookies and storage keys with a dual-read migration (read old key if new missing, write only new).
10. Seeds, fixtures, tests, docs, emails: replace all client data with neutral placeholders (Acme Industries, admin@plinth.example, fake GSTIN format 00AAAAA0000A0Z0). Generate the neutral demo dataset described in Phase 9. Remove personal names from code, seeds, docs, and comments.
11. Missing infrastructure: no .env.example or CI exists. Create `.env.example` with plinth-* names and document verify.sh as the CI gate. Do not invent a CI pipeline.
12. Playwright: add baseline screenshots at 1440px and 390px in Phase 10 only.
13. `formatDate`/`formatMoney`/terminology helpers do not exist: create them in packages/ and use them everywhere dates and money render.
