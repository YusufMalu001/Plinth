const { PrismaClient } = require('@prisma/client');

// Deliberately excludes users, sessions, RBAC, factories, departments and
// warehouse locations so the application remains accessible after reset.
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');

const tables = [
  'goods_receipt_measurements', 'goods_receipt_discrepancies',
  'goods_receipt_label_print_events', 'goods_receipt_labels',
  'goods_receipt_lines', 'goods_receipt_notes', 'expected_receipts',
  'purchase_order_lines', 'procurement_documents', 'procurement_approvals',
  'transmission_logs', 'purchase_orders', 'purchase_requisition_lines',
  'purchase_requisitions', 'notifications', 'stock_ledger_entries',
  'grn_documents', 'product_variants', 'products', 'materials', 'pack_sizes',
  'uom_conversions', 'units_of_measure', 'product_routes', 'route_steps',
  'qc_rules', 'wastage_rules', 'product_families', 'categories', 'vendors',
  'customers', 'master_data_import_rows', 'master_data_import_batches', 'audit_logs'
];

async function main() {
  console.log(apply
    ? 'DEMO DATA CLEANUP APPLY mode: business and master records will be deleted.'
    : 'DEMO DATA CLEANUP DRY-RUN: no records changed. Re-run with --apply to execute.');
  console.log(`Target tables (${tables.length}): ${tables.join(', ')}`);
  if (!apply) return;

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log('Demo data cleanup completed. Users and RBAC data were preserved.');
}

main().catch(error => {
  console.error('Demo data cleanup failed:', error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
