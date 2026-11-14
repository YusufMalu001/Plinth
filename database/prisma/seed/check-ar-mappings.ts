import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cols: any = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'sales_ar_mappings'
    ORDER BY ordinal_position;
  `);
  console.log('Columns for sales_ar_mappings:', cols);
}
main().catch(console.error).finally(() => prisma.$disconnect());
