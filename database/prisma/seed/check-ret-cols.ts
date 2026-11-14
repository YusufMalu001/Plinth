import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const returns = await prisma.salesFinancialReturn.findMany();
  console.log('Returns:', returns.map(r => ({ id: r.id, salesOrderId: r.salesOrderId })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
