const { PrismaClient, LifecycleStatus } = require('@prisma/client');

const prisma = new PrismaClient();

// Canonical Enterprise Units of Measure (UOM).
// GST UQC specifications are stored statically on the frontend and not as database UOM records.
const definitions = [
  ['PCS', 'PIECES', 'PCS', 'COUNT'],
  ['KG', 'Kilograms', 'kg', 'MASS'],
  ['G', 'Grams', 'g', 'MASS'],
  ['MTR', 'METERS', 'MTR', 'LENGTH'],
  ['MM', 'Millimeters', 'mm', 'LENGTH'],
  ['LTR', 'Liters', 'L', 'VOLUME'],
  ['ML', 'Milliliters', 'mL', 'VOLUME'],
  ['NOS', 'NUMBERS', 'NOS', 'COUNT'],
  ['BOX', 'BOX', 'BOX', 'COUNT'],
  ['FT', 'Feet', 'ft', 'LENGTH'],
];

async function main() {
  for (const [code, name, symbol, dimension] of definitions) {
    await prisma.unitOfMeasure.upsert({
      where: { code },
      update: { name, symbol, dimension, status: LifecycleStatus.ACTIVE },
      create: { code, name, symbol, dimension, status: LifecycleStatus.ACTIVE },
    });
  }
  console.log(`Restored ${definitions.length} canonical UOM specifications.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
