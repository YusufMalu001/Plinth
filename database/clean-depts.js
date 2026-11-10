const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const depts = await prisma.department.findMany({
    where: { name: { contains: 'Test Dept' } }
  });
  console.log(`Found ${depts.length} test departments to delete.`);
  
  if (depts.length > 0) {
    const ids = depts.map(d => d.id);
    // Delete any dependent PRs first just in case
    await prisma.purchaseRequisition.deleteMany({ where: { departmentId: { in: ids } } });
    const deleted = await prisma.department.deleteMany({
      where: { id: { in: ids } }
    });
    console.log(`Deleted ${deleted.count} test departments.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
