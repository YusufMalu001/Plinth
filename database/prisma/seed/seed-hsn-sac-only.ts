import { PrismaClient } from '@prisma/client';
import { seedHsnSacCodes } from './seed-hsn-sac';

const prisma = new PrismaClient();

async function main() {
  await seedHsnSacCodes(prisma);
}

main()
  .catch((error) => {
    console.error('HSN/SAC seed failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
