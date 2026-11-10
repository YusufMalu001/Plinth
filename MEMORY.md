# Synergy Project Memory

## IMPLEMENTED

- Product/material editors update saved BOM quantities, components, and names in place through the BOM PATCH endpoint; only an explicit new recipe creates a BOM. The standalone Create BOM form requires product selection, and product-side BOM updates show a success toast. BOM registry ordering follows last update, create/edit forms check names inline, saves reject duplicate names across records, and the detail ownership card shows only the direct product owner. See `docs/implementation/bom-product-owner-and-edits.md`.
- Departments created from the Shop Floor Departments screen receive a `SHOP-` code prefix so they pass the shop-floor execution filter; department lists sort newest updates first and create/update mutations refresh the list before resolving.

- Authentication uses an Express-owned JWT cookie pair: a short-lived access token and a rotating refresh token.
- Refresh sessions are persisted in PostgreSQL with only a SHA-256 token hash; logout revokes the server-side session.
- Passwords use Argon2id. Public registration is disabled; administrators provision accounts.
- Access control uses dynamic database-backed roles and granular permissions, while the legacy `admin`, `manager`, and `employee` field remains for compatibility. User provisioning and status changes require `admin`.
- The Next.js application communicates with authentication exclusively through `/api/v1`; it does not store tokens in browser storage.

## PLANNED

- Password change/recovery, invitations, MFA, and SSO.
- Continue extending granular domain permissions as later operational modules are certified.

## PROCUREMENT / INVENTORY DELIVERY

- Dedicated vendor workspace/API, deterministic scorecard profile, evaluation history, advisory OpenRouter recommendation endpoint, immutable PR revision snapshots, OCR job contract, finance-ready debit notes, inventory inquiry endpoints, additive inventory ledger posting on GRN finalization, and scoped SSE events are documented in `docs/implementation/procurement-vendor-inventory.md`.
- The additive migration is `database/prisma/migrations/20260901000000_procurement_intelligence_inventory`; apply it and seed the new RBAC permissions before enabling these routes.
- Inventory is now designed around the modern `InventoryBalance`/`InventoryLedgerEntry` projection: API responses hydrate item and location references, Product/Material profiles read live balances and movements, fabricated stock fallbacks are removed, and the shared `InventoryPostingService` enforces locked, idempotent before/delta/after postings. Migration `20260906000000_add_inventory_traceability_replenishment` adds lot/expiry, hierarchical location, item traceability, and replenishment policy/event foundations; GRN and movement posting asynchronously evaluate controlled auto-PO versus submitted PR replenishment.

## DECISION INTELLIGENCE CONTROL PLANE

### Implemented

- Migration `20260925120000_intelligence_control_plane` adds service principals, transactional event outbox/jobs, immutable certified snapshots/runs, recommendations/decisions/outcomes, durable tasks/activities, effective-dated objectives, and notification deduplication metadata.
- The API exposes neutral `/api/v1/intelligence/*` routes plus a private profile-authenticated, read-only MCP endpoint. The runtime receives no database credentials and has no write tool.
- Certified deterministic services calculate sales/contribution-margin, inventory, procurement, production, fulfillment, and executive metrics. New sales dispatch, return, and POS inventory postings use shared actual-cost inventory posting instead of selling price as cost.
- The worker provides `SKIP LOCKED` claiming, retries/dead-letter handling, idempotent daily/event/weekly scheduling in Asia/Kolkata, lifecycle management, digest notifications, and overdue-task escalation.
- Six isolated runtime profile containers are pinned to an immutable upstream image digest and configured without terminal, filesystem, browser, web, memory, skills, code execution, messaging, or delegation toolsets.
- The Decision Center, live certified analytics, evidence-linked recommendations, mandatory human acceptance/assignment, task feedback loop, scoped module panels, audit history, objectives, and read-only business questions are implemented.
- Source and customer-facing surfaces use neutral intelligence/advisor terminology. The upstream dependency name is limited to the ADR, deployment dependency record, and required license/SBOM contexts.

### Operational prerequisites (not yet production-enabled)

- Deploy the migration and RBAC seed through the release process.
- Approve OpenRouter Enterprise retention/training/downstream-routing terms and configure provider-side hard spend limits.
- Supply independent credentials via a secret manager, mirror/verify the pinned image, and enforce network egress outside Compose.
- Run runtime/MCP smoke tests and the golden isolation/model evaluation suite in staging.
- Complete at least 30 days of shadow mode and obtain written finance/operations metric and recommendation sign-off before enabling notifications.
- Later profiles (quality/loss, receiving, finance, workforce, physical audit, master-data/system health) remain planned until their metric contracts are certified.

## IMPLEMENTED — Stock variant visibility

- Unified inventory balances, stock issue and adjustment lists/details, stock ledger movement tables, and reorder rows share the selector’s violet Variant badge. Identity comes from saved item metadata or the existing `[Variant: ...]` transaction context; ordinary items remain untagged. No schema or posting behavior changed.

## IMPLEMENTED — Checkout database synchronization

- After updating a checkout, use Node 22.x, install changed dependencies, confirm the intended database target, run `npm run db:sync`, restart/rebuild API and workers, and verify affected endpoints. Local launcher reuses db:sync; plain Git commands do not run it. The command automatically selects pinned Node 22.23.4 via npm, validates the schema, applies pending committed migrations, generates Prisma Client and checks migration status, stopping on failure. First use requires a runtime download; it does not change system Node.
- IMPLEMENTED (2026-10-29): Windows local PostgreSQL uses localhost:5000; the API uses 5001 and web uses 3000. Applied 20261028120000_parallel_production_execution after a local backup, regenerated Prisma with temporary Node 22.23.4, and verified migration status plus read-only route (564 rows) and production overview (8 plans) queries. System Node remains 24; use Node 22 for project commands. The database also records historical migration 20261023152000_add_assembly_and_fg_receipt_tables absent from this checkout; preserve its history and recover the original file through the team release process, never reset or fabricate it.

## IMPLEMENTED — Department worker accounts and task scope

- Department workforce uses the existing `Department`, `Employee`, `User`, `UserRole`, `EmployeeTask`, and `WorkerAssignment` records; no schema migration was needed. The HR onboarding flow links the employee profile and operator login to the selected department.
- HR/Admin provision worker accounts through HR; department roster links open that flow with the department preselected. Department heads can provision only `shop_floor_operator` accounts in their assigned department; department in-charges do not receive worker-creation authority. API ensures the built-in operator RBAC role and restricted grants. Operators are scoped to their own EmployeeTask records and production assignments. Provisioning still performs multiple writes without one encompassing transaction. Implementation guide: `docs/implementation/department-workers-and-task-access.md`.

## IMPLEMENTED — Production schedule approval and floor release

- Non-Admin schedules wait in `PENDING_APPROVAL`; Admin-created schedules start `APPROVED`. Approval no longer issues materials or creates floor tasks. Admins separately release approved plans from Production Overview or the plan detail page, which revalidates inventory and creates execution assignments. See `docs/implementation/production-schedule-approval-and-floor-release.md`.
