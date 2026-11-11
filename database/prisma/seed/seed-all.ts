import { execSync } from 'child_process';
import path from 'path';

async function seedAll() {
  console.log('🚀 ========================================================');
  console.log('🌟 Starting Comprehensive Full Plinth Database Seeding...');
  console.log('🚀 ========================================================\n');

  const seedScripts = [
    { name: '1. Core Users, RBAC & GST Masters', cmd: 'ts-node prisma/seed/seed.ts', env: { SEED_FULL: 'true' } },
    { name: '2. Canonical Units of Measure (UOM)', cmd: 'node seed-uoms.js' },
    { name: '3. Official Plinth Master Data (Products, Materials, BOMs, Vendors)', cmd: 'ts-node prisma/seed/seed-official-plinth-data.ts' },
    { name: '4. Stock Item Hierarchy Dataset', cmd: 'ts-node prisma/seed/seed-stock-hierarchy.ts' },
    { name: '5. Realistic Opening Inventory & Stock Balances', cmd: 'ts-node prisma/seed/seed-opening-inventory.ts' },
    { name: '6. Loss Management & Quality Rejection Rules', cmd: 'ts-node prisma/seed/seed-loss-management.ts' },
    { name: '7. System User Profiles (without department accounts)', cmd: 'ts-node prisma/seed/seed-user-profiles.ts' },
    { name: '8. Procurement Orders & Inbound Goods Receipts (GRN)', cmd: 'ts-node prisma/seed/seed-procurement.ts' },
    { name: '9. Logistics Carriers, Multi-Stage Fulfillment, Shipments & Manifests', cmd: 'ts-node prisma/seed/seed-logistics-dispatch.ts' },
    { name: '10. Vendor Scoring Transaction History (Quality, Delivery, Debit Notes, Obligations, Custody)', cmd: 'ts-node prisma/seed/seed-vendor-scoring-data.ts' },
  ];

  const cwd = path.resolve(__dirname, '../..');

  for (const step of seedScripts) {
    console.log(`\n⏳ Running ${step.name}...`);
    try {
      execSync(`npx dotenv -e ../.env -- ${step.cmd}`, {
        cwd,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...(step.env || {}),
        },
      });
      console.log(`✅ ${step.name} finished successfully.`);
    } catch (err) {
      console.error(`❌ Failed during ${step.name}:`, err);
      process.exit(1);
    }
  }

  console.log('\n🎉 ========================================================');
  console.log('✨ Master, Inventory & Procurement data');
  console.log('✨ successfully seeded and persisted in PostgreSQL database!');
  console.log('🎉 ========================================================');
}

seedAll().catch((err) => {
  console.error('Fatal error during full seed:', err);
  process.exit(1);
});
