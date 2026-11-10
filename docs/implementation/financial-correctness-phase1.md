# Phase 1 — Financial Correctness

## Financial snapshot rules

Sales financial metrics use shipment lines handed over during the snapshot period. Gross shipped revenue is shipped quantity times stored unit price. Discounts are allocated in proportion to shipped quantity. Completed, dated return credits are subtracted only when an explicit credited net amount is present. Recorded line tax is presented separately as operational tax, never as statutory tax payable.

COGS comes from posted `SALES_SHIPMENT` inventory ledger entries that match the shipment and product, with positive quantity reversals netted against the outbound cost. Gross profit, gross margin, and known contribution margin require complete net cost quantity coverage. Known contribution margin subtracts recorded outbound shipment freight and excludes unrecorded labor, overhead, marketplace fees, commissions, and other costs. It is not net profit.

Non-INR transactions are excluded from INR aggregates. There is no exchange-rate conversion. A legacy returned quantity that does not reconcile to the dated return records makes period net revenue unavailable. Completed returns with missing credited amounts also make net revenue unavailable.

## Provenance and freshness

`MetricSnapshot` stores `provenance`, `freshnessStatus`, and optional `dataQualityScore`. The snapshot carries the period and formula version; each metric retains its source references and currency. Snapshot freshness is calculated from the latest observed source timestamp. Per-metric freshness remains `UNKNOWN` because this pipeline does not yet capture a separate source timestamp for every metric. Existing metric rows default to `UNKNOWN` provenance and freshness. New snapshot JSON carries the same classifications for Hermes. Null metric values mean unavailable and must not be rendered or cited as zero.

## Product pricing analysis

`POST /api/v1/intelligence/product-pricing-analysis` accepts only `productId` and an optional `targetMarginPercent`. It requires `update:PricingMaster`, reads the current approved base BOM and available company-owned inventory average costs, and returns a deterministic estimate with source time and limitations. It does not persist a recommendation or create a synthetic snapshot. Missing BOM, inventory cost, or selling-price metadata returns `UNAVAILABLE`.

Product creation must not submit browser-calculated cost, margin, or target prices to this API. Form previews are illustrative only; missing inputs remain unavailable, and overhead is not assumed.

## Return-credit lifecycle

The existing sales return request creates `SalesFinancialReturn` and detail rows in `REQUESTED` status. Existing return disposition completes the newest open return and records `occurredAt`; a net credit and tax credit are stored only when explicitly supplied. Refund payment remains a separate existing payment record. Return requests without recorded amounts do not become financial credits.

Apply the additive migration `20261001120000_phase1_financial_correctness` using the normal database migration deployment process. It does not backfill legacy returns or upgrade old snapshots; legacy metric provenance remains `UNKNOWN`.
