import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables = ['journal_vouchers', 'journal_lines', 'purchase_bills', 'purchase_bill_lines', 'miscellaneous_expenses', 'debit_notes'];
  for (const t of tables) {
    const constraints: any = await prisma.$queryRawUnsafe(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c 
      WHERE conrelid = '${t}'::regclass AND contype = 'c';
    `);
    console.log(`Check constraints for ${t}:`, constraints);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
