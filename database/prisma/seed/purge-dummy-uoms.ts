import { PrismaClient, LifecycleStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Canonical UOMs to ensure exist
const CANONICAL_UOMS = [
  { code: 'PCS', name: 'PIECES', symbol: 'PCS', dimension: 'COUNT' },
  { code: 'KG', name: 'Kilograms', symbol: 'kg', dimension: 'MASS' },
  { code: 'G', name: 'Grams', symbol: 'g', dimension: 'MASS' },
  { code: 'MTR', name: 'METERS', symbol: 'MTR', dimension: 'LENGTH' },
  { code: 'MM', name: 'Millimeters', symbol: 'mm', dimension: 'LENGTH' },
  { code: 'LTR', name: 'Liters', symbol: 'L', dimension: 'VOLUME' },
  { code: 'ML', name: 'Milliliters', symbol: 'mL', dimension: 'VOLUME' },
  { code: 'NOS', name: 'NUMBERS', symbol: 'NOS', dimension: 'COUNT' },
  { code: 'BOX', name: 'BOX', symbol: 'BOX', dimension: 'COUNT' },
  { code: 'FT', name: 'Feet', symbol: 'ft', dimension: 'LENGTH' },
];

// Placeholder GST UQC codes that must be removed from the UnitOfMeasure table
const PLACEHOLDER_UOM_CODES = [
  'BAG', 'BAL', 'BDL', 'BKL', 'BOU', 'BTL', 'BUN', 'CAN', 'CBM', 'CCM',
  'CMS', 'CTN', 'DOZ', 'DRM', 'EA', 'GGR', 'GMS', 'GRS', 'GYD', 'KGS',
  'KLR', 'KME', 'MLT', 'MTS', 'OTH', 'PAC', 'PACK', 'PRS', 'QTL', 'ROL',
  'ROLL', 'SET', 'SQF', 'SQM', 'SQY', 'TBS', 'TGM', 'THD', 'TON', 'TUB',
  'UGS', 'UNT', 'YDS'
];

// Remapping table in case any records are referencing placeholder codes
const FALLBACK_MAP: Record<string, string> = {
  EA: 'NOS',
  UNT: 'NOS',
  OTH: 'PCS',
  SET: 'PCS',
  PACK: 'BOX',
  PAC: 'BOX',
  ROLL: 'PCS',
  ROL: 'PCS',
  PRS: 'PCS',
  DOZ: 'PCS',
  CTN: 'BOX',
  BAG: 'BOX',
  BAL: 'BOX',
  BDL: 'BOX',
  BKL: 'PCS',
  BOU: 'NOS',
  BTL: 'NOS',
  BUN: 'NOS',
  CAN: 'NOS',
  DRM: 'NOS',
  TUB: 'NOS',
  KGS: 'KG',
  GMS: 'G',
  GRS: 'G',
  TGM: 'G',
  QTL: 'KG',
  TON: 'KG',
  MTS: 'KG',
  CMS: 'MM',
  KME: 'MTR',
  YDS: 'MTR',
  GYD: 'MTR',
  SQF: 'MTR',
  SQM: 'MTR',
  SQY: 'MTR',
  CBM: 'LTR',
  CCM: 'ML',
  KLR: 'LTR',
  MLT: 'ML',
  UGS: 'LTR',
  TBS: 'NOS',
  THD: 'NOS',
};

async function main() {
  console.log('🧹 Starting UnitOfMeasure placeholder cleanup...');

  // 1. Ensure all 10 canonical UOMs exist
  const canonicalMap = new Map<string, string>(); // code -> id
  for (const item of CANONICAL_UOMS) {
    const uom = await prisma.unitOfMeasure.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        symbol: item.symbol,
        dimension: item.dimension,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        code: item.code,
        name: item.name,
        symbol: item.symbol,
        dimension: item.dimension,
        status: LifecycleStatus.ACTIVE,
      },
    });
    canonicalMap.set(uom.code, uom.id);
  }
  console.log(`✅ Ensured ${canonicalMap.size} canonical enterprise UOMs are active.`);

  const pcsId = canonicalMap.get('PCS')!;

  // 2. Find all placeholder UOMs currently in the database
  const placeholders = await prisma.unitOfMeasure.findMany({
    where: {
      code: { in: PLACEHOLDER_UOM_CODES },
    },
  });

  console.log(`🔍 Found ${placeholders.length} placeholder UOM records in database.`);

  if (placeholders.length === 0) {
    console.log('✨ No placeholder UOMs found. Database is already clean!');
    return;
  }

  // 3. Remap references for each placeholder UOM
  for (const placeholder of placeholders) {
    const targetCode = FALLBACK_MAP[placeholder.code] || 'PCS';
    const targetId = canonicalMap.get(targetCode) || pcsId;

    // Remap Products
    const updatedProducts = await prisma.product.updateMany({
      where: { uomId: placeholder.id },
      data: { uomId: targetId },
    });
    if (updatedProducts.count > 0) {
      console.log(`  ↪ Remapped ${updatedProducts.count} Products from ${placeholder.code} to ${targetCode}`);
    }

    // Remap Materials
    const updatedMaterials = await prisma.material.updateMany({
      where: { uomId: placeholder.id },
      data: { uomId: targetId },
    });
    if (updatedMaterials.count > 0) {
      console.log(`  ↪ Remapped ${updatedMaterials.count} Materials from ${placeholder.code} to ${targetCode}`);
    }

    // Delete UOM Conversions involving this placeholder
    await prisma.uomConversion.deleteMany({
      where: {
        OR: [
          { fromUomId: placeholder.id },
          { toUomId: placeholder.id },
        ],
      },
    });

    // Remap PackSizes
    await prisma.packSize.updateMany({
      where: { uomId: placeholder.id },
      data: { uomId: targetId },
    });

    // Delete the placeholder UOM
    try {
      await prisma.unitOfMeasure.delete({
        where: { id: placeholder.id },
      });
      console.log(`  🗑️ Deleted placeholder UOM: ${placeholder.code} (${placeholder.name})`);
    } catch (err) {
      console.warn(`  ⚠️ Could not hard-delete ${placeholder.code}, setting to INACTIVE:`, (err as Error).message);
      await prisma.unitOfMeasure.update({
        where: { id: placeholder.id },
        data: { status: LifecycleStatus.INACTIVE },
      });
    }
  }

  const remaining = await prisma.unitOfMeasure.findMany({
    where: { status: LifecycleStatus.ACTIVE },
    orderBy: { code: 'asc' },
  });

  console.log(`\n🎉 Cleanup finished! Remaining Active UOMs (${remaining.length}):`);
  console.log(remaining.map((u) => `${u.code} - ${u.name} (${u.symbol})`).join(', '));
}

main()
  .catch((e) => {
    console.error('❌ Error during UOM purge:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
