const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const codes = ['DEPT-PROC', 'DEPT-QA', 'DEPT-MAINT', 'DEPT-WH'];
  for (const c of codes) {
    try {
      const d = await prisma.department.findUnique({ where: { code: c }});
      if (d) {
        await prisma.purchaseRequisitionLine.deleteMany({ where: { purchaseRequisition: { departmentId: d.id } } });
        await prisma.purchaseRequisition.deleteMany({ where: { departmentId: d.id } });
        await prisma.department.delete({ where: { code: c } });
        console.log('Deleted ' + c);
      }
    } catch(e) { console.error('Failed ' + c, e.message); }
  }
}
main().finally(() => prisma.$disconnect());
