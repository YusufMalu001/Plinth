# Synergy Intelligence Control Plane Implementation

## Delivered scope

The repository contains the durable control-plane foundation and five initial operational advisors plus an executive advisor:

- certified deterministic metric snapshots for sales, inventory, procurement, production, fulfillment, and executive rollups;
- transactional inventory event outbox and an idempotent PostgreSQL job worker;
- strict structured recommendation and question-answer contracts;
- exact evidence/impact validation and action catalogues;
- effective-dated business objective policies and hard quality thresholds;
- immutable run, snapshot, recommendation, decision, task activity, and outcome records;
- module-scoped RBAC, reviewer decisions, required task ownership/due dates, audit records, and deduplicated notifications;
- read-only profile-specific MCP tools backed by service-principal credentials;
- separate private runtime profiles and OpenRouter model routing;
- Decision Center pages, module recommendation panels, certified analytics, tasks, outcomes, audit history, objectives, and evidence-linked business questions;
- independent kill switches, profile pause controls, timeouts, concurrency caps, token-cost accounting, and monthly provider budget enforcement.

This code is deployable infrastructure, not permission to enable production recommendations. The activation gates in the operations runbook are mandatory.

## Data flow

1. An ERP inventory posting and a minimal `DomainEventOutbox` record commit together.
2. The worker claims pending events with row locks and creates module jobs using unique idempotency keys.
3. A job captures an immutable `BusinessSnapshot` and its `MetricSnapshot` rows.
4. The module profile receives the certified snapshot, deterministic opportunities, current objective policy, and output contract.
5. The runtime may call only the read tools granted to that profile.
6. Daily and weekly executive jobs wait for the corresponding module jobs, receive their validated structured summaries as context, and link the child runs through `parentRunId`.
7. Synergy parses and validates the final JSON. Unsupported values, inaccessible evidence, unsafe actions, stale data, or weak cost coverage are rejected.
8. Accepted output becomes an append-only recommendation and, when enabled, an urgent alert or grouped review digest.
9. An authorized reviewer accepts, dismisses, or defers it. Acceptance atomically creates one assigned task.
10. The owner records progress/completion. A realized outcome may be recorded against the original expected metric.

## Persistence

Migration `20260925120000_intelligence_control_plane` adds:

- `service_principals` and `service_principal_grants`;
- `domain_event_outbox` and `intelligence_jobs`;
- `business_snapshots` and `metric_snapshots`;
- `intelligence_runs`;
- `recommendations`, `recommendation_decisions`, and `recommendation_outcomes`;
- `business_tasks` and `business_task_activities`;
- `business_objective_policies`;
- `intelligence_control_state` for global, schedule, event-trigger, profile, and notification pause controls;
- notification metadata, priority, expiry, and deduplication fields.

Snapshots and histories are append-only by application policy. Unique event, run, recommendation, notification, and task keys prevent duplicates during retries and concurrent reviews.

## Public API

All routes are under `/api/v1/intelligence` and require normal user authentication:

- `GET /overview`
- `GET /recommendations`
- `GET /recommendations/:id`
- `POST /recommendations/:id/accept`
- `POST /recommendations/:id/dismiss`
- `POST /recommendations/:id/defer`
- `POST /recommendations/:id/refresh`
- `GET /tasks`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `POST /tasks/:id/complete`
- `GET /assignees`
- `GET /objectives`
- `PUT /objectives`
- `GET /runs`
- `GET /runs/:id`
- `POST /questions`
- `GET /questions/:runId/events`

Task-owner checks are enforced in the service, so an assigned employee can manage their own work without gaining module-wide visibility. Assignment and cross-owner updates require their separate permissions.

The private MCP transport is `/api/v1/internal/intelligence/mcp`. It accepts only profile service credentials and exposes no write tool.

## Permissions

The RBAC seed defines:

- `view:ExecutiveIntelligence`
- `view:ModuleIntelligence`
- `review:Recommendation`
- `accept:Recommendation`
- `dismiss:Recommendation`
- `manage:IntelligencePolicy`
- `view:IntelligenceAudit`
- `create:BusinessTask`
- `assign:BusinessTask`
- `update:BusinessTask`
- `view:BusinessTask`

Administrators retain human authority. The executive role has enterprise visibility. Operational managers are filtered to their department/module; task owners may see only their own tasks unless separately granted wider access. Service principals never enter this user authorization path.

## Certified metric boundary

Metric calculations live in `certified-metrics.service.ts`. They use Prisma queries and decimal-safe database values. The output records version, period, source references, units, source timestamp, freshness, and cost coverage. The initial sales margin uses actual outbound inventory ledger cost and recorded freight. When required costs are missing, the output remains explicitly named known contribution margin and its coverage score prevents unsupported profit claims.

The sales dispatch/return/POS paths now post inventory through the common inventory posting service. Outbound cost defaults to the locked average inventory cost and dispatch consumes the reservation. This removes the legacy use of selling price as inventory cost for new postings.

## Product experience

The neutral `/decision-center` experience provides executive overview, recommendations, tasks, realized impact, audit history, objective guardrails, runtime state, and evidence-linked read-only questions. Sales, inventory, procurement, production, and dispatch overview pages show their three highest current scoped recommendations. No browser call goes to the model gateway or runtime.

## Explicit exclusions

- automatic pricing, supplier commitment, PO issue, stock adjustment, order cancellation, production release, dispatch, or financial posting;
- direct database access by the runtime;
- acquisition optimization without CRM/lead/traffic data;
- net-profit claims without certified full cost coverage;
- email, SMS, and WhatsApp delivery;
- model-authored forecasts or financial calculations;
- autonomous memory, self-modifying prompts/skills, or native delegated workflows.
