const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const dbUrl = process.env.DATABASE_URL || '';
const maskedUrl = dbUrl ? dbUrl.replace(/:([^:@]+)@/, ':****@') : '(default from prisma schema)';
const prisma = new PrismaClient({
  datasources: dbUrl ? { db: { url: dbUrl } } : undefined
});

const apply = process.argv.includes('--apply');

function getNextIncrementedBomName(rawName, existingNamesSet) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return 'Item BOM';

  const match = trimmed.match(/^(.*?)(?:[\s\-_]+(\d+))$/);
  let base = trimmed;
  let nextNum = 2;

  if (match && match[1]?.trim()) {
    base = match[1].trim();
    nextNum = parseInt(match[2], 10) + 1;
  }

  let candidate = `${base} ${nextNum}`;
  while (existingNamesSet.has(candidate.toLowerCase())) {
    nextNum += 1;
    candidate = `${base} ${nextNum}`;
  }

  return candidate;
}

async function main() {
  console.log('========================================================');
  console.log('       PLINTH ERP - DISAMBIGUATE DUPLICATE BOMS        ');
  console.log('========================================================');
  console.log(`Database: ${maskedUrl}`);
  console.log(`Execution Mode: ${apply ? 'APPLY (Changes will be written)' : 'DRY-RUN (Preview only)'}\n`);

  try {
    const allBoms = await prisma.bomVersion.findMany({
      select: {
        id: true,
        bomNumber: true,
        version: true,
        createdAt: true,
        status: true,
        productId: true,
        materialId: true,
        product: { select: { name: true, sku: true } },
        material: { select: { name: true, code: true } },
        _count: { select: { lines: true } }
      },
      orderBy: [
        { bomNumber: 'asc' },
        { version: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    const existingNamesSet = new Set(
      allBoms.map((b) => String(b.bomNumber || '').trim().toLowerCase()).filter(Boolean)
    );

    // Group by trimmed lowercase BOM number
    const groups = new Map();
    for (const bom of allBoms) {
      const key = String(bom.bomNumber || '').trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bom);
    }

    const updates = [];

    for (const [key, boms] of groups.entries()) {
      if (boms.length <= 1) continue;

      // The first (earliest) keeps its original name
      const [original, ...duplicates] = boms;

      for (const dup of duplicates) {
        const newName = getNextIncrementedBomName(dup.bomNumber, existingNamesSet);
        existingNamesSet.add(newName.toLowerCase());

        const itemName = dup.product?.name || dup.material?.name || '(Unassigned)';
        const itemCode = dup.product?.sku || dup.material?.code || '';

        updates.push({
          id: dup.id,
          oldName: dup.bomNumber,
          newName,
          version: dup.version,
          status: dup.status,
          lines: dup._count.lines,
          itemName: itemCode ? `${itemName} (${itemCode})` : itemName,
          createdAt: dup.createdAt
        });
      }
    }

    if (updates.length === 0) {
      console.log('✅ No duplicate BOM names found. All Bill of Materials records are unique!\n');
      return;
    }

    console.log(`Found ${updates.length} duplicate BOM version records across ${allBoms.length} total BOMs:\n`);
    console.table(
      updates.map((u) => ({
        'Old BOM Name': u.oldName,
        'New BOM Name': u.newName,
        Version: `v${u.version}`,
        Lines: u.lines,
        Item: u.itemName.slice(0, 30),
        Status: u.status
      }))
    );

    if (!apply) {
      console.log('\n--------------------------------------------------------');
      console.log('ℹ️  DRY RUN COMPLETED. No database changes were made.');
      console.log('To apply these renames, run:');
      console.log('   npm run db:disambiguate-boms -- --apply');
      console.log('--------------------------------------------------------\n');
      return;
    }

    console.log('\nApplying renames to database inside transaction...');
    await prisma.$transaction(
      updates.map((u) =>
        prisma.bomVersion.update({
          where: { id: u.id },
          data: { bomNumber: u.newName }
        })
      )
    );

    console.log(`\n🎉 Successfully renamed ${updates.length} duplicate BOM records!\n`);
  } catch (error) {
    console.error('\n❌ Error during BOM disambiguation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
