const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const placeholderMaterialCodes = [
  'MAT-RAW-001', 'MAT-RAW-002', 'MAT-RAW-003', 'MAT-RAW-004',
  'MAT-PKG-001', 'MAT-PKG-002', 'MAT-PKG-003',
  'MAT-COMP-001', 'MAT-COMP-002', 'MAT-COMP-003',
  'MAT-CHEM-001', 'MAT-CHEM-002'
];
const placeholderDepartmentCodes = ['DEPT-PROC', 'DEPT-QA', 'DEPT-MAINT', 'DEPT-WH'];

async function removeIfUnreferenced(label, records, dependencyChecks, remove) {
  for (const record of records) {
    const dependencies = await Promise.all(dependencyChecks.map(check => check(record.id)));
    const usedBy = dependencies.filter(Boolean);
    if (usedBy.length > 0) {
      console.log(`SKIP ${label} ${record.code || record.name} - ${record.name || ''} (still referenced)`);
      continue;
    }
    console.log(`${apply ? 'DELETE' : 'WOULD DELETE'} ${label} ${record.code || record.name} - ${record.name || ''}`);
    if (apply) await remove(record);
  }
}

async function main() {
  console.log(apply
    ? 'Placeholder cleanup APPLY mode: only unreferenced allowlisted records will be removed.'
    : 'Placeholder cleanup DRY-RUN: no database records will be changed. Use --apply after reviewing.');

  const departments = await prisma.department.findMany({
    where: {
      OR: [
        { code: { in: placeholderDepartmentCodes } },
        { name: { contains: 'Test Dept', mode: 'insensitive' } }
      ]
    }
  });

  // Test departments commonly have test PR/PO records attached. Remove only
  // those procurement documents first; this makes the department cleanup
  // complete without touching records belonging to real departments.
  if (departments.length > 0) {
    const departmentIds = departments.map(department => department.id);
    const testPrs = await prisma.purchaseRequisition.findMany({
      where: { departmentId: { in: departmentIds } },
      select: { id: true, prNumber: true }
    });
    const testPrIds = testPrs.map(pr => pr.id);
    const testPoCount = testPrIds.length
      ? await prisma.purchaseOrder.count({ where: { prId: { in: testPrIds } } })
      : 0;
    if (testPrs.length > 0 || testPoCount > 0) {
      console.log(`${apply ? 'DELETE' : 'WOULD DELETE'} ${testPrs.length} test requisition(s) and ${testPoCount} linked purchase order(s)`);
      if (apply) {
        if (testPrIds.length > 0) {
          await prisma.purchaseOrder.deleteMany({ where: { prId: { in: testPrIds } } });
          await prisma.purchaseRequisition.deleteMany({ where: { id: { in: testPrIds } } });
        }
      }
    }
  }
  const testPrIdsForDependencyCheck = departments.length > 0
    ? (await prisma.purchaseRequisition.findMany({
      where: { departmentId: { in: departments.map(department => department.id) } },
      select: { id: true }
    })).map(pr => pr.id)
    : [];
  await removeIfUnreferenced('department', departments, [
    id => prisma.purchaseRequisition.count({
      where: {
        departmentId: id,
        ...(testPrIdsForDependencyCheck.length ? { id: { notIn: testPrIdsForDependencyCheck } } : {})
      }
    }),
    id => prisma.employee.count({ where: { departmentId: id } }),
    id => prisma.workCenter.count({ where: { departmentId: id } }),
    id => prisma.routeStep.count({ where: { departmentId: id } })
  ], record => prisma.department.delete({ where: { id: record.id } }));

  const materials = await prisma.material.findMany({ where: { code: { in: placeholderMaterialCodes } } });
  await removeIfUnreferenced('material', materials, [
    id => prisma.purchaseRequisitionLine.count({ where: { materialId: id } }),
    id => prisma.purchaseOrderLine.count({ where: { materialId: id } }),
    id => prisma.packSize.count({ where: { materialId: id } }),
    id => prisma.wastageRule.count({ where: { materialId: id } })
  ], async record => {
    await prisma.material.delete({ where: { id: record.id } });
  });

  const placeholderCategories = await prisma.category.findMany({
    where: { code: { in: ['CAT-PKG', 'CAT-COMP', 'CAT-CHEM', 'CAT-FG'] } }
  });
  await removeIfUnreferenced('category', placeholderCategories, [
    id => prisma.product.count({ where: { categoryId: id } }),
    id => prisma.material.count({ where: { categoryId: id } }),
    id => prisma.productFamily.count({ where: { categoryId: id } })
  ], record => prisma.category.delete({ where: { id: record.id } }));

  // Vendors are not present in the client workbook. We only report obvious
  // test names and never remove a vendor that has PO history.
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { code: { contains: 'TEST', mode: 'insensitive' } },
        { code: { contains: 'DUMMY', mode: 'insensitive' } },
        { name: { contains: 'test', mode: 'insensitive' } },
        { name: { contains: 'dummy', mode: 'insensitive' } },
        { name: { contains: 'acme', mode: 'insensitive' } }
      ]
    }
  });
  await removeIfUnreferenced('vendor', vendors, [
    id => prisma.purchaseOrder.count({ where: { vendorId: id } })
  ], record => prisma.vendor.delete({ where: { id: record.id } }));

  // Test suites historically created many identically named products. They
  // are never client master data, so remove them explicitly when they are not
  // referenced by a procurement or receiving document.
  const testProducts = await prisma.product.findMany({
    where: { name: { equals: 'Test Product', mode: 'insensitive' } },
    select: { id: true, sku: true }
  });
  for (const product of testProducts) {
    const [requisitions, orders, receipts, variants, routes] = await Promise.all([
      prisma.purchaseRequisitionLine.count({ where: { productId: product.id } }),
      prisma.purchaseOrderLine.count({ where: { productId: product.id } }),
      prisma.goodsReceiptLine.count({ where: { productId: product.id } }),
      prisma.productVariant.count({ where: { productId: product.id } }),
      prisma.productRoute.count({ where: { productId: product.id } }),
    ]);
    if (requisitions + orders + receipts + variants + routes > 0) {
      console.log(`SKIP test product ${product.sku} - still referenced`);
      continue;
    }
    console.log(`${apply ? 'DELETE' : 'WOULD DELETE'} test product ${product.sku}`);
    if (apply) {
      await prisma.stockLedgerEntry.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } });
    }
  }

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { code: { contains: 'TEST', mode: 'insensitive' } },
        { code: { contains: 'DUMMY', mode: 'insensitive' } },
        { name: { contains: 'test', mode: 'insensitive' } },
        { name: { contains: 'dummy', mode: 'insensitive' } }
      ]
    }
  });
  await removeIfUnreferenced('customer', customers, [], record => prisma.customer.delete({ where: { id: record.id } }));
}

main()
  .catch(error => {
    console.error('Placeholder cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
