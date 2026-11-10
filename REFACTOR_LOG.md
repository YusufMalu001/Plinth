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
