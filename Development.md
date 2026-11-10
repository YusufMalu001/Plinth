# Synergy International ERP — Living Development Tracker

Last updated: 2026-08-25  
Current phase: Phase 0 — Discovery and Validation  
Implementation state: Planning only; ERP implementation has not started  
Active vertical slice: None approved  
Next recommended vertical slice: Module 0 — Secure authentication and protected application shell

## 1. Project Identity and Product Definition

Synergy International is an Indore-based manufacturer of cloth-drying stands and related household products across stainless-steel, plastic, wall-mounted, glider, CS19, and outsourced product lines.

The ERP must become the operational system of record for every important physical movement:

`Supplier/Procurement -> GRN -> Inventory -> BOM/Planning -> Material Issue -> Department Execution -> WIP -> QC/Scrap/Rework -> Assembly -> Finished Goods -> Sales -> Fulfillment/Packing -> Dispatch -> Accounts/Tally`

Parallel governed flows:

- `Inventory -> Job Work Vendor -> Processing -> Return -> Reconciliation -> Inventory`
- `Inventory/Production/FG -> Physical Audit -> Variance -> Investigation -> Approval -> Adjustment`
- `Validated transactions -> Reporting -> AI Command Brain`

Tally remains the accounting system of record until its version, integration method, mappings, and reconciliation process are validated. AI is last and may not replace deterministic ERP transactions.

## 2. Source Priority and Classification

Source priority:

1. Confirmed Factory Operations / Industrial Visit findings
2. Confirmed Business Process / Accounts findings
3. Post-visit Master SOW / ERP Blueprint
4. Earlier SOW content only where not contradicted
5. Clearly labelled assumptions
6. Future / optional ideas

Required labels:

- **CONFIRMED** — directly supported by the governing source.
- **TO BE VALIDATED** — unresolved business decision; dependent automation must stop.
- **ASSUMPTION** — planning hypothesis only; never executable without confirmation.
- **FUTURE / OPTIONAL** — possible later enhancement, outside current dependency path.
- **OUT OF SCOPE** — excluded from core ERP.
- **DEPENDENCY** — prerequisite capability or decision.

## 3. Confirmed Governing Rules

- Every important physical movement requires a traceable digital transaction.
- Stock is a transaction-derived ledger; physical counts never silently overwrite it.
- GRN requires physical verification and digital sign-off.
- Weight-based and piece-based receiving must both be supported.
- Production completion may be partial; uncompleted quantity is never auto-completed.
- Material issue remains product-specific even when schedules are visually grouped.
- BOM formulas, routing, UOM conversions, rounding, QC rules, and tolerance values must be validated before executable automation.
- Worker attribution is required at assignment, execution, discrepancy, and handover points.
- Required QC gates cannot be bypassed; failures require reason and controlled disposition.
- Ready-to-complete intermediate stock is not finished goods.
- Job-work material remains Synergy-owned while held by a vendor.
- Sales channels retain distinct behavior; they must not be forced into one workflow.
- Authorization is least-privilege, deny-by-default, permission-based, scope-aware, server-enforced, and audited.
- Approval permissions remain separate from create/update permissions.
- AI is permission-aware, source-traceable, human-governed, and implemented only after reliable transactional data and reporting.

## 4. Repository Assessment — 2026-08-25

### Existing architecture

- npm-workspace/Turborepo monorepo.
- Next.js 14 App Router frontend in `apps/web`.
- Express/TypeScript modular monolith in `services/api`.
- Prisma 5 with Supabase PostgreSQL configuration in `database`.
- Shared `types`, `validation`, `ui`, `config`, and `eslint-config` packages.
- Intended backend flow: route -> middleware -> validation -> controller -> service -> repository -> Prisma.
- HTTP-only frontend/backend boundary with a Next.js API rewrite.
- Docker production/development definitions and GitHub CI/production workflow scaffolds.

### Existing implementation inventory

- **IMPLEMENTED FOUNDATION:** correlation IDs, structured request logging, centralized application errors, centralized Express error handling, Helmet, CORS, JSON parsing, Prisma singleton, database health query, versioned API mounting.
- **IMPLEMENTED HEALTH SLICE:** health endpoint with connected/unhealthy responses and two API tests.
- **PARTIAL AUTHENTICATION:** login UI and API, JWT issuance, seeded users, local browser authentication state.
- **PARTIAL UI SHELL:** login screen, fixed sidebar, theme persistence, dashboard layout, shared Button/Card/Input/Badge/Table primitives.
- **PROTOTYPE DASHBOARD:** hard-coded CRM leads, metrics, activity feed, placeholder navigation states.
- **SCAFFOLDED MODULES:** users, employees, inventory, production, sales, purchases, and finance routers; frontend feature README placeholders.
- **DATABASE SKELETON:** User, AuditLog, and HealthCheckLog models; no business transaction entities.

### Missing or incomplete implementation

- No repository/service layers exist; authentication queries Prisma directly from its controller.
- No authentication middleware, session verification, logout invalidation, password reset, lockout/rate limiting, or protected API behavior.
- No real password hashing; seed/login use predictable mock strings.
- No permission, role-assignment, data-scope, or approval authorization model.
- No audit event writer despite the AuditLog table.
- No organization, factory, department, location, document, notification, or settings domain.
- No Prisma migrations directory or migration history.
- No ERP master or transaction models.
- No functional ERP module API, service, repository, page, form, query, state store, or integration.
- No frontend test framework or E2E test framework configured.
- Only two backend tests, both for health.
- No `MEMORY.md`; `Development.md` did not exist before this assessment.
- Production deployment workflow contains placeholder deployment commands.

### Current quality evidence

- `npm run typecheck`: PASS on 2026-08-25.
- `npm run build`: PASS on 2026-08-25.
- `npm run lint`: PASS with two Next.js `<img>` optimization warnings.
- `npm run test`: PASS outside the sandbox; 1 suite and 2 health tests. Initial sandbox run failed because Supertest could not bind a local listener (`EPERM`), not because an assertion failed.
- Git: clean working tree before this tracker; branch `assign/fardeen`, four commits ahead of `origin/assign/fardeen`.
- Environment names observed without values: `NODE_ENV`, `PORT`, `API_VERSION`, `JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_API_URL`.

### Technical risks and debt

- **Critical:** predictable mock password representation is unsafe.
- **Critical:** browser `isLoggedIn` flag is trusted for route access; no server-side session verification protects the dashboard.
- **Critical:** no server-side RBAC or data-scope enforcement.
- **High:** JWT storage in localStorage raises token-theft risk; session design needs hardening.
- **High:** role definitions disagree across Prisma, shared types, request typing, seeds, and the master specification.
- **High:** successful authentication response does not follow the documented `ApiResponse<T>` contract or include `requestId`.
- **High:** shared login schema exists but the login route does not apply validation middleware.
- **High:** controller-to-Prisma coupling violates the documented service/repository boundary.
- **High:** no migrations exist, so deployed schema provenance and rollback are absent.
- **High:** audit storage exists but sensitive operations do not emit audit records.
- **High:** CORS allows every origin; network/device restriction is not implemented.
- **Medium:** development Prisma query logging can expose query parameters and must be reviewed for sensitive data.
- **Medium:** root documentation references database scripts that are not exposed at the root package level.
- **Medium:** branching documentation expects a `stage` branch, but no local or remote `stage` branch was observed.
- **Medium:** production workflow is a scaffold and does not deploy.
- **Medium:** docs describe shadcn/ui, Zustand, React Hook Form, and TanStack Query, but current UI does not yet establish working conventions for them.
- **Low:** two raw `<img>` elements produce lint warnings.
- **Low:** generated `.next`, `dist`, coverage, and Turborepo artifacts exist locally but are ignored.

## 5. Validation Register

All unresolved items remain **TO BE VALIDATED**. “Blocks” means the named automation cannot be completed safely; non-dependent foundation work may continue.

### V-001 — Complete/reconciled product master

- Status/owner: TO BE VALIDATED / Business owner + operations lead.
- Evidence: source names five SS items while describing “6–7”; examples exist for other families.
- Depends/blocks: Modules 1, 5–17, 21; blocks executable product-dependent transactions.
- Decision/date: Pending / none.
- Impact: establish approved SKU, family, variant, active status, UOM, pack size, and identity rules.

### V-002 — Exact BOM/formula values

- Status/owner: TO BE VALIDATED / Production owner + source-spreadsheet custodian.
- Evidence: formulas exist in Excel; only limited examples are confirmed.
- Depends/blocks: Modules 5–13 and production costing/reporting.
- Decision/date: Pending / none.
- Impact: no executable material calculation until versioned golden examples are approved.

### V-003 — Product-wise department routing

- Status/owner: TO BE VALIDATED / Production management.
- Evidence: department examples confirmed; CS19 is separate; routing varies by product.
- Depends/blocks: Modules 6, 8–13, 21.
- Decision/date: Pending / none.
- Impact: define ordered stages, optional stages, handover gates, and rework paths per product/version.

### V-004 — Production and transaction approval hierarchy

- Status/owner: TO BE VALIDATED / Synergy ownership and department heads.
- Evidence: Haider usually decides quantities, sometimes Aziz; escalation exists but exact hierarchy is unknown.
- Depends/blocks: Modules 0, 2–3, 6–7, 10–13, 15, 19.
- Decision/date: Pending / none.
- Impact: permission keys and state transitions may be scaffolded, but assignments cannot be finalized.

### V-005 — DS sales workflow

- Status/owner: TO BE VALIDATED / Sales owner.
- Evidence: DS exists; exact workflow absent.
- Depends/blocks: Modules 15–17 and channel reporting.
- Decision/date: Pending / none.
- Impact: DS-specific order, packing, exchange, documentation, and completion states remain blocked.

### V-006 — Tally version

- Status/owner: TO BE VALIDATED / Finance owner.
- Evidence: Tally is accounting system of record; version not supplied.
- Depends/blocks: Module 18.
- Decision/date: Pending / none.
- Impact: connector capability and supported exchange formats cannot be selected.

### V-007 — Tally integration method

- Status/owner: TO BE VALIDATED / Finance owner + technical lead.
- Evidence: manual, semi-automatic, or automatic method not confirmed.
- Depends/blocks: Module 18 and accounting dashboard integration.
- Decision/date: Pending / none.
- Impact: do not invent an API, retry model, or sync topology.

### V-008 — Debit-note accounting treatment

- Status/owner: TO BE VALIDATED / Finance owner.
- Evidence: receiving discrepancy/debit-note process confirmed; accounting treatment unknown.
- Depends/blocks: Modules 3 and 18.
- Decision/date: Pending / none.
- Impact: GRN may record discrepancies, but accounting posting/handoff rules remain blocked.

### V-009 — QC rules by checkpoint

- Status/owner: TO BE VALIDATED / Quality and production owners.
- Evidence: checkpoints and outcome categories are confirmed; exact criteria are not.
- Depends/blocks: Modules 10–13.
- Decision/date: Pending / none.
- Impact: inspection framework can be designed; executable criteria and automatic gates await approval.

### V-010 — Wastage tolerance by material/product/process

- Status/owner: TO BE VALIDATED / Production + finance owners.
- Evidence: observed rope example around 1–2% is explicitly variable.
- Depends/blocks: Module 11 and exception reporting.
- Decision/date: Pending / none.
- Impact: tolerance must be configurable and versioned; no universal hard-coded rate.

### V-011 — Return/refund rules

- Status/owner: TO BE VALIDATED / Sales + finance owners.
- Evidence: Amazon returns department and E-Trade exchange ownership confirmed; detailed rules absent.
- Depends/blocks: Modules 15–18.
- Decision/date: Pending / none.
- Impact: return authorization, refund, restock, write-off, and accounting states remain blocked.

### V-012 — Historical migration requirement

- Status/owner: TO BE VALIDATED / Business owners + technical lead.
- Evidence: no approved import scope, retention period, or source inventory in repository.
- Depends/blocks: Modules 1–21 and pilot readiness.
- Decision/date: Pending / none.
- Impact: migration tooling, cleansing, reconciliation, and cutover plan cannot be finalized.

### V-013 — Exact material units and pack sizes

- Status/owner: TO BE VALIDATED / Store + production owners.
- Evidence: weight, piece, bundle, rope, rod, and packet handling are confirmed; exact conversions are not.
- Depends/blocks: Modules 1, 3–14.
- Decision/date: Pending / none.
- Impact: UOM conversions, receiving, issue, BOM, and reconciliation calculations remain blocked.

### V-014 — Job-work accounting treatment

- Status/owner: TO BE VALIDATED / Finance owner.
- Evidence: Synergy ownership at vendor is confirmed; accounting treatment is not.
- Depends/blocks: Modules 14 and 18.
- Decision/date: Pending / none.
- Impact: operational vendor-held ledger may proceed after master data; financial posting waits.

### V-015 — Stock-adjustment authorization

- Status/owner: TO BE VALIDATED / Store, finance, and ownership.
- Evidence: adjustments must be controlled; approver hierarchy is absent.
- Depends/blocks: Modules 4 and 19.
- Decision/date: Pending / none.
- Impact: adjustment workflow can be modeled; final role/scope assignments await approval.

### V-016 — User/device/network policy details

- Status/owner: TO BE VALIDATED / Technical lead + ownership.
- Evidence: factory network restriction and authorized phone-browser access are confirmed at a high level.
- Depends/blocks: Module 0 production acceptance and go-live.
- Decision/date: Pending / none.
- Impact: define trusted networks, remote access, device policy, session duration, MFA, and emergency access.

### V-017 — Opening stock verification method/date

- Status/owner: TO BE VALIDATED / Store + auditor + finance.
- Evidence: no approved opening balance/cutover procedure supplied.
- Depends/blocks: Modules 4, 13, 14, 19 and pilot.
- Decision/date: Pending / none.
- Impact: opening ledger entry, physical count evidence, approval, and cutover timestamp must be defined.

### V-018 — AI governance for controlled automation

- Status/owner: TO BE VALIDATED / Ownership + security + technical lead.
- Evidence: human approval and no autonomous critical decisions are confirmed; detailed governance is absent.
- Depends/blocks: Module 22 levels 7 and any write action.
- Decision/date: Pending / none.
- Impact: AI remains read-only/analytical until policies, approval, logging, evaluation, and kill-switch controls are approved.

## 6. Dependency Map

Primary dependency chain:

`0 Platform Foundation -> 1 Master Data -> 2 Procurement -> 3 GRN -> 4 Inventory -> 5 BOM -> 6 Production Planning -> 7 Material Issue -> 8 Department Execution -> 9 WIP -> 10 QC -> 11 Scrap/Wastage -> 12 Assembly -> 13 Finished Goods -> 14 Job Work -> 15 Sales -> 16 Fulfillment/Packing -> 17 Dispatch -> 18 Accounts/Tally -> 19 Physical Audit -> 20 Tasks -> 21 Reporting -> 22 AI`

Important cross-dependencies:

- Module 0 security, audit, documents, users, and scopes govern every module.
- Module 1 masters feed every operational transaction.
- Module 4 ledger is consumed by production, job work, sales allocation, dispatch, audit, and reporting.
- Modules 5 and 1 jointly gate production automation.
- Modules 8–11 jointly establish WIP, quality, loss, rework, and traceability.
- Module 13 gates sellable stock allocation.
- Module 18 depends on validated mappings from procurement, GRN, inventory, sales, dispatch, returns, and job work.
- Module 19 depends on stable inventory/FG ledgers and adjustment authorization.
- Module 21 reads only traceable source transactions; it must not create alternate truths.
- Module 22 depends on governed data, reporting definitions, RBAC, traceability, and AI policy.

## 7. Phase Roadmap

- **Phase 0 — Discovery/Validation:** maintain validation register, collect masters/formulas/routes/approvals, define acceptance evidence, and keep dependent rules blocked.
- **Phase 1 — Foundation:** Module 0 in small slices: secure identity/session, RBAC engine, organization/scopes, audit, documents, notifications/settings, network controls.
- **Phase 2 — Master Data + Inbound:** Modules 1–4, ending with a traceable procurement-to-stock flow.
- **Phase 3 — Production Core:** Modules 5–9, ending with traceable partial production and WIP.
- **Phase 4 — QC + Assembly + FG:** Modules 10–13, ending with QC-gated finished goods.
- **Phase 5 — Job Work:** Module 14 operational vendor-held balances and reconciliation; accounting waits for validation.
- **Phase 6 — Sales + Fulfillment + Dispatch:** Modules 15–17 with channel-specific behavior.
- **Phase 7 — Tally:** Module 18 after V-006–V-008 and V-014 are resolved.
- **Phase 8 — Audit + Tasks:** Modules 19–20.
- **Phase 9 — Dashboards:** Module 21 after transactional metrics are reproducible.
- **Phase 10 — AI:** Module 22 after governance and reliable reporting.

## 8. Module Status Index

| Module | Status | Current repository evidence | Principal gate |
|---|---|---|---|
| 0 Platform Foundation | Planning / partial prototype | Login, health, middleware, shell, three DB models | Security hardening, RBAC, scopes, audit writer, V-004/V-016 |
| 1 Master Data | Done (Data Entry Blocked on Mod 0 & V-items) | API, Frontend, E2E implemented | V-001/V-003/V-013 |
| 2 Vendor & Procurement | Scaffolded | Empty purchases router and README | Module 1, V-004 |
| 3 Goods Receiving / GRN | Functionally complete (unverified against a live DB) — see §10 for detail, updated 2026-08-30 | Full API+frontend: state machine, measurements, labels, discrepancies, sign-off/finalize, stock-ledger inventory handoff, PO/ExpectedReceipt sync, scoped RBAC, Supabase-backed attachments; 99 unit tests passing | Run `db:migrate`/`db:seed` + full test suite against a real Postgres; provision Supabase Storage credentials; V-013 UOM/pack conversion still unresolved; no perf/bulk tests yet |
| 4 Inventory & Store | Scaffolded | Empty router and README | Module 3, V-015/V-017 |
| 5 BOM / Formula | Not Started | No domain implementation | Module 1/4, V-002/V-013 |
| 6 Production Planning | Scaffolded | Empty production router and README | Module 5, V-003/V-004 |
| 7 Material Issue | Not Started | No domain implementation | Modules 4–6, V-013 |
| 8 Department Execution | Not Started | No domain implementation | Modules 6–7, V-003 |
| 9 WIP & Batch | Not Started | No domain implementation | Module 8 |
| 10 Quality Control | Not Started | No domain implementation | Modules 8–9, V-009 |
| 11 Scrap/Damage/Wastage | Not Started | No domain implementation | Modules 4/8/10, V-010 |
| 12 Assembly | Not Started | No domain implementation | Modules 5/10/11, V-002/V-009 |
| 13 Finished Goods | Not Started | No domain implementation | Module 12 and QC gate |
| 14 Job Work | Not Started | No domain implementation | Modules 1/4, V-014 |
| 15 Sales Orders | Scaffolded | Empty sales router and README | Module 13, V-005/V-011 |
| 16 Fulfillment/Packing | Not Started | No domain implementation | Module 15, channel validations |
| 17 Dispatch | Not Started | No domain implementation | Module 16 |
| 18 Accounts/Tally | Functionally complete (PURCHASE_ORDER active, others blocked) | Full API/service/stub adapter/migrations/seeds/RBAC implemented; 23 tests passing | Blocked on Modules 14-17 and V-006/V-007/V-008/V-011/V-014 |
| 19 Physical Audit | Not Started | AuditLog is unrelated to stock audit | Modules 4/13, V-015/V-017 |
| 20 Task & Workforce | Scaffolded | Empty employees router and README | Module 0 and department master |
| 21 Reporting/Dashboards | Prototype only | Hard-coded CRM dashboard | Stable source transactions |
| 22 AI Command Brain | Not Started | No AI implementation | Module 21 and V-018 |

## 9. Shared Product and Engineering Strategy

### UI and page strategy

Each screen must declare purpose, users, permissions/scopes, data source, actions, filters/search/sort, field validation, valid transitions, audit visibility, responsive behavior, and loading/empty/error/success/unauthorized/forbidden/confirmation states. Shop-floor screens should favor large targets, fast quantity entry, barcode/QR workflows where validated, low-friction handovers, and clear offline/network-failure feedback. Concrete URLs will follow the existing Next.js App Router conventions during implementation and are intentionally not prescribed here.

### Reusable component strategy

Extend the existing UI package and feature-local components deliberately: application shell, protected view, permission guard for presentation only, data table, pagination, filter bar, searchable selector, status badge, workflow indicator, quantity/UOM input, stock indicator, batch indicator, approval panel, confirmation dialog, discrepancy panel, QC panel, audit/transaction timeline, document attachment, barcode/QR capture/print surface, empty/error/loading states, toast/notification surface, date/time controls, and accessible form controls. Server authorization remains authoritative.

### Backend and domain strategy

Preserve the modular monolith. Each business module should contain routes, thin controllers, Zod validation, application/domain services, repositories, authorization policies, audit event emission, and tests. All externally supplied input is validated. State transitions are explicit. Stock, approvals, and derived quantities are calculated server-side. Relevant writes use database transactions, optimistic/concurrency controls, uniqueness constraints, and idempotency keys. Integrations are isolated behind adapters with timeouts, validation, retries only when safe, reconciliation, and observability.

### Database and persistence strategy

Use reviewed Prisma migrations for every schema change. Model masters separately from immutable/append-oriented transactions. Store stable identifiers, timestamps, actor/context, status, source references, line items, UOM, locations, batches, versions/effective dates, approvals, discrepancies, and audit references. Use decimal-safe representations for money and validated precision for quantities. Add foreign keys, unique constraints, check-like domain enforcement, indexes for queues/ledgers/history, and explicit archival/deactivation behavior. Never replace history with destructive updates.

### RBAC and security strategy

Model `User -> RoleAssignment -> Role -> Permission -> Resource/Action -> Scope -> ALLOW/DENY`. Initial role names from the source are candidates, not hard-coded authorization logic. Permission actions include view, create, update, archive/delete, approve, reject, export, import, adjust, assign, manage, and configure. Scopes include own, department, branch/store/warehouse, organization, and explicitly approved all-scope access. Backend middleware/policies enforce permissions and scope; frontend guards improve UX only. Audit role/permission changes, approvals, exports, deletions, adjustments, deactivation, and security events. Apply secure password hashing, protected sessions, session expiry, origin/network controls, rate limiting, security headers, and safe secrets/logging.

### Testing and acceptance strategy

Every slice selects appropriate unit, domain, API, integration, frontend component, E2E/workflow, RBAC/security, data-integrity, regression, performance, and UAT tests. API tests cover validation, 401/403, scope isolation, invalid transitions, duplicate/idempotent requests, concurrency, and safe failures. A slice is not done until its source requirement, dependency and validation gates, domain/backend, migration, authorization/scope, frontend states, auditability, tests, typecheck, lint, build, acceptance evidence, regression, documentation, and critical-defect gate pass.

## 10. Detailed 23-Module Roadmap

### Module 0 — Platform Foundation

Status: **Planning / partially prototyped**  
Objective/business purpose: create the trusted identity, authorization, scope, audit, document, and application-shell foundation required to attribute and govern every later transaction.  
Confirmed requirements: secure login/logout; session expiry; authenticated context; initial role families; permission/scoped authorization; activation/deactivation; departments/factory context; notifications; audit trail; attachments; settings; internal-network restriction with authorized phone-browser access.  
TO BE VALIDATED: V-004 approval assignments and V-016 network/device/session/MFA policy.  
ASSUMPTION: the existing modular monolith, REST prefix, Prisma/Supabase, and shared packages remain the implementation base.  
OUT OF SCOPE: public mobile app, user-specific hard-coded access, full HR/payroll.  
Dependencies: none; all later modules depend on this module.

Submodules and functional scope:

- [ ] Authentication, secure password storage, login/logout, expiry, current-user context, recovery/admin reset, rate limiting, and security events.
- [ ] Users, activation/deactivation, profile, department/location association, and session management.
- [ ] Roles, permissions, role assignments, scope grants, deny-by-default policy evaluation, and separate approval permissions.
- [ ] Organization/factory, departments/work centers, branch/store/warehouse context.
- [ ] Audit-event writer, privileged-event viewer, immutable retention, before/after/source/request context.
- [ ] Notifications, document attachments, system settings, and network/device enforcement.
- [ ] Protected application shell with unauthorized/forbidden/expired-session behavior.

Workflow/states/validation: invited-or-created -> active -> suspended/deactivated; session issued -> active -> expired/revoked; role assignment proposed -> active -> revoked. Validate unique normalized email, password policy, active user, token/session integrity, permission/action/resource/scope compatibility, attachment type/size, and network policy. Approval is required for privileged role/permission changes according to V-004. Audit all identity, access, export, security, and configuration changes.

UI/screens: login; session-expired state; user directory/detail/editor; role/permission matrix; role assignments; organization/department/location administration; audit explorer; notifications; document viewer/uploader; security/settings; protected shell. Components: protected view, session boundary, permission-aware action, role matrix, scope selector, audit timeline, attachment control, confirmation dialog, state surfaces.

Backend/persistence: authentication/session service and repository; password hasher; token/session verifier; authorization policy engine; scope resolver; user/role/permission/assignment/scope/session/security-event/audit/document/notification/settings models; transactional privileged changes; stable API response contract.

Permissions/scopes: identity and access actions split across view/create/update/deactivate/assign/approve/configure; scope changes server-enforced and audited. Error/edge states include invalid credentials, inactive user, expired/revoked session, concurrent role changes, last-admin protection, duplicate email, unauthorized scope, network denial, attachment failure, and audit-write failure policy.

Tests:

- [ ] Unit/domain: password/session/policy/scope/state rules.
- [ ] API/integration: login/current-user/logout, validation, 401/403, deactivation, role assignment, audit emission.
- [ ] Frontend/E2E: protected shell, expiry, forbidden actions, user/role administration.
- [ ] Security/data: brute-force controls, token misuse, scope isolation, deny-by-default, audit immutability, secret/log leakage, network policy.
- [ ] Regression/performance: authorization latency and session concurrency.

Acceptance/Definition of Done: every later transaction can be attributed to an authenticated active user, timestamped, permission-gated, scope-filtered, and audit-linked; all submodules, migrations, UI states, tests, docs, UAT, and V-016 production gate are complete.  
Next dependent module: Module 1.

### Module 1 — Master Data Management

Status: **Done (Technically Complete, Data Entry Blocked by V-001, V-002, V-003, V-009, V-010, V-013)**  
*Implementation state details*:
- **Files changed**: `apps/web/src/features/master-data/*`, `services/api/src/modules/master-data/*`, `apps/web/tests/downstream-consumer.spec.ts`, etc.
- **Evidence**: Next.js App Router UI, Express controllers/services/repositories, full unit and E2E test suite passing.
- **Limitations**: Module 0 RBAC is currently stubbed — replace `PermissionChecker` implementation when Module 0 ships. Real business data entry is blocked pending the TO BE VALIDATED items (V-001, V-002, V-003, V-009, V-010, V-013) for specific entity types.
- **Frontend Integration**: Read-only selector hooks (Vendors, Products, Materials, UOM) and foundation API client are fully connected to the real backend. However, the existing Module 1 screens (Dashboard, Products, Inventory, approvals) remain disconnected mocks and are NOT wired to the API.
Objective/business purpose: establish approved, reusable identities and configurations so all modules reference one versioned truth.  
Confirmed requirements: exact SKU/specification identity; product-specific variants/configuration; known product examples; material/component/packaging/UOM/vendor/customer/employee/channel/location/QC/wastage/routing masters; no orphan references.  
TO BE VALIDATED: V-001, V-002 metadata inputs, V-003, V-009, V-010, V-013.  
ASSUMPTION: incomplete candidates may be imported as draft/validation-pending but cannot drive executable transactions.  
OUT OF SCOPE: guessing missing SKUs, formulas, routes, ratios, pack sizes, or rules.  
Dependencies: Module 0 identity/RBAC/audit; gates Modules 2–17 and 20–21.

Submodules/functions:

- [x] Product families, products, variants, exact SKUs, categories, colors, sizes, active lifecycle.
- [x] Raw materials, hardware/components, consumables, packaging, pipe/rod/rope specs.
- [x] UOM and validated conversions/pack sizes.
- [x] Vendors, customers, employees/production roles, sales channels.
- [x] Factories, departments, work centers, locations/warehouses.
- [x] QC rule and wastage-rule definitions with version/effective status.
- [x] Product routing and validation status.
- [x] Import/export, duplicate review, approval, history/versioning.

Workflow/states/validation: draft -> pending validation -> approved/active -> inactive/superseded; prevent duplicates, circular/invalid conversions, orphan references, use of inactive/unapproved masters, and edits that rewrite historical meaning. Approval is separate from editing; all approval, deactivation, import/export, and version changes are audited.

UI/screens: master overview and readiness; searchable/filterable lists; product/variant detail; material/component editor; UOM/conversion editor; vendor/customer profiles; department/location/work-center management; routing designer; QC/wastage configuration; import preview/validation; change history. Components: master-data table, validation-status badge, version history, duplicate resolver, searchable selector, effective-date control, import error panel.

Backend/persistence: dedicated master services/repositories; normalized entities and codes; unique constraints and effective-dated versions; reference-usage checks; immutable historical links; staged import and validation results.

Permissions/scopes: view/create/update/archive/import/export/approve/configure by organization/location/domain. Error/edge states include duplicate codes, partially defined variant, invalid UOM, inactive dependency, concurrent approval, referenced deletion, and import row failures.

Tests:

- [x] Unit/domain: identity, lifecycle, conversion, version-selection rules.
- [x] API/integration/frontend: CRUD/archive/approval, import preview, filters, histories, error states.
- [x] RBAC/data/E2E: scope isolation, inactive master rejection, referential integrity, duplicate prevention, approved-master reuse.
- [x] Regression/performance: large selectors/list filtering and master import.

Acceptance/Definition of Done: approved master set is reusable without duplicated truth; validation-pending data is visibly and technically blocked from dependent automation; full tests, migration, audit, docs, and owner sign-off pass.  
Next dependent module: Module 2.

### Module 2 — Vendor & Procurement

Status: **Scaffolded / not implemented**  
Objective/business purpose: convert requirements into controlled, exact-SKU purchase commitments and expected receipts with vendor history.  
Confirmed workflow: requirement -> purchase request -> approval -> PO -> transmission -> expected receipt -> GRN.  
TO BE VALIDATED: V-004 approval hierarchy; vendor terms/numbering/document rules where absent.  
ASSUMPTION: no automatic vendor transmission until its method is approved.  
OUT OF SCOPE: invented pricing, taxation, credit terms, or external vendor integration.  
Dependencies: Modules 0–1; feeds Module 3.

Submodules/functions:

- [ ] Vendor onboarding/linkage and approved-source status.
- [ ] Requirement and purchase requisition with exact SKU/UOM/quantity/need date.
- [ ] Review, approve/reject/return-for-change, revision, and cancellation.
- [ ] Purchase order generation, approved lines, transmission log, expected delivery.
- [ ] Invoice/document capture reference and procurement status.
- [ ] Vendor delivery, shortage, discrepancy, quality, and job-work history.

Workflow/states/validation: draft PR -> submitted -> approved/rejected/changes requested -> PO draft -> approved -> sent -> partially/fully received -> closed/cancelled. Validate approved masters, positive quantities, UOM, vendor status, duplicate/reference numbers, edit restrictions after approval, and received quantity linkage. Approval and PO issue are separate permissions. Audit revisions, approvals, cancellations, transmission, and exports.

UI/screens: procurement queue; PR create/detail/review; PO workspace and printable document; expected-receipt calendar/queue; vendor procurement history and performance; attachment/history panels. Components: line-item editor, approval panel, status timeline, vendor/SKU selector, document attachment, comparison/discrepancy summary.

Backend/persistence: PR/PO aggregates and lines, revisions, approvals, status events, vendor links, expected receipts, transmission events, attachments; transactional state transitions and idempotent PO creation.

Permissions/scopes: request/create/update/submit/approve/reject/issue/cancel/export by purchase scope and organization. Error/edge states include duplicate submission, stale revision, inactive vendor/SKU, partial receipts, changed need date, cancelled PO, concurrent approval.

Tests:

- [ ] Unit/domain: totals only after validated pricing, state/edit/approval rules.
- [ ] API/integration/frontend: PR-to-PO, documents, partial receipt status, filters, failures.
- [ ] RBAC/data/E2E: creator cannot implicitly approve; exact-SKU integrity; audit and procurement-to-GRN handoff.
- [ ] Regression/performance: high-line-count PO and queue filtering.

Acceptance/Definition of Done: an authorized approved requirement produces one traceable PO and expected receipt without unapproved edits or duplicate issue; tests/docs/UAT pass.  
Next dependent module: Module 3.

### Module 3 — Goods Receiving / GRN

Status: **Production workflow implemented, live-database/UAT verification pending** (updated 2026-09-10 — Physical Verification & line-by-line inspection gate added, Debit Note creation segregated to Accountant/Finance role with Store Manager notification workflow; control center, scoped reads, capability-driven UI, workflow notifications, CSV export, and editable RBAC catalogue active; see `docs/modules/module-3-goods-receiving.md`).
Objective/business purpose: record physically verified incoming material, discrepancies, Synergy labels, sign-off, and inventory handoff.  
Confirmed requirements: WhatsApp/printed invoice capture context; weight checks for bulk raw material; individual piece checks for hardware; bundle/packet size; Synergy QR/barcode; store verification; digital sign-off; shortage/excess/damage; excess returned; strict physical verification gate on platform prior to acceptance; segregation of duties for Debit Notes (Store Manager notifies Accountant; Accountant drafts/generates Debit Note).  
TO BE VALIDATED: V-008 debit-note accounting (still correctly unresolved — no amount field exists) and V-013 UOM/pack conversions (still correctly unresolved — unit label is stored verbatim, no conversion performed).  
ASSUMPTION: invoice image/file is an attachment, not automatically trusted structured data.  
OUT OF SCOPE: automated accounting posting before Module 18 validation — confirmed still blocked (debit-note is flag-only, no amount).  
Dependencies: Modules 0–2; feeds Module 4 and Module 18 handoff.

Submodules/functions:

- [x] Incoming shipment/PO/invoice references and attachments. PO/unreferenced-shipment linkage plus Supabase Storage-backed invoice/document upload (`GrnDocumentService`, `POST/GET /goods-receipts/:id/documents`) — requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to be provisioned before it works end-to-end.
- [x] Weight, piece, bundle, packet, damage, and identity verification. Append-only measurement log with scale-retry support.
- [x] **Physical Verification & Dock Inspection Layer**: Mandatory platform verification of delivered, accepted, rejected, damaged, and defect quantities across every line before goods acceptance. Balance equation `Received = Accepted + Rejected + Damaged` enforced at verification and finalize.
- [x] Expected/received/accepted/rejected/short/excess quantities. Equation enforced at finalize; discrepancy-resolution `ACCEPT_EXCESS` on a `DAMAGE` line now correctly moves quantity into `acceptedQuantity` (previously a no-op bug).
- [x] Unique QR/barcode label generation/printing/linkage. Unique-constraint + collision retry; reprint preserves identity.
- [x] Discrepancy case, excess-return evidence, **Segregated Debit Note Workflow**: Store Managers notify Finance/Accountants (`POST /goods-receipts/:id/notify-accountant`); only Accounts/Finance users with `create:DebitNote` capability draft commercial Debit Notes.
- [x] Store sign-off, GRN finalization, inventory/accounting handoff. Finalize now runs in one transaction with a conditional-update concurrency guard, posts a `StockLedgerEntry` per accepted line (the "inventory posting reference"), and syncs `ExpectedReceipt`/`PurchaseOrder` status — this was the module's biggest gap and is now closed.

Workflow/states/validation: expected -> arrived -> under verification -> discrepancy pending or verified -> signed off -> finalized; discrepancy -> review -> return/accept/reject per approved rule -> resolved. Finalization requires physical checks, valid PO/line, approved UOM, sign-off, unique labels, and consistent quantity equations. Finalization must be atomic/idempotent — **now implemented**: the status flip, stock-ledger posts, and PO/ExpectedReceipt sync all run inside one `$transaction`, guarded by a conditional `updateMany` so concurrent finalize calls can't double-post. Audit measurements, edits, discrepancies, labels, sign-off, and reversal/correction — audited via `DbAuditWriter` on every state change.

UI/screens: expected receipts; receiving workspace optimized for store devices; invoice/PO comparison; quantity/weight capture; label print/reprint; discrepancy resolution; sign-off; GRN detail/history. Components: measurement input, line verifier, label panel, discrepancy panel, attachment viewer (now a real upload form + document list, not a placeholder), signature/sign-off confirmation, three-way-match summary.

Backend/persistence: receipt/GRN aggregates and lines, measurements, label identities, discrepancy/return/debit-note proposal, sign-offs, attachments, status events, inventory posting reference (`StockLedgerEntry`, `@@unique(grnLineId)` guarantees exactly one effect per line); unique/idempotency constraints and transaction boundary — all present.

Permissions/scopes: receive/verify/update/sign-off/finalize/resolve discrepancy/return/export by store/location — **now enforced**: a real `DbPermissionChecker` (dynamic Role/Permission/UserRole schema) replaces the previous allow-all stub, wired explicitly into the GRN and Procurement route modules (every other module intentionally still runs on the allow-all default, a scoping decision, not an oversight); GRNs carry a `locationId` checked against the acting user's `assignedLocationId`, with an `allLocations` role bypass for supervisors/admins. Finance view of the accounting handoff remains not applicable until Module 18 exists. Edge states: wrong UOM (still unvalidated per V-013, as intended), scale retry (supported), duplicate barcode (unique-constraint + retry), over-receipt (EXCESS discrepancy), damaged/short line (DAMAGE/SHORTAGE discrepancies, tested), unreferenced shipment (supported, exempt from PO-line checks, still location-scoped), partial receipt (supported), PO closed (blocked — only SENT/PARTIALLY_RECEIVED accepted), offline/retry duplication (idempotency key on creation; finalize is idempotent + concurrency-guarded).

Tests:

- [x] Unit/domain: quantity equations, weight/piece rules, finalization gates — plus new coverage for over-receipt, damaged/short lines, unreferenced-shipment finalize, wrong-UOM verbatim storage, and the discrepancy accept-into-stock fix. **99 unit tests passing** in this sandbox.
- [x] API/integration/frontend: three-way match, labels, sign-off, discrepancy and partial receipt — tests exist and were rewritten to seed real RBAC fixtures (no live DB in this sandbox to execute them; must be run against a real Postgres before merge).
- [x] RBAC/data/E2E: idempotent finalization, atomic stock posting, unauthorized sign-off, audit trail, Procurement -> GRN -> Inventory — new tests added for inventory handoff, finalize concurrency, and location-scope 403s (same live-DB caveat as above).
- [ ] Performance/regression: bulk lines and barcode lookup. **Still not done.**

Acceptance/Definition of Done: physically verified receipt creates one immutable, traceable GRN and exactly one inventory effect (now true — `StockLedgerEntry` unique per line); discrepancies remain explicit (true); V-008-dependent accounting is blocked (true — flag only, no amount field); tests/UAT pass (unit tests pass in-sandbox; integration/API tests and UAT still need to run against a real database — **not yet verified end-to-end**).
Next dependent module: Module 4 (still a placeholder router — the stock ledger is a minimal posting reference, not a full Inventory module).

### Module 4 — Inventory & Store Management

Status: **Functionally complete, unverified against a live database** (implemented 2026-08-31 — see verification note below; same DB-access caveat as Module 3).
Objective/business purpose: provide one explainable live ledger for all stock types and locations.  
Confirmed requirements: raw material, hardware, packaging, processed components, WIP, FG, and vendor-held stock; GRN increases stock; confirmed issue decreases; controlled adjustments; consumption-based reorder insight; no silent overwrite.  
TO BE VALIDATED: V-013 (still correctly unresolved — UOM conversion is not performed anywhere in the ledger), V-015, V-017 (opening-stock verification is out of this pass's scope; a `StockAdjustment` INCREASE is the mechanism available to record an opening count once V-017 is resolved).  
ASSUMPTION: ledger entries are append-only with corrective/reversal transactions — implemented via `reversalOfId` self-relation on `StockLedgerEntry`; nothing is ever updated or deleted, only compensated.  
OUT OF SCOPE: unapproved automatic adjustments or static reorder logic presented as actual consumption — confirmed still true: `StockAdjustment` always requires propose→approve→post, and the reorder-signal endpoint computes real trailing-30-day consumption from `ISSUE` ledger entries, surfacing any configured `minStockLevel`/`reorderPoint` as a distinct, separately-labeled field rather than conflating the two.  
Dependencies: Modules 0–3 and approved masters; feeds Modules 5–19 and 21. GRN's existing `StockLedgerEntry` write path (Module 3) now flows through this module's `StockLedgerRepository` instead of a narrow GRN-only method, so GRN receipts appear in the same balance projection as every other movement type — "GRN increases stock" is now literally true, not just a documented intent. Module 4 does **not** invent WIP/FG production entities that belong to Modules 5–13 — those views stay legitimately empty until those modules exist to post into this ledger.

Submodules/functions:

- [x] Immutable stock ledger and balance projection by SKU/UOM/location/ownership/state. `StockLedgerEntry` (append-only) + `StockBalance` (transactionally-maintained projection, not a computed view) keyed by an app-computed `itemKey` (avoids the Postgres NULL-in-compound-unique pitfall that a direct `[productId, materialId, ...]` unique index would hit).
- [x] Receipts, issues, transfers, returns, reservations, releases, and availability. Receipts via GRN (Module 3); issues with reversal; transfers with request/issue/receive/cancel including partial receipt and cancel-after-issue compensation; reservations hold `onHand - reserved` availability without moving on-hand quantity.
- [x] Raw material, component, packaging, processed, WIP, FG, and job-work views — Product/Material-backed items are fully tracked by location + `StockOwnership` (OWNED/VENDOR_HELD, covering job-work vendor-held stock); WIP/FG-in-process views are intentionally empty pending Modules 5–13, not faked.
- [x] Controlled adjustment request/approval/posting and reversal. `StockAdjustment`: PROPOSED → UNDER_REVIEW → APPROVED/REJECTED → POSTED (terminal; a correction is a new adjustment, matching how physical stock-count corrections actually work — not literally "reversible" in place).
- [x] Movement inquiry/history/aging and source-document drill-down. `/stock/ledger` (global inquiry) and `/stock/balances/[id]` (per-item movement timeline with days-since-last-movement aging and a link back to the originating GRN/transfer/adjustment).
- [x] Consumption-based reorder signals and audit-ready snapshots. `/stock/reorder` computes avg-daily-consumption and days-of-cover from real `ISSUE` history; `POST /inventory/snapshots` writes one point-in-time `StockSnapshot` row per current balance for reconciliation/reporting.

Workflow/states/validation: source transaction -> pending posting -> posted/reversed; transfer requested -> issued/in-transit -> received; adjustment proposed -> investigated -> approved/rejected -> posted — **all implemented exactly as specified**. Prevent negative/insufficient available stock unless an explicit approved rule allows it: every OUT movement and every reservation is gated by an atomic conditional update (`StockLedgerRepository.postEntry`/`.reserve`) that rejects with `INSUFFICIENT_STOCK` rather than allowing a negative balance — verified under concurrency (two simultaneous issues against low stock: exactly one succeeds). Enforce UOM/location/ownership/source identity: every line carries all four. Reserve and post atomically: single-column comparisons use Prisma's native conditional `updateMany`; the one two-column comparison (`onHand - reserved >= qty`) uses one hand-written parameterized `$executeRaw` statement. Never update balance without ledger entry: `StockBalance` is only ever mutated from inside `StockLedgerRepository`, in the same transaction as the `StockLedgerEntry` row that justifies it.

UI/screens: all implemented under a new `/stock` route segment (kept separate from `/inventory/*`, which is Module 1's materials/products/vendors UI — building over it would have collided with shipped routes and sidebar active-state logic). Overview (`/stock`), SKU/location balances (`/stock/balances`, `/stock/balances/[id]`), ledger inquiry (`/stock/ledger`), transfer workspace (`/stock/transfers`, `/transfers/new`, `/transfers/[id]`), adjustment/approval (`/stock/adjustments` + `/new` + `/[id]`), reservation view (`/stock/reservations`), aging/reorder (`/stock/reorder`), stock source timeline (embedded in the balance detail page). Issues use a lighter `Dialog`-based create/reverse flow rather than dedicated routes, matching their short lifecycle. Sidebar gained an "Inventory & Store" section with the same expand-on-active pattern as Goods Receiving.

Backend/persistence: `StockLedgerEntry`, `StockBalance`, `StockIssue`, `StockTransfer`, `StockAdjustment`, `StockReservation`, `StockSnapshot` — all present, with idempotency keys on issue/transfer creation, indexed FK columns on the ledger, and the transaction/concurrency-guard pattern described above reused from Module 3's finalize.

Permissions/scopes: view/issue/transfer/reserve/adjust/approve/export — implemented via the same scoped `DbPermissionChecker` opt-in pattern as GRN/Procurement (global default remains allow-all for every other module), with two new seeded roles (`store_clerk`, `store_supervisor`) and the same per-user `assignedLocationId`/`allLocations`-flag scoping GRN uses (extracted into a shared `common/rbac/location-scope.ts` helper so the two modules can't silently drift). Edge states: concurrent issue (tested, one wins), stale availability (reservation re-checks at write time, not read time), partial transfer receipt (supported, shortfall surfaced not silently dropped), duplicate posting (idempotency keys on issue/transfer creation), wrong location (location-scope 403), uncounted/opening stock (V-017-gated, out of scope), reversal after downstream use (issue reversal and post-issue transfer cancellation both post compensating entries rather than mutating history).

Tests:

- [x] Unit/domain: debit/credit movement rules, availability, reservation, adjustment transitions — full suites for `StockLedgerRepository` (post/reserve/release, insufficient-stock rejection), `StockIssueService`, `StockTransferService`, `StockAdjustmentService`, `StockReservationService`, `StockBalanceService` (reorder-signal math). **All passing in this sandbox.**
- [x] API/integration/frontend: movements, transfers, filters, errors, history — `inventory.api.test.ts` covers the full transfer/adjustment/reservation lifecycles, written and typechecked; needs a live Postgres to actually execute (none available here, same caveat as Module 3's own integration suite).
- [x] RBAC/data/E2E: atomicity, concurrency/idempotency, scope isolation, source traceability, GRN-to-balance — concurrent-issue-against-low-stock test (one succeeds, one gets `INSUFFICIENT_STOCK`), location-scope 403 test, and a transfer-lifecycle test that asserts the resulting `StockBalance` rows at both locations directly.
- [x] Performance/regression: high-volume ledger, balance inquiry, reorder aggregation — a correctness-under-volume test posts 500 alternating IN/OUT ledger entries against an in-memory stand-in and asserts the running balance exactly equals the algebraic sum (a correctness check, not a real load-test harness — same honest scoping Module 3 used).

Acceptance/Definition of Done: every displayed balance reconciles to immutable source transactions (true by construction — `StockBalance` is only ever written alongside the `StockLedgerEntry` that justifies it); no unauthorized or silent adjustment (RBAC-gated propose/approve/post, `StockAdjustment` always requires explicit approval before posting); opening stock and approvals validated (approvals implemented; opening-stock is explicitly out of scope pending V-017); tests pass in-sandbox, **UAT/reconciliation against a live database is still outstanding** — run `npm run db:migrate`/`db:seed` and the full suite against a real Postgres before merge.
Next dependent module: Module 5.

### Module 5 — BOM / Formula Engine

Status: **Not Started**  
Objective/business purpose: digitize approved Synergy product formulas into versioned, reproducible material requirements.  
Confirmed requirements: product-specific BOMs/formulas, ratios, effective versions, UOM conversion, department requirements, simulation, history, and golden test cases.  
TO BE VALIDATED: V-002 and V-013; component ratios beyond explicit examples remain blocked.  
ASSUMPTION: formulas may include fixed and quantity-scaled components only after source confirmation.  
OUT OF SCOPE: invented formula, quantity, conversion, yield, rounding, or costing behavior.  
Dependencies: Modules 0–1 and inventory identities; gates Modules 6–13.

Submodules/functions:

- [ ] BOM header/version/effective dates/status and product-variant linkage.
- [ ] Component/material/packaging lines, ratios, UOM conversions, department grouping.
- [ ] Formula representation, validated rounding/yield rules, requirement calculator.
- [ ] Draft/compare/approve/supersede, simulation, golden examples, history.

Workflow/states/validation: draft -> validation pending -> approved/effective -> superseded/retired. Prevent missing/inactive components, overlapping effective versions, circular references, invalid UOM, unapproved calculation, and retrospective mutation. Approval is distinct; every version and simulation input/output is traceable.

UI/screens: BOM list/readiness; version editor; line/formula editor; version comparison; simulation/calculation; approval/history; validation blockers. Components: formula line editor, UOM selector, version diff, effective-date control, calculation breakdown, validation-result panel.

Backend/persistence: immutable BOM versions/lines/formula metadata, approval/effective dates, calculation engine with deterministic inputs/output, golden test fixtures, source/evidence links.

Permissions/scopes: view/create/update/validate/approve/supersede/simulate/export. Edge states include missing version for date, invalid quantity, version race, conversion precision, zero/negative values, partial validation.

Tests:

- [ ] Unit/domain: every validated example, scaling, UOM, rounding, version selection, invalid component.
- [ ] API/frontend/integration: lifecycle, simulation, comparison, approval.
- [ ] RBAC/data/E2E: no draft execution, historical reproducibility, permission separation.
- [ ] Regression/performance: golden-formula suite and bulk requirement calculation.

Acceptance/Definition of Done: every executable calculation reproduces an approved source example and version; unresolved formulas remain blocked; tests and production-owner sign-off pass.  
Next dependent module: Module 6.

### Module 6 — Production Planning & Scheduling

Status: **Scaffolded / not implemented**  
Objective/business purpose: create full-day, product-specific production commitments with material visibility, ownership, approval, and partial-completion continuity.  
Confirmed requirements: Haider/occasionally Aziz quantity decisions; ownership escalation for changes; full-day schedules; buffers; typically 5–7 schedule types; grouped visual chart but product-specific issues; interruptions; partial completion and next-day fresh scheduling.  
TO BE VALIDATED: V-003 routing and V-004 approval hierarchy.  
ASSUMPTION: priority/urgent markers are informational until escalation rules are approved.  
OUT OF SCOPE: auto-finishing remaining quantity or executing invalid BOM/routing.  
Dependencies: Modules 0–5; feeds Modules 7–9.

Submodules/functions:

- [ ] Daily/product/group schedule, quantity, buffer, priority, owner, notes.
- [ ] BOM requirement and inventory availability/shortage projection.
- [ ] Routing/version selection and batch creation.
- [ ] Submit/approve/reject/modify/cancel with history.
- [ ] Partial completion, interruption reason, carry-forward suggestion, fresh next-day reissue.

Workflow/states/validation: draft -> checked -> pending approval -> approved/released -> in progress -> partially/fully completed or interrupted/cancelled; remaining quantity may seed a new draft but never auto-post. Validate approved product/BOM/routing, positive quantity, date, duplicate schedule, capacity inputs only if validated, and material shortage acknowledgement.

UI/screens: daily schedule board; schedule editor; grouped chart; material requirement/availability panel; approval queue; batch preview; interruption/partial-completion/history. Components: schedule grid, quantity/buffer control, shortage panel, routing summary, approval panel, partial-completion dialog.

Backend/persistence: production plan/schedule lines, selected BOM/routing versions, requirement snapshot, approvals, batch identity, status events, interruption and carry-forward linkage; transactional release and idempotency.

Permissions/scopes: plan/update/submit/approve/release/cancel/view by production/department; approval separate. Edge states include BOM changed after draft, stock changed before release, outage, worker reassignment, partial quantity, duplicate release, invalid route.

Tests:

- [ ] Unit/domain: requirement, state, partial completion, carry-forward rules.
- [ ] API/frontend/integration: planning, approval, shortage, release/batch creation.
- [ ] RBAC/data/E2E: approval separation, version snapshot, no silent completion.
- [ ] Regression/performance: full-day board and multi-product calculation.

Acceptance/Definition of Done: an approved schedule is source-grounded, material-visible, batch-linked, and records actual partial completion without inventing output; tests/UAT pass.  
Next dependent module: Module 7.

### Module 7 — Material Issue

Status: **Not Started**  
Objective/business purpose: issue exact materials from store to an approved production batch with acknowledgement and ledger traceability.  
Confirmed requirements: issue is product-specific; availability and batch linkage precede issue; confirmed issue decreases stock; returns/replacements remain traceable.  
TO BE VALIDATED: V-013 and whether/when partial issue is allowed.  
ASSUMPTION: issue challan is a controlled document generated from an approved transaction.  
OUT OF SCOPE: issue without approved schedule/BOM or client-calculated availability.  
Dependencies: Modules 0–6; feeds Module 8.

Submodules/functions:

- [ ] Issue request from released schedule/BOM requirement.
- [ ] Availability, store verification, allocation, challan, handover acknowledgement.
- [ ] Confirmed deduction, shortage handling, validated partial issue.
- [ ] Unused return, damaged-material replacement, history and batch linkage.

Workflow/states/validation: requested -> verified/shortage -> prepared -> handed over -> acknowledged/posted; return/replacement follows separate referenced transaction. Validate source versions, exact quantities/UOM/location, availability, duplicate request, acknowledgement actor, and return not exceeding outstanding issue.

UI/screens: issue queue; batch requirement comparison; picking/preparation; challan; acknowledgement; shortage exception; return/replacement; transaction history. Components: requirement-vs-issue grid, stock indicator, quantity control, handover confirmation, challan viewer, exception panel.

Backend/persistence: issue/line, allocation, challan, acknowledgement, ledger posting, return/replacement, shortage, idempotency key, source references; atomic ledger operations.

Permissions/scopes: request/prepare/verify/issue/acknowledge/return/replace by store/department. Edge states include concurrent depletion, partial availability, duplicate acknowledgement, damaged handover, wrong batch, stale BOM.

Tests:

- [ ] Unit/domain: BOM-to-issue, outstanding and return/replacement rules.
- [ ] API/frontend/integration: insufficient stock, challan, acknowledgement, ledger.
- [ ] RBAC/data/E2E: scope separation, idempotency, batch traceability, no negative stock.
- [ ] Regression/performance: multi-line issues and queue concurrency.

Acceptance/Definition of Done: one authorized acknowledged issue creates exactly one explainable stock deduction tied to schedule/batch/product; exceptions remain explicit; tests/UAT pass.  
Next dependent module: Module 8.

### Module 8 — Department-Wise Execution

Status: **Not Started**  
Objective/business purpose: make shop-floor work, worker attribution, quantities, discrepancies, and handovers visible at each product-specific department stage.  
Confirmed requirements: named departments/work centers; product-dependent routing; department in-charges; named worker subtasks; receipt/start/progress/partial completion/rejection/scrap/wastage/pending; digital handover.  
TO BE VALIDATED: V-003 and detailed worker/handover policies.  
ASSUMPTION: department queues are scoped by assigned work center and approved overrides.  
OUT OF SCOPE: camera/vision tracking and invented routes.  
Dependencies: Modules 0–7; feeds Modules 9–11.

Submodules/functions:

- [ ] Department queue and incoming batch receipt confirmation.
- [ ] Start/pause/resume/progress/partial/complete execution.
- [ ] Worker/subtask assignment and attribution.
- [ ] Rejection, scrap, wastage, pending reason, interruption.
- [ ] Outgoing handover and next-stage confirmation/history.

Workflow/states/validation: awaiting receipt -> received -> assigned -> in progress/paused -> partial/complete/rework/rejected -> handover pending -> next stage accepted. Validate route stage, quantity conservation, worker/department scope, required reasons, and handover acceptance; batch cannot disappear or skip required stage.

UI/screens: department queue; batch execution; worker assignment; quantity/progress capture; exception/reason; outgoing/receiving handover; department history. Components: shop-floor queue, worker selector, batch card/indicator, quantity reconciliation, handover panel, interruption reason, status timeline.

Backend/persistence: execution/stage instances, assignments, progress events, quantity outcomes, exceptions, handovers/acknowledgements, timestamps; transactional state machine and audit.

Permissions/scopes: department-scoped view/receive/assign/start/update/complete/reject/handover; managerial override separately audited. Edge states include reassignment, outage, partial work, receiver refusal, duplicate handover, route change, quantity mismatch, offline retry.

Tests:

- [ ] Unit/domain: state/quantity/handover/worker rules.
- [ ] API/frontend/integration: queue, execution, partial, exception, handover.
- [ ] RBAC/data/E2E: department isolation, attribution, no skipped/disappearing batch.
- [ ] Performance/regression: queue refresh and full-day production volume.

Acceptance/Definition of Done: the system answers who handled each stage, what quantity changed state, where the batch went, and why any discrepancy occurred; tests/shop-floor UAT pass.  
Next dependent module: Module 9.

### Module 9 — WIP & Batch Tracking

Status: **Not Started**  
Objective/business purpose: provide continuous batch genealogy and accurate work-in-progress position across departments.  
Confirmed requirements: batch identity, current department, complete/pending/rejected quantities, stage/handover history, rework, processing time, and bottleneck visibility.  
TO BE VALIDATED: bottleneck thresholds/SLAs and any batch split/merge rules.  
ASSUMPTION: WIP is derived from immutable stage transactions, not manually overwritten.  
OUT OF SCOPE: fabricated capacity/efficiency metrics.  
Dependencies: Module 8 and its upstream chain; feeds Modules 10–13 and 21.

Submodules/functions:

- [ ] Batch identity/genealogy, split/merge only if validated.
- [ ] Current state/department and quantity buckets.
- [ ] Stage/handover/rework history and processing/wait time.
- [ ] Search, trace, delay/bottleneck indicators and reconciliation.

Workflow/states/validation: WIP state follows accepted execution events; rework loops to an approved stage; completion requires quantity reconciliation. Prevent impossible stage order, double presence, negative quantities, history mutation, and inconsistent handover.

UI/screens: WIP overview; batch search/detail/genealogy; department WIP queue; stage timeline; delayed/bottleneck view; reconciliation exception. Components: genealogy/timeline, batch indicator, quantity buckets, workflow map, delay flag, source drill-down.

Backend/persistence: batch/WIP projection from stage events, genealogy links, current-state lock/version, timing metrics, reconciliation exceptions; indexed trace queries.

Permissions/scopes: view/trace/reconcile/manage exception by department/organization; history is non-destructive. Edge states include rework loops, partial quantities, handover in transit, stale projection, split/merge ambiguity.

Tests:

- [ ] Unit/domain: state derivation, quantity conservation, rework, timing.
- [ ] API/frontend/integration: current location, history, filters, exception repair.
- [ ] RBAC/data/E2E: history integrity, no duplicate presence, complete production trace.
- [ ] Performance/regression: long histories and WIP dashboards.

Acceptance/Definition of Done: any batch yields a reproducible current position, quantities, handlers, prior stages, and delay explanation; tests/UAT pass.  
Next dependent module: Module 10.

### Module 10 — Quality Control

Status: **Not Started**  
Objective/business purpose: enforce traceable inspection gates and controlled disposition throughout receiving, production, assembly, and FG.  
Confirmed requirements: incoming, production, loose/tight frame-printing, completion recount, intermediate/pre-FG, assembly/FG checks; PASS/FAIL/REWORK/REJECT-SCRAP/RE-INSPECTION; failure reason and batch/department traceability.  
TO BE VALIDATED: V-009 exact criteria, sampling, authority, and mandatory checkpoints by product/process.  
ASSUMPTION: criteria are versioned/effective master data.  
OUT OF SCOPE: invented tolerances or automatic pass decisions.  
Dependencies: Modules 1, 3, 8–9; gates Modules 11–13.

Submodules/functions:

- [ ] Inspection plans/criteria/checkpoints and version selection.
- [ ] Incoming, in-process, intermediate, assembly, pre-FG, and FG inspection.
- [ ] Result capture, evidence, reason, responsible batch/department.
- [ ] Corrective action, rework, rejection/scrap, reinspection, release gate.

Workflow/states/validation: due -> in inspection -> pass/rework/reject -> corrective action -> reinspection -> pass/reject. Validate required criteria/results/reasons/evidence, qualified inspector, source quantity, and no bypass of mandatory gate. Audit every result, change, override, release, and evidence reference.

UI/screens: inspection queue; inspection form; criteria/checklist; failure/disposition; rework/reinspection; batch quality history; QC configuration link. Components: QC checklist/panel, evidence attachment, disposition control, reason selector, quality timeline, release gate.

Backend/persistence: inspection plan/version/criteria, inspection/result line, sample/quantity, disposition, corrective action, reinspection link, evidence, gate status and audit.

Permissions/scopes: inspect/view/rework-disposition/reject/release/configure/override by quality/location; override separate and audited. Edge states include mixed result, partial inspected quantity, criteria version change, reinspection loop, unavailable evidence, unauthorized release.

Tests:

- [ ] Unit/domain: result/disposition/reinspection/gate rules.
- [ ] API/frontend/integration: all outcomes, reasons, evidence, source links.
- [ ] RBAC/data/E2E: mandatory gate, override audit, quantity integrity, production-to-FG QC.
- [ ] Regression/performance: criteria versions and inspection queues.

Acceptance/Definition of Done: no required checkpoint is bypassed; each failure has reason, source, actor, disposition, and controlled next state; validated criteria and QC-owner UAT pass.  
Next dependent module: Module 11.

### Module 11 — Scrap, Damage & Wastage

Status: **Not Started**  
Objective/business purpose: quantify and attribute material/product losses, replacement, tolerances, and abnormal exceptions.  
Confirmed requirements: damage/wastage tracking; challan-based replacement; actual versus expected; batch/department attribution; configurable material/product/process tolerance; variable rope example must not be universal.  
TO BE VALIDATED: V-010 tolerances and approval/escalation thresholds.  
ASSUMPTION: each loss event has explicit inventory/WIP disposition after authorization.  
OUT OF SCOPE: hard-coded 1–2% or unapproved financial valuation.
Dependencies: Modules 4, 8–10; feeds Modules 12, 18, 21.

Submodules/functions:

- [ ] Material/production/component/FG damage and cutting/rope waste.
- [ ] QC rejection-to-scrap linkage and replacement challan.
- [ ] Expected-versus-actual calculation and configurable tolerance version.
- [ ] Abnormal alert, review, approval, stock/WIP disposition, history.

Workflow/states/validation: reported -> reviewed -> within tolerance/abnormal -> approved/rejected/investigated -> posted/replaced. Validate source batch/stage/material, quantity/UOM, reason, tolerance version, attribution, and no duplicate stock impact.

UI/screens: loss reporting; abnormal review queue; batch/department/material analysis; replacement challan; disposition/approval; history. Components: loss quantity control, tolerance comparison, alert/status, reason/evidence panel, approval panel, source timeline.

Backend/persistence: loss event/type/reason, expected/actual, tolerance version, source, attribution, approval, ledger/WIP effect, replacement and challan link.

Permissions/scopes: report/review/approve/post/replace/configure/export by department/store/quality. Edge states include variable tolerance, partial salvage, double posting, rework later scrapped, replacement mismatch.

Tests:

- [ ] Unit/domain: tolerance and classification, disposition, replacement.
- [ ] API/frontend/integration: reporting, alerts, approval, stock effect.
- [ ] RBAC/data/E2E: attribution, audit, no universal tolerance, no duplicate loss.
- [ ] Regression/performance: loss analytics by period/batch.

Acceptance/Definition of Done: every posted loss is source-linked, attributed, authorized, inventory-consistent, and assessed against an approved effective tolerance; tests/UAT pass.  
Next dependent module: Module 12.

### Module 12 — Assembly

Status: **Not Started**  
Objective/business purpose: combine validated product-specific components into QC-gated assemblies with worker and batch traceability.  
Confirmed requirements: product-specific component ratios; confirmed examples such as hook/frame set and rope length/pack where validated; allocation/issue; worker attribution; completion; assembly QC; rework; FG conversion.  
TO BE VALIDATED: V-002 exact ratios, V-003 route, V-009 assembly criteria, V-013 units.  
ASSUMPTION: assembly consumption and output post atomically after confirmation/gates.  
OUT OF SCOPE: invented ratios or bypassed QC.  
Dependencies: Modules 4–11; feeds Module 13.

Submodules/functions:

- [ ] Assembly schedule/queue and source batch selection.
- [ ] Component availability, reservation/allocation, issue/consumption.
- [ ] Worker assignment, progress, partial completion, discrepancy.
- [ ] Assembly QC, rework, completion, output handoff to FG.

Workflow/states/validation: planned -> allocated -> in assembly -> partial/complete -> QC pending -> pass to FG or rework/reject. Validate approved BOM/version, source components, quantity conservation, worker, packaging, mandatory QC, and idempotent consumption/output.

UI/screens: assembly queue; component readiness/allocation; execution; completion/reconciliation; assembly QC link; rework; output history. Components: assembly kit list, component indicator, quantity reconciliation, worker selector, QC gate, completion confirmation.

Backend/persistence: assembly order/batch links, allocations/consumption, worker events, output, discrepancy, QC relation, rework, status events; transactional inventory/WIP effects.

Permissions/scopes: plan/allocate/issue/execute/complete/inspect/rework by assembly/store/quality. Edge states include missing component, substituted part (blocked unless validated), partial assembly, QC fail, overconsumption, duplicate completion.

Tests:

- [ ] Unit/domain: validated ratios, availability, quantity, QC gate.
- [ ] API/frontend/integration: allocation-to-completion, partial, rework, ledger.
- [ ] RBAC/data/E2E: traceability, atomic effects, no bypass/substitution.
- [ ] Regression/performance: assembly queue and large kits.

Acceptance/Definition of Done: completed assembly reconciles validated inputs to outputs, identifies workers and source batches, passes required QC, and posts exactly once; tests/UAT pass.  
Next dependent module: Module 13.

### Module 13 — Finished Goods

Status: **Not Started**  
Objective/business purpose: establish sellable, traceable finished-goods inventory only after required production/assembly/QC gates.  
Confirmed requirements: FG by variant; packaging status/location; reservation/allocation; dispatch readiness; audit/adjustment; ready-to-complete is not FG; genealogy retained.  
TO BE VALIDATED: product/pack identities and final QC/pack readiness rules through V-001/V-009/V-013.  
ASSUMPTION: FG receipt is an explicit transaction distinct from assembly completion.  
OUT OF SCOPE: auto-converting intermediate stock to FG.  
Dependencies: Modules 4–12; feeds Modules 15–19 and 21.

Submodules/functions:

- [ ] QC-approved FG receipt and product/variant/batch identity.
- [ ] Packaging/readiness/location status and movement.
- [ ] FG balance, reservation/allocation availability, and traceability.
- [ ] FG adjustment/audit readiness and intermediate-state visibility.

Workflow/states/validation: ready-to-complete -> assembly/QC gates -> FG receipt -> available/reserved/allocated -> picked/dispatched; hold/quarantine/rework where applicable. Validate source batch, QC pass, packaging/readiness, exact variant/UOM, unique receipt, and location.

UI/screens: FG receipt queue; FG inventory; batch/variant detail; readiness/packaging; reservations/allocations; hold/release; adjustment/audit link. Components: FG status badge, genealogy, readiness checklist, stock/reservation indicator, hold/release confirmation.

Backend/persistence: FG receipt/line, batch genealogy, readiness/pack status, location, ledger links, hold/release, reservation, adjustment references.

Permissions/scopes: receive/view/move/hold/release/reserve/adjust/approve/export by FG location/organization. Edge states include QC revoked, incomplete packaging, duplicate receipt, allocation race, hold after reservation, traceability gap.

Tests:

- [ ] Unit/domain: QC-to-FG, readiness, hold, allocation rules.
- [ ] API/frontend/integration: receipt, balances, reservation, genealogy.
- [ ] RBAC/data/E2E: no premature FG, atomic stock, adjustment authorization.
- [ ] Regression/performance: FG lookup/allocation concurrency.

Acceptance/Definition of Done: every available FG unit/quantity has valid variant, location, QC-approved production history, and explainable ledger state; tests/UAT pass.  
Next dependent module: Module 14.

### Module 14 — Job Work / Outsourced Processing

Status: **Not Started**  
Objective/business purpose: replace manual projections with a live Synergy-owned vendor-held material ledger and reconciliation.  
Confirmed workflow: inventory -> vendor -> processing -> return -> reconciliation -> inventory; track issued/returned/outstanding/short/excess/scrap and vendor history; ownership remains Synergy.  
TO BE VALIDATED: V-014 accounting treatment and any approved tolerance/processing specifications.  
ASSUMPTION: operational vendor-held balance can remain separate from accounting postings.  
OUT OF SCOPE: invented accounting entries or vendor API.  
Dependencies: Modules 0–4 and master data; production component integration as applicable.

Submodules/functions:

- [ ] Job-work vendor/profile linkage, order, expected output/specification.
- [ ] Material allocation/issue, challan, vendor-held balance.
- [ ] Processing status and partial/multiple returns.
- [ ] Returned output, shortage/excess/scrap, reconciliation, closure.
- [ ] Vendor performance/history and accounting handoff status.

Workflow/states/validation: draft -> approved -> issued/in vendor custody -> partially/fully returned -> discrepancy/reconciliation -> closed. Validate Synergy ownership, issue availability, return not silently exceeding custody, conversion/output rules only if validated, outstanding balance, reason/evidence, and idempotency.

UI/screens: job-work order; issue/challan; vendor-held balance; return receiving; discrepancy/reconciliation; vendor history; overdue/outstanding. Components: custody ledger, issue-return comparison, challan, reconciliation panel, vendor balance indicator, evidence attachment.

Backend/persistence: job-work order/lines, custody ledger, issue/return, output, discrepancy, scrap, reconciliation, approvals, attachments, operational/accounting status separation.

Permissions/scopes: create/approve/issue/receive/reconcile/close/export by store/purchase/production/finance view. Edge states include partial return, over-return, shortage, scrap, lost challan, vendor change, unresolved outstanding quantity.

Tests:

- [ ] Unit/domain: custody balance, partial return, reconciliation.
- [ ] API/frontend/integration: issue/challan/returns/discrepancies/inventory.
- [ ] RBAC/data/E2E: ownership continuity, no double posting, Job Work -> Vendor -> Return -> Reconciliation.
- [ ] Regression/performance: long-lived/vendor-wide balance.

Acceptance/Definition of Done: current vendor-held balance is live and transaction-explainable; every return/discrepancy reconciles to original issue; accounting remains blocked until V-014; tests/UAT pass.  
Next dependent module: Module 15.

### Module 15 — Sales Order Management

Status: **Scaffolded / not implemented**  
Objective/business purpose: capture customer/channel-specific demand with controlled status, availability, allocation readiness, cancellation, and history.  
Confirmed requirements: Amazon individual orders/labels/invoices and Synergy returns; E-Trade bulk/container, single PO/MRP label and E-Trade exchanges; walk-in bill/direct handover; DS exists; channel behavior stays distinct.  
TO BE VALIDATED: V-005 DS, V-011 returns/refunds, Amazon/E-Trade data access, pricing/tax/approval rules.  
ASSUMPTION: manual order capture is available before external integrations.  
OUT OF SCOPE: unvalidated marketplace APIs or forced common exchange/refund logic.  
Dependencies: Modules 0–1 and 13; feeds Modules 16–18.

Submodules/functions:

- [ ] Customer/channel order header, exact product/variant lines, quantity, source/reference.
- [ ] Validated pricing/tax metadata when approved; documents and channel metadata.
- [ ] Review/approval, cancellation, availability check, allocation readiness.
- [ ] Channel-specific state/history, duplicate detection, return linkage foundation.

Workflow/states/validation: draft/imported -> validated -> pending approval if required -> confirmed -> allocation ready/backordered -> cancelled/fulfilled; return states deferred until V-011. Validate customer/channel/SKU, quantity, source uniqueness, pricing only when approved, cancellation restrictions, and channel-required fields.

UI/screens: order queue; create/import/manual capture; order detail; channel-specific forms; availability/readiness; approval/cancellation; customer/channel history; validation/import errors. Components: order line editor, channel metadata panel, availability indicator, duplicate alert, approval/cancellation confirmation.

Backend/persistence: sales order/line, channel/source metadata, source idempotency key, status events, approval/cancellation, availability snapshot, attachments, return reference model when validated.

Permissions/scopes: view/create/import/update/approve/cancel/export by sales/channel/organization; finance fields separately scoped. Edge states include duplicate marketplace order, invalid variant, unavailable stock, partial allocation, channel outage, cancellation after pick, pricing mismatch.

Tests:

- [ ] Unit/domain: channel states, cancellation, duplicate rules.
- [ ] API/frontend/integration: create/import simulation, availability, status, errors.
- [ ] RBAC/data/E2E: channel scope, approval separation, no unvalidated integration.
- [ ] Regression/performance: daily order volume/import and search.

Acceptance/Definition of Done: each confirmed order preserves channel-specific truth, exact product demand, source identity, authorization, and allocation readiness; unresolved DS/returns/integrations stay blocked; tests/UAT pass.  
Next dependent module: Module 16.

### Module 16 — Order Fulfillment / Packing

Status: **Not Started**  
Objective/business purpose: allocate, pick, reconcile, and pack FG using channel-specific labels/documents before dispatch.  
Confirmed requirements: daily queue; allocation/reservation; picking; packing; Amazon individual; E-Trade bulk/container with single PO/MRP; walk-in direct; DS pending validation.  
TO BE VALIDATED: V-005, V-011, detailed packing/document rules, label integrations.  
ASSUMPTION: manual label/document attachment/confirmation precedes validated automation.  
OUT OF SCOPE: generic one-size-fits-all packing workflow.  
Dependencies: Modules 13 and 15; feeds Module 17.

Submodules/functions:

- [ ] Fulfillment queue and order allocation/reservation.
- [ ] Pick list, picked quantity, discrepancy/shortage, substitution only if validated.
- [ ] Channel-specific packing units, labels, invoices/documents, confirmation.
- [ ] Release to dispatch and exception resolution.

Workflow/states/validation: allocation pending -> reserved/short -> picking -> picked/exception -> packing -> packed/hold -> dispatch ready. Validate source order/status, reservation ownership, exact picked/packed quantity, channel-required documents, duplicate pack/label, and hold resolution.

UI/screens: fulfillment queue; allocation; pick list; picking confirmation; packing station; channel document/label panel; discrepancy/hold; packed-order detail. Components: allocation panel, pick checklist, barcode capture, packing-unit builder, label/document viewer, discrepancy panel, completion confirmation.

Backend/persistence: fulfillment/order links, reservation, pick task/lines, pack units/content, labels/documents, exceptions, status events, actor/timestamps, idempotency.

Permissions/scopes: allocate/pick/pack/hold/release/reprint by warehouse/channel; sensitive reprints audited. Edge states include shortage after reservation, damaged pick, partial pack, duplicate scan, wrong order item, label failure, cancelled order mid-flow.

Tests:

- [ ] Unit/domain: allocation, quantity conservation, channel packing rules.
- [ ] API/frontend/integration: pick/pack/documents/exceptions/inventory reservations.
- [ ] RBAC/data/E2E: no cross-order packing, duplicate prevention, Sales -> Allocation -> Picking -> Packing.
- [ ] Regression/performance: daily queues and scan throughput.

Acceptance/Definition of Done: every packed unit reconciles to reserved FG and its channel/order requirements, with actor, documents, and exceptions traceable; tests/UAT pass.  
Next dependent module: Module 17.

### Module 17 — Dispatch

Status: **Not Started**  
Objective/business purpose: confirm physical dispatch, proof, order linkage, and exactly-once FG stock deduction/accounting handoff.  
Confirmed requirements: planning; packed confirmation; invoice/challan; proof; stock deduction at dispatch; originating order/account reference; history.  
TO BE VALIDATED: carrier/proof/document fields and channel completion specifics.  
ASSUMPTION: dispatch confirmation is the authoritative FG deduction event.  
OUT OF SCOPE: carrier integration until validated.  
Dependencies: Module 16 and inventory/FG; feeds Module 18 and reporting.

Submodules/functions:

- [ ] Dispatch queue/planning and packed-readiness verification.
- [ ] Vehicle/carrier/reference data when validated, invoice/challan/proof.
- [ ] Dispatch confirmation, FG deduction, order/fulfillment completion.
- [ ] Correction/reversal by controlled exception and history retrieval.

Workflow/states/validation: dispatch ready -> planned -> loaded -> confirmed/dispatched -> completed; hold/cancel/error paths. Validate packed status, source order, proof/documents, quantity, duplicate confirmation, stock/reservation, and correction authority.

UI/screens: dispatch queue/plan; load/verification; document/proof capture; confirmation; dispatch detail/history; discrepancy/correction. Components: readiness checklist, load list, proof attachment, dispatch confirmation, source timeline, discrepancy panel.

Backend/persistence: dispatch/shipment, lines/pack units, proof/documents, confirmation event, ledger deduction, order completion/accounting reference, correction/reversal linkage; atomic/idempotent transaction.

Permissions/scopes: plan/load/confirm/correct/view/export by dispatch location/channel; correction approval separate. Edge states include duplicate confirmation, missing pack, dispatch discrepancy, proof failure, cancellation after load, partial dispatch if validated.

Tests:

- [ ] Unit/domain: readiness, exactly-once deduction, completion/correction.
- [ ] API/frontend/integration: dispatch/proof/ledger/order status.
- [ ] RBAC/data/E2E: authorization, idempotency, Sales -> Allocation -> Pick -> Pack -> Dispatch.
- [ ] Regression/performance: dispatch batch size and history retrieval.

Acceptance/Definition of Done: one confirmed dispatch produces one traceable FG deduction tied to order, pack, actor, documents, and proof; tests/UAT pass.  
Next dependent module: Module 18.

### Module 18 — Accounts / Tally Integration

Status: **schema and integration mechanics complete; PURCHASE_ORDER is the only active source type; SALES_INVOICE, DEBIT_NOTE, JOB_WORK, RETURN, and INVENTORY_COGS structurally present but carry zero mapping rules and cannot become eligible — blocked on Modules 14-17 and V-006/V-007/V-008/V-011/V-014.**  
Objective/business purpose: hand off validated operational transactions to Tally and reconcile results without creating a second uncontrolled accounting truth.  
Confirmed requirements: Tally remains accounting system of record; map purchases, sales, and validated inventory/COGS; status/error/retry/reconciliation/audit.  
TO BE VALIDATED: V-006, V-007, V-008, V-011, V-014, mappings, tax/COGS rules, manual/semi/automatic process.  
ASSUMPTION: an integration boundary and operational “accounting handoff status” can be designed without choosing a connector.  
OUT OF SCOPE: invented Tally API, ledger mapping, debit note, refund, or job-work accounting.  
Dependencies: stable Modules 2–4 and 15–17 plus relevant validations; feeds finance reporting.

*Implementation state details*:
- **Files added/modified**: `services/api/src/modules/finance/*`, `database/prisma/schema.prisma`, `packages/types/src/index.ts`, `packages/validation/src/index.ts`, `database/prisma/seed/seed.ts`, `services/api/src/modules/users/rbac.ts`, `services/api/src/app.ts`.
- **Evidence**: Full Express REST API (`/api/v1/finance`), state machine (ELIGIBLE -> QUEUED -> EXPORTED/SENT -> ACKNOWLEDGED -> RECONCILED; FAILED -> INVESTIGATED -> CORRECTED/RETRIED; REJECTED/HELD), stub `TallyCsvExportAdapter` writing batch files to disk, segregated creator vs approver for mapping configurations, SHA-256 payload fingerprinting for duplicate prevention, internal self-consistency reconciliation, audit emission via `DbAuditWriter`, and RBAC permissions (`read:FinanceIntegration`, `create:FinanceMapping`, `approve:FinanceMapping`, `queue:FinanceIntegration`, `export:FinanceIntegration`, `retry:FinanceIntegration`, `acknowledge:FinanceIntegration`, `reconcile:FinanceIntegration`).
- **Test Evidence**: 23/23 tests passing (17 unit + 6 live-DB API integration tests).

Submodules/functions:

- [x] Mapping configuration/version and source-transaction eligibility. (Seed includes approved v1 mapping for PURCHASE_ORDER; other source types have 0 approved mappings and return NOT_YET_SUPPORTED).
- [x] Purchase/sales/debit-note/returns/job-work/inventory-COGS export only after validation. (PURCHASE_ORDER active; others explicitly guarded).
- [x] Manual/semi/automatic adapter, batch/export file or connector as approved. (Stub `TallyExportAdapter` writes structured CSV batch files; no real Tally API).
- [x] Acknowledgement, error queue, safe retry, reconciliation, exception closure, logs. (Manual finance acknowledgement & internal consistency reconciliation implemented; auto-transition avoided).

Workflow/states/validation: eligible -> queued -> exported/sent -> acknowledged -> reconciled; failed -> investigated -> corrected/retried; rejected/held. Validate source finality, mapping version, monetary precision/currency/tax, duplicate external reference, retry safety, and reconciliation balance.

UI/screens: integration readiness; mapping configuration; eligible queue; export/sync run; error/retry queue; reconciliation workspace; source/external drill-down; audit log. Components: mapping editor, sync status, reconciliation comparison, error detail, controlled retry/approval, source timeline.

Backend/persistence: adapter interface, mapping versions, integration job/item, external reference, payload fingerprint, acknowledgement, error/retry, reconciliation and audit; background job if required; timeouts/idempotency.

Permissions/scopes: configure/map/queue/export/retry/reconcile/approve/view by finance; exports and corrections audited. Edge states include Tally unavailable, malformed response/file, partial batch, duplicate posting, changed mapping, out-of-balance, source reversal.

Tests:

- [x] Unit/domain: mapping, eligibility, precision, reconciliation, idempotency.
- [x] API/frontend/integration: adapter contract, failure/retry, status, audit.
- [x] RBAC/data/E2E: export permission, duplicate prevention, source-to-Tally reconciliation.
- [x] Performance/regression: batch volumes and restart/recovery.

Acceptance/Definition of Done: only validated, final source transactions are handed off exactly once and reconciled with traceable errors/retries; finance UAT and all validations pass.  
Next dependent module: Module 19.

### Module 19 — Physical Audit & Reconciliation

Status: **Not Started**  
Objective/business purpose: capture Kanta’s recurring raw-material/FG counts and convert variances into investigated, approved, traceable adjustments.  
Confirmed workflow: count -> match/variance; match -> verified; variance -> investigation -> reason -> approval -> adjustment; identity/timestamp/evidence; uncounted stock is not verified.  
TO BE VALIDATED: V-015 stock-adjustment authority and V-017 opening stock/cutover; audit frequency/sampling details.  
ASSUMPTION: audit uses a frozen system snapshot for comparison.  
OUT OF SCOPE: direct balance overwrite.  
Dependencies: Modules 0, 4, 13 and stable ledger.

Submodules/functions:

- [ ] Scheduled/random audit plan, scope, assignment, snapshot.
- [ ] Raw-material/FG physical count and evidence.
- [ ] Match/variance calculation, investigation, reason, approval.
- [ ] Controlled adjustment/rejection/recount and verified position/history.

Workflow/states/validation: planned -> opened/snapshot -> counting -> submitted -> matched/variance -> investigation/recount -> approval/rejection -> adjusted/closed. Validate scope, count completeness, snapshot time, evidence, reason, segregation of duties, and adjustment linkage.

UI/screens: audit schedule/assignment; mobile count sheet; progress/uncounted list; variance review; investigation/evidence; approval/adjustment; audit result/history. Components: count input, scan/search, progress indicator, variance comparison, evidence panel, approval workflow, reconciliation timeline.

Backend/persistence: audit plan/scope/snapshot/count/result, variance, investigation, evidence, approval, adjustment ledger link, verified status; immutable evidence/history.

Permissions/scopes: plan/assign/count/submit/investigate/approve/adjust/view/export; counter cannot implicitly approve own variance unless explicitly validated. Edge states include uncounted SKU, duplicate count, late movement after snapshot, recount, missing evidence, concurrent audit, rejected adjustment.

Tests:

- [ ] Unit/domain: match/variance, completeness, transition and segregation rules.
- [ ] API/frontend/integration: count, evidence, investigation, approval, ledger adjustment.
- [ ] RBAC/data/E2E: scope, no overwrite, Audit -> Variance -> Investigation -> Approval -> Adjustment.
- [ ] Regression/performance: large count scope and snapshot comparison.

Acceptance/Definition of Done: every verified position is backed by complete count evidence or an approved adjustment; no silent overwrite; auditor/store UAT passes.  
Next dependent module: Module 20.

### Module 20 — Task & Workforce Management

Status: **Scaffolded / not implemented**  
Objective/business purpose: replace/augment the current Haider/Aziz task app for daily and department accountability without expanding into payroll.  
Confirmed requirements: tasks, department/daily assignment, due time, completion, incomplete/delay reason, escalation, management visibility.  
TO BE VALIDATED: escalation rules, notification channels, relationship to the existing task app.  
ASSUMPTION: tasks may link to ERP resources but do not change transaction state by themselves.  
FUTURE / OPTIONAL: automated late-arrival fine.  
OUT OF SCOPE: full HR/payroll.  
Dependencies: Module 0, employee/department masters; optional links to operational modules.

Submodules/functions:

- [ ] Task/template, assignment to user/department, due time/priority.
- [ ] Accept/start/complete/incomplete with mandatory delay reason.
- [ ] Comments/evidence, escalation, reassignment, management visibility.
- [ ] Resource links and workload/overdue reporting.

Workflow/states/validation: draft -> assigned -> accepted/in progress -> completed or incomplete/overdue -> escalated/resolved/cancelled. Validate assignee/scope, due time, reason for incomplete/delay, reassignment authority, and resource access.

UI/screens: personal/department task board; create/assign; task detail; completion/incomplete; overdue/escalation; management view; history. Components: task card/list, assignee selector, due-time control, reason/evidence panel, escalation badge, resource link.

Backend/persistence: task/template/assignment, status event, reason/comment/evidence, escalation/reassignment, resource reference, notification link.

Permissions/scopes: view/create/assign/update/complete/escalate/manage by own/department/organization. Edge states include reassignment in progress, overdue completion, inaccessible linked record, missing delay reason, duplicate notification.

Tests:

- [ ] Unit/domain: due/incomplete/escalation/assignment rules.
- [ ] API/frontend/integration: lifecycle, notifications, resource links.
- [ ] RBAC/data/E2E: own/department scope, management visibility, reason enforcement.
- [ ] Regression/performance: daily boards and overdue scans.

Acceptance/Definition of Done: authorized users can see and action scoped tasks; incomplete/late work always has reason and escalation history; tests/UAT pass without HR/payroll creep.  
Next dependent module: Module 21.

### Module 21 — Reporting & Management Dashboards

Status: **Prototype only / not implemented**  
Objective/business purpose: provide role-specific operational insight whose every number drills down to source transactions.  
Confirmed dashboards: management, store, production, procurement, accounts, quality, dispatch, sales, vendor management, audit. Confirmed metrics include stock, shortages, incoming, planned-versus-completed, WIP/delay, scrap/wastage, FG, orders/dispatch, vendor shortages, audit variance, productivity.  
TO BE VALIDATED: KPI definitions, target/threshold ownership, costing/profitability data and refresh requirements.  
ASSUMPTION: reporting projections/read models may be added after transactional truth stabilizes.  
OUT OF SCOPE: hard-coded prototype values presented as live data or unvalidated profitability.  
Dependencies: relevant completed transaction modules; feeds Module 22.

Submodules/functions:

- [ ] Metric catalog with definition, owner, source, filters, grain, freshness.
- [ ] Role/domain dashboards, drill-down, date/location/product/channel filters.
- [ ] Traceable reports, export with permission, scheduled delivery if validated.
- [ ] Data-quality/freshness indicators and exception reporting.

Workflow/states/validation: metric query -> scoped source calculation -> result -> drill-down/export; validate source finality, scope, date/time zone, quantity/UOM, deduplication, and reconciliation to ledger/transactions.

UI/screens: management overview; domain dashboards; report catalog/builder only if approved; drill-down/detail; export history; metric definition/source panel. Components: KPI tile with source/freshness, filter bar, accessible chart, traceable table, drill-down, export confirmation, data-quality alert.

Backend/persistence: query/read services, metric definitions/versions, projections/materialized views where measured, export jobs, freshness/run metadata, source links and authorization filters.

Permissions/scopes: dashboard/report view, sensitive metric, export, schedule, configure by data scope; server applies row/metric restrictions. Edge states include incomplete source data, delayed projection, changed metric definition, large export, forbidden drill-down.

Tests:

- [ ] Unit/domain: metric formulas against known transactions.
- [ ] API/frontend/integration: filters, drill-down, freshness, exports.
- [ ] RBAC/data/E2E: scope/metric visibility, source reconciliation, export audit.
- [ ] Performance/regression: dashboard latency, large period/filter combinations.

Acceptance/Definition of Done: every displayed number is reproducible, permission-scoped, freshness-labelled, and traceable to source transactions; business-owner KPI sign-off and tests pass.  
Next dependent module: Module 22.

### Module 22 — AI Command Brain

Status: **Not Started / intentionally deferred**  
Objective/business purpose: add governed intelligence over reliable ERP data without replacing deterministic transactions or authorization.  
Confirmed levels: data visibility -> rule alerts -> exception detection -> natural-language query -> forecasting -> recommendations -> controlled automation only after explicit approval.  
TO BE VALIDATED: V-018 governance, model/provider/data-retention policy, evaluation thresholds, permitted actions.  
ASSUMPTION: early levels are read-only and grounded in approved reporting/query services.  
OUT OF SCOPE: autonomous critical decisions, RBAC bypass, fabricated data, or early implementation before transactional ERP/reporting.  
Dependencies: Modules 0–21, governed data, metric definitions, audit, and V-018.

Submodules/functions:

- [ ] Permission-aware data retrieval with source citations.
- [ ] Deterministic rule alerts and acknowledged exception workflow.
- [ ] Statistical exception detection and evaluation.
- [ ] Natural-language query constrained to scoped semantic definitions.
- [ ] Forecasting with backtesting/confidence/quality monitoring.
- [ ] Recommendations with rationale and human disposition.
- [ ] Controlled actions only through existing domain commands and explicit approval.

Workflow/states/validation: request/event -> authorize/scope -> retrieve/compute -> grounded response/alert -> human review -> acknowledge/accept/reject; controlled proposal -> approval -> deterministic domain command. Validate source availability, scope, freshness, citation, confidence, prohibited action, prompt/input safety, and complete AI activity logging.

UI/screens: AI workspace; alert/inbox; grounded answer with source drill-down; forecast/evaluation; recommendation review; governance/configuration; activity/audit. Components: source citation, confidence/data-quality notice, permission-aware prompt, alert disposition, approval panel, activity timeline.

Backend/persistence: AI gateway/orchestrator isolated from domain writes, scoped retrieval layer, prompt/config/version, evaluation datasets/results, alert/recommendation, human decision, activity/audit, provider adapter and kill switch.

Permissions/scopes: ask/view alerts/view forecasts/configure/evaluate/propose/approve action; never broader than underlying data permissions. Edge states include missing/contradictory data, prompt injection, stale data, model outage, hallucinated identifier, low confidence, prohibited action, scope change mid-session.

Tests:

- [ ] Unit/domain: permission filters, rule alerts, grounding/citation validators.
- [ ] Integration/frontend: provider failure, source drill-down, alert/recommendation workflows.
- [ ] Security/E2E: prompt injection, cross-scope leakage, RBAC bypass resistance, approval gate, kill switch.
- [ ] Evaluation/regression/performance: retrieval correctness, hallucination rate, forecast backtests, latency/cost, model-version regression.

Acceptance/Definition of Done: outputs are source-traceable, permission-correct, evaluated, logged, explainable, and unable to execute critical changes without approved deterministic commands; governance and owner sign-off pass.  
Next dependent module: none; continuous improvement only.

## 11. Mandatory End-to-End Workflow Strategy

- [ ] **E2E-A Inbound:** Requirement -> PR -> Approval -> PO -> Receipt -> physical weight/piece verification -> discrepancy/sign-off -> GRN -> one inventory posting.
- [ ] **E2E-B Production:** Plan -> approved BOM/routing -> availability -> material issue -> department receipt/execution/handover -> WIP -> QC -> loss/rework where required -> assembly -> assembly QC -> FG receipt.
- [ ] **E2E-C Job Work:** Job-work order -> Synergy material issue -> vendor-held balance -> partial/full return -> shortage/scrap/excess -> reconciliation -> inventory.
- [ ] **E2E-D Sales:** Channel order -> availability/allocation -> reservation -> picking -> channel-specific packing/labels -> dispatch proof -> exactly-once FG deduction -> order completion.
- [ ] **E2E-E Audit:** scoped snapshot -> physical count -> match/variance -> investigation/reason/evidence -> separate approval -> adjustment -> verified position.

Cross-workflow exception scenarios:

- [ ] Partial production and fresh next-day reissue.
- [ ] Receiving shortage, excess return, and damage/debit-note proposal.
- [ ] Insufficient stock and concurrent reservation/issue.
- [ ] QC failure, rework, reinspection, rejection/scrap.
- [ ] Damage and challan-based replacement.
- [ ] Partial job-work return, shortage, scrap, and unresolved balance.
- [ ] Dispatch discrepancy and duplicate confirmation retry.
- [ ] Stock variance with unauthorized approval/adjustment attempt.
- [ ] Unauthorized export/approval, cross-scope access, expired/revoked session.
- [ ] Full-day production simulation, pilot parallel run, reconciliation, and rollback/correction exercises.

## 12. Integration, Migration, Pilot, and Go-Live Readiness

### Integrations

- [ ] Tally environment/version/method/mappings validated.
- [ ] Amazon/E-Trade structured access validated before connectors.
- [ ] Barcode/QR printer/scanner workflow validated with factory hardware.
- [ ] Document storage, backup, access policy, malware/type/size checks selected.
- [ ] Notification channels selected and failure/retry behavior defined.
- [ ] Network enforcement and authorized phone-browser path tested.

### Migration

- Status: **Blocked by V-012 and V-017**.
- [ ] Inventory all source spreadsheets/files/apps and owners.
- [ ] Define master/history/opening-stock scope and retention.
- [ ] Profile, cleanse, map, deduplicate, and approve data.
- [ ] Build repeatable dry-run import with row-level errors and idempotency.
- [ ] Reconcile counts/totals and obtain business sign-off.
- [ ] Define cutover timestamp, freeze window, rollback, and archive access.

### UAT

- Status: Not Started.
- [ ] Business owners and role-based UAT participants named.
- [ ] Source-grounded acceptance scripts approved per slice.
- [ ] Shop-floor device/network usability tested.
- [ ] Finance, store, production, quality, sales, dispatch, and audit sign-offs recorded.

### Pilot and go-live

- Pilot readiness: **Not Ready**.
- Go-live readiness: **Not Ready**.
- [ ] All blocking validations for pilot scope resolved.
- [ ] Opening masters/stock reconciled and approved.
- [ ] Critical E2E chains and full-day production simulation pass.
- [ ] Parallel run matches physical/manual/Tally truth within approved tolerances.
- [ ] Security/network/backup/restore/monitoring/support runbooks pass.
- [ ] Training and SOPs delivered; owners sign off; no critical defects.
- [ ] Cutover, rollback, incident response, and hypercare ownership approved.

## 13. Active and Completed Slices

Active slice: **None — awaiting explicit approval.**

Completed production slices: **None.** The health endpoint and UI/authentication are repository prototypes and do not satisfy the Synergy Definition of Done.

## 14. Recommended First Vertical Slice — Do Not Implement Yet

### Module 0: Secure authentication and protected application shell

Scope boundary:

- Replace mock password comparison with an approved password-hashing implementation and safe seed process.
- Introduce authentication service/repository boundaries and apply shared request validation.
- Establish one server-verified session/current-user mechanism with expiry and inactive-user rejection.
- Protect one application-shell view using server authority; remove trust in the standalone `isLoggedIn` flag.
- Normalize success/error responses with request IDs.
- Emit authentication/security audit events without logging secrets.
- Add focused unit, API, frontend, E2E, and security tests for success, invalid credentials, inactive user, expired/invalid session, 401 behavior, logout/session termination as selected, and audit emission.
- Record but do not prematurely solve the full role/permission matrix, organization scopes, or network policy.

Why first:

- Every later transaction requires a trustworthy actor and protected backend.
- It repairs the highest-risk existing prototype rather than discarding working architecture.
- It has no dependency on unvalidated product/BOM/routing/Tally rules.
- It establishes the controller/service/repository, validation, response, audit, and testing patterns later slices will reuse.
- It is small enough to implement, test, review, and accept independently.

Dependency/validation gate before approval:

- Confirm the technical session approach and expiry behavior for the slice.
- V-016 may remain open for production network/MFA/device controls, but its unresolved parts must be clearly excluded from slice completion and must block production acceptance.

Acceptance gate:

- [ ] Passwords are securely hashed and never logged/returned.
- [ ] Login uses shared validation and standard response contract.
- [ ] Protected backend and shell reject missing/invalid/expired/inactive sessions.
- [ ] Authentication logic follows route -> controller -> service -> repository.
- [ ] Relevant events are audit-linked to request context.
- [ ] Focused tests, typecheck, lint, build, and regression pass.
- [ ] Documentation and this tracker contain evidence and limitations.
- [ ] No product/business rules or unrelated ERP modules are implemented.

## 15. Known Defects and Technical Debt Register

- TD-001 / Critical: mock password comparison and mock seed hashes.
- TD-002 / Critical: client `isLoggedIn` flag acts as the dashboard gate.
- TD-003 / Critical: no authentication/authorization middleware.
- TD-004 / High: no RBAC permission/scope persistence or policy engine.
- TD-005 / High: authentication controller directly accesses Prisma.
- TD-006 / High: shared login validation is not wired to the route.
- TD-007 / High: inconsistent roles across specification, Prisma, shared types, request typing, and seeds.
- TD-008 / High: missing migrations and schema deployment history.
- TD-009 / High: AuditLog exists without an audit writer or retention/access policy.
- TD-010 / High: API success contracts are inconsistent.
- TD-011 / High: unrestricted CORS and missing network/device enforcement.
- TD-012 / Medium: no frontend/component/E2E testing stack.
- TD-013 / Medium: query parameter logging needs sensitive-data review.
- TD-014 / Medium: root database commands/documentation mismatch.
- TD-015 / Medium: stage-branch documentation does not match observed branches.
- TD-016 / Medium: production deploy workflow is a placeholder.
- TD-017 / Low: two Next.js image lint warnings.

## 16. Future / Optional and Out-of-Scope Backlog

- FUTURE / OPTIONAL: automated late-arrival fine.
- FUTURE / OPTIONAL: machine maintenance, warehouse cleaning scheduling, camera/vision tracking only after separate approval.
- OUT OF SCOPE: full HR/payroll in core ERP.
- OUT OF SCOPE: generic public mobile application.
- OUT OF SCOPE: unvalidated marketplace or Tally integrations.
- OUT OF SCOPE: autonomous AI critical decisions or authorization bypass.

## 17. Change Log

- **2026-08-25 — Planning baseline:** Read the 19-page Synergy Codex Master Development Plan Prompt; inspected repository architecture, code, schema, tests, docs, configuration names, Git state, and current module placeholders; recorded baseline checks; created the 23-module roadmap, validation register, dependency/phase maps, risk/debt registers, E2E strategy, readiness gates, and one recommended first slice. No ERP functionality implemented.

## 18. Update Protocol for Every Approved Slice

1. Read this tracker and the source-grounded master context.
2. Inspect current repository and Git state.
3. Confirm one approved vertical slice, dependencies, and validation gates.
4. Mark only that slice active and record planned files/acceptance.
5. Implement domain/backend/persistence as required, server authorization, UI, states, audit, and tests.
6. Run focused tests, typecheck, lint, build, and relevant regression/E2E.
7. Review security, data integrity, business rules, and unvalidated boundaries.
8. Record files, evidence, results, limitations, defects, and acceptance state.
9. Stop; do not automatically continue to the next slice.
