# ADR-007: Synergy Intelligence Control Plane

- Status: accepted for staged rollout
- Date: 2026-09-25
- Owners: platform engineering, finance, operations, security

## Context

Synergy needs evidence-backed operational recommendations across sales, inventory, procurement, production, and fulfillment. ERP transactions must remain deterministic, auditable, permission-scoped, and available when the model provider is unavailable. Financial figures produced by a language model are not an acceptable source of truth.

## Decision

Synergy owns a vendor-neutral intelligence control plane in the existing Express modular monolith and PostgreSQL database. A separate worker captures immutable certified snapshots, invokes isolated read-only advisor profiles, validates their structured output, and persists approved recommendations. The web application talks only to Synergy APIs.

The model runtime is supplied by the MIT-licensed `NousResearch/hermes-agent` project. It is consumed as a private, digest-pinned container image rather than cloned or vendored into this repository. The upstream name is restricted to this compliance record, dependency inventories, deployment source, and SBOM/license notices; product routes, UI, records, notifications, and generated content use neutral Synergy terminology.

Six isolated runtime containers are used: executive, sales, inventory, procurement, production, and fulfillment. Each container has its own runtime key, MCP credential, configuration volume, tool allowlist, and internal URL. OpenRouter Enterprise is the initial model gateway after contractual approval of retention, training, and downstream routing terms.

## Trust boundary

The runtime receives no database credential, end-user JWT, terminal, filesystem, browser, arbitrary HTTP, email, messaging, autonomous memory, skill creation, or delegated-agent capability. It can call only the internal Streamable HTTP MCP endpoint with a profile credential. That endpoint offers allowlisted, length-limited read tools over certified snapshots and PII-minimized evidence.

Language-model output is untrusted. Synergy validates the complete JSON contract, action code, opportunity identity, evidence values and timestamps, impact ranges, data quality, cost coverage, dates, permissions, and policy guardrails before persistence. Hidden reasoning and raw sensitive tool payloads are not stored.

No operational mutation is exposed as an MCP tool. A recommendation can create exactly one task only after an authorized person accepts it, chooses an owner, and supplies a due date. Any later purchase, pricing, stock, sales, production, dispatch, or finance change still follows its existing ERP workflow and approval controls.

## Data and orchestration ownership

PostgreSQL is the sole durable system of record. Domain transactions emit minimal outbox events in the same transaction. Workers claim outbox rows and jobs with `FOR UPDATE SKIP LOCKED`, use idempotency keys, apply bounded retries/dead-letter states, and correlate event, job, run, snapshot, recommendation, decision, task, and outcome.

The platform orchestrates module analysis and executive prioritization. Native runtime delegation is not used because durable workflow state belongs in Synergy. Forecasting, financial arithmetic, and optimization remain deterministic application services; the model explains and prioritizes only values supplied in the certified snapshot.

## Financial terminology

The initial release reports booked sales, dispatched net revenue, delivered net revenue, collections, actual inventory-ledger COGS, and **known contribution margin**. It does not claim net profit. GST is excluded from revenue. Recorded discounts and outbound freight are included; absent labour, overhead, commission, marketplace fee, packaging, or return data reduces coverage and is disclosed. Recommendations are rejected below configured coverage and freshness thresholds.

## Runtime and failure behavior

The dependency is pinned to release `v2026.9.14` and multi-platform digest `sha256:99641e57ec762c59e54cb44aa6746b7fc68c18b3c5ddb088af54234c613d9294`. Containers are internal-only, read-only, non-root, capability-restricted, resource-limited, and have no Docker socket. Network egress must additionally be restricted by the deployment environment to the approved provider and private Synergy endpoint.

Provider or runtime failure never blocks an ERP transaction. It fails or retries an intelligence job. Kill switches exist globally and independently for provider calls, schedules, events, notifications, and profiles. Default configuration is disabled, shadow mode, with all triggers and notifications off.

## Consequences

- Recommendations remain reproducible and traceable to immutable business evidence.
- The runtime and model gateway can be replaced without changing the public product contract.
- The system incurs worker, model, evaluation, and governance operating costs.
- Safe production activation requires migrations, RBAC seeding, enterprise provider approval, egress policy, staging evaluation, and business sign-off.
- Fully autonomous operational execution remains outside this decision.

