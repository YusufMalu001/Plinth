# Sales and Orders to Accounts AR

## Current flow

Sales and Fulfillment remain operational systems. Shipment handover creates one invoice draft per shipment, POS checkout creates an invoice draft and receipt candidate, and payment/return actions produce durable Accounts outbox events. Amazon order import remains an order import; its operational payment state is `PENDING` until settlement evidence is recorded.

Accounts owns the invoice review and posting lifecycle, receipt verification and allocation, posted customer balances, credit-note approval, and marketplace settlement posting. Drafts do not post a journal. Official invoice numbers are allocated at posting from the configured fiscal-year sequence. Invoice posting requires entity mappings for AR (or marketplace clearing), revenue, and applicable output tax. Posting writes journal lines and the Accounts document status in a database transaction.

Sales and Orders does not expose payment capture or payment marking. POS checkout creates only the sale and invoice draft; it does not mark the order paid or create a receipt. The Accounts receipt form selects a posted invoice with an open balance and links the recorded receipt to that invoice. A partial collection is allowed; the amount cannot exceed the invoice's current available balance. Receipts are verified and posted from Accounts. The previous `/finance/payments` Sales page redirects to the Accounts payment register.

## API surface

Mounted below `/api/v1/accounts`:

- `GET /ar/invoices`, `GET /ar/invoices/:id`, `POST /ar/invoices/:id/{submit,approve,post}`
- `GET/PUT /ar/mappings`
- `GET/POST /ar/receipts`, `POST /ar/receipts/:id/{verify,allocate,post}`
- `GET /ar/credit-notes`, `POST /ar/credit-notes/:id/{submit,approve,post}`
- `GET /ar/aging`, `GET /ar/customers/:customerId/ledger`
- `GET/POST /marketplace/batches`, `POST /marketplace/batches/:id/{match,post}`
- `GET /ar/events/failed`, `POST /ar/events/:id/retry`

The routes use Accounts authentication, permission checks, and audit events. Invoice posting enforces maker-checker separation; a second user must approve a submitted document. Allocations are restricted to posted invoices for the same customer and entity and cannot exceed the open invoice or receipt amount.

## Mapping keys and release controls

Configure the following per legal entity before posting: `AR_CONTROL`, `SALES_REVENUE`, `OUTPUT_GST` when tax is charged, `CUSTOMER_ADVANCES`, `CASH_CLEARING`, `MARKETPLACE_CLEARING`, `MARKETPLACE_FEES`, `GST_TCS`, and `INCOME_TDS`. GST TCS and income-tax TDS have separate mappings. Do not enable tax mapping or document rules until Finance/tax approves them. The implemented workflow supports INR only.

Shipment event retries use unique source keys so replay cannot create a second invoice for a shipment. Payment capture requires an `Idempotency-Key`; a repeated key with different payment content is rejected. Failed events remain visible for retry and block period close.

## Known release gaps

- Marketplace capture currently records verified batch totals and a bank reference; it does not parse order-level marketplace settlement files or automatically prove each invoice's proceeds/fees/refunds.
- A return candidate currently requires a single posted source invoice. Splitting one return across multiple invoices is not supported.
- Operational return refunds are not yet posted through a distinct approved Accounts refund journal workflow. Do not treat an operational negative payment row as an Accounts refund.
- Opening customer AR and advances must be imported as signed, reconciled balances at the Finance-approved cutover date. Do not replay historical Sales orders as new revenue.
- Inventory and COGS postings remain gated on the separate inventory valuation reconciliation. Tally remains authoritative until Finance/tax sign-off after two reconciled month ends.

## Verification

Run `npm run typecheck --workspace=@synergy/api`, `npm run typecheck --workspace=@synergy/web`, and `npx prisma validate --schema=database/prisma/schema.prisma`. Apply the migration in a non-production environment, then run the Sales and Accounts integration suites before enabling posting in production.
# Sales pro forma lifecycle

Every newly created Sales order gets one persisted pro forma (`PF-<sales order number>`) in the Accounts pro forma register and Sales order documents panel. It snapshots the order's customer, GSTIN, currency, lines, quantities, prices, discounts and tax estimates. Before dispatch, Finance can edit quoted prices, discounts and estimated tax rates in Accounts; line membership and quantities stay sourced from Sales, so inventory allocation remains tied to the order. Sales order edits refresh the snapshot. The first Sales or Fulfillment dispatch locks the pro forma as `LOCKED` (shown as dispatched in the Accounts register).

Pro formas are commercial documents only: they do not create AR open items, receipts, tax invoices, or journal entries. Dispatch continues to create the separate Accounts tax invoice draft based on shipped quantities, using the pro forma's approved quoted price, discount and tax rate for each shipped order line. The pro forma table is included in the Accounts Sales AR migration.
