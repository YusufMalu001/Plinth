const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const d = await prisma.material.findUnique({ where: { code: 'MAT-PKG-003' }});
  if (d) {
    await prisma.purchaseOrderLine.deleteMany({ where: { materialId: d.id } });
    await prisma.purchaseRequisitionLine.deleteMany({ where: { materialId: d.id } });
    await prisma.material.delete({ where: { code: 'MAT-PKG-003' } });
    console.log('Deleted MAT-PKG-003');
  }
}
main().finally(() => prisma.$disconnect());
