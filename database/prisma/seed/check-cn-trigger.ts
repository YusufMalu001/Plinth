import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const [f]: any = await prisma.$queryRaw`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'accounts_guard_sales_ar_credit_note';
  `;
  if (f) console.log(f.def);
  else console.log('No trigger function accounts_guard_sales_ar_credit_note');
}
main().catch(console.error).finally(() => prisma.$disconnect());
