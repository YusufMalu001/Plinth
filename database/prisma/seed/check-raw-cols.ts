import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables = ['sales_ar_proformas', 'sales_ar_proforma_lines', 'sales_ar_invoices', 'sales_ar_invoice_lines', 'sales_ar_receipts', 'sales_ar_allocations', 'sales_ar_credit_notes', 'sales_ar_marketplace_batches'];
  for (const t of tables) {
    const cols: any = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = '${t}'
      ORDER BY ordinal_position;
    `);
    console.log(`=== ${t} ===`);
    console.log(cols.map((c: any) => `${c.column_name}: ${c.data_type}`).join(', '));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
