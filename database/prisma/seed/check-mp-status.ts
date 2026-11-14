import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const constraints: any = await prisma.$queryRawUnsafe(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c 
    WHERE conrelid = 'sales_ar_marketplace_batches'::regclass AND contype = 'c';
  `);
  console.log('Constraints for sales_ar_marketplace_batches:', constraints);
}
main().catch(console.error).finally(() => prisma.$disconnect());
