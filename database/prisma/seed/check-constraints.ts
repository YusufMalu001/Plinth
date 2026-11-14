import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const constraints: any = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c 
    JOIN pg_namespace n ON n.oid = c.connamespace 
    WHERE conrelid = 'ledger_accounts'::regclass;
  `;
  console.log('ledger_accounts constraints:', constraints);
}
main().catch(console.error).finally(() => prisma.$disconnect());
