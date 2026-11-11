# Local Intelligence Control-Plane Test Guide

This guide uses Plinth's six existing advisor profiles. Models do not write ERP records. Recommendations remain review items; business tasks require human acceptance.

## 1. Prerequisites

- Node.js 22.x, npm, Docker Engine, and Compose v2.
- An OpenRouter API key with access to a tool-capable free model.
- Local `.env` configured with unique runtime and profile-scoped MCP credentials. Keep credentials out of logs and screenshots.

Install dependencies and prepare the environment:

```bash
npm ci
cp .env.example .env
```

The local free-only route uses `nvidia/nemotron-3-super-120b-a12b:free` with `nvidia/nemotron-3.5-lightning:free` as fallback. The gateway rejects paid model IDs and caps every completion at 4,096 output tokens. Free availability and rate limits are controlled by the provider. OpenRouter's free plan currently allows 50 requests per day; one advisor run can use several requests, including tool continuations and title generation.

Free provider routing can permit provider training on submitted prompts and evidence. Set `INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE=true` only after your organization approves sending its ERP data. Without that setting, Plinth refuses business-data advisor runs.

## 2. Start the private stack

```bash
docker compose --profile intelligence config --quiet
docker compose --profile intelligence up -d --build
docker compose --profile intelligence ps
```

The stack runs PostgreSQL, API, web, worker, the private model egress boundary, and six advisor containers. Host ports are configurable with `API_HOST_PORT`, `WEB_HOST_PORT`, and `POSTGRES_PORT` in `.env`. The defaults expose web on 3000, API on 5000, and PostgreSQL on 55432. The advisor and model egress ports stay private on the Compose network.

Do not run `npm run dev` at the same time as this stack because both modes use the default database host port. Host development uses a separate database volume.

## 3. Check builds and controls

```bash
npm run typecheck
npm run build
npm run test --workspace @plinth/api -- --runInBand src/modules/intelligence/__tests__
node --test infrastructure/model-egress/server.test.js
```

Before live advisor testing, keep `INTELLIGENCE_SHADOW_MODE=true`, `INTELLIGENCE_EVENT_TRIGGERS_ENABLED=false`, `INTELLIGENCE_SCHEDULES_ENABLED=false`, `INTELLIGENCE_NOTIFICATIONS_ENABLED=false`, and `INTELLIGENCE_MAX_CONCURRENT_RUNS=1`. If you change `.env`, recreate the API, worker, model egress, and advisor containers.

## 4. Verify the free route

Use a synthetic tool-call model check first. It tests account access, catalog availability, generation, structured output, and tools. Then ask one source-backed question in a single module. Wait for a terminal run and inspect its request ID, evidence, provider attempt, resolved model, usage, and validation state in Audit & Run History. Repeat sequentially for Sales, Inventory, Procurement, Production, Fulfillment, and Executive. A catalog entry or an HTTP health response alone does not prove a successful business answer.

A `429` usually means the free pool or daily quota is exhausted. A `404` can mean that no free endpoint supports the requested parameters or privacy policy. Do not switch to a paid route automatically. Leave background triggers paused unless the free allowance, answer quality, and source-backed recommendations have been verified under realistic use.

## 5. Test every Plinth advisor module

The Business Questions UI has six dedicated Hermes profiles. Run questions **one at a time**: the worker enforces a concurrency limit, and launching all six simultaneously can cause expected “concurrency limit reached” failures. For each question, wait for its terminal state before submitting the next. Use real or seeded local ERP records; no direct intelligence-table inserts are needed.

- **Executive Super Agent** — asks for a cross-functional pulse. It can use the enterprise pulse and module evidence. Try: “Summarize the latest cross-functional business risks from certified snapshots. State any missing evidence.” It needs certified data in the relevant departments.
- **Sales Advisor** — checks booked/dispatched sales, customer opportunities, seasonal demand, and margin leakage. Try: “Summarize the latest certified sales performance and cite its metric keys.” It needs recent orders; shipment/cost metrics need dispatch and inventory cost postings.
- **Inventory Advisor** — checks availability, reorder policy, replenishment risk, and purchase tradeoffs. Try: “Identify current replenishment risks from certified inventory evidence.” It needs balances and active replenishment policies for item-level findings.
- **Procurement Advisor** — reviews purchase exposure and supplier reliability. Try: “Summarize current vendor and procurement exposure from certified evidence.” It needs purchase orders, vendors, and receipts for useful supplier results.
- **Production Advisor** — reviews capacity, bottlenecks, material shortages, quality, and loss. Try: “Summarize current production capacity and bottleneck risks from certified evidence.” It needs plans/work centers and related execution records.
- **Fulfillment Advisor** — checks dispatch backlog, delivery risk, and consolidation. Try: “Summarize current fulfillment and delivery SLA risks from certified evidence.” It needs shipments with expected and delivered timestamps for on-time metrics.

For each advisor question, verify **Decision Center → Run History** shows the trace, requested exact model, runtime-reported model, provider attempt, and certified evidence. For recommendations, open **Decision Center → Audit & Run History**, choose a module, and select **Run recommendation analysis**. A run with no deterministic opportunity explicitly records `MODEL_NOT_INVOKED: NO_OPPORTUNITY`. Accepting a recommendation, not merely generating it, creates a task.

The implementation has six standalone advisor profiles: Executive, Sales, Inventory, Procurement, Production, and Fulfillment. `QUALITY`, `FINANCE`, and `SYSTEM` are not standalone Hermes recommendation profiles in this release. Quality and Finance are not yet covered by certified recommendation snapshots; the existence of a read-tool name or ERP screen does not mean a Hermes operational recommendation is implemented for that domain. `SYSTEM` is not a business advisor.

### Operational recommendation scenarios

Use disposable test records and verify both the ERP workflow and the recommendation path. Never treat an Ask Business answer as proof that operational analysis ran.

| Scenario | Setup in Plinth | Expected result to inspect |
| --- | --- | --- |
| Replenishment threshold | Create an active item/location policy; set available stock at or below its reorder point; record a stock movement. | Inventory replenishment event/notification and the permitted PR or draft PO outcome. Then run Inventory analysis and inspect its certified snapshot and replenishment review recommendation. A draft PO is never auto-sent. |
| Slow/fast movers | Give one stocked product no ISSUE entries over 90 days. Give another product enough recent ISSUE volume that its available cover is at most 14 days. | Inventory snapshot reports slow/fast product counts and the slow-stock review opportunity where there is costed stock. This is a movement heuristic, not a demand forecast. |
| Supplier score | Send a test PO and finalize one or more receipts with received, accepted, rejected quantities and actual receipt timestamps. | Vendor tool derives fill, acceptance, and observed on-time metrics from finalized receipts. With no receipt history, it reports insufficient data instead of an invented grade. |
| Upcoming order coverage | Create an active sales order with a promised date in the next 30 days, then compare its unshipped quantity with an approved/released/in-progress production plan for the product and same horizon. | Production snapshot reports any product-level demand gap and a schedule-review opportunity. This version does not optimize route/work-centre capacity or BOM material constraints. |
| Customer engagement | Create active customer accounts with orders at different recency/frequency levels. | Sales snapshot reports dormant-account count and a recency/frequency/order-value engagement heuristic. It does not score creditworthiness or payment risk. |
| Marketplace import exceptions | Import an Amazon/E-Trade order; for a negative-path test, use a disposable order that fails validation. | Sales order/channel records and event routing should be visible. Hermes reports a marketplace validation exception only for an order that actually reaches `VALIDATION_FAILED`; it does not optimize channel stock or marketplace pricing. |
| Task lifecycle | Generate a valid recommendation, open it, accept with a module-eligible assignee and due date. | Exactly one linked Business Task appears; update/complete it through the task workflow. Recommendation generation does not execute the ERP action. |

The price analysis panel in product creation currently uses a deterministic margin formula and caller-supplied values; it is not an OpenRouter/Hermes inference. The bulk-purchase tool now returns `not_available` when costed policy inputs are absent instead of substituting a fabricated spend baseline. Capacity utilization and route-based freight savings remain unavailable until the platform has certified capacity calendars and routes/rates.

### Live module MCP check

Each service principal should list only its profile tools plus the shared metric/evidence tools. Current expected tool counts are Executive 18, Sales 6, Inventory 5, Procurement 6, Production 6, Fulfillment 5. The Inventory profile must be denied if it tries `get_sales_performance`. The UI question test above verifies the longer API → worker → Hermes → MCP/OpenRouter → evidence validator path.

## 5A. Detailed end-to-end scenario cards

This section is the hands-on test plan for operational recommendations and tasks. Run scenarios in a local/test tenant with disposable records. Use the UI labels available in your build; if a field is named differently, keep the data condition the same. Do not test these scenarios on production records.

### Before each scenario: establish a clean baseline

1. Sign in with a user who can access the relevant ERP module and Decision Center.
2. Open the relevant module and record the test entity identifiers (SKU/item, warehouse, policy, order, vendor, customer, shipment). Add a recognizable `HERMES-TEST-<date>-<case>` reference where the ERP screen allows it.
3. Check that the source record is saved and in the correct business status. Intelligence reads persisted business records; an unsaved form is not test evidence.
4. Open **Decision Center → Audit & Run History**. Select exactly one module and click **Run recommendation analysis**. Wait for the new run to reach a terminal state before launching another run; parallel runs can hit the worker concurrency limit.
5. Record the run ID/status, snapshot time, metric values, recommendation ID (if any), and task ID (for lifecycle cases). Compare only recommendations created by this run and tied to your test record; older runs may still appear in the list.
6. If the run failed, stop interpreting recommendation absence as a business result. Check the error/status and safe service logs first.

Manual analysis is the reliable trigger for this test suite. Current local configuration has schedules disabled. Event-driven work can also be exercised, but do not assume every ERP save emits an intelligence-triggering event. Shadow mode suppresses notifications; it does not, by itself, prevent a recommendation run or persistable recommendation.

### A. Inventory replenishment and stock movement

#### A1. Positive replenishment case

**Setup**

1. In **Inventory → Replenishment Policies**, create a policy for a test item and one warehouse. Make it active.
2. Set reorder point `100`, safety stock `50`, order-up-to `500`, approved unit cost `₹50`, currency `INR`.
3. In the inventory balance/receipt workflow, ensure the same item has `20` available units at that exact warehouse and condition. If there are reservations, record them separately; the calculation uses available balance quantity minus reserved quantity.
4. Save/post the inventory transaction so the balance is persisted.

**Run and inspect**

1. Run **INVENTORY** analysis as described above.
2. In the run evidence/snapshot, inspect `inventory.replenishment_risk_count` and `inventory.replenishment_exposure`.
3. Open the generated recommendation and verify item/policy/location references and the source metrics.

**Expected result with the current implementation**

- Risk count increases by one for this policy if this is the only risky policy.
- Shortage is `reorder point - available = 100 - 20 = 80` units.
- Exposure is `80 × ₹50 = ₹4,000` (assuming INR and a valid unit cost).
- The `500` order-up-to quantity is stored policy context; it is **not** the shortage formula used for this opportunity. Therefore, do not expect 480 units / ₹24,000 from the current implementation.
- Hermes may produce zero persisted recommendations if the model output is empty or policy/evidence validation rejects it. Inspect run details for the reason; the deterministic opportunity is the candidate, not a guarantee that a recommendation card is persisted.

#### A2. Threshold boundary

Repeat A1 with available stock exactly `100`, then `101`, then `99`. Run Inventory analysis after each saved balance.

- At `100` and `101`, this code should not create a risk row because it tests `available < reorder point` (equivalently, positive `reorder point - available`).
- At `99`, shortage is `1`; with ₹50 approved unit cost, exposure is ₹50.
- If results differ, compare the snapshot’s actual available quantity and policy `locationId`, not just on-hand quantity in the screen.

#### A3. Reservations reduce availability

Set on-hand quantity to `120`, reserved quantity to `30`, reorder point `100`.

- The evidence should treat available as `120 - 30 = 90`.
- Expected shortage is `10`; exposure is ₹500 at ₹50/unit.
- Also test reserved `0`, then verify it clears the risk at `120` on hand.
- Do not create a reservation larger than on-hand stock unless the ERP itself permits it; that tests inventory validation rather than Hermes.

#### A4. Policy applicability and missing inputs

Run separate cases with (1) no policy, (2) inactive policy, (3) policy attached to another warehouse, (4) approved cost blank/zero, and (5) missing balance.

- No/inactive/wrong-location policy: no item-level candidate from that policy. A zero balance at the policy’s exact location may count as zero available if the balance row is absent.
- Missing/zero cost: the item may still have a replenishment quantity candidate, but do not accept a financial impact as valid unless it is supported by snapshot evidence and passes validation. The model must not invent a price.
- No inventory balance anywhere: verify whether the risk count uses zero available for the configured policy; distinguish this from a stale/missing snapshot.
- Check item type, item ID, location ID, active flag, and currency in source records when expected rows are absent.

#### A5. Warehouse isolation

Create two policies for the same item at `WH-A` and `WH-B`. Put `20` units in WH-A and `200` in WH-B; set both reorder points to `100`.

- Only WH-A should be risky; its shortage should be 80.
- Then move stock between warehouses using the normal transfer workflow, post it, and rerun. Confirm the risk moves/disappears based on the new balances. The snapshot should not let surplus stock in WH-B silently cancel WH-A’s shortage.

#### A6. Slow and fast product movement

These metrics currently operate on **PRODUCT** balances and `ISSUE` ledger entries, not raw-material movement.

1. Create a stocked product with positive available balance, positive average cost, and no `ISSUE` ledger entries during the trailing 90 days. Run Inventory analysis. It should contribute to `inventory.slow_moving_product_count` and, when costed, `inventory.slow_moving_stock_value`; an excess-stock review opportunity is eligible.
2. Create another stocked product and post dated `ISSUE` movements totaling 900 units in the trailing 90 days. Leave 100 available units. Daily issue rate is 10, cover is 10 days, so it should count as fast-moving.
3. Boundary: with 140 available and 900 issues, cover is exactly 14 days and should count; with 141, it is 14.1 days and should not.
4. Set product available stock to zero: it should not count as a stocked slow/fast item.
5. Add a recent `ISSUE` to the zero-issue slow product: it should no longer meet the slow definition.

Use the ERP’s dated inventory movement flow. If it prevents backdating, ask an administrator to load **ordinary test inventory transactions** into a disposable local database; don’t insert certified snapshots or recommendation rows. Record movement date and sign: the implementation counts negative `ISSUE` quantity deltas in the trailing 90 days.

### B. Procurement and supplier evidence

#### B1. Vendor scorecard from finalized receipts

1. Ensure an active Vendor Scorecard exists. Record its weights and thresholds before the test; the computed grade depends on these settings.
2. Create a test vendor and a PO with a need date. Send/confirm it through the normal procurement workflow so it reaches a status included in the scorecard query.
3. Create a GRN against that PO, enter received, accepted, and rejected quantities, and finalize it. Use the actual receipt timestamp relative to the need date.
4. Query the Procurement tools via a Procurement Business Question that explicitly asks for the scorecard for the test vendor, or inspect the returned scorecard evidence in the run. Verify it references the expected vendor/PO history.

**Example expected math**

- PO ordered 100; finalized GRN received 80 → fill rate 80% (assuming this is the full included PO population).
- Of the 80 received, 72 accepted → quality rate 90%.
- Receipt timestamp on/before need date → on-time for that receipt line; after need date → late.
- Current code compares finalized receipt `receivedAt` with PO-line `needDate`.

#### B2. Vendor edge cases

- **No finalized GRN:** receipt-derived measures are unavailable; a complete score may be impossible.
- **Partially received PO:** fill rate is based on received versus ordered quantities; verify multiple GRNs aggregate correctly.
- **Rejected quantity:** quality rate should use accepted/received; test received > 0 and accepted < received.
- **Late and on-time lines:** test one of each; verify aggregate is based on receipt lines, not order count.
- **Cancelled/rejected/superseded PO:** should not be part of the selected scorecard population.
- **Missing compliance docs:** if compliance has a nonzero active weight, the score can be incomplete.
- **Missing price/responsiveness inputs:** current implementation cannot certify cross-vendor price or response time. If active scorecard weights require these, expect an insufficient-metrics status, not a complete grade.
- **No active scorecard / no positive weights:** expect a not-configured or insufficient-data result.
- **Currency:** the price-dispersion input only uses INR PO line prices; it is not a market benchmark and does not establish that a vendor is cheap/expensive.

Do not expect this read/scorecard calculation to update the vendor master grade or create historical grade transitions. The grade-history writeback feature is not implemented here.

#### B3. Bulk purchase tradeoff tool

Ask the Inventory/Procurement advisor to run the bulk-purchase comparison with active replenishment policies that have both approved unit cost and order-up-to quantity.

- With no valid policy costs/quantities, expect `not_available` and a reason.
- With valid inputs, inspect the displayed assumptions: discount percentage, annual holding-cost percentage, horizon, and simulated policy spend. This is a sensitivity calculation using supplied/default assumptions, not a vendor quote or purchase recommendation from observed negotiated terms.
- Change only one parameter at a time (e.g. discount 5% then 15%) and verify the tradeoff direction responds accordingly.

### C. Production schedule and quality/loss

#### C1. Upcoming demand gap

1. Create a non-cancelled sales order for a test product with remaining unshipped quantity `100` and a promised date within the next 30 days.
2. Run Production analysis with no matching approved/released/in-progress production plan.
3. Inspect `production.upcoming_unplanned_demand_units` and the product-level schedule review candidate. Expected uncovered demand is 100 units.
4. Create a matching production plan for 60 units in an included status, for the same product/horizon. Save it.
5. Run again. Expected gap is 40 units, subject to other matching plans/orders in the test dataset.
6. Increase matching planned quantity to 100 or more, save, rerun. The gap should be zero for this order/product.

#### C2. Production boundary and exclusion cases

- Plan in a status outside approved/released/in-progress: it should not cover demand.
- Plan for a different product: it should not cover the order.
- Promise date just inside versus outside the 30-day horizon: only the inside order should be included.
- Fully shipped/cancelled order: it should not contribute remaining active demand.
- Partly shipped order: compare remaining order quantity, not original ordered quantity.

The current calculation is product-level plan quantity versus near-term order demand. It is not a production scheduling optimizer: it does not reserve machine hours, enforce work-center calendars, consume BOM components, or predict order demand that does not exist as an order.

#### C3. Inspection defects and abnormal loss

Create production inspection records with a known sampled quantity and defect quantity; create a separate abnormal-loss event or open corrective action if those workflows are available.

- Defect rate should equal defective quantity divided by sampled quantity. For example, 5 defective of 100 sampled is 5%.
- Test below 5%, exactly 5%, and above 5%; current opportunity condition is at least 5% defect rate or any abnormal loss/open corrective action (check current metric/snapshot implementation if your build has changed).
- Resolve/close the corrective action and rerun to verify the open-action signal clears.
- With zero sampled quantity, the percentage is not meaningful; ensure no divide-by-zero or fabricated percentage appears.

### D. Sales, customers, and marketplace orders

#### D1. Dormant and engagement heuristics

1. Ensure the customer is `ACTIVE`.
2. Create one customer with no non-cancelled sales orders in the trailing 90 days. Run Sales analysis. It should count as dormant and make a follow-up review candidate eligible.
3. Create comparison customers with a recent order, several orders in the last year, and a higher/lower order value. Run again and compare engagement scores.
4. Cancel a recent order and rerun. Cancelled orders should not be treated as valid history for the customer measure.
5. Set a customer inactive and rerun; it should not be included in the active customer population.

The score is a rule-based 0–100 engagement heuristic based on recency, order frequency, and log-scaled order value. It does not use payment history, credit limits, returns behavior, or dealer-specific risk rules. Do not describe it as a dealer score.

#### D2. Margin review

1. Create and dispatch test INR orders through the regular sales/shipping process so actual inventory COGS ledger entries are posted.
2. Keep costed shipped quantity at or above 80% of dispatched quantity.
3. Create a contribution margin below 15% after actual COGS, returns, and recorded freight.
4. Run Sales analysis; a margin review candidate is eligible. Check `sales.known_contribution_margin`, `sales.cost_coverage_score`, and `sales.known_contribution_margin_rate` against the order/ledger records.
5. Repeat with <80% cost coverage: a financial recommendation should not claim a supported margin opportunity from insufficient cost evidence.

Known margin omits unrecorded labor, overhead, marketplace fees, commissions, and other unrecorded variable costs. Treat it as the implementation-defined known contribution margin, not a complete accounting gross margin.

#### D3. Amazon/E-Trade validation exception

1. Create/import an Amazon or E-Trade test order using the ordinary channel workflow.
2. For the positive case, pass validation and save the order. It should count in the appropriate channel count/revenue if it meets the reporting period and INR criteria.
3. For the negative case, use a disposable order with a validation issue that the platform can actually mark `VALIDATION_FAILED`. Run Sales analysis and inspect `sales.marketplace_validation_failure_count` and the exception candidate.
4. Correct the order through the regular workflow and rerun; check whether it leaves the failure state and whether the new snapshot reflects that.
5. Test cancelled channel orders: they should not be reported as marketplace validation failures.

This checks platform-recorded order validation. It does not connect Hermes to Amazon/E-Trade APIs by itself and does not implement marketplace pricing, listing, or inventory allocation optimization.

### E. Fulfillment SLA

1. Create test shipments with an expected delivery timestamp.
2. Mark one delivered before/on the expected time and another after it.
3. Run Fulfillment analysis and inspect the on-time metric and shipment evidence.
4. Add a shipment with no expected delivery timestamp and an undelivered shipment. Confirm those are not falsely counted as on-time delivered shipments.
5. Cancel a shipment and rerun; it should not be included in the non-cancelled population.

Use consistent timezone/date entry and inspect persisted timestamps when a boundary result looks wrong.

### F. Recommendation validation and task lifecycle

#### F1. Evidence and action validation

Use the test recommendation generated from A1, C1, or D1.

1. Open its details. Confirm the target item/order/vendor evidence and metric keys are present in the run snapshot.
2. Compare any numeric impact to the referenced opportunity and certified metric values. A model-written number is not accepted merely because it sounds reasonable; validation must match it to the permitted opportunity/evidence.
3. If the run is `REJECTED`, inspect the validation reason. Typical reasons include wrong module/action, unknown opportunity, unsupported evidence key, invented impact, stale/low-quality evidence, or policy limits.
4. Confirm rejected output did not create an open recommendation or task.

Do not try to manipulate production OpenRouter responses to force a rejection. Validator unit/contract tests cover adversarial envelopes safely; live runs should use normal provider output.

#### F2. Accept and complete a task

1. Open a valid recommendation and choose **Accept**.
2. Select an eligible owner from the user list and choose a future due date. Save.
3. Open **Decision Center → Tasks**. Find the task by linked recommendation/test reference.
4. Verify owner, due date, status, module, recommendation reference, and task activity.
5. Change status through the task workflow (for example, in progress, then completed) and add the required completion/outcome fields if prompted.
6. Reopen task detail and verify the activity/outcome is retained. Reopen the recommendation and inspect its status/audit relationship.

#### F3. Task edge cases

- Accept with no owner or no due date: expect server-side validation to reject the request.
- Accept the same recommendation twice quickly: expect only one linked task; verify by recommendation link, not just title.
- Assign a user without the required role/permission: expect rejection or exclusion from eligible owners.
- Use a past due date: expect validation failure if the endpoint disallows it; record actual behavior.
- Defer/dismiss a recommendation, then rerun the unchanged snapshot: check that status and deduplication rules prevent unwanted duplicate work.
- Complete the task and rerun without changing source ERP data: task completion should not be represented as automatic ERP fulfillment; inspect recommendation outcome separately.

### G. Runtime, provider, event, and schedule controls

#### G1. Provider credential / model routing

Run one Business Question for a module with data, then one recommendation analysis. In run history inspect terminal status, provider/model metadata, evidence, and any usage fields. A completed question proves the question path; a completed recommendation run proves the recommendation path. They are separate jobs. Never print `.env`, runtime tokens, or the OpenRouter key into logs/chat.

For a negative check, disable provider calls using the Decision Center control (or local environment config and restart the relevant services), run once, then restore the previous value. Expected: a bounded failed/paused run and no invented recommendation; normal ERP saves should still work. Do not test with a paid route if the goal is to verify the configured free route.

#### G2. Event-triggered versus manual run

The manual button is the baseline. To test event triggers, select a supported domain transaction known to emit an intelligence outbox event, make exactly one valid change, and inspect the outbox/worker logs and run trigger (`EVENT`). Do not infer event support from any arbitrary save. Compare event run evidence to a manual run after the same change; do not expect exactly the same run IDs or timestamps.

#### G3. Scheduled runs

The current local guide sets `INTELLIGENCE_SCHEDULES_ENABLED=false`. Therefore, no daily/weekly schedule run is expected in the default local setup. To test schedules, enable them only in a disposable local environment, restart API/worker, verify the worker reports the schedule enabled, and wait for the configured schedule boundary (or use a supported manual/administrative trigger). Confirm run trigger is `DAILY` or `WEEKLY`. Restore schedules to disabled after the test. Do not label manual runs as evidence that schedules work.

#### G4. Shadow and notification behavior

With shadow mode on, run a case that creates a recommendation. Check that run/recommendation data appears, while review notifications are suppressed. Then, if notification delivery is explicitly configured in local/test, disable shadow mode and enable notifications to verify delivery. Restore safe local values afterward. Lack of a notification in shadow mode is expected and does not prove the Hermes run failed.

### H. Cleanup and test record

1. Export or record the run/recommendation/task IDs and results before cleanup.
2. Complete or dismiss test tasks/recommendations through the UI when possible.
3. Cancel test POs/orders/shipments using ordinary workflows where allowed; never delete posted inventory ledger or finalized accounting records to make a test look clean.
4. Deactivate test replenishment policies and test customer/vendor records if they are no longer needed.
5. Preserve audit history. If test data must be removed, use a disposable local database reset after retaining the test report.

For each case, record: case ID, setup IDs, starting values, module/run ID, run status, snapshot metric values, recommendation ID/status (or why none was eligible), task ID/status (if accepted), and pass/fail with evidence. This makes a zero-recommendation result diagnosable instead of ambiguous.

## 6. Verify MCP profile isolation

The MCP endpoint is reachable through the API, but accepts only a configured profile credential:

```bash
curl -sS \
  -H "Authorization: Bearer ${INTELLIGENCE_INVENTORY_MCP_TOKEN}" \
  -H 'Content-Type: application/json' \
  http://localhost:5000/api/v1/internal/intelligence/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The inventory response must contain only inventory tools and shared metric/evidence tools. Calling a sales-only resource with the inventory credential must return a scoped validation error. No MCP write tool exists in the first release.

## 7. Exercise the complete business flow

Use the existing ERP UI to create a legitimate inventory, sales, procurement, production, or dispatch transaction. Do not insert intelligence rows directly into PostgreSQL.

Verify this sequence:

1. The transaction commits successfully even if a runtime is unavailable.
2. A minimal domain event appears in the outbox.
3. The worker creates a module job and immutable certified snapshot.
4. The module run completes or records a bounded failure.
5. A valid recommendation appears in `Decision Center → Recommendations` only when evidence, freshness, cost coverage, and policy checks pass.
6. Accepting it requires an assignee and due date, then creates exactly one task.
7. The owner updates or completes the task through the task workflow.
8. The recommendation, task, notification, and outcome are visible in audit/performance views.

Useful observations:

```bash
docker compose logs -f intelligence-worker agent-runtime-inventory
```

The API also exposes authenticated views under `/api/v1/intelligence/overview`, `/recommendations`, `/tasks`, `/runs`, and `/controls`.

### Exercise receiving OCR

In a local/test ERP account, create or open a goods receipt, upload a clear PDF or image of a supplier document, and run the OCR/extraction action. Compare extracted vendor, document number, dates, and line values to the source file before saving. Inspect `docker compose --profile intelligence logs --tail=200 api` for provider errors. A 429/5xx from the free vision model means OCR needs a later retry; it does not prove Hermes text-question routing is broken.

## 8. Test failure and rollback controls

Pause provider calls without stopping ERP:

```dotenv
INTELLIGENCE_PROVIDER_ENABLED=false
```

Pause schedules, events, or notifications independently, or use the authorized Decision Center controls page. A global stop is:

```dotenv
INTELLIGENCE_ENABLED=false
```

After changing environment variables, restart the API and worker. Do not delete recommendations or task history when testing rollback.

## 9. Diagnose “port already in use”

First find the listener and the Compose containers publishing ports:

```bash
docker compose ps
docker ps --format 'table {{.Names}}\t{{.Ports}}'
ss -ltnp | rg ':(3000|3001|5000|5001|5432|55432)\\b'
```

If available, `lsof -nP -iTCP:<port> -sTCP:LISTEN` identifies the owning process. Do not kill a process just because it owns a port; confirm it belongs to an old Plinth run first. Stop a host-run `npm run dev` with `Ctrl+C`. Stop only a specific stale Compose service with `docker compose stop <service>`.

If another application legitimately owns the port, edit `.env` and change the host mapping, for example `WEB_HOST_PORT=3011`, `API_HOST_PORT=5011`, or `POSTGRES_PORT=55433`, then recreate the affected Compose service:

```bash
docker compose --profile intelligence up -d --force-recreate web api postgres
```

Keep internal ports (`API_PORT=5000`, `WEB_PORT=3000`) unchanged unless you also update the service configuration. After changing a host port, use the new value in browser URLs, curl commands, and `NEXT_PUBLIC_API_URL` as applicable. For example, if `API_HOST_PORT=5011`, set `NEXT_PUBLIC_API_URL=http://localhost:5011/api/v1` in `.env`. Rebuild the web image if a `NEXT_PUBLIC_*` value was baked into the frontend at build time. Do not use `docker compose down -v`; `-v` removes database volumes.

## 10. Before staging or production

- Replace development credentials with secret-manager values.
- Pin and mirror the runtime image digest through the approved registry/SBOM process.
- Enforce provider-only and private-MCP egress at the network layer.
- Reconcile certified revenue, COGS, contribution margin, inventory, and service metrics with Finance/Operations.
- Run the golden evaluation set and retry/duplicate/isolation tests.
- Keep shadow mode enabled for at least 30 days before notifications.
- Enable notifications one module at a time only after written approval.
