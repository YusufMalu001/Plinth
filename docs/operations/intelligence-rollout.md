# Intelligence Control Plane Operations and Rollout

## Prerequisites

- Node.js 22.x, npm 9+, Docker Engine with Compose v2, and PostgreSQL 16.
- A reviewed OpenRouter Enterprise agreement covering zero training, retention, regional processing, approved downstream providers/models, incident response, and data deletion.
- Six independent runtime API keys and six independent MCP tokens stored in the deployment secret manager. Each MCP token must use `<profile-key>.<at-least-32-random-characters>`.
- Network policy allowing each runtime to reach only the approved model gateway and the private Plinth API MCP address. Docker Compose does not itself provide a domain egress firewall.
- Finance and operations owners for metric reconciliation and recommendation evaluation.

The upstream runtime repository does not need to be cloned. Compose pulls the digest-pinned image recorded in ADR-007. Mirror that exact digest into the company registry for supply-chain control before production.

## Prepare a deployment

1. Copy `.env.example` into the secret/environment system. Generate all runtime and MCP credentials independently. Do not reuse user JWTs, database passwords, or one profile's key for another.
2. Keep the rollout switches at their safe defaults:

   ```dotenv
   INTELLIGENCE_ENABLED=false
   INTELLIGENCE_PROVIDER_ENABLED=false
   INTELLIGENCE_SHADOW_MODE=true
   INTELLIGENCE_EVENT_TRIGGERS_ENABLED=false
   INTELLIGENCE_SCHEDULES_ENABLED=false
   INTELLIGENCE_NOTIFICATIONS_ENABLED=false
   ```

3. Review model IDs and input/output token prices against the approved OpenRouter routes. Incorrect price configuration affects the local budget estimate; the provider's independent hard spend limit is also required.
4. Apply migration and permissions through the normal release pipeline:

   ```bash
   npm run db:deploy
   npm run db:seed-rbac
   ```

5. Build and validate the application, then start the optional profile:

   ```bash
   npm run typecheck
   npm run test
   docker compose --profile intelligence config --quiet
   docker compose --profile intelligence up -d --build
   ```

6. Verify the configured image digest against the approved SBOM/signature process. Never replace it with `latest`.

## Staged activation

Enable one control at a time; every change requires a recorded change request.

1. Set `INTELLIGENCE_ENABLED=true` while keeping provider calls off. Verify worker health, service-principal reconciliation, permissions, and Decision Center empty/disabled states.
2. Set `INTELLIGENCE_PROVIDER_ENABLED=true` and run manually in staging. Confirm raw prompts/tool payloads are absent from logs and the provider dashboard uses only approved routes.
3. Enable schedules in shadow mode. Keep notifications and event triggers off. Reconcile every certified metric to its source transaction and run the golden evaluation suite.
4. Enable event triggers in shadow mode. Verify an ERP transaction succeeds when the runtime is stopped and that duplicate events create neither duplicate recommendations nor tasks.
5. Run shadow mode for at least 30 calendar days. Finance and operations sample evidence, false positives, impact ranges, workload, and omissions weekly.
6. After written sign-off, expose the Decision Center to selected executives. Keep notifications off.
7. Set `INTELLIGENCE_SHADOW_MODE=false`, then enable notifications one module at a time: inventory/procurement, sales, production, fulfillment. Do not enable a module whose certified metric gate has not passed.

## Activation gates

- 100% financial reconciliation within declared rounding rules for the enabled metrics.
- No unauthorized tool or data access in the isolation tests.
- No duplicate task or notification in concurrency/retry tests.
- At least 99% schema-valid completed staging runs on the approved evaluation set.
- Urgent event recommendation within two minutes and daily review within ten minutes when dependencies are healthy.
- Every recommendation shows evidence timestamp, confidence, assumptions, expiry, quality, and cost coverage.
- Provider account and Plinth hard budgets are active and tested.
- Backup restoration includes all control-plane tables and audit relationships.

## Schedules and notifications

The worker evaluates time in `Asia/Kolkata`. Daily module/executive jobs become eligible at 07:00; the Monday weekly module jobs and executive strategic job become eligible at 08:00, with the executive run waiting for validated module summaries. Idempotency keys ensure one scheduled job per business date/module. Event-driven high/critical findings alert scoped reviewers immediately. Scheduled findings are grouped into one module digest. Overdue tasks notify the owner and originating reviewer once per day.

## Monitoring

Phase 0 adds `GET /api/v1/intelligence/health`, audit-only `GET /api/v1/intelligence/provider-attempts`, and audit/policy-only `POST /api/v1/intelligence/model-checks` with a JSON body containing one exact approved model slug. Run model checks only with the approved account; each check performs authenticated key, catalog, endpoint, basic generation, structured-output, and tool-call probes and records safe metadata. These direct probes do not prove that Hermes made an OpenRouter request. A real Business Question run must separately show API request ID, job, worker, Hermes attempt, validation, database persistence, and UI result. The provider HTTP status, generation ID, and underlying provider remain **NOT VERIFIED** when the pinned runtime does not expose them. Do not substitute the Hermes run ID for an OpenRouter generation ID.

Alert on dead-letter events/jobs, repeated rejected output, provider timeouts/rate limits, runtime health failure, stale snapshots, runs above the latency SLO, cost approaching 70/90/100% of the monthly ceiling, and unusual recommendation or notification volume. Correlate using `correlationId` from event through outcome. Logs may contain identifiers, status, duration, model, token count, cost, and redacted error codes—not secrets, raw prompts, sensitive tool responses, or hidden reasoning.

## Incident controls and rollback

- Global stop: `INTELLIGENCE_ENABLED=false`.
- Provider stop: `INTELLIGENCE_PROVIDER_ENABLED=false`.
- Trigger stops: turn schedules/events off independently.
- Notification stop: `INTELLIGENCE_NOTIFICATIONS_ENABLED=false`.
- Profile stop: add its key to `INTELLIGENCE_DISABLED_PROFILES`.
- Runtime stop: scale the affected container to zero after disabling its profile.

Stopping this subsystem does not roll back or block ERP transactions. Existing recommendations/tasks remain auditable and usable. Do not delete their history during rollback. Resume only after resolving and documenting the incident, rotating exposed credentials, and replaying the affected evaluation cases.

## Known rollout dependencies

Before live use, deployment engineering still must provide the enterprise provider account, secret-manager values, private registry/SBOM controls, domain-level egress enforcement, dashboards/alerts, staging runtime smoke tests, 30-day shadow evidence, and finance/operations approval. These are external operational controls and are intentionally not represented as completed by the source-code implementation.
