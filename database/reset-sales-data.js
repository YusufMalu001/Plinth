const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const apply = process.argv.includes('--apply');

const salesTables = [
  'sales_dispatch_documents',
  'sales_manifest_shipments',
  'sales_dispatch_manifests',
  'sales_proofs_of_delivery',
  'sales_delivery_attempts',
  'sales_tracking_events',
  'sales_shipment_lines',
  'sales_shipment_packages',
  'sales_shipments',
  'sales_package_material_usages',
  'sales_package_items',
  'sales_packages',
  'sales_pick_items',
  'sales_pick_lists',
  'sales_fulfillments',
  'sales_order_allocations',
  'sales_order_exceptions',
  'sales_order_external_references',
  'sales_order_status_history',
  'sales_order_approvals',
  'sales_order_payments',
  'sales_order_taxes',
  'sales_order_charges',
  'sales_order_addresses',
  'sales_order_lines',
  'sales_credit_authorizations',
  'sales_integration_outbox',
  'sales_orders',
  'customers'
];

async function main() {
  console.log('=== SALES, ORDERS & CUSTOMERS PURGE TOOL ===');
  
  // 1. Show current record counts
  console.log('\nCurrent database counts:');
  for (const table of salesTables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "${table}"`);
      const count = result[0]?.count ?? 0;
      console.log(` - ${table}: ${count} records`);
    } catch (err) {
      console.log(` - ${table}: (table not found or error: ${err.message})`);
    }
  }

  const resCount = await prisma.inventoryReservation.count();
  console.log(` - inventory_reservations: ${resCount} records`);

  if (!apply) {
    console.log('\n[DRY RUN] No records were deleted. Run with --apply to execute.');
    return;
  }

  console.log('\nApplying cleanup...');

  // Break customer self-references first
  await prisma.$executeRawUnsafe(`UPDATE "customers" SET "supersededById" = NULL WHERE "supersededById" IS NOT NULL`);

  // Truncate all sales, dispatch, fulfillment, and customer tables
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${salesTables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );

  // Clear sales order reservations
  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_reservations" WHERE "sourceType" = 'SALES_ORDER'`
  );

  // Reset reserved quantity on inventory balances so stock is 100% available
  await prisma.$executeRawUnsafe(
    `UPDATE "inventory_balances" SET "reserved" = 0 WHERE "reserved" > 0`
  );

  console.log('✅ Successfully purged all sales orders, dispatch/fulfillment pipelines, credit records, and customers.');
  console.log('✅ Released all inventory reservations; available balances are clean and ready for testing.');
}

main()
  .catch(err => {
    console.error('❌ Error during cleanup:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
