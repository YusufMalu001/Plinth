/*
 * Clear client-owned catalog/master data while preserving users, sessions,
 * RBAC, organization structure, and warehouse configuration.
 *
 * Dry run:  node reset-client-master-data.js
 * Apply:    node reset-client-master-data.js --apply
 * Production additionally requires:
 *   CONFIRM_MASTER_DATA_RESET=YES
 *   ALLOW_PRODUCTION_MASTER_DATA_RESET=YES
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const tables = [
  // Operational records that directly reference the catalog.
  'production_material_issues', 'production_outputs', 'production_plan_requirements',
  'production_plan_events', 'production_plans', 'bom_simulation_runs',
  'bom_golden_examples', 'bom_lines', 'bom_versions', 'product_routes', 'route_steps',
  'product_variants', 'inventory_ledger_entries', 'inventory_balances',
  'stock_ledger_entries', 'stock_balances', 'stock_issues', 'stock_reservations',
  'stock_adjustments', 'stock_transfers', 'stock_snapshots',
  // Client master data and its direct supporting records.
  'pack_sizes', 'uom_conversions', 'units_of_measure', 'products', 'materials',
  'wastage_rules', 'qc_rules', 'product_families', 'categories'
];

async function main() {
  console.log(apply ? 'APPLY mode: client master and dependent inventory/production data will be deleted.' : 'DRY-RUN: no records will be changed.');
  console.log(`Tables (${tables.length}): ${tables.join(', ')}`);
  if (!apply) return;
  if (isProduction && process.env.CONFIRM_MASTER_DATA_RESET !== 'YES') {
    throw new Error('Production reset refused. Set CONFIRM_MASTER_DATA_RESET=YES after taking a verified backup.');
  }
  if (isProduction && process.env.ALLOW_PRODUCTION_MASTER_DATA_RESET !== 'YES') {
    throw new Error('Production reset refused. Set ALLOW_PRODUCTION_MASTER_DATA_RESET=YES explicitly.');
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} CASCADE`);
  console.log('Client master data reset completed. Users, sessions, RBAC, departments, and warehouse configuration were preserved.');
}

main().catch((error) => {
  console.error(`Client master-data reset failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
