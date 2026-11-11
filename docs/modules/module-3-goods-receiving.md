# Module 3 — Goods Receiving / GRN

## Purpose

Module 3 converts a physical incoming shipment into one verified, traceable receipt and one exactly-once inventory effect. It sits between Procurement expected receipts and the Module 4 stock ledger.

## End-to-end operating workflow

1. Procurement issues a purchase order and creates expected receipt rows.
2. A GRN clerk opens the Expected Queue and registers an arrival against receivable PO lines. Controlled unreferenced receipt is supported only with an approved vendor, exact item/UOM lines, a receiving location, and a mandatory justification.
3. The system creates an idempotent `ARRIVED` GRN and notifies location-eligible verifiers.
4. A verifier records append-only weight, piece, bundle, or packet readings and classifies accepted, rejected, and damaged quantity.
5. The service calculates shortage/excess and creates explicit discrepancy cases. Reviewers receive an actionable workflow notification.
6. Each discrepancy is resolved as an authorized return-to-vendor or an accept-into-stock override with evidence/justification. Shortage and damage are flagged for future Finance debit-note validation; no unapproved monetary amount is invented.
7. When every line is verified, the system assigns one immutable label identity per line, records every reprint, marks the GRN `VERIFIED`, and notifies sign-off authorities.
8. A distinct supervisor signs off. A distinct finalization capability then posts accepted quantities.
9. Finalization executes under one database transaction with a conditional status guard. It writes at most one `StockLedgerEntry` per GRN line, synchronizes Expected Receipt and PO status, audits the event, and notifies the operational participants.

## Workflow states and gates

- `ARRIVED`: registered but not physically classified.
- `UNDER_VERIFICATION`: at least one line is being checked.
- `DISCREPANCY_PENDING`: unresolved shortage, excess, or damage blocks sign-off.
- `VERIFIED`: all lines classified, discrepancies resolved, and labels assigned.
- `SIGNED_OFF`: supervisor approval recorded; receipt is read-only.
- `FINALIZED`: accepted stock is posted exactly once; the GRN is immutable.

Finalization requires a signed-off GRN, valid PO-line linkage unless explicitly unreferenced, a label on every line, no unresolved discrepancy, and `received = accepted + rejected + damaged` for every line.

## Real data captured

- Header: GRN number, PO, vendor, unreferenced flag/justification, receiving location, idempotency key, receiver, verifier, sign-off actor, finalizer, and timestamps.
- Line: exact product/material identity, UOM, expected/received/accepted/rejected/damaged/short/excess quantity, PO-line link, and status.
- Measurement: type, raw value, unit label, note, measuring actor, and timestamp. Measurements are append-only.
- Discrepancy: type, quantity, state, resolution, evidence/justification, resolving actor, debit-note validation flag, and timestamps.
- Label: immutable label code, generation time, and append-only print/reprint events.
- Documents: invoice/supporting PDF, PNG, or JPEG up to 10 MB with uploader and timestamp.
- Inventory handoff: item, UOM, location, accepted quantity, poster, time, source GRN, and unique GRN-line identity.

## RBAC and scope

The API is authoritative. The web client obtains server-derived capabilities so it does not expose actions that will be rejected.

- `receive:GoodsReceiptNote`: register PO and unreferenced arrivals.
- `read:GoodsReceiptNote`: dashboard, register, detail, and history.
- `update:GoodsReceiptNote`: edit an open receipt.
- `verify:GoodsReceiptNote`: record physical checks and classification.
- `resolve_discrepancy:GoodsReceiptDiscrepancy`: accept an authorized variance.
- `return:GoodsReceiptDiscrepancy`: authorize physical return to vendor; deliberately separate from generic resolution.
- `update:GoodsReceiptLabel`: print/reprint a persistent label identity.
- `upload_document:GoodsReceiptNote`: attach receiving evidence.
- `sign_off:GoodsReceiptNote`: supervisory sign-off.
- `finalize:GoodsReceiptNote`: exactly-once stock posting.
- `export:GoodsReceiptNote`: location-scoped CSV register export.

Every list, dashboard, detail, history, discrepancy, document, and mutation path enforces the actor's assigned location. Roles with `allLocations` and administrators can operate across stores. The Access Control screen can assign users to roles and edit the complete GRN permission catalogue.

## Notifications

Notifications are persisted in the shared workflow inbox and linked directly to the relevant GRN. Recipients are resolved from live permissions and location scope, not hard-coded display names.

- Arrival → users able to verify.
- Unreferenced arrival → users able to verify, highlighted as approval-required.
- New discrepancy → users able to resolve discrepancies.
- Fully verified → users able to sign off.
- Signed off → users able to finalize.
- Finalized → receiver, verifier, and sign-off participants.

Notification failure is isolated from an already-committed physical workflow action so a transient inbox issue cannot encourage a duplicate receipt or finalization retry.

## UI surfaces

- Receiving Control Center: scoped operational metrics, governed workflow, personalized oldest-first action queue, and recent stock postings.
- Expected Queue: date-grouped incoming PO lines with overdue emphasis and direct receiving handoff.
- GRN Register: search, state filters, pagination, CSV export, source/vendor/location context, and drill-down.
- New Receipt: separate PO and controlled-exception flows with idempotent submission.
- Receiving Workspace: workflow stepper, three-way quantities, touch-friendly physical inputs, append-only history, labels, discrepancies, attachments, sign-off, finalization, and inventory outcome.
- Access Control: user activation, role assignment, custom roles, and editable capability grants.

## Validation still requiring a business/environment decision

- V-008: Finance must confirm debit-note accounting and amount calculation before accounting posting is added.
- V-013: Owners must approve UOM/pack conversion rules; raw measurement unit labels remain verbatim until then.
- Supabase document upload requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Live Postgres integration tests and store-device UAT must run in a provisioned environment before production release.

## Release verification

Run:

```bash
npm run typecheck --workspace=@plinth/api
npm run typecheck --workspace=@plinth/web
npm test --workspace=@plinth/api -- --runInBand src/modules/goods-receipt
npm test --workspace=@plinth/web
```

Live-database release validation must additionally cover cross-location reads, concurrent finalization, high-line-count receiving, notification recipient scope, PO/Expected Receipt synchronization, and exactly-once ledger posting.
