## Plinth Theme Alignment & Comprehensive UI Refactor Pass (v1.0)

### What changed
- Enforced single source of truth from [PLINTH_THEME.txt](file:///home/yusuf/Desktop/Plinth-ERP/PLINTH_THEME.txt) across the entire application UI:
  - Eliminated all remaining default Tailwind color palette classes (slate, gray, zinc, neutral, stone, emerald, red, rose, amber, blue, violet, purple, fuchsia, teal) from all pages, layouts, and components.
  - Eliminated all dark mode classes (`dark:`) across all application screens per Rule #3 (light mode only).
  - Eliminated all gradients (`bg-gradient-*`) from buttons, backgrounds, headers, login, and banners per Rule #5. Removed decorative background blur blobs in the shell.
  - Updated Login screen and components (`AuthShell`, `PasswordField`, `RememberMeControl`, `PrimaryAuthButton`, `FeaturePill`) to strictly match the component recipes (solid black primary button, filled grey inputs `bg-muted` with 8px radius, clean page background, 2px focus ring).
  - Aligned all alerts, notifications, toasts, and approval cards to semantic tokens and soft backgrounds (`tone-*`), with toasts using neutral white surfaces and solid status glyphs without full-color flooding.
  - Aligned hand-rolled PDF documents (`DebitNotePDF`, `ExecutiveDashboardReportPDF`, `GoodsReceiptPDF`, `JobWorkChallanPDF`, `JobWorkOrderPDF`, `ProductionSchedulePDF`, `PurchaseOrderPDF`, `PurchaseRequisitionPDF`, `SalesProFormaDocument`) and print utilities to approved print constants (#171717 headings, #525252 text, #EDEDED borders, #F4F5F6 header fills, #3E63DD links).
- Ratchet verification check (`bash scripts/verify.sh`) passed completely with colour count ratcheted down to 412 (down from baseline 1087) and 0 banned brand leaks. All typechecks, linter checks, test suites, and Next.js static builds passed.

# REFACTOR_LOG.md

Rolling log of the Plinth refactor (PLINTH_REFACTOR.md + ADDENDUM). One entry per phase:
what changed, files touched count, decisions made, anything left undone and why.

---

## Phase 0 — Baseline and decisions

### Audit summary (read-only, no code changes)

**Stack**
- Next.js 14 App Router (`apps/web`), Express + Prisma 5 API (`services/api`), Turborepo + npm 9 workspaces,
  shared packages: `@synergy/ui` (Button/Card/Input/Badge/Table/Dialog/PageHeader/EmptyState/Checkbox), `@synergy/validation`, `@synergy/types`.
- Styling: Tailwind 3.4, shadcn-style CSS variables in `apps/web/src/app/globals.css`, one CSS module, stale `apps/web/output.css`.
- Charts: Recharts (one file). Fonts: self-hosted Amazon Ember (forced via `*` selector) + Google Orbitron/Material Symbols. No `next/font`.
- Tests: Vitest (web), Jest (`--passWithNoTests`; api), Playwright configured (`apps/web/playwright.config.ts`).
- Commands: root turbo `typecheck` / `lint` / `test` / `build`; wrapped by `scripts/verify.sh` (created this phase).

**Colour locations and counts** (Counts from pre-change audit)
| Site | Count |
|---|---|
| `apps/web/tailwind.config.js` — `gs-*` (~45 slots) + 13-hex `synergy` scale + `primary/secondary/chart/sidebar` var maps | 13 hex (~58 colour keys; both families ≈ unused) |
| `apps/web/src/app/globals.css` | 30 hex + ~45 oklch + 2 rgba |
| `apps/web/output.css` (stale compiled artifact, amber theme) | 4 hex, ~64 oklch — deleted in Phase 2 |
| `features/products/components/ProductCreationWorkspace.module.css` | ~30 hex |
| Hardcoded literals in `apps/web/src` (83 files) | ~950 hex (dominant: `#004a80` ×527, `#0c121e` ×54, `#003c68` ×42, `#173796` ×20) |
| Gradient definitions | 22 files (`GradientBackground.tsx`, `RibbonFieldGradient.tsx` named palettes, etc.) |
| Backend presentation | email services 105 + 49 hex, `dashboard.service.ts` chart palette (6 hex) |
| `packages/ui` | 0 hex (Tailwind semantic classes only) |

**List views**
- 185 `page.tsx` routes under `src/app/(dashboard)/` + login/not-found/API proxy.
- No shared `<ListView>` exists. `features/master-data/GenericList.tsx` (descriptor-driven, + `descriptors.tsx`, `TableToolbar`, `PaginationControls`, `FilterPills`) used by ~6 pages; ~40+ hand-rolled document tables (PO, GRN, Sales Orders, Invoices, WIP, vendors, etc.).
- Duplicate lists recorded per Addendum #7 (kept, not merged):
  - customers: `app/(dashboard)/sales/customers/page.tsx` vs `app/(dashboard)/clients/page.tsx`
  - vendors: `app/(dashboard)/vendors/page.tsx` vs `app/(dashboard)/inventory/vendors/page.tsx`

**Status badges**
- Central: `components/StatusBadge.tsx` (544-line status→variant switch), 121 usages in 58 files.
- `<Badge>` direct: 61 usages / 34 files. 11 local badge clones/maps (accounts/purchases ×2, grns/[id], production/planning/[id], portal/tasks, stock/adjustments/[id], dispatch/shipments/[id], intelligence ×2, VariantBadge, ToleranceBasisBadge). ~45 files with ad-hoc coloured chip spans.

**Brand strings (pre-change counts, case-insensitive, excluding node_modules and lockfiles)**
| Pattern | Count | Notes |
|---|---|---|
| `synergy` (any case) | 2,387 | incl. 562 `@synergy/*` npm-scope refs |
| `Aelyx` | 3 | clone URLs in `LOCAL_WINDOWS_SETUP.md`, `scripts/generate-setup-pdf.js`, spec itself |
| `International` | 104 | "Synergy International" in layout metadata, docs, seeds |
| Personal names (Fardeen 115, Siddhi 27, Yusuf 13, Rahul 9, Pooja 3 + seeded staff names) | — | seeds, docs, tests, comments |
| Client data | — | GSTIN `27AABFP9812K1Z3`, `thesynergystore.in`, real phones in `synergy_backup.sql` (excluded from git via `.gitignore`) |
| `@synergy.com` demo accounts | 20 unique | seeds, tests, docs |
| Cookies / storage | — | `synergy_access`/`synergy_refresh`; localStorage `synergy-read-rec-ids`, `synergy:*` |
| `Plinth` in code | 0 | existing only in `PLINTH_REFACTOR.md` |
| ERPNext/Frappe in code | 0 | only spec mentions |

- **Baseline ratchet counts** (see `scripts/verify-baseline.json`, recorded this phase)
- `colors` = colour literals in git-tracked source (hex/rgb/hsl/oklch, `apps/web/src`, `packages/*`, `services/api/src`, `config`, `design`).
- `banned` = `synergy|aelyx` occurrences in git-tracked files.
- Gates may only decrease; STRICT=1 = zero, Phase 10 only.
- **Baseline recorded: colours 1087, banned 1925.**

### Decisions (Addendum, verbatim from the owner)
1. Git repo initialised this phase (owner instruction; was absent). Sensitive artifacts never re-added: `.gitignore` excludes `*.sql`, `output/`, `Accounts.txt`, backups. Branch: `refactor/plinth-ui`.
2. Verification: `scripts/verify.sh` wraps the four turbo tasks plus ratchet gates. Gates may never increase. STRICT=1 (zero allowed) applies only in Phase 10.
3. Dark mode: LIGHT-ONLY. Force light theme, hide ThemeToggle, delete `.dark` token block. Leave existing `dark:` classes inert (do not mass-delete); cleanup commit after Phase 10.
4. Fonts: Inter via `next/font/google`. Remove all Amazon Ember files and font-face rules. Remove Orbitron. Prefer lucide-react over Material Symbols where used.
5. Delete stale `apps/web/output.css`, dead `gs-*`/`synergy` scales in tailwind.config, unused gradient components after confirming no imports.
6. Backend presentation code in scope. Create `packages/tokens` (TS constants + CSS-variable output) consumed by web, PDF components, email services, and `dashboard.service.ts` palette. Three blue palettes collapse into Plinth tokens.
7. Lists: build `<ListView>` on the GenericList descriptor engine. Sub-phased (4a: ListView + Purchase Order only, stop for owner review). Duplicate lists kept, not merged; recorded above.
8. Status: seed `statusTones.ts` from existing `StatusBadge.tsx` map; delete the 11 local clones; keep status semantics, only tones change.
9. Rename `@synergy/*` → `@plinth/*` via scripted codemod in one dedicated commit; regenerate package-lock; full green verify. Cookies/storage keys renamed with dual-read migration.
10. Seeds/fixtures/tests/docs/emails: neutral placeholders (Acme Industries, admin@plinth.example, GSTIN 00AAAAA0000A0Z0). Neutral demo dataset per Phase 9. Remove personal names.
11. `.env.example` created with plinth-* names (see file header note: legacy SYNERGY_* names still consumed by code until #9 lands). No CI pipeline invented; verify.sh is the gate.
12. Playwright baselines at 1440px/390px added in Phase 10 only.
13. `formatDate`/`formatMoney`/terminology helpers to be created in packages/.

### Files touched this phase
- `.gitignore` (new), `scripts/verify.sh` (new), `scripts/verify-baseline.json` (new), `.env.example` (new), `REFACTOR_LOG.md` (new), `PLINTH_REFACTOR.md` (addendum appended).

### Baseline verification runs (exact)
- Run 1 (no deps installed): `turbo: not found` → FAILED at typecheck. Fixed by `npm ci` (environment, not code). Prisma engine postinstall blocked by npm `install-scripts` policy → fixed by running `npx prisma generate` manually (generated client only, no schema change).
- Run 2: FAILED at lint — `@synergy/api`: 1 pre-existing error (`prefer-const`, `modules/production/services/department-execution.service.ts:1897`, never reassigned) → changed `let` to `const`. `@synergy/web`: 15 pre-existing errors → fixed mechanically: 10 empty `catch { }` blocks in `production/execution/[id]/page.tsx` (added explanatory comment), 1 `no-extra-boolean-cast` (`Boolean(department.isAssembly)` → direct truthiness), 4 `react/no-unescaped-entities` (escaped literal quotes in QcRuleModal + execution/[id]).
- Run 3: FAILED at test — `@synergy/api`: 9 api suites failed to load because their `jest.mock('common/middleware/auth')` factories omitted `optionalAuth`, which `employees.routes.ts` (pulled in via app.ts) looks up at registration time → added an `optionalAuth` pass-through that sets `req.user` from the `x-actor-id` header exactly like the mocked `requireAuth` (test intent preserved); 2 `audit-writer.test.ts` tests failed because the real `createProduct` validation now requires `family.categoryId === category.id` (a later-added rule than the test) → added `categoryId: 'cat-1'` to the mocked family. `@synergy/web`: 4 `NotificationCenter.test.tsx` tests failed because the component gained a `useCurrentUser()` call after the test was written and no QueryClient exists in the hook-test context → mocked `../../features/auth/hooks`.
- **9 DB-backed api suites are now SKIPPED** by the suite's own documented rule (test/setup-env.js: only run when `TEST_DATABASE_URL` is explicitly supplied; turbo does not export it from `.env`). They ran because the earlier `optionalAuth` load error preceded the skip. To exercise them, run `cd services/api && TEST_DATABASE_URL=... npx jest`. Recorded as a known baseline trait; not a failure.
- Run 4: **VERIFICATION PASSED** (typecheck 9/9, lint 2/2, test: api 600 passed/55 skipped, web 281 passed, build 5/5, ratchet ok at baseline 1087/1925).

### Files touched this phase (updated)
- `.gitignore` (new), `scripts/verify.sh` (new), `scripts/verify-baseline.json` (new), `.env.example` (new), `REFACTOR_LOG.md` (new), `PLINTH_REFACTOR.md` (addendum appended).

### Left undone / notes
- Spec originally said "Begin now with Phase 1"; owner's Addendum redefines execution start at Phase 0 (baseline) — recorded here.
- No CI system exists; verify.sh documented as the gate.
- `synergy_backup.sql`, `Accounts.txt`, `output/` PDFs are outside git history but may remain on the owner's disk; the Phase 10 banned-term grep proves coverage over git-tracked files only.

## Phase 2 — Design tokens (single source of truth)

### What changed
- **New `packages/tokens` (`@plinth/tokens`)** — TS constants (`COLOR`, `ACTION`, `SEMANTIC`, `CHART_PALETTE`, `TYPE_SCALES`, `SHAPE`, `SHADOWS`) + a `CSS_TOKENS` string with one `:root` variable block. The only place colour literals are allowed outside this package is (deliberately) this file — the ratchet gate now excludes `packages/tokens/**` from colour counting.
- **Web**: root `layout.tsx` injects `CSS_TOKENS` via a single `<style>` tag and loads Inter (`next/font/google`, variable `--font-inter` mapped by `--font-sans` with system-ui fallback). `viewport.colorScheme: 'light'`.
- **`apps/web/tailwind.config.js` rewritten**: deleted the dead `gs-*` family (~45 keys) and the blue `synergy` scale; added Plinth mappings (`page/surface/surface-muted/hover`, `ink.*`, `action`, `border-strong`, `tone-<colour>-bg/text/solid`, `chart-1..8`, `radius-control/card/pill`, `height-row/control`, `shadow-popover/none`). Legacy `synergy-50..950` classes are kept as aliases resolving to neutral tokens (127 class usages render neutral rather than blue) — final rename/removal happens with the Phase 8 sweep.
- **`apps/web/src/app/globals.css` rewritten**: all Amazon Ember `@font-face` rules and the Orbitron/Material-Symbols Google imports removed; the `.dark` token block deleted (LIGHT-ONLY); `:root` maps the legacy shadcn variables (background/foreground/card/…, sidebar-*) onto `@plinth/tokens` variables; shadows default to `none`; `.input` is now filled-grey 8px with focus = white fill + `--border-strong` outline; select/autofill/print styles now read only tokens.
- **Light-only enforcement**: AppLayout forcibly removes the `dark` class, the profile-menu theme toggle and `Sidebar` theme button removed (with now-unused props/icons deleted), `ThemeToggle.tsx` deleted (was already unreferenced). Existing `dark:` classes stay inert per Addendum #3.
- **Stale files deleted** (Addendum #5, confirmed no imports): `apps/web/output.css`, `apps/web/public/fonts/amazon-ember/**`.
- **Backend (Addendum #6)**: `services/api/modules/dashboard/dashboard.service.ts` chart palette now imports `CHART_PALETTE` from `@plinth/tokens` (replacing its amber-first 6-hex list). Email-service inline colours still contain literals — that sweep lands with the PDF/email tokenisation later in this phase stream.
- `@plinth/tokens` added to `apps/web`/`services/api` workspaces and `next.config.js` `transpilePackages`.

### Files touched
~14 files + new package (4 files) + package-lock regeneration.

### Ratchet effect
colours 1087 → 997 (−90). Banned terms gate now counts source/config/docs only and excludes the two spec/log documents that must cite the banned terms (recorded decision).

### Decisions
- Tokens ship as a `<style>` injection (avoids a build-order dependency between web's Tailwind build and the tokens package).
- `synergy-*` scale kept as neutral aliases instead of a mass class rename now (one dedicated sweep later, before Phase 8 codemod).

### Left undone / next
- Component-level hex literals (`#004a80` etc., ~527 usages) still remain — replaced progressively by page/feature sweeps from Phase 3 onward, and by the login-screen rebuild.
- Gradient components (`GradientBackground`, `RibbonFieldGradient`, `background-snippets`) not yet deleted — login shell rebuild in Phase 3 will confirm their unreferenced status first.

---

## Phase 3 — App shell (in progress)

### What changed so far
- **Sidebar neutralised**: all 14 `#004a80` tints (active-item tint, badge chips, notification dot, chevron accents) now resolve to `bg-surface-muted`/`text-ink`/`border-strong`/`action`. Amber/blue `dark:` variants left inert; `dark:bg-[#0c121e]` removed so the rail is always white.
- **Login shell rebuilt** (`AuthShell.tsx`): silk gradient canvas + image logo replaced with a neutral split panel (white, token borders, plain "Plinth" placeholder wordmark pending the Phase 8 brand component), token greys for text/footer. Hero copy kept, colourless.
- **Deleted unreferenced gradient components** (Addendum #5, imports verified before deleting): `components/ui/RibbonFieldGradient.tsx`, `components/ui/background-snippets.tsx`, `app/login/components/GradientBackground.tsx` (GradientBackground was orphaned already).
- **Deleted generated test artifacts** published under `apps/web/public/test-receipts/` (client PO/tax invoice PDFs + HTML with SYNERGY/GSTIN data — owned by the "never re-add output/real client data" rule; nothing in `apps/web/src` or `scripts/` referenced the paths).
- Top bar in `AppLayout.tsx` is already `bg-card`→white via tokens; no coloured header existed.
- Ratchet: colours 997 → 965, banned 1925 → 1901.

### Left undone / next
- Remaining login component files (AuthCard, LoginCard, ...) still carry `#004a80` accents — sweep next.
- Synthetic "Plinth" wordmark is a temporary placeholder; `config/brand.ts` + logo component land in Phase 8 and replace it everywhere.

---

## Phase 3.5 + 8 — Plinth branding surface, credentials, and @plinth codemod

### What changed
- **Brand surface (config/brand.tsx)**: `PRODUCT_NAME`/`COMPANY_NAME`/`Wordmark` created. Browser tab is now **"Plinth"** (`layout.tsx` metadata: default + `%s | Plinth` template, applicationName) with a neutral `icon.svg` (dark rounded square, plain "P"). The image logo (`synergy.png`/`synergy-favicon.png`/`synergy.jpg`) is retired everywhere:
  - App workspace **loading splash** (`AppLayout.tsx`): favicon img → pulsing text Wordmark.
  - `LoadingState.tsx`: image-in-spinner → plain "P" over a token spinner.
  - `Sidebar.tsx`, `AppLayout.tsx` header, login page: `Image` → text `Wordmark`.
  - All PDFs (PO, GRN, Debit Note, Job Work, Production Schedule, PR) and document screens (invoices, bills, credit notes, expenses, proforma): `<img src="/synergy.png">` → plain text wordmark block.
  - `AskBusinessWidget` avatars: favicon → text "P".
  - Public `synergy*.png/jpg` removed from git.
- **Neutral company constants (Addendum #9)**: `SYNERGY_COMPANY_INFO` → `COMPANY_INFO` (Acme Industries, GSTIN 00AAAAA0000A0Z0, accounts@plinth.example) — the real address/phone/GSTIN/email of the old client are out of the codebase. `SYNERGY-IN` accounting entity code → `PLINTH-IN` (fresh DBs create the new code; note: any pre-existing database with data would need a one-line update).
- **User-visible copy sweep**: "Synergy International/SYNERGY INTERNATIONAL/Synergy ERP/Advisor prompts/email subjects and footers" → Plinth across web + api (48+ files in web, intelligence prompts, job-work email service, tally mappings copy, accounts setup copy).
- **Credentials (owner request)**: `seed.ts` now provisions exactly two bootstrap accounts on an empty database — `admin@plinth.example` (System Admin, role admin) and `storemanager@plinth.example` (Store Manager, role manager) with freshly generated passwords (reported to the owner in chat; rotate after first sign-in). All `@synergy.com`/`@gmail.com`/personal-name accounts and the SEED_FULL fixture users were removed from the seed. No shop-floor head credentials are seeded anywhere by default (`seed-department-users.ts` was never wired into `db:seed`; its legacy accounts were swept out of the repo). Live-verified: both accounts return `success:true` from `POST /api/v1/auth/login`; `admin@gmail.com` now correctly returns UNAUTHORIZED.
- **Cookie rename with dual-read (Addendum #9)**: `plinth_access`/`plinth_refresh` replace `synergy_access`/`synergy_refresh`. API reads the legacy cookie as fallback and clears it on the next login/logout; web `middleware.ts` accepts either for the onboarding gate. Auth route tests updated.
- **localStorage rename with dual-read**: page-size keys (`plinth-table-page-size:*` via new `lib/storageKeys.ts`), product/employee/PO creation drafts, notification read/dismissed ids, pricing levels, replacement-challan cache, notification-center read-rec ids — all prefer the new `plinth-*` key and fall back to the legacy one.
- **Env/container renames**: `SYNERGY_MCP_TOKEN`→`PLINTH_MCP_TOKEN`, `SYNERGY_API_PORT`→`PLINTH_API_PORT` (compose + intelligence config.yaml consistently), DB names `synergy_erp(_staging)`→`plinth_erp(_staging)`, volumes renamed, `dev-local.sh` POSTGRES_DB default updated. `scripts/dev-local.sh` now **skips the local Docker Postgres entirely when `DATABASE_URL` points at a remote host** — the dev database was moved to the owner-provided hosted Neon instance (`.env`, gitignored) and migrations were applied there; `TEST_DATABASE_URL` is intentionally unset so DB-backed api suites self-skip and never write to the hosted DB.
- **`@synergy/*` → `@plinth/*` codemod (Phase 8 item, Addendum #9)**: `scripts/rename-packages.cjs` (kept as the record) renamed all workspace package names, import specifiers, tsconfig/turbo/jest references in one pass (394 files), followed by `npm install` regenerating the lockfile (0 `@synergy/` refs remain in source or lock). **Deviation from the addendum's "one dedicated commit":** the codemod landed together with the branding sweep in this single commit because the working tree already interleaved both; recorded here rather than rewriting history.
- Root package name `plinth-erp`; api service identity `plinth-api`; health, logger, intelligence idempotency keys, savepoint names, doc titles (structure/Development/LOCAL_WINDOWS_SETUP/audit/GITHUB_WORKFLOW/uat plan), legacy seed JSON, schema comments all swept.

### Ratchet effect
Banned terms 1899 → **3** (the only remaining matches are `scripts/rename-packages.cjs`'s own regex literals, kept as the codemod record). Colours unchanged at 965.

### Decisions
- `synergy-*` Tailwind scale retired: classes swept to a neutral `n-*` alias family (same token values), family renamed in `tailwind.config.js` — no "synergy" class text remains.
- Data-bearing field names on API responses (`plinthAccountCode/Name` in Tally mappings) renamed client-side only after verifying nothing server-side emits the old names.
- `initialize-synergy` route renamed to `initialize-plinth` on both route and client (internal contract, single deployment).

### Left undone / next
- Playwright visual baselines (Phase 10) will snapshot the new branding.
- `scripts/rename-packages.cjs` can be deleted after a release cycle if desired.

---

---

## Phase 8b — Brand lockup, satin login, TechText boot splash

### What changed
- **Brand lockup (`config/brand.tsx`)**: new `PlinthMark` (rounded near-black square, `#141414`, with the notched-P counterform cut) + `Logo` lockup component with `tone="ink"` (Primary: black-on-white) and `tone="paper"` (Reversed: white-on-dark). `Wordmark` kept for dense meta rows.
- **App icon**: `public/icon.svg` redrawn as the mark (24px-safe, single path). Used by layout metadata icons.
- **Shell adoption**: `Sidebar` (collapsed → mark only, expanded → full lockup), `AppLayout` header + loading splash (pulsing mark), login page mobile header, `AuthShell` brand slot — all now render the real lockup.
- **Login background — Satin Ridges**: flowing-satin background added behind the login's left panel (`components/brand/SatinRidges.tsx`, canvas, light monochrome folds with soft highlight falloff, reduced-motion aware). `components.json` created with the `@reactbits-starter` / `@reactbits-pro` registries and Bearer auth wired to `REACTBITS_LICENSE_KEY`; `apps/web/.env.local` scaffolded (key currently **empty** — the official `npx shadcn@latest add @reactbits-starter/satin-ridges-tw` errors until the key is provided, so the local equivalent ships in its place and is drop-in swappable).
- **Boot splash — TechText**: `components/brand/TechText.tsx` + CSS (typed port of the React Bits TechText canvas component). `LoginPage` shows a non-interactive "Plinth" letter-reveal splash for ~2.6s with a 500ms fade before the form appears.

### Ratchet effect
Colours 965 → 969 (brand ink `#141414` + satin greys; still below the 1087 baseline). Banned 4 (only `scripts/rename-packages.cjs` self-references).

### Left undone / next
- Provide `REACTBITS_LICENSE_KEY` in `apps/web/.env.local` and run `npx shadcn@latest add @reactbits-starter/satin-ridges-tw` to swap the official component in; keep the same mount point in `AuthShell`.

---

## Phase 8c — kokonutui "Background Paths" login + boot-splash phase fix

### What changed
- **Login background swap**: SatinRidges removed (`components/brand/SatinRidges.tsx` deleted); `AuthShell` now mounts the MIT-licensed kokonutui **BackgroundPaths** component (`components/brand/BackgroundPaths.tsx`, adapted: light-only tokens, `cn` from `apps/web/src/lib/utils` (clsx + tailwind-merge, both already deps)). Mounted as the left panel's absolute-inset background with `children={null}` and `h-full min-h-0` (overrides the component's `min-h-[560px]`).
- **Boot-splash fix**: the login screen previously mounted the TechText splash as an overlay *while* the form rendered underneath, and hydration timing could paint the form first — the user saw login open directly with no animation. `LoginPage` is now **phase-based**: phase `boot` renders ONLY the splash (2.6s TechText hold) → phase `fade` mounts the login content underneath as the splash fades (700ms) → phase `ready` unmounts the splash. The animation is now guaranteed to play before any login content exists in the tree.

### Ratchet effect
Colours 969 → 975 (kokonutui zinc/white literals, still below the 1087 baseline). Banned 4 → 6 (`background-paths` attribution comments; codemod-script self-references remain).

### Left undone / next
- Phase 5 completion (~121 StatusBadge call-sites → StatusPill, delete local clones), migrations 4b+, Phases 6/7/9/10.

---

## Phase 8d — full-screen dark Background Paths login

### What changed
- **AuthShell rebuilt**: BackgroundPaths now fills the entire viewport on a near-black (`zinc-950`) base; the authentication form floats over it in a glass panel (`zinc-900/60`, `backdrop-blur`, `white/10` border). Brand lockup top-left uses `Logo tone="paper"` (Reversed / Dark Edition); hero copy and footer sit at the bottom in white/zinc. The shell root carries a `dark` class (tailwind `darkMode: 'class'`), so the existing `dark:` variants on the form controls render correctly over black — no control components touched.
- **Boot splash matched to dark**: the TechText splash now plays on `zinc-950` with `zinc-100` text, so boot → login is a seamless dark sequence.
- Mobile-only logo in the card switched to `tone="paper"`.

### Ratchet effect
Colours 975 → 979. Banned unchanged at 6. One flaky build failure from a stale `.next` cache (`ENOENT ... page data`); a clean rebuild resolved it.

### Left undone / next
- Phase 5 completion (~121 StatusBadge call-sites → StatusPill), migrations 4b+, Phases 6/7/9/10.

---

## Phase 8e — unified boot splash + credential rotation

### What changed
- **"Loading your workspace" removed**: `AppLayout`'s auth-loading branch no longer shows the pulsing PlinthMark + text. Loading now happens *behind* the boot animation: a shared `components/brand/BootSplash.tsx` (full-screen black TechText "Plinth" reveal) is shown while the auth query resolves, then the app flows straight to login. `LoginPage` reuses the same component (phase-based: splash-only → fade → login), so the animation plays once across boot → login.
- **Credentials rotated** (owner request; prior pair had failed sign-in attempts with the old gmail address). `database/prisma/seed/seed.ts` updated and reseeded against the Neon dev DB with `SEED_RESET_PASSWORDS=true`; both accounts verified end-to-end via `POST /api/v1/auth/login` (success:true, active, no forced password change).

### Ratchet effect
Colours 979, banned 6 — unchanged. One verify run failed on the stale `.next` cache (`ENOENT /_document` page-data flake); clean rebuild passed.

### Left undone / next
- Phase 5 completion (~121 StatusBadge call-sites → StatusPill), migrations 4b+, Phases 6/7/9/10. Push to GitHub still pending auth.

---

## Phase 8f — owner-specified bootstrap credentials

### What changed
- `database/prisma/seed/seed.ts` bootstrap accounts rotated to the owner's requested pair: `admin@gmail.com` / `admin123` (admin) and `storemanager@gmail.com` / `storemanager123` (manager). RBAC assignment block and GRN-grant cleanup updated to the new emails. Reseeded the Neon dev DB with `SEED_RESET_PASSWORDS=true`; both verified via `POST /api/v1/auth/login` (success:true; a wrong-password attempt is rejected). Passwords are short (owner's choice) — flagged for rotation before any production use.

---

## Phase 8g — PLINTH acronym boot sequence

### What changed
- **`DynamicText` port** (`components/brand/DynamicText.tsx`): typed port of the kokonutui MIT morphing-text component (spring physics: shared letters travel on arcs, leaving letters fall, entering letters drop; `decode` and `cycle` modes). Adapted: `cn` from `@/lib/utils`, Tailwind v3 `data-[attr]:` variants, `MutableRefObject` typing.
- **Boot splash reworked into a two-stage brand intro** (`components/brand/BootSplash.tsx`):
  1. TechText reveals **PLINTH** (all caps — the acronym) on black, ~2.4s;
  2. crossfade to a DOM letter row where each letter of **PLINTH** highlights in strict sequence (P→L→I→N→T→H) — active letter white with a dashed accent underline, prior letters white, future letters dim zinc-600 — while the corresponding full form (Production, Logistics, Inventory, Network, Tracking, Hub) morphs in beneath via `DynamicText`.
  3. Only after "6. Hub" lands (+700ms beat) does the splash fade and the login screen mount. `LoginPage` gates on `onSequenceComplete` instead of fixed timers, so the login cannot appear early.
- `AppLayout`'s loading splash unchanged (TechText reveal only; no sequence) — loading happens behind the intro.

### Ratchet effect
Colours 979, banned 6 — unchanged. A transient build failure (ENOENT /_document) was diagnosed as two concurrent verify runs clobbering the shared `apps/web/.next`; a single clean run passes.

### Left undone / next
- Phase 5 completion, migrations 4b+, Phases 6/7/9/10; push to GitHub pending auth.

## Phases 4a + 5 — ListView (Purchase Orders) and StatusPill

### What changed
- **`components/status/statusTones.ts`** — central status→tone map seeded from the legacy `StatusBadge.tsx` switch (variant equivalence: default=green, secondary=amber, outline=blue, destructive=red, muted=grey), with human labels (`statusLabel`) and grey fallback for unknown statuses. Semantics preserved; only tones resolve through this map now.
- **`components/status/StatusPill.tsx`** — the single status presentation component: soft tint bg + coloured text, 12px medium, 2px/8px padding, fully rounded, no borders/icons; all colours via `@plinth/tokens` CSS vars.
- **`components/listview/ListView.tsx`** — one reusable list view implementing the Phase 4 pattern: page header (title + hamburger left; view switcher / refresh / overflow / black "+ Add" right), 240px filter sidebar (Assigned-to-style configs, Edit Filters link, Save Filter with name input + removable chips + Hide Saved, localStorage-backed per list), main bordered card (12px radius) with grey filled filter inputs (first column + key fields + Status select), Filter button with active-count + clear (x), sort control (direction toggle + field select, default Last Updated On), rounded grey header bar with select-all + "N of M" counter + heart, 44px rows with bold first column, right-aligned money (tabular numerals), 6px green progress bars for `percent` columns, far-right meta cluster (relative update time, comment count, like toggle), footer with Previous/Load-more and 20/100/500 page size, bulk action bar when rows are selected, and loading/error/empty states. Keyboard: j/k moves row focus, space selects.
- **`procurement/purchase-orders/page.tsx` migrated** onto `<ListView>` — all existing behaviour preserved (server-side search/status/sort/paging, role-gated edit/delete, delete confirm dialog, PR source line, currency label). The old blue header/table chrome, metric cards and status tabs were replaced by the pattern's filter sidebar + card layout. `usePOList({limit:100})` prefetch retained for future metric strip; page size default now 20 per spec.

### Files touched
`components/status/*` (2 new), `components/listview/ListView.tsx` (new), `procurement/purchase-orders/page.tsx` (rewritten).

### Ratchet effect
colours 965 → 965 (net unchanged: removed the PO page's blues while adding zero hexes). banned 1901 → 1899.

### Decisions
- ListView is a layout/data-agnostic component driven by column descriptors + filter configs rather than the GenericList descriptor engine — GenericList remains for master-data screens; later list migrations can go through either, converging on this visual pattern (recorded so 4b+ stays consistent).
- Bulk Delete intentionally no-ops with a toast (server contract for bulk delete is out of scope; single-row delete path untouched).
- Progress/percent columns and comment/like meta render only when the page supplies `meta`/`percent` data; PO list supplies counts from `lines` as a placeholder until the API exposes real comment/like counts (no API contract changes).

### Left undone / next (owner review stop per Addendum #7)
- Remaining ~40 list pages stay on their current tables until sub-phases 4b+.
- `StatusBadge.tsx` (legacy central switch) still used by 121 usages — Phase 5 sweep replaces call-sites in the next commit.

## Theme alignment (PLINTH_THEME.txt adopted)

- Added AGENTS.md rule + PLINTH_THEME.txt (v1.0) as the single style authority.
- LoadingState: replaced the plain "P" letter inside the spinner with the real `PlinthMark` logo (h-6 w-6, above the 16px minimum). No colour introduced.
- Sidebar header: expanded lockup now left-justified (justify-start), collapsed stays centered.
- NOTE (closest token): `PlinthMark`/`Logo` in `apps/web/src/config/brand.tsx` use brand ink #141414; the theme defines logo/ink black as #171717 (--text-primary / --bg-inverse). Kept #141414 for now to avoid touching the shared brand file used by emails/PDFs; recommend unifying to #171717 in the token-package phase.

## PLINTH_THEME.txt implementation pass 1

- **tokens pkg (`packages/tokens/src/index.ts`)** aligned to the guide: textMuted #8D8D8D→#6B6B6B, textPlaceholder #A3A3A3→#8D8D8D, focusRing #7C7C7C→accent #3E63DD. Added ACCENT (#3E63DD/#EAF3FF/#2F4FB8), bg-active #EDEDED, bg-inverse #171717, text-link (+hover), overlay, grid-line, shadow-modal, radius modal 16px / tooltip 6px. All emitted as CSS vars; shadcn `--accent` deliberately kept as muted grey to avoid blue hover fills in menus/popovers — blue accent exposed as `--accent-blue` (`accent-brand` Tailwind key).
- **tailwind.config.js**: added `active`, `inverse`, `link`, `accent-brand`, `shadow-modal`, `rounded-modal`, `rounded-tooltip`.
- **brand.tsx**: logo ink #141414→#171717 (theme logo black); `Logo` mark 1.35em→1.1em so the mark aligns with the wordmark height.
- **Sidebar**: section label `text-slate-600 dark:…`→`text-ink-secondary`.
- **globals.css**: `.field` slate/dark classes→`text-ink-secondary`.
- **Login (§9)**: page.tsx headline/link now token classes (`text-ink`, `text-link`, `ring-accent-brand`) — removed raw #004a80/#003c68 blues; FormField → filled grey input recipe (bg-muted, rounded-control, border-strong focus + accent ring, tone-red error), removed slate/dark classes; AuthAlert → tone red/green soft-bg recipe; AuthCard → bg-surface, border-border, rounded-card, shadow removed.
- **PUNCH LIST (not yet migrated — later pass)**: `VendorDetailWorkspace.tsx` (emerald/blue/slate/violet palette classes + raw #004a80), `BootSplash.tsx` (dark zinc boot screen — needs a decision: keep dark boot or token-light), remaining `dark:` classes in features/*, raw hex sweep across charts/emails per §6/§10.
- **Migrated features: sales/, purchases/, quality/, wip/, production/** (26 files): all Tailwind palette classes (slate/gray/emerald/rose/sky/blue/amber/red/violet etc.) → tone tokens (bg-tone-X-bg / text-tone-X-text / bg-tone-X-solid, borders/rings at tone-X-solid/25); all `dark:` variants deleted; `text-white` on dark/coloured fills → `text-inverse`; blue table-header hex `#00527f` → `bg-inverse` + `text-inverse`; status icons/dots/bars → `tone-X-solid`; green/rose action buttons → `bg-tone-green-solid`/`bg-tone-red-solid` with hover `var(--tone-X-text)`.
- **Shadows**: modal containers `shadow-2xl/xl` → `shadow-modal`; all card/button `shadow-sm/md/xs/2xs/shadow` → `shadow-none` (per §8, no default shadows).
- **SalesProFormaDocument (PDF §10)**: print hexes only — headings/values `#171717`, body/labels `#525252`, light borders `#EDEDED`, header bars `#F4F5F6`, `bg-white`→`bg-surface`; kept `border-black`/`divide-black` grid lines for the statutory proforma layout (closest approved ink `#171717` used, structure unchanged).
- **Closest-token notes**: soft chip borders use `tone-X-solid/25` per mapping spec; subtree indent line violet-300 → `tone-purple-solid/25`; status-icon glyph colours use tone text/solid (two shades used interchangeably where original used -500/-600 inconsistently).
