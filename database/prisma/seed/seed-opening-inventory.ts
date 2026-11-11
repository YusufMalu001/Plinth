import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('📦 Seeding realistic opening inventory balances for Plinth single plant...');

  // Ensure default warehouse locations exist
  const locationDefs = [
    { code: 'RAW-MATERIALS', name: 'Raw Materials & Hardware Store (Rack A-D)', type: 'RAW_MATERIAL' },
    { code: 'FINISHED-GOODS', name: 'Finished Goods Bay (Bay 1-4)', type: 'FINISHED_GOODS' },
    { code: 'WIP-STAGING', name: 'Shop Floor Assembly & WIP Staging', type: 'WIP' },
    { code: 'QC-HOLD', name: 'Quality Inspection & Quarantine Hold', type: 'QUARANTINE' },
  ];

  const locations: Record<string, string> = {};
  for (const loc of locationDefs) {
    const existing = await prisma.warehouseLocation.upsert({
      where: { code: loc.code },
      update: { name: loc.name, type: loc.type },
      create: {
        id: randomUUID(),
        code: loc.code,
        name: loc.name,
        type: loc.type,
        status: 'ACTIVE',
      },
    });
    locations[loc.type] = existing.id;
  }

  // Fetch all products and materials
  const products = await prisma.product.findMany();
  const materials = await prisma.material.findMany();
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = adminUser?.id || randomUUID();

  console.log(`Found ${products.length} products and ${materials.length} materials for stock allocation.`);

  let seededCount = 0;

  // Seed Raw Materials (5000 qty)
  for (const mat of materials) {
    const qty = 5000;
    const reserved = 0; // Ensure full stock is available for issues, reservations, transfers
    const avgCost = Number((Math.random() * 250 + 25).toFixed(2));
    const locationId = locations['RAW_MATERIAL'];

    await prisma.inventoryBalance.upsert({
      where: {
        itemType_itemId_uomId_locationId_condition_ownership: {
          itemType: 'MATERIAL',
          itemId: mat.id,
          uomId: mat.uomId,
          locationId,
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
        },
      },
      update: {
        quantity: qty,
        reserved: 0,
        averageCost: avgCost,
      },
      create: {
        id: randomUUID(),
        itemType: 'MATERIAL',
        itemId: mat.id,
        uomId: mat.uomId,
        locationId,
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        quantity: qty,
        reserved: reserved,
        averageCost: avgCost,
      },
    });

    // Record ledger entry
    const entryId = randomUUID();
    await prisma.inventoryLedgerEntry.upsert({
      where: { entryNumber: `INIT-MAT-${mat.code}` },
      update: {
        quantityDelta: qty,
        quantityBefore: 0,
        quantityAfter: qty,
      },
      create: {
        id: entryId,
        entryNumber: `INIT-MAT-${mat.code}`,
        itemType: 'MATERIAL',
        itemId: mat.id,
        uomId: mat.uomId,
        locationId,
        movementType: 'OPENING_BALANCE',
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        quantityDelta: qty,
        quantityBefore: 0,
        quantityAfter: qty,
        averageCostBefore: 0,
        averageCostAfter: avgCost,
        unitCost: avgCost,
        totalCost: qty * avgCost,
        sourceType: 'INITIAL_LOAD',
        sourceId: 'INITIAL_OPENING_2026',
        idempotencyKey: `INIT:MAT:${mat.id}`,
        postedBy: actorId,
      },
    });

    seededCount++;
  }

  // Seed Finished Products (5000 qty)
  for (const prod of products) {
    const qty = 5000;
    const reserved = 0; // Ensure full stock is available for issues, reservations, transfers
    const avgCost = Number((Math.random() * 1200 + 450).toFixed(2));
    const locationId = locations['FINISHED_GOODS'];

    await prisma.inventoryBalance.upsert({
      where: {
        itemType_itemId_uomId_locationId_condition_ownership: {
          itemType: 'PRODUCT',
          itemId: prod.id,
          uomId: prod.uomId,
          locationId,
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
        },
      },
      update: {
        quantity: qty,
        reserved: reserved,
        averageCost: avgCost,
      },
      create: {
        id: randomUUID(),
        itemType: 'PRODUCT',
        itemId: prod.id,
        uomId: prod.uomId,
        locationId,
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        quantity: qty,
        reserved: reserved,
        averageCost: avgCost,
      },
    });

    await prisma.inventoryLedgerEntry.upsert({
      where: { entryNumber: `INIT-PROD-${prod.sku}` },
      update: {
        quantityDelta: qty,
        quantityBefore: 0,
        quantityAfter: qty,
      },
      create: {
        id: randomUUID(),
        entryNumber: `INIT-PROD-${prod.sku}`,
        itemType: 'PRODUCT',
        itemId: prod.id,
        uomId: prod.uomId,
        locationId,
        movementType: 'OPENING_BALANCE',
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        quantityDelta: qty,
        quantityBefore: 0,
        quantityAfter: qty,
        averageCostBefore: 0,
        averageCostAfter: avgCost,
        unitCost: avgCost,
        totalCost: qty * avgCost,
        sourceType: 'INITIAL_LOAD',
        sourceId: 'INITIAL_OPENING_2026',
        idempotencyKey: `INIT:PROD:${prod.id}`,
        postedBy: actorId,
      },
    });

    seededCount++;
  }

  // Seed a couple of Quarantined items for realism
  if (materials[0]) {
    await prisma.inventoryBalance.upsert({
      where: {
        itemType_itemId_uomId_locationId_condition_ownership: {
          itemType: 'MATERIAL',
          itemId: materials[0].id,
          uomId: materials[0].uomId,
          locationId: locations['QUARANTINE'],
          condition: 'QUARANTINED',
          ownership: 'COMPANY',
        },
      },
      update: { quantity: 45, reserved: 0, averageCost: 85 },
      create: {
        id: randomUUID(),
        itemType: 'MATERIAL',
        itemId: materials[0].id,
        uomId: materials[0].uomId,
        locationId: locations['QUARANTINE'],
        condition: 'QUARANTINED',
        ownership: 'COMPANY',
        quantity: 45,
        reserved: 0,
        averageCost: 85,
      },
    });
  }

  console.log(`✅ Successfully seeded ${seededCount} opening inventory records!`);
}

main()
  .catch((e) => {
    console.error('Error seeding opening inventory:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
