import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables: any = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log('All public tables:');
  console.log(tables.map((t: any) => t.table_name));
}
main().catch(console.error).finally(() => prisma.$disconnect());
