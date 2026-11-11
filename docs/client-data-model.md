# Client workbook data model

Source workbooks reviewed from `/home/fardeen/Downloads`:

- Product/order labels: `MRP PROJECT.xlsm` (Input, Label, Masters, Settings)
- Production schedules and material issues: the `PS - ...` workbooks for CS3–CS12, Regular, Rods Cutting, Laser Economy and Laser Glider
- Material/stock controls: `ABS MATERIAL REPORT.xlsx`, `FLOOR AUDIT NEW.xlsm`, `DAILY STOCK AUDIT - RAW.xlsm`, and `StkSum_SKU_Cleaned.xlsx`

## Canonical modules and fields

### Product catalogue

The `MRP PROJECT/Masters` sheet establishes the product identity fields:

- SKU (canonical key), ASIN, item name, MRP, warehouse ID, warehouse address
- product family/model (CS3, CS6, CS8, CS9, CS10, CS11, CS12, Economy, Glider, Regular)
- sellable label/sticker type and printer routing from `MRP PROJECT/Input`

These map to `Product`/`ProductVariant` with SKU uniqueness. MRP, ASIN, warehouse routing and label metadata belong in typed product fields (not free-form UI-only values).

### Materials and inventory

Material issue sheets consistently use `PARTICULARS`, `QUANTITY`, `UNIT`, `SPECS`, `REMARKS`, with material-specific dimensions such as pipe section, wall thickness, length, sheet thickness, rope diameter and masterbatch colour. The ABS report adds inward/outward quantity, rate, party, date and material-balance columns. Daily stock and floor audit add opening, returns, outward/projection, manufacturing journal, system closing, physical closing and variance.

These map to:

- `Material`: code, name, material type, specification JSON, UOM, reorder threshold and active status
- stock ledger: receipt, issue, return, adjustment and audit count events
- inventory balance: calculated on-hand, reserved, available, reorder state and variance
- vendor receipt: party, receipt date, rate and quantity received

### Production and MRP

Production schedule sheets contain PS ID, date, in-charge, product/model, operation stage (laser, buffing, tube bending, rod cutting, assembly), planned quantity, completed quantity and status. `PS_Log` provides a durable PS ID sequence (`UniqueCode`, `YearMonth`, `Seq`, `PS_ID`, `Date`, `SheetName`).

Material issue sheets are the component-consumption side of the same production order. They should be represented as a production order with operation steps and a material issue transaction, rather than separate disconnected forms.

### Procurement

Purchase requisitions must reference a material/product, quantity, UOM, required date, department, requester, specification, cost centre and justification. The current approval workflow remains Store Manager → Admin, with automatic PO generation after final approval.

### Audit and controls

Floor audit and daily stock audit require immutable snapshots: counted by, counted at, opening balance, system balance, physical balance, variance, reason and approval. These records must never be overwritten when a later count is entered.

## Import rules

1. Import into staging first; never write workbook rows directly into live master data.
2. Normalize headers, trim text, preserve source workbook/sheet/row references, and reject ambiguous SKU/material matches.
3. Deduplicate by SKU/material code/PS ID and show conflicts before commit.
4. Convert formulas to evaluated values for import; retain the original formula and source cell in staging for audit.
5. Commit in dependency order: UOM → categories/families → materials/products → vendors → BOM/routes → opening stock → production history → procurement history.
6. Existing users/RBAC and system configuration are not part of the client-data import.

## Open data decisions before commit

- Confirm the authoritative SKU list when the same product appears in multiple workbook masters.
- Confirm whether MRP is current selling price or historical price.
- Confirm warehouse IDs and the mapping to Plinth locations.
- Confirm whether historical PS logs and audits should be imported as history or only used to seed opening balances.
- Confirm the canonical material code for dimension-only descriptions such as `18x18`, `16x16`, and `1/2 x 0.6mm`.
