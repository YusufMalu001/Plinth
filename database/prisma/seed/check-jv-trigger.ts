import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const triggers: any = await prisma.$queryRawUnsafe(`
    SELECT trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'journal_vouchers' OR event_object_table = 'journal_lines';
  `);
  console.log('Triggers:', triggers);

  // Check trigger function source if any
  const funcs: any = await prisma.$queryRawUnsafe(`
    SELECT routine_name, routine_definition
    FROM information_schema.routines
    WHERE routine_name LIKE '%journal%' OR routine_name LIKE '%voucher%';
  `);
  console.log('Routines:', funcs.map((f: any) => ({ name: f.routine_name, def: f.routine_definition?.slice(0, 300) })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
