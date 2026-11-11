# CS8 workbook master-data mapping

Source: `PS - CS8.xlsm` supplied by the client.

This workbook is a production-schedule and material-issue workbook. It is not a purchase requisition or purchase order template. The seed uses only values that are explicitly present in the workbook and does not invent vendor, price, tax, payment, or approval values.

## Imported master data

- `MASTERS`: store, production, laser, tube-bending, pipe-cutting, and buffing incharge names.
- `CS8 - Master`, `CS8 - Laser*`, `CS8 - Top Rod*`, `Laser - Single`, `CS8 - BUFFING`, `CS8 - Tube Bending`, and `CS8 - Rods Cutting*`: CS8 product/component names and production descriptions.
- `Material - *`, `Mat - Tube Bend`, and `Assembly`: raw-material and hardware descriptions used by the process.
- `PS_Log`: production schedule codes and historical sequence format. These codes are operational schedule identifiers, not product SKUs.

## Plinth master-data mapping

- CS8 finished/semi-finished components are seeded as approved `Product` records (`PROD-001` through `PROD-013`) in family `FAM-CS8` and category `CAT-CS8`.
- Pipes, bolts, nuts, screws, and other consumables remain `Material` records, because the workbook identifies them as material issues.
- Count-based workbook quantities (`Nos.`, `Pipes`, and pieces) use the existing `PCS` UOM. Weight measurements remain process/specification values and are not silently converted into procurement quantities.
- The six organizational departments remain linked to the main factory. Their incharge names come from `MASTERS` and are retained in the department display names until the client supplies employee IDs and contact details.

## Not imported yet

The workbook has no PR/PO sheets, so no exact PR/PO print format or vendor master can be derived from it. Add the client PR and PO templates before changing procurement document layout, numbering, pricing, tax, payment terms, transmission, or vendor fields.

