# Intelligence event operations

Intelligence event publishers write compact version 1 records to the existing
`DomainEventOutbox` in the same database transaction as the business change.
Legacy callers that pass the root Prisma client are wrapped in a transaction
by the inventory posting primitive before it writes the ledger or event.
The outbox correlation ID preserves the originating request ID when supplied;
the outbox service creates one only for sources without a request correlation.
Event keys identify the persisted source transition and remain stable during
worker retries.

The worker validates the versioned envelope and event-specific payload allowlist
before fan-out. Unknown types, unsupported versions, and malformed or unsafe
payloads go directly to dead letter and do not create jobs. Known historic
outbox names (`FULFILLMENT_DISPATCHED` and the inventory movement aliases) are
explicit compatibility aliases. The worker normalizes their bounded safe
fields into the version 1 payload before forwarding them. New fulfillment
publishing uses `SHIPMENT_DISPATCHED`; the existing sales integration outbox
event `FULFILLMENT_DISPATCHED` remains unchanged and is not a competing
intelligence event.

Fan-out uses a unique job key per outbox event and module. Event failures retry
with bounded exponential delays and dead-letter after ten attempts. A worker
restart recovers claims older than five minutes. Users with both
`view:IntelligenceAudit` and `manage:IntelligencePolicy` can inspect dead-letter
metadata and explicitly replay a valid version 1 event. Replay resets the
outbox row and writes the audit record in the same transaction; it does not
change the event ID, so downstream job uniqueness prevents duplicate work.
Legacy or invalid rows must be reconciled before replay and cannot use this
endpoint.

The event worker and delayed-fulfillment scan run only when the existing global
intelligence and event-trigger controls permit them. Provider, schedules,
notifications, cases, scenarios, conversations, and delegation remain off by
default. Downstream worker/provider failures occur asynchronously and cannot
fail the originating ERP transaction. An outbox write is protected by a
PostgreSQL savepoint: if that intelligence-only statement fails, it rolls back
to the savepoint and logs a safe error while preserving the ERP transaction.
Such a failure can result in an ERP change without an intelligence event; fatal
connection or transaction failures can still abort the ERP transaction.
