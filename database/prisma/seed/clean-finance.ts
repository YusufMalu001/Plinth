import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Testing TRUNCATE TABLE CASCADE on finance tables...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_allocations" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_receipts" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_credit_notes" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_invoice_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_invoices" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_proforma_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_proformas" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_marketplace_batches" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_mappings" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_events" CASCADE;`);
  
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_note_documents" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_note_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_notes" CASCADE;`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "purchase_bill_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "purchase_bills" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "miscellaneous_expenses" CASCADE;`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "journal_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "journal_vouchers" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_sequences" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ledger_accounts" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_periods" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_entities" CASCADE;`);
  console.log('TRUNCATE successful! Truncate bypasses row-level triggers.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
