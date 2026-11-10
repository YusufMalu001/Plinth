const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Delete lines that might block deletion
  await prisma.purchaseOrderLine.deleteMany({ where: { productId: { not: null } } });
  await prisma.purchaseRequisitionLine.deleteMany({ where: { productId: { not: null } } });
  await prisma.purchaseOrder.deleteMany(); // to avoid dangling POs if we want to be safe, but we only delete lines
  await prisma.purchaseRequisition.deleteMany(); // same here

  // Delete all existing products (since they are test products)
  await prisma.productRoute.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productFamily.deleteMany();
  
  // Find or create Category
  let cat = await prisma.category.findUnique({ where: { code: 'CAT-FG' } });
  if (!cat) {
    cat = await prisma.category.create({
      data: { code: 'CAT-FG', name: 'Finished & Semi-Finished Goods', description: 'Manufactured products' }
    });
  }

  // Find UOM
  const uom = await prisma.unitOfMeasure.findUnique({ where: { code: 'PCS' } });

  const productsToCreate = [
    { name: 'CS8 - Lower Frame with Rods', description: '' },
    { name: 'CS8 - Lower Frame without Rods', description: '' },
    { name: 'CS8 - Top Frame with Rods', description: '' },
    { name: 'CS8 - Top Frame without Rods', description: '' },
    { name: 'CS8 - Top Rod', description: 'Full length' },
    { name: 'CS8 - Top Rod LHS', description: '' },
    { name: 'CS8 - Top Rod RHS', description: '' },
    { name: 'CS8 - 827mm Pipe', description: 'Cut piece' },
    { name: 'CS8 - 860mm Pipe', description: 'Cut piece' },
    { name: 'CS8 - Side Cap', description: '' },
    { name: 'CS8 - Bottom Cap', description: '' },
    { name: 'E-Rod', description: 'Cut from 3/4" x 0.9mm pipe' },
    { name: 'D-Rod', description: 'Cut from 3/4" x 0.9mm pipe' },
  ];

  for (let i = 0; i < productsToCreate.length; i++) {
    const item = productsToCreate[i];
    const code = `PROD-${(i+1).toString().padStart(3, '0')}`;
    
    // Create family
    const family = await prisma.productFamily.create({
      data: {
        code: `FAM-${code}`,
        name: item.name,
        categoryId: cat.id,
        status: 'APPROVED'
      }
    });

    // Create product
    await prisma.product.create({
      data: {
        sku: code,
        name: item.name,
        description: item.description || null,
        productFamilyId: family.id,
        categoryId: cat.id,
        uomId: uom.id,
        status: 'APPROVED',
        version: 1
      }
    });
    console.log(`Created product: ${item.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
