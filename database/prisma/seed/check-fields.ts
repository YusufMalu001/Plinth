import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dmmf = (prisma as any)._dmmf;
  for (const model of ['JournalLine', 'PurchaseBill', 'PurchaseBillPayment', 'MiscellaneousExpense', 'SalesOrder']) {
    const m = dmmf.datamodel.models.find((x: any) => x.name === model);
    if (m) {
      console.log(`Fields for ${model}:`, m.fields.map((f: any) => `${f.name} (${f.type})`));
    } else {
      console.log(`Model ${model} not found in Prisma DMMF.`);
    }
  }

  // Check ExpenseCategory enum values
  const enums = dmmf.datamodel.enums.find((e: any) => e.name === 'ExpenseCategory');
  console.log('ExpenseCategory values:', enums?.values.map((v: any) => v.name));

  // Check SalesOrder relations
  const so = dmmf.datamodel.models.find((x: any) => x.name === 'SalesOrder');
  console.log('SalesOrder fields:', so?.fields.map((f: any) => `${f.name} (${f.type})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
