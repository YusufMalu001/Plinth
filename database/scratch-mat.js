const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const codes = [
    'MAT-HDW-001', 'MAT-HDW-002', 'MAT-HDW-003',
    'MAT-RAW-001', 'MAT-RAW-002', 'MAT-RAW-003', 'MAT-RAW-004',
    'MAT-PKG-001', 'MAT-PKG-002', 'MAT-PKG-003',
    'MAT-COMP-001', 'MAT-COMP-002', 'MAT-COMP-003',
    'MAT-CHEM-001', 'MAT-CHEM-002'
  ];
  for (const c of codes) {
    try {
      const d = await prisma.material.findUnique({ where: { code: c }});
      if (d) {
        await prisma.packSize.deleteMany({ where: { materialId: d.id } });
        await prisma.purchaseRequisitionLine.deleteMany({ where: { materialId: d.id } });
        await prisma.material.delete({ where: { code: c } });
        console.log('Deleted ' + c);
      }
    } catch(e) { console.error('Failed ' + c, e.message); }
  }
}
main().finally(() => prisma.$disconnect());
