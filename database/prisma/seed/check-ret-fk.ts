import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const fkeys: any = await prisma.$queryRawUnsafe(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c 
    WHERE conrelid = 'sales_ar_credit_notes'::regclass AND contype = 'f';
  `);
  console.log('Foreign keys for sales_ar_credit_notes:', fkeys);

  const returns = await prisma.salesFinancialReturn.findMany({ take: 5 });
  console.log('Existing salesFinancialReturn rows:', returns.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
