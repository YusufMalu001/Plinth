import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Models in Prisma ---');
  const rawTables: any = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (
        table_name LIKE 'sales_ar%' 
        OR table_name LIKE 'accounting%' 
        OR table_name LIKE 'purchase%' 
        OR table_name LIKE 'debit%' 
        OR table_name LIKE 'journal%' 
        OR table_name LIKE 'miscellaneous%'
        OR table_name LIKE 'ledger%'
        OR table_name LIKE 'tally%'
        OR table_name LIKE 'bank%'
      )
    ORDER BY table_name;
  `;
  console.log('Postgres tables matching finance:');
  console.log(rawTables.map((r: any) => r.table_name));

  // Also check columns of sales_ar tables
  for (const t of ['sales_ar_invoices', 'sales_ar_proformas', 'sales_ar_credit_notes', 'sales_ar_receipts', 'sales_ar_marketplace_batches', 'debit_notes']) {
    const cols: any = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = '${t}'
      ORDER BY ordinal_position;
    `);
    console.log(`Columns for ${t}:`, cols.map((c: any) => `${c.column_name} (${c.data_type})`));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
