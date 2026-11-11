# Plinth AI reliability and capability plan

## Implementation update: free-only route, 2 October 2026

The user clarified that Plinth uses a free provider key and explicitly approved sending ERP prompts and evidence to free providers. The local configuration now selects a tool-capable free primary model with a free fallback, zero token prices, a 4,096-token completion cap, five-turn advisor limit, and one concurrent run. The private gateway rejects paid model IDs and omits its data-collection denial only when that approval flag is enabled. All six Plinth profiles use the free primary for auxiliary calls too.

The remaining assessment text below records the original paid-route failure. It is historical context rather than the current local configuration. Background schedules, event triggers, and notifications stay disabled while free-tier availability and end-to-end answer quality are checked. Free-model requests may be rate limited and can consume several requests per advisor run.

**Local acceptance evidence:** a synthetic Sales runtime request completed through the private gateway. Authenticated Sales and Inventory Business Questions completed with saved structured answers and ten and five certified evidence references, respectively; both provider attempts requested the free primary route and recorded zero-dollar charges. The Inventory prompt was shortened after an earlier response produced malformed JSON, and the successful retry used prompt version `business-question-v1.1`. A separate Sales recommendation analysis completed with no qualifying deterministic opportunity, so it made no provider call and produced no recommendation. The one-run concurrency check was corrected to exclude the run being checked. Synthetic tool calling passed for the free fallback model; a request to a congested free primary then completed on that fallback through the deployed gateway. The deployed gateway rejected a paid model ID with HTTP 403. The final focused intelligence suite passed 25 suites and 118 tests; both gateway tests, Compose validation, and six advisor health checks passed. The other four business question paths and a model-authored recommendation remain to be checked against suitable Plinth source records and the free daily request allowance.

**Assessment date:** 2 October 2026. **Scope:** the current Plinth checkout and its local Compose deployment, compared with the two supplied handoff documents and comparison image. The supplied documents describe another ERP and an earlier Plinth investigation; they are evidence to evaluate, not instructions or a feature specification for Plinth.

## Decision in brief

Keep Plinth's existing intelligence control plane, six approved advisor profiles, certified metrics, read-only tools, review decisions, tasks, and outcomes. Make its model boundary reliable and measurable. Do not import the other ERP's departments, data model, OCR, market collection, finance workflows, task state machines, or screens.

The immediate blocker is a paid model selected by the API on an account whose earlier test showed insufficient credit. The request sent to the runtime specifies the API model, so the free model in a profile YAML does not govern advisor runs. The current runtime image contains a local output cap patch, but it is set to **1,000 tokens**, has not been verified through an end-to-end paid-model run in this assessment, and may truncate Plinth's structured output. Plinth also has background work enabled at concurrency 12 while both configured token prices are zero. This permits a large request volume while rendering the application budget check ineffective.

## Evidence and limits

| Observation | Evidence | Confidence |
| --- | --- | --- |
| The API sends `model` and provider on each run; profile YAML is overridden for the main run | `services/api/src/modules/intelligence/integrations/agent-runtime.client.ts`, request body in `execute()` | Confirmed in code |
| The running API selects `google/gemini-2.5-flash`, has both cost rates at zero, and has schedules, events, and notifications enabled | Redacted process-environment read from the running API container, 2 October | Confirmed locally |
| The running Sales advisor has the image patch loaded, a 1,000-token cap, and free route in mounted YAML | Read-only container checks, 2 October | Confirmed locally; effectiveness of all model calls is unverified |
| The last 24 hours contain 156 failed advisor attempts with HTTP 402, 1,017 failed advisor attempts without an HTTP status, and 33 successful advisor attempts | Aggregated `provider_attempts` query through the API container, 2 October | Confirmed locally; totals span image/config changes and do not isolate one cause for status-less failures |
| The last 24 hours contain 32 completed jobs and 79 dead-letter jobs | Aggregated `intelligence_jobs` query, 2 October | Confirmed locally |
| Recent daily runs report `Runtime ended with status 'failed'` or runtime unavailable; several question specialist runs report `SPECIALIST_FAILED` | Recent `intelligence_runs` error-code and bounded-message query | Confirmed locally; the underlying provider/MCP cause needs trace-level diagnosis |
| The earlier investigation reproduced 402 with a high implicit output allowance and completed 10/10 capped requests through a test proxy | Supplied 402 investigation | Historical test evidence, not proof that the current patch works |

No provider call, account change, secret inspection, database mutation, or application configuration change was made for this assessment. The earlier investigation's claim that the local models had already been changed is stale: the running API still selects the paid route. The supplied image's comparison is directionally useful but is not a current deployment audit.

## Architecture to preserve

```text
Authorized user / Plinth event
  -> Plinth API: RBAC and durable job
  -> worker: certified snapshot and deterministic opportunity
  -> profile-specific read-only runtime + MCP allowlist
  -> model gateway
  -> Plinth contract and evidence validator
  -> saved answer or recommendation + run and usage trace
  -> human review -> existing Plinth task and ERP workflow -> measured outcome
```

This already follows the valuable part of the reference architecture: one controlled AI boundary, bounded tools, saved evidence, human approval, and background processing. The reference system's implementation uses additional service boundaries and more specialist definitions because its business scope differs. Plinth should keep its modular monolith and six profiles unless Plinth source data and product requirements justify another profile.

## Capability inventory and gaps

| Capability | Plinth today | Required work |
| --- | --- | --- |
| Sales, inventory, procurement, production, fulfillment, executive advice | Six isolated profiles, certified snapshots, read-only tools, question and recommendation routes exist | Prove live completion per profile; fix provider and output failures before claiming operational readiness |
| AI insights and findings | Decision Center has recommendations, cases, conversations, scenarios, outcomes, performance, and audit views; deterministic detectors and question answers exist | Distinguish a certified detector signal, model-authored explanation, and unavailable evidence in API and UI; verify each surface against real Plinth source records |
| Owner synthesis | Executive path can reconcile specialist summaries and issue cross-module answers | Bound fan-out and cost; surface partial specialist failures without implying complete coverage |
| Saved conversations | Owner-scoped persistent conversations and message routes exist behind a feature flag | Verify retention, idempotent message submission, failure display, and bounded context before rollout |
| Human action and impact | Recommendation acceptance creates one Plinth task; task completion and outcome records exist | Preserve existing review and task flow; require source-backed outcome reconciliation |
| Runtime and cost controls | Kill switches, profile pause, concurrency, token-cost estimate, run history, model checks, and provider attempts exist | Make spend reservation and model failure reporting reliable; do not count an absent provider generation ID as verified provider telemetry |
| Quality and finance | Some read tools and ERP fields exist, but no standalone certified recommendation profiles | Do not copy departments from the other ERP; assess only after Plinth has authoritative metrics, policies, RBAC, and acceptance cases |
| OCR, marketing, HR, payroll, and other reference features | Not part of this Plinth advisor scope | Do not import from the comparison implementation |

**Evidence-integrity issue:** `intelligence-case.service.ts` currently fills missing numeric case fields with example values in `calculateDetectorEvidence()`. These values must not become business evidence. Emit `UNAVAILABLE` with the missing source/metric, or calculate solely from certified fields. Add tests proving absent fields never produce a plausible amount, quantity, rate, or impact.

## Implementation sequence

### 0. Contain the local failure volume

1. In the local development configuration, enable shadow mode; disable schedules, event triggers, and notifications; set concurrency to one. Preserve the existing database and audit trail. Do not replay dead letters until failure causes are classified.
2. Inspect current control-state overrides as well as environment switches. Record the image digest, applied output cap, API process model, auxiliary YAML model, runtime health, and MCP reachability for each profile in one safe diagnostics command. Never print credentials or prompts.
3. Separate historical failures by creation time, image/config revision, profile, trigger, runtime status, provider HTTP status, and final validation stage. The status-less failures need a separate root-cause label; do not treat all of them as 402.

**Exit:** idle development stack produces no new provider attempts, and every prior failure category has a traceable stage and bounded safe message.

### 1. Make a single advisor run reliable

1. Choose one verified tool-capable route for development. Use the same route for API per-run model and runtime auxiliary calls. Validate it with the authenticated model check, then with an actual one-profile Plinth question. A catalog check alone is insufficient.
2. Enforce an explicit output-token ceiling on **every** model call, including tool continuations, retries, executive calls, and title generation. Start at 4,096 for the current structured contract and tune only after checking truncation. The existing image patch at 1,000 is an unverified temporary mechanism. Prefer a small, tested gateway adapter/proxy for the near term so all calls and streaming follow one policy; keep the version-specific image patch only while the replacement is verified.
3. With a paid route, use a funded development key with a provider-side spend limit. A zero-credit key may still reject a capped paid request. With a free route, expect availability and rate limits to vary; it is a path test, not a production service level.
4. Bound a development run to roughly five model/tool turns and one active run while verifying the path; restore a higher turn limit only when the evaluation set demonstrates a need. Restrict provider routing to approved hosts and order those hosts by the configured cost policy, so a route change does not silently select an expensive host.
5. Verify Docker DNS, MCP authorization and port routing from the runtime container to the API. The supplied macOS port 5000 conflict is historical evidence; check the actual host before changing ports. Replace development-only `api:host-gateway` routing with a stable service-network address where the deployment permits it.
6. Return stable, neutral failure codes to the run UI for provider budget, rate limit, model unavailable, runtime unreachable, MCP permission, timeout, output truncated, validation rejected, and persistence failure. Keep the provider detail in restricted audit data only.

**Exit:** a Sales or Inventory question completes end to end, showing certified evidence and a saved answer; a deliberately failed call identifies its actual stage and code. No prompt, key, or raw sensitive tool result enters logs.

### 2. Add bounded fallback and real cost control

1. Put primary and fallback routes behind Plinth's runtime adapter. Retry or switch only on transient provider failures and verified model unavailability, within a small global attempt limit. Do not automatically retry 402, malformed evidence, RBAC denial, or a failed validator. Record each route attempt and preserve one Plinth run correlation ID.
2. Reserve a conservative spend/token slot **before** each provider call, including auxiliary calls and executive specialist fan-out. Use database concurrency control so concurrent workers cannot all pass the same remaining-budget check. Release unused reserve and reconcile actual usage. The current monthly check only compares previously recorded run cost; configured prices of zero cause estimates to remain zero.
3. Load route prices from approved environment configuration and fail closed for paid routes whose price is missing. Retain the independent provider-side key limit. Show requested model, resolved model when verified, input/output usage, estimated cost, and unknown telemetry explicitly.
4. Detect `finish_reason: length` or equivalent truncation and mark the run as incomplete. A partial JSON response must not be persisted as an insight or recommendation.

**Exit:** concurrent test calls stop at the budget, fallback is limited to allowed errors, 402 and 429 have distinct UI states, and usage totals reconcile within an agreed tolerance against the provider account report.

### 3. Validate Plinth insights and workflows

1. Use Plinth-specific fixtures and real test records for each of the five module advisors, then executive synthesis. Test both Business Questions and recommendation analysis: they are separate job paths. Include a no-opportunity case and a missing-evidence case.
2. Remove fabricated case evidence defaults. Trace each displayed metric to a certified snapshot, source period, unit, freshness, and quality score. Mark unsupported metrics unavailable; do not substitute example numbers.
3. Confirm a validated recommendation can be accepted once, assigned to an authorized Plinth user, completed through the existing task API, and reconciled to observed ERP evidence. AI must never perform the business transaction.
4. Verify conversations, cases, scenarios, and outcome views only for Plinth's enabled policy gates. Disable or clearly mark any surface that lacks a trustworthy source or has not passed its gate.

**Exit:** every supported insight has evidence and limitations; each missing source is visible; all five module paths and executive path pass a staged end-to-end matrix with no cross-module permission leak.

### 4. Neutral naming and rollout

1. Replace provider and runtime names in UI labels, notifications, error text, analytics labels, and public API responses with `Plinth AI`, `Advisor`, `Model provider`, or `Decision Center` as appropriate. The admin control description currently names a provider explicitly. Search generated content and notification templates as well as visible React text.
2. Rename Plinth-owned identifiers where migration is safe. Keep unavoidable third-party package/image coordinates, external protocol keys, vendor API URLs, license/SBOM records, and historical database migrations inside the infrastructure boundary. Those are technical dependency references, not product branding. Do not rewrite applied migrations or break external API compatibility solely for naming.
3. Add a CI check for prohibited product strings in frontend content, notifications, email templates, user-visible errors, and public response fields. Review false positives in infrastructure and compliance records explicitly.
4. Roll out from one profile in shadow mode, then five module profiles, then executive fan-out, then scheduled/event runs at controlled concurrency. Watch provider failures, cost, validation rejection, dead letters, worker lag, and answer quality. Enable notifications after evidence and review flows pass.

**Exit:** application surfaces show only Plinth terminology; all six supported advisor profiles pass staging, and the rollback is the existing provider/profile kill switch.

## Change map

| Work item | Primary Plinth files |
| --- | --- |
| Model selection, prices, environment defaults | `services/api/src/config/index.ts`, `.env.example`, `infrastructure/intelligence/*/config.yaml`, `docs/operations/intelligence-local-test.md` |
| Output cap and routing boundary | `services/api/src/modules/intelligence/integrations/agent-runtime.client.ts`, `infrastructure/docker/*token-budget*`, `docker-compose.yml` |
| Budget reservation, fallback attempts, verified usage | `services/api/src/modules/intelligence/services/provider-telemetry.service.ts`, `services/api/src/modules/intelligence/services/intelligence-controls.service.ts`, a new reservation migration/service |
| Failure classification and health | `services/api/src/modules/intelligence/services/intelligence-orchestrator.service.ts`, `services/api/src/modules/intelligence/services/intelligence-health.service.ts`, `apps/web/src/features/intelligence/components/RunHistoryView.tsx` |
| Source-backed cases and insight wording | `services/api/src/modules/intelligence/services/intelligence-case.service.ts`, `services/api/src/modules/intelligence/services/certified-metrics.service.ts`, `apps/web/src/features/intelligence/components/IntelligenceResourcesView.tsx` |
| Product terminology | `apps/web/src/features/intelligence/`, Plinth-owned API errors, notification templates, user-facing documentation |

## Acceptance evidence to collect

- A build check for the runtime cap/proxy showing an explicit output ceiling on initial, tool, retry, and auxiliary requests.
- Focused contract and integration tests for route selection, fallback policy, atomic budget reservation, error mapping, evidence rejection, and permission-scoped MCP tools.
- A staged question and recommendation per supported Plinth profile, with request ID → job → snapshot → runtime attempt → validator → saved result → UI trace.
- A 24-hour staged soak with background triggers enabled gradually, no unexplained status-less failures, bounded retries, and recorded cost per run.
- A branding scan of product strings and notifications, plus a license/dependency review for technical names that must remain private.

## Open decisions before implementation

The implementation team should choose and record one near-term cap mechanism (tested proxy/adapter recommended), the development model and account limit, the output ceiling proven by Plinth's evaluation set, and the retention period for conversations. These are configuration and architecture choices for Plinth; the comparison ERP's modules and defaults are not acceptance criteria.
