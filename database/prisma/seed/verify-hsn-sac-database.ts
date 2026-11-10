import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { loadHsnSacDefinitions } from './seed-hsn-sac';

const prisma = new PrismaClient();

async function main() {
  const definitions = loadHsnSacDefinitions();
  let verified = 0;
  const chunkSize = 500;

  for (let index = 0; index < definitions.length; index += chunkSize) {
    const batch = definitions.slice(index, index + chunkSize);
    const rows = await prisma.hsnSacCode.findMany({
      where: { code: { in: batch.map((item) => item.code) } },
      select: { code: true, description: true, kind: true },
    });
    const actualByCode = new Map(rows.map((row) => [row.code, row]));

    for (const expected of batch) {
      const actual = actualByCode.get(expected.code);
      assert.ok(actual, `Missing HSN/SAC code ${expected.code}`);
      assert.equal(actual.kind, expected.kind, `Incorrect kind for code ${expected.code}`);
      assert.equal(actual.description, expected.description, `Incorrect description for code ${expected.code}`);
      verified += 1;
    }
  }

  const hsnCount = definitions.filter((item) => item.kind === 'HSN').length;
  console.log(`Verified every source row in the database: ${verified} total (${hsnCount} HSN, ${verified - hsnCount} SAC).`);
}

main()
  .catch((error) => {
    console.error('HSN/SAC database verification failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
