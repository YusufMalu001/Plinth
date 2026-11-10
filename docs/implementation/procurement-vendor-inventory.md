# Procurement, Vendor, Receiving and Inventory implementation

This release adds the production workflow foundations described in the Synergy implementation plan. Stable PR/PO/GRN identifiers are retained; editable PR drafts are preserved with `purchase_requisition_revisions` snapshots.

## Delivered vertical slices

- Vendor control centre at `/vendors`, with server-side directory filtering, governed lifecycle data, operational profile metrics, order/receipt history, evaluation and scorecard APIs. `/inventory/vendors` redirects to the new UI.
- Revision snapshots are written before PR edits and can be queried at `GET /api/v1/purchases/requisitions/:id/revisions`. The existing Admin approval transaction remains the only path that creates the approved PO.
- `POST /api/v1/purchases/requisitions/:id/vendor-recommendations` returns an advisory deterministic shortlist. OpenRouter/Gemini can enrich explanations, but never changes eligibility, scores, or approval decisions.
- `POST /api/v1/purchases/requisitions/:id/vendor-selection` records the selected eligible vendor and requires an audited override reason when the selection is outside the latest shortlist. Recommendation runs/candidates are persisted for review.
- Receipt documents are SHA-256 checked and can queue an asynchronous OCR job at `POST /api/v1/goods-receipts/:id/documents/:documentId/extract`. Provider failures and missing configuration become `NEEDS_REVIEW`; corrections are explicit via `PATCH /api/v1/goods-receipts/ocr/:jobId`.
- Debit notes are finance-ready records created from recorded GRN discrepancies at `/api/v1/debit-notes/from-grn/:grnId`. Amounts use PO line price/tax data and are never inferred by AI.
- Inventory inquiry endpoints expose dashboard, balances, and immutable ledger entries. Once the additive ledger migration is present, GRN finalization and the guided movement endpoint post idempotent entries with quantity/cost before and after and moving weighted-average cost. The shared `InventoryPostingService` is also used by compatibility issue/reservation commands, enforcing row locks, available-stock checks, and retry-safe idempotency.
- The modern inventory read path now hydrates polymorphic ledger rows with Product/Material, UOM, and warehouse references; `/inventory/items` provides item-level aggregates and Product/Material profiles consume live balances and ledger movements without demo fallbacks. Migration `20260906000000_add_inventory_traceability_replenishment` adds configurable lot/expiry metadata and governed replenishment policies/events. Every posted inventory movement asynchronously checks configured reorder/safety thresholds. At or below threshold, Hermes ranks active item/category-capable vendors using the supplier scorecard, uses 90-day issue history plus lead time and safety stock to estimate an order quantity, then creates a `DRAFT` PO only when an eligible vendor and usable cost are available. Admins and store managers receive a PO or manual-review notification. Draft POs are never auto-approved or sent; repeated movements are deduplicated until stock recovers above threshold. Legacy stock issue/transfer flows use the same draft-only behavior.
- `/api/v1/events/stream` provides scoped SSE notifications with reconnect hints; clients receive resource IDs and refetch through authorized REST endpoints.

## Deployment sequence

1. Apply `database/prisma/migrations/20260901000000_procurement_intelligence_inventory`.
2. Apply `database/prisma/migrations/20260906000000_add_inventory_traceability_replenishment`, then run `prisma generate` for the additive lot/replenishment models.
3. Run the RBAC seed (or `ensurePermissionCatalogue`) so VendorEvaluation, DebitNote, StockLedgerEntry, and scorecard permissions exist.
4. Configure `OPENROUTER_API_KEY` and server-only model/timeout/budget values. Leaving the key empty intentionally routes OCR and recommendation work to manual review/deterministic ranking.
5. Run API/web typechecks and the procurement/receiving unit suites before enabling the new vendor route in production.

The database migration is additive and leaves historical compatibility `StockLedgerEntry` rows read-only for reconciliation and cutover; new receipts use the authoritative modern ledger whenever it is available. External vendor transmission and accounting/Tally posting remain outside this release.
