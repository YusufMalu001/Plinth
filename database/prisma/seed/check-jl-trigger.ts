import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const [f]: any = await prisma.$queryRaw`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'accounts_guard_line';
  `;
  console.log(f.def);
}
main().catch(console.error).finally(() => prisma.$disconnect());
