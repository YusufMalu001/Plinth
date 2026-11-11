# Plinth Platform Implementation Plan

**Platform:** Plinth International ERP  
**Plan status:** Active implementation plan  
**Plan date:** 2026-09-21  
**Repository basis:** Current workspace, `plinth_platform_implementation_audit.md`, `Development.md`, source tree, Prisma schema/migrations, CI workflows and architecture documentation

## 1. Purpose

This document defines the implementation sequence for completing the Plinth Platform as a reliable manufacturing ERP. It is intentionally grounded in the current repository rather than treating every visible page or planned module as complete.

The plan has four goals:

1. Restore a trustworthy engineering baseline.
2. Close the first end-to-end operational vertical slice.
3. Extend the same transaction, ledger, permission, audit and testing patterns through production and downstream operations.
4. Reach controlled pilot and production readiness without inventing unresolved business rules.

The plan uses the following status language:

- **Implemented:** meaningful code, schema or UI exists.
- **Integrated:** the UI and API are connected sufficiently to exercise the workflow.
- **Verified:** live database, browser, UAT or equivalent execution evidence exists.
- **Blocked:** a known defect or unresolved decision prevents safe acceptance.
- **To be validated:** a business or technical decision is not yet confirmed and dependent automation must not be finalized.

## 2. Product alignment

Plinth must become the operational system of record for important physical movements:

```text
Supplier / Procurement
        -> Goods Receipt / GRN
        -> Inventory
        -> BOM and Production Planning
        -> Material Issue
        -> Department Execution
        -> WIP and Handover
        -> QC / Scrap / Rework
        -> Assembly
        -> Finished Goods
        -> Sales
        -> Fulfillment / Packing
        -> Dispatch
        -> Accounts / Tally
```

Parallel governed flows are:

```text
Inventory -> Job Work Vendor -> Processing -> Return -> Reconciliation -> Inventory
Inventory / Production / FG -> Physical Audit -> Variance -> Investigation -> Approval -> Adjustment
Validated Transactions -> Reporting -> Human-Governed AI
```

Tally remains the accounting system of record until its version, integration method, mappings and reconciliation procedure are confirmed. AI is last in the implementation sequence and must not replace deterministic transactions.

## 3. Non-negotiable implementation rules

These rules apply to every new module and every change to an existing module:

1. Every important physical movement has a durable, traceable transaction.
2. Stock is changed through governed ledger or movement services; physical counts never silently overwrite system stock.
3. GRN requires physical verification and digital sign-off.
4. Piece-based and weight-based receiving remain first-class cases.
5. Production can complete partially; unreported quantity is never auto-completed.
6. Material issue remains product-specific even when schedules are visually grouped.
7. BOM formulas, routing, UOM conversion, rounding, QC rules and tolerances are versioned or explicitly validated before executable automation.
8. Worker attribution is captured at assignment, execution, discrepancy and handover points.
9. Required QC gates cannot be bypassed. Failures require a reason and controlled disposition.
10. Intermediate WIP is not finished goods.
11. Job-work material remains Plinth-owned while held by a vendor.
12. Sales channels retain their distinct business behavior.
13. Authorization is least-privilege, deny-by-default, permission-based, scope-aware, server-enforced and audited.
14. Approval permissions remain separate from create/update permissions.
15. Retried requests must be idempotent where they can create physical or financial effects.
16. AI is permission-aware, source-traceable, human-governed and dependent on reliable transactional data.

## 4. Current baseline and acceptance posture

### 4.1 Current architecture

- npm workspaces and Turborepo monorepo.
- Next.js 14 App Router frontend in `apps/web`.
- Express/TypeScript modular monolith in `services/api`.
- Prisma ORM and PostgreSQL/Supabase configuration in `database`.
- Shared `types`, `validation`, `ui`, `config` and `eslint-config` packages.
- Intended API layering: route -> middleware -> validation -> controller -> service -> repository -> Prisma.
- Docker Compose and deployment workflow scaffolding.

### 4.2 Current implementation concentration

Meaningful implementation is concentrated in:

- Master Data.
- Vendor and Procurement.
- Goods Receiving / GRN.
- Inventory and Store.
- BOM and Formula.
- Production Planning.
- Material Issue.
- Department Execution.
- WIP and Batch Tracking.
- Quality Control.
- Finance/Tally mechanics.
- Notifications, Events and Calendar.

The strongest candidate for the first full UAT slice is:

```text
Master Data -> PR -> PO -> Expected Receipt -> GRN -> Stock Balance / Ledger
```

### 4.3 Known blockers from the implementation audit

The following must be resolved before the platform can be treated as release-ready:

- Generated Prisma client is out of sync with the checked-in schema, including QC types/models expected by code.
- API test suite is not green in the audited environment; failures include listener restrictions and unavailable database connectivity.
- Next.js production build fails with webpack errors and needs clean CI reproduction.
- Several modules have pages or scaffolds without complete end-to-end transaction lifecycles: Sales, Dispatch, Fulfillment/Packing, Job Work, Physical Audit and Workforce.
- Live database and browser UAT evidence is incomplete.
- Authentication/session hardening, consistent RBAC/scope enforcement and audit coverage require completion.

## 5. Delivery principles

### 5.1 Deliver vertical slices, not isolated screens

Each milestone must deliver a complete path across:

```text
UI -> API route -> validation -> authorization -> service -> repository -> database
   -> audit / notification / event -> tests -> UAT evidence
```

A page is not considered delivered until its persistence, permissions, status transitions, error states and tests are present.

### 5.2 Preserve transaction history

Do not overwrite approved or posted facts. Use revisions, reversal records, return records, correction notes and explicit adjustments. Every correction must preserve the original actor, timestamp, reason and related transaction.

### 5.3 Keep business uncertainty visible

If a required business rule is unresolved, mark it **TO BE VALIDATED**, record its owner and prevent dependent automation from becoming authoritative.

### 5.4 Use the database as a contract

Every schema change must be reviewed alongside:

- Prisma generated client.
- Migration SQL.
- Seed scripts.
- Repository queries.
- Service logic.
- API request/response types.
- UI selectors and forms.
- Tests and fixtures.

## 6. Phased implementation roadmap

| Phase | Objective | Exit condition |
|---|---|---|
| P0 | Restore trustworthy baseline | Schema/client, typecheck, tests and build are green in CI. Critical auth and audit defects have owners and fixes. |
| P1 | Close procurement-to-stock vertical slice | Master Data through GRN finalization and stock ledger is proven against live seeded data, including exceptions and reversal. |
| P2 | Close production execution slice | Approved BOM through plan, material issue, department execution, WIP handover and QC disposition is proven. |
| P3 | Complete downstream operations | Assembly, finished goods, job work, sales, packing, dispatch, physical audit and workforce lifecycles are implemented and integrated. |
| P4 | Complete finance and reporting | Validated Tally boundary, source mappings, reconciliation, governed dashboards and operational reporting are accepted. |
| P5 | Controlled pilot and production | Pilot evidence, migration reconciliation, security review, rollback plan, support runbook and go-live approval exist. |

## 7. P0 - Restore a trustworthy engineering baseline

### Objective

Make the repository safe to extend and make CI a reliable signal.

### Work packages

#### P0.1 Schema and generated client alignment

- Run Prisma validation against `database/prisma/schema.prisma`.
- Generate the client from the checked-in schema.
- Compare QC, WIP, BOM, production and finance imports against generated types.
- Repair migration/schema/client drift rather than patching individual compile errors.
- Confirm the generated client is reproducible from a clean install.
- Add a CI guard that fails when generated types are stale.

**Acceptance criteria**

- `prisma validate` passes.
- `npm run db:generate` completes from a clean workspace.
- API typecheck has zero errors.
- QC tests compile against the same schema used by runtime.

#### P0.2 Test environment reliability

- Separate unit tests from database integration tests where needed.
- Add explicit test-database configuration and health detection.
- Make unavailable external resources fail clearly or skip only the tests that require them.
- Remove listener-binding assumptions from tests that can exercise the Express app directly.
- Keep production behavior unchanged; test fallbacks must not hide real failures in CI.

**Acceptance criteria**

- API test command is deterministic in CI.
- Database-dependent tests use a known schema and seed.
- A missing database produces an explicit setup failure or documented skip, not an ambiguous assertion failure.

#### P0.3 Production web build

- Reproduce the webpack failure with a clean install and CI-equivalent Node version.
- Capture the complete underlying diagnostic.
- Fix module resolution, client/server boundary, asset or bundling defects.
- Run a clean production build after fixing.

**Acceptance criteria**

- `npm run build` passes from a clean workspace.
- The built web app starts and can load the login and protected shell routes.

#### P0.4 Authentication and session hardening

- Apply shared login validation middleware at the route boundary.
- Use real password hashing for all seeded and runtime credentials.
- Enforce server-side authentication on protected routes.
- Define access-token, refresh-token, expiry, logout and session invalidation behavior.
- Remove reliance on a browser-only `isLoggedIn` flag for authorization.
- Add lockout/rate limiting and safe error responses.
- Confirm CORS/trusted-origin behavior for local, staging and production origins.

**Acceptance criteria**

- Unauthenticated API calls receive a consistent 401 response.
- Expired or revoked sessions cannot access protected data.
- Passwords are never stored or compared as predictable mock strings.
- Login and logout are covered by API and browser tests.

#### P0.5 RBAC, data scope and audit baseline

- Reconcile role definitions across Prisma, shared types, seeds and request typing.
- Define permission keys by resource and action.
- Separate create/update from submit, approve, release, post and reverse actions.
- Enforce department, factory, warehouse and location scopes where applicable.
- Emit audit records for authentication, approvals, postings, reversals, adjustments, exports and permission changes.

**Acceptance criteria**

- A permission matrix exists for every P1 workflow.
- Server-side authorization tests cover allow, deny and out-of-scope cases.
- Audit records contain actor, action, resource, resource ID, timestamp, request/correlation ID and reason where required.

## 8. P1 - Procurement to stock vertical slice

### Objective

Make the first operational flow trustworthy in a live seeded environment.

### Sequence

```text
Master Data -> Purchase Requisition -> Approval -> Purchase Order
-> Expected Receipt -> OCR / Document -> GRN Draft -> Physical Verification
-> Discrepancy Resolution -> Finalization -> Inventory Ledger / Balance
```

### Work packages

#### P1.1 Master Data readiness

- Reconcile product, category, family, variant, material and UOM identity rules.
- Confirm vendors, customers, factories, departments, work centers, warehouses and locations.
- Confirm active/inactive lifecycle behavior and duplicate detection.
- Confirm import staging and row-level error handling.
- Establish a versioned seed dataset for UAT.

**Acceptance criteria**

- Every P1 transaction references approved master records.
- Duplicate, orphan and inactive-record behavior is tested.
- UOM and pack-size conversions used by P1 are approved.

#### P1.2 Procurement workflow

- Complete PR creation, editing, submission, approval, rejection and revision behavior.
- Generate PO only from an allowed PR state.
- Preserve PO revisions and transmission history.
- Enforce approval permissions and scope.
- Create expected receipt records that are visible to receiving.

**Acceptance criteria**

- Invalid state transitions are rejected.
- Approval and rejection require the correct permission.
- A PO cannot be finalized from an unapproved or superseded PR.
- Expected receipt quantities reconcile to PO quantities.

#### P1.3 Goods Receiving / GRN

- Support expected receipt selection and PO matching.
- Support invoice/document upload, OCR extraction, correction and approval.
- Support piece and weight measurements.
- Capture physical verification and receiver sign-off.
- Implement exact match, shortage, excess, wrong item, UOM mismatch, price variance, damage and unreadable-document paths.
- Keep debit-note treatment separate from stock acceptance until finance rules are confirmed.
- Use idempotency to prevent duplicate receipt posting.

**Acceptance criteria**

- Each discrepancy has type, quantity/value impact, reason, status, actor and resolution.
- A GRN cannot finalize without required verification and permissions.
- Retrying the same finalization request creates one stock effect.
- Original OCR values and corrected approved values remain distinguishable.

#### P1.4 Inventory posting

- Define the canonical inventory posting service.
- Create one ledger movement per accepted stock movement.
- Update balance, lot, ownership, condition and location consistently.
- Support reversal without deleting the original entry.
- Emit audit and notification events.

**Acceptance criteria**

- Finalizing a GRN changes the expected balance exactly once.
- Ledger and balance reconcile for every UAT case.
- Reversal restores the correct quantity and creates a traceable counter-entry.
- Unauthorized users cannot post or reverse.

### P1 UAT pack

The P1 UAT pack must execute all of the following with seeded data:

1. Exact PO-to-receipt match.
2. Shortage.
3. Excess.
4. Wrong item.
5. UOM mismatch.
6. Price variance.
7. Damaged material.
8. Unreadable invoice/document.
9. Duplicate browser retry.
10. Unauthorized approval/finalization.
11. Reversal after posting.
12. Reconciliation of PO, GRN, stock balance and ledger.

## 9. P2 - Production, WIP and QC vertical slice

### Objective

Prove quantity and ownership continuity from approved product definition through intermediate execution and quality disposition.

### Sequence

```text
Approved Product / Route / BOM
-> Production Plan
-> Material Requirement
-> Material Issue
-> Department Execution Batch
-> Worker Assignment / Progress
-> Handover / WIP
-> QC Checkpoint
-> Pass, Hold, Rework, Scrap or Reject
```

### Work packages

#### P2.1 BOM and formula engine

- Reconcile product formulas and approved golden examples.
- Implement draft, validate, approve, supersede and history behavior.
- Validate quantity mode, rounding rule, UOM conversion and precision.
- Store simulation runs and comparison evidence.
- Prevent planning from selecting an unapproved BOM.

**Acceptance criteria**

- An approved BOM has immutable version identity.
- Golden examples pass before approval.
- A changed formula creates a new version.
- Planning results can be traced to the selected BOM version.

#### P2.2 Production planning

- Confirm product-wise routing, department order, optional stages and rework paths.
- Generate requirements from approved BOM and plan quantity.
- Handle partial quantities, interruption, cancellation and release.
- Reserve or identify material requirements without silently consuming stock.

**Acceptance criteria**

- A plan cannot release without approved BOM and route.
- Partial completion leaves uncompleted quantity open.
- Plan events provide a traceable state history.

#### P2.3 Material issue and return

- Issue material against a product-specific plan/batch.
- Preserve source stock, lot, ownership and location.
- Support return of unused material.
- Support reversal with reason and approval.
- Reconcile required, issued, returned, consumed and remaining quantities.

**Acceptance criteria**

- No issue can exceed available or authorized quantity.
- Returned material is traceable to the originating issue.
- Quantity conservation passes for every P2 scenario.

#### P2.4 Department execution and WIP

- Create execution batches from released plans.
- Assign workers and capture responsibility.
- Record progress, partial output, delay and exception.
- Enforce handover gates and destination acceptance.
- Track WIP ownership, condition and quantity.
- Add genealogy and reconciliation exceptions.

**Acceptance criteria**

- Every handover has source, destination, quantity, people, time and status.
- A department cannot receive more than the source department has handed over.
- WIP is not presented as finished goods.
- Exceptions cannot be closed without disposition.

#### P2.5 QC and loss disposition

- Repair schema/client alignment for QC models and enums.
- Approve checkpoint rules, tolerance values and responsible roles.
- Capture inspection result, evidence, failed quantity and corrective action.
- Gate release from hold into the next allowed state.
- Link scrap, damage, abnormal wastage and replacement to source batches.

**Acceptance criteria**

- Required checkpoints cannot be bypassed.
- Failed output is held, reworked, scrapped or rejected through a controlled disposition.
- QC result, disposition and stock effect reconcile.

## 10. P3 - Complete downstream operational modules

P3 begins only after P0, P1 and P2 have green gates and UAT evidence. The goal is not to build every screen at once; each module must be delivered as a vertical transaction slice.

### 10.1 Assembly and Finished Goods

- Define assembly input/output rules and product genealogy.
- Consume eligible WIP and create assembly output.
- Enforce QC and release gates.
- Create finished goods receipt, hold, release and traceability.
- Reconcile components, output quantity, scrap and variance.

**Exit criteria:** assembly-to-finished-goods flow passes with partial output, failure and rework scenarios.

### 10.2 Job Work / Outsourced Processing

- Issue Plinth-owned material to a vendor.
- Track custody, expected return, processing status and vendor documents.
- Receive processed material and reconcile quantity, loss and condition.
- Support rejection, shortage, excess, return and adjustment.
- Confirm accounting treatment before Tally automation.

**Exit criteria:** job-work material remains owned by Plinth throughout the vendor cycle and every movement reconciles.

### 10.3 Sales Order Management

- Define channel-specific workflows for DS, Amazon, E-Trade and other approved channels.
- Capture customer/order lines, price, tax, promised date and status.
- Define cancellation, return, refund, exchange and credit behavior.
- Enforce allocation only from eligible finished goods.

**Exit criteria:** at least one validated channel completes order -> allocation -> fulfillment and has finance mapping requirements documented.

### 10.4 Fulfillment, Packing and Dispatch

- Reserve and pick stock.
- Pack by order/channel rules.
- Capture package, label, carrier and dispatch evidence.
- Support dispatch confirmation, cancellation and return-to-stock behavior.
- Preserve status history.

**Exit criteria:** an order cannot dispatch without eligible allocation and packing completion; physical and system quantities reconcile.

### 10.5 Physical Audit and Reconciliation

- Create count sessions by location/product scope.
- Capture counted quantity without overwriting book quantity.
- Calculate variance and require investigation.
- Require approval for adjustment.
- Post adjustment through the inventory ledger with reason and audit.

**Exit criteria:** count -> variance -> investigation -> approval -> adjustment is fully traceable.

### 10.6 Workforce and Task Management

- Define task types, assignment, priority, due date and escalation.
- Link tasks to PR, receipt, production, QC, exception or audit records.
- Capture worker attribution and completion evidence.
- Add permission and department scope.

**Exit criteria:** a task can be assigned, progressed, escalated and closed with actor/time evidence.

## 11. P4 - Finance, reporting and management controls

### 11.1 Tally boundary

Before implementing a connector, obtain these decisions:

- Tally version.
- Manual, semi-automatic or automatic integration method.
- Supported file/API format.
- Master and transaction mappings.
- Retry and duplicate handling.
- Reconciliation ownership and cadence.
- Debit-note, return, sales, COGS and job-work treatment.

Until these are confirmed, build only deterministic internal queues, mappings, export validation and reconciliation evidence.

### 11.2 Finance implementation

- Define source transaction eligibility.
- Implement mapping configuration with versioning.
- Queue export jobs and items.
- Store source references and exported identifiers.
- Handle retry, failure and manual correction.
- Reconcile Plinth totals with Tally totals.

**Exit criteria:** every supported source type has a mapping, export, retry and reconciliation test.

### 11.3 Reporting

- Define each metric's source tables, filters, timezone, freshness and owner.
- Separate operational dashboards from financial reports.
- Show pending, held, rejected and unreconciled populations.
- Provide drill-through to source transactions.
- Do not present prototype hard-coded metrics as authoritative.

**Exit criteria:** dashboard numbers reconcile to source queries and stale data is visibly identified.

## 12. P5 - Migration, pilot and go-live

### 12.1 Migration

- Confirm historical migration scope and retention period.
- Profile source workbooks and identify authoritative fields.
- Stage imports before final insert.
- Reconcile product, material, vendor, UOM and opening stock data.
- Record rejected rows and business decisions.
- Freeze a cutover dataset and checksum/export it.

### 12.2 Pilot

- Select one factory/location and one controlled operating group.
- Use approved master data and a limited product family.
- Run procurement-to-stock and production-to-WIP slices.
- Track defects, training questions and reconciliation outcomes.
- Require daily review of held, failed, reversed and manually adjusted transactions.

### 12.3 Go-live readiness gates

Go-live requires all of the following:

- CI lint, typecheck, tests and build are green.
- Prisma migration history is deployable and rollback/restore is documented.
- Authentication, session invalidation, RBAC and data scope are tested.
- P1 and P2 workflows have live UAT evidence.
- Opening stock is reconciled and approved.
- Tally boundary and finance ownership are signed off.
- Backups, monitoring, logs, audit review and incident response are available.
- User training and support runbook are complete.
- Production deployment has a tested rollback path.

## 13. Business validation register

The following decisions must be owned and resolved before dependent automation is finalized:

| ID | Decision | Owner | Blocks |
|---|---|---|---|
| V-001 | Complete/reconciled product master | Business owner + operations lead | Product-dependent modules |
| V-002 | Exact BOM/formula values | Production owner + source-spreadsheet custodian | BOM, planning, production and costing |
| V-003 | Product-wise department routing | Production management | Planning, execution, WIP and QC |
| V-004 | Approval hierarchy | Plinth ownership + department heads | Permissions and workflow release |
| V-005 | DS sales workflow | Sales owner | Sales, fulfillment, dispatch and reporting |
| V-006 | Tally version | Finance owner | Connector and supported exchange format |
| V-007 | Tally integration method | Finance + technical lead | Sync topology and retry model |
| V-008 | Debit-note accounting treatment | Finance owner | GRN exceptions and finance posting |
| V-009 | QC rules by checkpoint | Quality + production owners | QC gates and dispositions |
| V-010 | Wastage tolerance by material/process | Production + finance owners | Loss control and exception reporting |
| V-011 | Return/refund rules | Sales + finance owners | Returns, refunds, restock and accounting |
| V-012 | Historical migration scope | Business owners + technical lead | Migration and cutover |
| V-013 | Material UOMs and pack sizes | Store + production owners | Receiving, issue, BOM and reconciliation |
| V-014 | Job-work accounting treatment | Finance + operations | Job-work and Tally |
| V-015 | Stock-adjustment authorization | Operations + finance | Physical audit and adjustments |
| V-016 | Device/network policy | Technical lead + security owner | Production access controls |
| V-017 | Opening-stock verification method/date | Store + finance | Go-live opening balances |
| V-018 | AI governance | Business + technical lead | AI command brain |

Each register item should record evidence, decision date, owner, impacted modules and the exact implementation change required.

## 14. Engineering work conventions

### 14.1 Backend

- Keep routes declarative.
- Keep controllers thin.
- Put business rules and transaction coordination in services.
- Put Prisma calls in repositories.
- Validate body, params and query inputs with shared Zod schemas.
- Use standard `ApiResponse<T>` and `ApiErrorResponse` contracts.
- Write tests for allowed, denied, invalid-state, duplicate and reversal paths.

### 14.2 Frontend

- Keep domain UI in `apps/web/src/features`.
- Use shared UI primitives for consistent states.
- Provide loading, empty, error, permission-denied, approval-pending and success states.
- Keep server data in query/cache patterns and local interaction state local to the feature.
- Never import Prisma or query the database directly from Next.js.

### 14.3 Database

- Update `schema.prisma` first.
- Generate a migration and inspect SQL safety.
- Regenerate Prisma client.
- Update repositories, services, types, seeds and tests together.
- Avoid destructive migrations without an approved migration plan and backup.

### 14.4 Pull requests and CI

Every PR should include:

- Scope and affected modules.
- Migration impact.
- Permission/audit impact.
- Test evidence.
- UAT or screenshots for user-facing work.
- Confirmation that lint, typecheck, test and build gates were run.

## 15. Definition of done for a module

A Plinth module is complete only when all of the following are true:

1. Business rules and unresolved decisions are documented.
2. Prisma models and migrations are reviewed.
3. API routes, validation, authorization, controllers, services and repositories are implemented.
4. UI pages, forms, tables, statuses and error states are integrated.
5. Audit, notification and event behavior is defined.
6. Unit and integration tests pass.
7. Browser or UAT workflow passes against seeded data.
8. Reversal, retry, permission-denied and exception paths are tested.
9. Reports and downstream consumers use governed source data.
10. Documentation and runbooks are updated.

## 16. Immediate next actions

1. Regenerate Prisma client and restore schema/client alignment.
2. Reproduce and fix the production web build.
3. Make API tests deterministic with a documented database strategy.
4. Harden authentication, sessions, RBAC, scopes and audit writes.
5. Run the P1 procurement-to-stock UAT pack with live seeded data.
6. Resolve the first business validation register items: product master, UOM, BOM examples, routing and approval hierarchy.
7. Start P2 only after P1 acceptance evidence is complete.

## 17. Plan maintenance

Update this plan after every approved slice or material architecture change. Each update should include:

- Date and owner.
- Completed work packages.
- New blockers or validation decisions.
- Changed module status.
- Updated acceptance evidence.
- Revised next actions.

This document is the implementation sequence. The architecture report remains the detailed current-state explanation of how the platform is structured and how the implemented flows operate.
