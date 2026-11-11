const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const dbUrl = process.env.DATABASE_URL || '';
const maskedUrl = dbUrl ? dbUrl.replace(/:([^:@]+)@/, ':****@') : '(default from prisma schema)';
const prisma = new PrismaClient({
  datasources: dbUrl ? { db: { url: dbUrl } } : undefined
});

const apply = process.argv.includes('--apply');
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Target tables in reverse dependency order
const procurementTables = [
  // 1. Goods Receipt details & dependencies
  'grn_payments',
  'goods_receipt_measurements',
  'goods_receipt_discrepancies',
  'goods_receipt_label_print_events',
  'goods_receipt_labels',
  'ocr_extraction_jobs',
  'grn_documents',
  'goods_receipt_lines',
  'goods_receipt_notes',

  // 2. Purchase Order lines, deliveries, logs, PO records
  'expected_receipts',
  'purchase_order_email_deliveries',
  'transmission_logs',
  'purchase_order_lines',
  'purchase_orders',

  // 3. Vendor intelligence, scoring, profiles
  'vendor_contacts',
  'vendor_capabilities',
  'vendor_compliance_documents',
  'vendor_evaluations',
  'vendor_score_snapshots',
  'vendor_scoring_events',
  'vendor_recommendation_candidates',
  'vendor_recommendation_runs',
  'vendors'
];

async function main() {
  console.log('========================================================');
  console.log('       PLINTH ERP - PROCUREMENT & VENDOR RESET         ');
  console.log('========================================================');
  console.log(`Target Database: ${maskedUrl}\n`);

  console.log('1. Current Record Counts for Target Tables:');
  for (const table of procurementTables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "${table}"`);
      const count = result[0]?.count ?? 0;
      console.log(`   - ${table.padEnd(35)}: ${count}`);
    } catch (err) {
      console.log(`   - ${table.padEnd(35)}: (skip/not present: ${err.message})`);
    }
  }

  // Count related dependent rows that will be cleaned / unlinked
  try {
    const prVendorLinked = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "purchase_requisitions" WHERE "preferredVendorId" IS NOT NULL`
    );
    console.log(`   - purchase_requisitions (preferredVendor): ${prVendorLinked[0]?.count ?? 0} (will be unlinked, NOT deleted)`);
  } catch (_) {}

  try {
    const poApprovals = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "procurement_approvals" WHERE "poId" IS NOT NULL`
    );
    console.log(`   - procurement_approvals (PO approvals): ${poApprovals[0]?.count ?? 0}`);
  } catch (_) {}

  try {
    const poDocuments = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "procurement_documents" WHERE "poId" IS NOT NULL`
    );
    console.log(`   - procurement_documents (PO documents): ${poDocuments[0]?.count ?? 0}`);
  } catch (_) {}

  try {
    const grnStockLedger = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "stock_ledger_entries" WHERE "grnId" IS NOT NULL OR "grnLineId" IS NOT NULL`
    );
    console.log(`   - stock_ledger_entries (GRN entries)   : ${grnStockLedger[0]?.count ?? 0}`);
  } catch (_) {}

  if (!apply) {
    console.log('\n--------------------------------------------------------');
    console.log('[DRY-RUN MODE] No changes made to the database.');
    console.log('To execute this purge, rerun with:');
    console.log('  node reset-procurement-data.js --apply');
    if (isProduction) {
      console.log('In production, also ensure CONFIRM_RESET=YES is set.');
    }
    console.log('--------------------------------------------------------\n');
    return;
  }

  if (isProduction && process.env.CONFIRM_RESET !== 'YES') {
    throw new Error('Production reset safeguard: You must set CONFIRM_RESET=YES after verifying backups.');
  }

  console.log('\nExecuting targeted cleanup transaction...');

  await prisma.$transaction(async (tx) => {
    // A. Unlink relations from records we want to preserve
    // 1. Unlink preferred vendors from Purchase Requisitions (preserves PRs!)
    await tx.$executeRawUnsafe(
      `UPDATE "purchase_requisitions" SET "preferredVendorId" = NULL WHERE "preferredVendorId" IS NOT NULL`
    );

    // 2. Unlink preferred vendors from Replenishment Policies
    try {
      await tx.$executeRawUnsafe(
        `UPDATE "replenishment_policies" SET "preferredVendorId" = NULL WHERE "preferredVendorId" IS NOT NULL`
      );
    } catch (_) {}

    // 3. Unlink PO from Job Work Orders if any exist
    try {
      await tx.$executeRawUnsafe(
        `UPDATE "job_work_orders" SET "purchaseOrderId" = NULL WHERE "purchaseOrderId" IS NOT NULL`
      );
    } catch (_) {}

    // 4. Clean up PO-specific approvals and documents (preserves PR approvals and PR documents!)
    await tx.$executeRawUnsafe(
      `DELETE FROM "procurement_approvals" WHERE "poId" IS NOT NULL`
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM "procurement_documents" WHERE "poId" IS NOT NULL`
    );

    // 5. Clean up Inspection Results linked to GRN lines if any
    try {
      await tx.$executeRawUnsafe(
        `DELETE FROM "inspection_results" WHERE "grnLineId" IS NOT NULL`
      );
    } catch (_) {}

    // 6. Clean up Stock Ledger Entries linked to GRN receipts if any
    try {
      await tx.$executeRawUnsafe(
        `DELETE FROM "stock_ledger_entries" WHERE "grnId" IS NOT NULL OR "grnLineId" IS NOT NULL`
      );
    } catch (_) {}

    // 7. Clean up GRN payments if any exist
    try {
      await tx.$executeRawUnsafe(`DELETE FROM "grn_payments"`);
    } catch (_) {}

    // 8. Clean up Purchase Bill Lines and Bills linked to PO/GRN/Vendors if any exist
    try {
      await tx.$executeRawUnsafe(`DELETE FROM "purchase_bill_lines" WHERE "poLineId" IS NOT NULL OR "grnLineId" IS NOT NULL`);
      await tx.$executeRawUnsafe(`DELETE FROM "purchase_bill_lines" WHERE "billId" IN (SELECT "id" FROM "purchase_bills" WHERE "vendorId" IN (SELECT "id" FROM "vendors"))`);
      await tx.$executeRawUnsafe(`DELETE FROM "purchase_bills" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
    } catch (_) {}

    // 9. Clean up Job Work records linked to vendors if any exist
    try {
      await tx.$executeRawUnsafe(`DELETE FROM "job_work_receipt_returns" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
      await tx.$executeRawUnsafe(`DELETE FROM "job_work_custody_ledgers" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
      await tx.$executeRawUnsafe(`DELETE FROM "job_work_material_issues" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
      await tx.$executeRawUnsafe(`DELETE FROM "job_work_orders" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
    } catch (_) {}

    // 10. Clean up Debit Notes linked to vendors if any exist
    try {
      await tx.$executeRawUnsafe(`DELETE FROM "debit_note_lines" WHERE "debitNoteId" IN (SELECT "id" FROM "debit_notes" WHERE "vendorId" IN (SELECT "id" FROM "vendors"))`);
      await tx.$executeRawUnsafe(`DELETE FROM "debit_notes" WHERE "vendorId" IN (SELECT "id" FROM "vendors")`);
    } catch (_) {}

    // B. Break self-referencing foreign keys on POs and Vendors
    await tx.$executeRawUnsafe(
      `UPDATE "purchase_orders" SET "previousRevisionId" = NULL WHERE "previousRevisionId" IS NOT NULL`
    );
    await tx.$executeRawUnsafe(
      `UPDATE "vendors" SET "supersededById" = NULL WHERE "supersededById" IS NOT NULL`
    );

    // C. Delete GRN tables in sequence
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_measurements"`);
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_discrepancies"`);
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_label_print_events"`);
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_labels"`);
    try { await tx.$executeRawUnsafe(`DELETE FROM "ocr_extraction_jobs"`); } catch (_) {}
    await tx.$executeRawUnsafe(`DELETE FROM "grn_documents"`);
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_lines"`);
    await tx.$executeRawUnsafe(`DELETE FROM "goods_receipt_notes"`);

    // D. Delete PO tables in sequence
    await tx.$executeRawUnsafe(`DELETE FROM "expected_receipts"`);
    try { await tx.$executeRawUnsafe(`DELETE FROM "purchase_order_email_deliveries"`); } catch (_) {}
    await tx.$executeRawUnsafe(`DELETE FROM "transmission_logs"`);
    await tx.$executeRawUnsafe(`DELETE FROM "purchase_order_lines"`);
    await tx.$executeRawUnsafe(`DELETE FROM "purchase_orders"`);

    // E. Delete Vendor intelligence & vendor tables
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_scoring_events"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_score_snapshots"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_evaluations"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_compliance_documents"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_capabilities"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_contacts"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_recommendation_candidates"`); } catch (_) {}
    try { await tx.$executeRawUnsafe(`DELETE FROM "vendor_recommendation_runs"`); } catch (_) {}
    await tx.$executeRawUnsafe(`DELETE FROM "vendors"`);
  }, { timeout: 30000 });

  console.log('✅ SUCCESS: All Purchase Orders, Goods Receipt Notes, and Vendors have been deleted.');
  console.log('✅ Master data (Users, RBAC, Products, BOMs, Warehouse Locations, Customers, Sales Orders) remains completely safe and untouched.\n');
}

main()
  .catch((err) => {
    console.error('❌ Error during procurement cleanup:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
