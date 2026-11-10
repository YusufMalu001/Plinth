import { PrismaClient, PoStatus, GrnStatus } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedProcurement() {
  console.log('🛒 Seeding Procurement Orders and Goods Receipts for Executive Hub...');

  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
  });
  if (!admin) {
    console.log('⚠️ No admin user found to seed procurement.');
    return;
  }

  const vendors = await prisma.vendor.findMany({ take: 5 });
  const materials = await prisma.material.findMany({ take: 10 });
  const location = await prisma.warehouseLocation.findFirst();

  if (vendors.length === 0 || materials.length === 0) {
    console.log('⚠️ Vendors or materials missing for procurement seeding.');
    return;
  }

  const now = new Date();

  // Create 2 POs
  const po1 = await prisma.purchaseOrder.upsert({
    where: { poNumber_revisionNumber: { poNumber: 'PO-2026-001', revisionNumber: 1 } },
    update: {},
    create: {
      poNumber: 'PO-2026-001',
      revisionNumber: 1,
      vendorId: vendors[0].id,
      status: PoStatus.SENT,
      currency: 'INR',
      subtotal: 125000,
      taxAmount: 22500,
      totalAmount: 147500,
      createdAt: now,
      lines: {
        create: [
          {
            materialId: materials[0].id,
            uomId: materials[0].uomId,
            quantity: 500,
            unitPrice: 250,
            taxRate: 18,
            lineTotal: 147500,
            needDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    },
    include: { lines: true },
  });

  const po2 = await prisma.purchaseOrder.upsert({
    where: { poNumber_revisionNumber: { poNumber: 'PO-2026-002', revisionNumber: 1 } },
    update: {},
    create: {
      poNumber: 'PO-2026-002',
      revisionNumber: 1,
      vendorId: vendors[1]?.id || vendors[0].id,
      status: PoStatus.APPROVED,
      currency: 'INR',
      subtotal: 84000,
      taxAmount: 15120,
      totalAmount: 99120,
      createdAt: now,
      lines: {
        create: [
          {
            materialId: materials[1]?.id || materials[0].id,
            uomId: materials[1]?.uomId || materials[0].uomId,
            quantity: 200,
            unitPrice: 420,
            taxRate: 18,
            lineTotal: 99120,
            needDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Create 1 Finalized GRN
  if (po1 && po1.lines[0]) {
    await prisma.goodsReceiptNote.upsert({
      where: { grnNumber: 'GRN-2026-001' },
      update: {},
      create: {
        grnNumber: 'GRN-2026-001',
        poId: po1.id,
        vendorId: po1.vendorId,
        locationId: location?.id,
        status: GrnStatus.FINALIZED,
        receivedByActorId: admin.id,
        receivedAt: now,
        verifiedByActorId: admin.id,
        verifiedAt: now,
        finalizedByActorId: admin.id,
        finalizedAt: now,
        lines: {
          create: [
            {
              poLineId: po1.lines[0].id,
              materialId: po1.lines[0].materialId,
              uomId: po1.lines[0].uomId,
              receivedQuantity: 500,
              acceptedQuantity: 500,
              rejectedQuantity: 0,
            },
          ],
        },
      },
    });
  }

  console.log('✅ Seeded procurement orders and goods receipts.');
}

if (require.main === module) {
  seedProcurement()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
