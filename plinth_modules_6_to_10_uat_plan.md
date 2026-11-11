# Plinth Modules 6–10 — End-to-End UAT Plan

This plan tests the dependency chain:

**Module 6 Production Plan → Module 7 Material Issue → Module 8 Department Execution → Module 9 WIP/Batch Tracking → Module 10 Quality Control**

## 0. Important baseline gate

Do not begin business UAT until these pass:

```bash
npm run db:generate
npm run typecheck
npm run build
```

The current repository audit found that the generated Prisma client is out of sync with the QC schema and that the web production build fails. Fix those first, or record every QC result as “environment blocked,” not “business failure.”

## 1. Start a clean local environment

Use a disposable local database. Do not run cleanup/seed scripts against production or shared staging.

```bash
cp .env.example .env
# Set a 32+ character JWT_SECRET in .env if needed.
docker compose -f docker-compose.dev.yml up -d postgres
npm run db:generate
npm run db:migrate
SEED_FULL=true npm run db:seed
npx dotenv -e .env -- ts-node database/prisma/seed/seed-execution-flow.ts
npx dotenv -e .env -- ts-node database/prisma/seed/seed-wip-shopfloor.ts
docker compose -f docker-compose.dev.yml up -d api web
```

Open `http://localhost:3000` and use the seeded admin or manager account from the seed output. The execution seed creates plans, materials, departments, employees, batches, handovers and exception scenarios. If the seed scripts are not wired into your environment, run them directly with the equivalent project `ts-node`/dotenv command.

## 2. Test identities and permissions

Use separate browser sessions for each role. Never validate all actions using only admin.

| Role/session | Use for |
|---|---|
| Admin | setup, approvals, QC rule configuration, audited override |
| Store Manager | material issue request/verify/prepare/hand-over, store-scoped actions |
| Department operator | receive, assign, start, pause/resume, progress, complete |
| Next department operator | receive accepted handover and continue the batch |
| Quality inspector | inspection, reinspection and disposition |
| Unauthorized user | negative permission tests |

Record user ID, department, location and permission set for every test run.

## 3. Golden-path test: Modules 6 → 10

Create one fresh plan and use one product with an approved BOM, active routing, active UOMs, and sufficient stock.

### M6 — Production Planning

UI: `/production/planning`, `/production/planning/new`, `/production/planning/[id]`.

1. Create a plan with product, approved BOM, active route, schedule date, quantity, buffer quantity, department and notes.
2. Verify the plan is saved as draft and has a unique plan number.
3. Run **Check/Validate**. Confirm the UI exposes missing BOM, inactive route, insufficient material, invalid date and duplicate-plan errors clearly.
4. Submit the valid plan for approval.
5. Approve it as a different authorized user.
6. Release it, then start it if the workflow requires a separate start action.
7. Verify requirements are derived from the selected BOM and UOM conversions, not manually invented by the browser.
8. Verify the plan detail shows status history, actor, timestamp and notes.

Expected statuses must be recorded exactly as returned by the API. Do not accept a green UI badge unless the API detail and database row agree.

### M7 — Material Issue

UI: `/stock/issues` and the plan detail issue action, if enabled.

1. Request material issue for the released plan.
2. Verify requested quantity equals the plan/BOM requirement and is tied to the plan.
3. Verify available stock is shown and the issue cannot exceed available stock.
4. Verify the lifecycle: requested → verified → prepared → handed over → acknowledged.
5. At each transition, reload the page and confirm state persists.
6. Confirm stock ledger and stock balance change once, with source reference to the issue.
7. Confirm duplicate clicks/retries do not create duplicate issues or duplicate stock movements.
8. Request a return for unused material and acknowledge it. Confirm the reverse ledger entry and resulting balance.

### M8 — Department Execution

UI: `/production/execution`, `/production/execution/[id]`.

1. Initialize or open the batch generated from the released plan.
2. Receive the batch into the first department.
3. Assign a worker from that department.
4. Start the batch; record partial progress.
5. Pause with a reason, reload, then resume.
6. Record a valid exception with reason/evidence where supported.
7. Complete the stage only when the quantity conservation equation balances:

   `received = completed + rejected + scrap + wastage + pending`

8. Propose handover to the next department, then accept it using the next department identity.
9. Confirm the previous department cannot edit the batch after accepted handover except through the governed correction/override path.

### M9 — WIP and Batch Tracking

UI: `/production/wip`.

1. Verify overview totals by department and status.
2. Search the batch by batch number and open detail.
3. Verify stage timeline, current owner, quantities, timestamps, worker assignments and handovers.
4. Open genealogy and confirm backward links to plan/material issue and forward links to child/next-stage batches.
5. Run reconciliation.
6. Create or use a seeded exception. Move it through investigating → resolved, including notes and actor history.
7. Confirm unresolved exceptions remain visible and do not silently disappear from overview counts.
8. Check timing metrics. Confirm durations are raw measured values and not synthetic “delayed/bottleneck” labels unless the business rule explicitly says so.

### M10 — Quality Control

UI: `/quality`, `/quality/queue`, `/quality/history`, `/quality/rules`.

1. Confirm a valid QC rule exists and is approved before inspection.
2. Resolve checkpoints for the batch or GRN line.
3. Record a PASS inspection. Confirm the result appears in batch and stage history.
4. Confirm the release gate permits the next action only when required checkpoints pass.
5. Record FAIL with no reason. The UI/API must reject it.
6. Record FAIL with reason and evidence. Confirm the batch is held or routed to corrective action.
7. Create corrective action with owner, due date, disposition and notes.
8. Attempt release while inspection is failed/open. It must be blocked.
9. Record REWORK or RE-INSPECTION as applicable, then record a PASS reinspection.
10. Confirm release gate changes to pass only after the required result is complete.
11. Test a mandatory QC checkpoint with missing rule configuration. Confirm a prominent blocked state, not an empty successful queue.
12. Test the audited override as an authorized manager/admin. Confirm reason, actor, timestamp and override event are visible in history.

## 4. Best-case and exception-case matrix

| ID | Scenario | Expected outcome |
|---|---|---|
| E2E-01 | Valid plan through PASS QC | Plan, issue, batch, WIP and QC histories all linked; next stage/release allowed |
| E2E-02 | Missing approved BOM | Plan check blocked with actionable validation error |
| E2E-03 | Inactive route/UOM | Plan creation or check blocked; no batch created |
| E2E-04 | Insufficient stock | Material issue blocked or shortfall explicitly recorded; no negative balance |
| E2E-05 | Duplicate material issue request | Idempotent response or one persisted issue only |
| E2E-06 | Invalid quantity conservation | Completion blocked; no handover or stock effect |
| E2E-07 | Pause/resume | State and reason persist; elapsed timing remains accurate |
| E2E-08 | Handover rejected | Source remains actionable; next department receives nothing |
| E2E-09 | Handover accepted | Source closes/advances; child/current batch and genealogy update |
| E2E-10 | Scrap/rejected quantity | Quantities reconcile and downstream quantity is reduced correctly |
| E2E-11 | WIP reconciliation mismatch | Exception created with source references and visible in queue |
| E2E-12 | QC FAIL without reason | Rejected at validation layer |
| E2E-13 | QC FAIL with corrective action | Batch held; release gate blocked until disposition/reinspection |
| E2E-14 | QC PASS | Release gate opens only for required checkpoints |
| E2E-15 | Unauthorized action | HTTP 403 and no database mutation |
| E2E-16 | Browser retry/network retry | No duplicate issue, progress event, handover, inspection or ledger entry |
| E2E-17 | Refresh/browser restart at every state | State is recovered from API/database, not local React state |
| E2E-18 | Concurrent two-user transition | One valid transition wins; second receives governed conflict/error |

## 5. Evidence to capture for every case

For each test, save:

- test ID, date/time, environment and commit SHA;
- role, user, department and location;
- plan number, issue number, batch number, handover ID and inspection ID;
- screenshots before/after each transition;
- API response status and payload for every write;
- database proof: status, quantity totals, ledger rows, audit events and notifications;
- expected result, actual result, severity and defect link.

## 6. API spot-check commands

Use the browser DevTools Network tab first because it preserves the authenticated session. For repeatable API testing, export the bearer token and call the routes below:

```text
GET  /api/v1/production/plans
POST /api/v1/production/plans
POST /api/v1/production/plans/:id/check
POST /api/v1/production/plans/:id/submit
POST /api/v1/production/plans/:id/approve
POST /api/v1/production/plans/:id/release
POST /api/v1/material-issues
POST /api/v1/material-issues/:id/verify
POST /api/v1/material-issues/:id/prepare
POST /api/v1/material-issues/:id/hand-over
POST /api/v1/material-issues/:id/acknowledge
POST /api/v1/production/batches/:id/receive
POST /api/v1/production/batches/:id/assign
POST /api/v1/production/batches/:id/start
POST /api/v1/production/batches/:id/progress
POST /api/v1/production/batches/:id/complete
POST /api/v1/production/batches/:id/handovers
POST /api/v1/production/handovers/:handoverId/decide
GET  /api/v1/wip/batches/:id/genealogy
POST /api/v1/wip/reconcile
POST /api/v1/qc/inspections
POST /api/v1/qc/inspections/:id/reinspect
GET  /api/v1/qc/release-gate/check
```

## Acceptance rule

Modules 6–10 pass only when the golden path and all P0/P1 exception cases pass in a live database, every write is persisted and auditable, no duplicate ledger/event records are created, permission tests pass with non-admin users, and `typecheck`, `test`, and `build` are green.
