import { PrismaClient, LifecycleStatus, MaterialType } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { seedHsnSacCodes } from './seed-hsn-sac';

const prisma = new PrismaClient();

interface ExtractedProduct {
  sku: string;
  name: string;
  asin?: string | null;
  mrp?: number | null;
  source: string;
}

interface ExtractedMaterial {
  code: string;
  name: string;
  specs?: string;
  unit?: string;
  rate?: number | null;
  source: string;
}

interface ExtractedDepartment {
  code: string;
  name: string;
  source?: string;
}

interface ExtractedData {
  products: ExtractedProduct[];
  materials: ExtractedMaterial[];
  departments: ExtractedDepartment[];
  uoms: { code: string; name: string }[];
  parties: { name: string; role: string; source: string }[];
  employees: { name: string; role: string; source: string }[];
}

const toCode = (v: string) =>
  String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

// Enterprise Categories definition
const CATEGORIES = [
  { code: 'CLOTH-DRYING-STANDS', name: 'Cloth Drying Stands', description: 'Floor standing and wall-mounted foldable cloth drying systems' },
  { code: 'CEILING-DRYERS', name: 'Ceiling Cloth Dryers', description: 'Individual and full drop-down ceiling mounted pulley dryers' },
  { code: 'LAUNDRY-ACCESSORIES', name: 'Laundry Accessories', description: 'Stainless steel cloth clips, pegs, and specialized ironing mats' },
  { code: 'HOME-KITCHEN', name: 'Home & Kitchen Storage', description: 'Multi-layer kitchen trolleys and chopping boards' },
  { code: 'BATHROOM-HARDWARE', name: 'Bathroom Hardware', description: 'Stainless steel towel rods, folding racks, and shelves' },
  { code: 'RAW-POLYMERS', name: 'Polymers & Moulding Granules', description: 'ABS polymers, masterbatches, and injection moulding compounds' },
  { code: 'SPARES-ACCESSORIES', name: 'Spare Parts & Accessories', description: 'Replacement ropes, nylon pulleys, plastic caps, fasteners, and packaging' },
];

// Product Families definition
const PRODUCT_FAMILIES = [
  { code: 'FLOOR-STANDS', name: 'Cloth Drying Floor Stands (CS Series)', categoryCode: 'CLOTH-DRYING-STANDS' },
  { code: 'WALL-MOUNT-STANDS', name: 'Wall-Mounted Foldable Dryers (GL Series)', categoryCode: 'CLOTH-DRYING-STANDS' },
  { code: 'CEILING-DRYERS-INDIVIDUAL', name: 'Individual Drop-Down Ceiling Dryers (CL Series)', categoryCode: 'CEILING-DRYERS' },
  { code: 'CEILING-DRYERS-FULL', name: 'Full Drop-Down Ceiling Dryers (CE Series)', categoryCode: 'CEILING-DRYERS' },
  { code: 'CLOTH-CLIPS', name: 'Stainless Steel Cloth Clips (CC Series)', categoryCode: 'LAUNDRY-ACCESSORIES' },
  { code: 'IRONING-MATS', name: 'Ironing Mats & Board Alternatives (IM Series)', categoryCode: 'LAUNDRY-ACCESSORIES' },
  { code: 'KITCHEN-TROLLEYS', name: 'Kitchen Storage Trolleys (ST Series)', categoryCode: 'HOME-KITCHEN' },
  { code: 'CHOPPING-BOARDS', name: 'Chopping Boards (CB Series)', categoryCode: 'HOME-KITCHEN' },
  { code: 'BATHROOM-ACCESSORIES', name: 'Bathroom Fixtures & Racks (TH Series)', categoryCode: 'BATHROOM-HARDWARE' },
  { code: 'SPARES-HARDWARE', name: 'Spare Parts, Ropes & Hardware Kits', categoryCode: 'SPARES-ACCESSORIES' },
];

function resolveProductFamily(sku: string): string {
  const s = sku.toUpperCase();
  if (s.startsWith('CS')) return 'FLOOR-STANDS';
  if (s.startsWith('GL')) return 'WALL-MOUNT-STANDS';
  if (s.startsWith('CL-') || s.startsWith('CL1') || s.startsWith('CL2') || s.startsWith('CL3') || s.startsWith('CL4') || s.startsWith('CL5') || s.startsWith('CL6')) {
    return 'CEILING-DRYERS-INDIVIDUAL';
  }
  if (s.startsWith('CE-') || s.startsWith('CE1') || s.startsWith('CE2') || s.startsWith('CE3') || s.startsWith('CE4') || s.startsWith('CE5') || s.startsWith('CE6')) {
    return 'CEILING-DRYERS-FULL';
  }
  if (s.startsWith('CC')) return 'CLOTH-CLIPS';
  if (s.startsWith('IM')) return 'IRONING-MATS';
  if (s.startsWith('ST-')) return 'KITCHEN-TROLLEYS';
  if (s.startsWith('CB')) return 'CHOPPING-BOARDS';
  if (s.startsWith('TH') || s.startsWith('SY-TH')) return 'BATHROOM-ACCESSORIES';
  return 'SPARES-HARDWARE';
}

function resolveMaterialType(name: string): { type: MaterialType; categoryCode: string } {
  const n = name.toUpperCase();
  if (n.includes('ABSOLAC') || n.includes('MASTER BATCH') || n.includes('GRANULE') || n.includes('NATURAL MATERIAL')) {
    return { type: MaterialType.RAW_MATERIAL, categoryCode: 'RAW-POLYMERS' };
  }
  if (n.includes('PIPE') || n.includes('ROD') || n.includes('TUBE') || n.includes('MM') || n.includes('1/2') || n.includes('5/8') || n.includes('CUTTING')) {
    return { type: MaterialType.RAW_MATERIAL, categoryCode: 'SPARES-ACCESSORIES' };
  }
  if (n.includes('BOX') || n.includes('LABEL') || n.includes('CARTON') || n.includes('PACK') || n.includes('TAPE')) {
    return { type: MaterialType.PACKAGING, categoryCode: 'SPARES-ACCESSORIES' };
  }
  return { type: MaterialType.COMPONENT, categoryCode: 'SPARES-ACCESSORIES' };
}

async function main() {
  console.log('🚀 Starting official Plinth International master data seeding...');

  const dataPath = path.join(__dirname, 'plinth-official-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found at: ${dataPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as ExtractedData;
  console.log(`📦 Loaded dataset: ${raw.products.length} products, ${raw.materials.length} materials, ${raw.departments.length} departments.`);

  // 1. Units of Measure
  console.log('📐 1. Seeding Units of Measure...');
  const uomDefs = [
    { code: 'PCS', name: 'PIECES', symbol: 'PCS', dimension: 'COUNT' },
    { code: 'KG', name: 'Kilograms', symbol: 'kg', dimension: 'MASS' },
    { code: 'KGS', name: 'KILOGRAMS', symbol: 'KGS', dimension: 'MASS' },
    { code: 'NOS', name: 'NUMBERS', symbol: 'NOS', dimension: 'COUNT' },
    { code: 'BOX', name: 'BOX', symbol: 'BOX', dimension: 'COUNT' },
    { code: 'FT', name: 'Feet', symbol: 'ft', dimension: 'LENGTH' },
    { code: 'MTR', name: 'METERS', symbol: 'MTR', dimension: 'LENGTH' },
  ];

  const uomMap = new Map<string, string>();
  for (const def of uomDefs) {
    const record = await prisma.unitOfMeasure.upsert({
      where: { code: def.code },
      update: { name: def.name, symbol: def.symbol, dimension: def.dimension, status: LifecycleStatus.ACTIVE },
      create: { code: def.code, name: def.name, symbol: def.symbol, dimension: def.dimension, status: LifecycleStatus.ACTIVE },
    });
    uomMap.set(def.code, record.id);
  }
  const defaultUomId = uomMap.get('PCS')!;
  await seedHsnSacCodes(prisma);

  // 2. Factory / Organization
  console.log('🏭 2. Seeding Factory Organization...');
  const factory = await prisma.factory.upsert({
    where: { code: 'PLINTH-HQ-INDORE' },
    update: {
      name: 'Plinth International - Indore Plant',
      address: {
        legalName: 'Plinth International',
        street: 'Nemawar Road, Palda',
        city: 'Indore',
        state: 'Madhya Pradesh',
        postalCode: '452001',
        country: 'India',
        phone: '+91-9285151928',
        email: 'sales@theplinthstore.in',
      },
      status: LifecycleStatus.ACTIVE,
    },
    create: {
      code: 'PLINTH-HQ-INDORE',
      name: 'Plinth International - Indore Plant',
      address: {
        legalName: 'Plinth International',
        street: 'Nemawar Road, Palda',
        city: 'Indore',
        state: 'Madhya Pradesh',
        postalCode: '452001',
        country: 'India',
        phone: '+91-9285151928',
        email: 'sales@theplinthstore.in',
      },
      status: LifecycleStatus.ACTIVE,
    },
  });

  // Shop-floor departments are operational setup managed through the UI.
  // Keep imported product master data from recreating departments after a reset.

  // 4. Categories
  console.log('🗂️ 4. Seeding Enterprise Categories...');
  const categoryMap = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { code: cat.code },
      update: { name: cat.name, description: cat.description, status: LifecycleStatus.ACTIVE },
      create: { code: cat.code, name: cat.name, description: cat.description, status: LifecycleStatus.ACTIVE },
    });
    categoryMap.set(cat.code, record.id);
  }

  // 5. Product Families
  console.log('👨‍👩‍👧‍👦 5. Seeding Product Families...');
  const familyMap = new Map<string, string>();
  for (const fam of PRODUCT_FAMILIES) {
    const catId = categoryMap.get(fam.categoryCode) || categoryMap.get('CLOTH-DRYING-STANDS')!;
    const record = await prisma.productFamily.upsert({
      where: { code: fam.code },
      update: { name: fam.name, categoryId: catId, status: LifecycleStatus.ACTIVE },
      create: { code: fam.code, name: fam.name, categoryId: catId, status: LifecycleStatus.ACTIVE },
    });
    familyMap.set(fam.code, record.id);
  }

  // 6. Finished Products
  console.log(`📦 6. Seeding ${raw.products.length} Finished Products...`);
  let productsCount = 0;
  for (const prod of raw.products) {
    const famCode = resolveProductFamily(prod.sku);
    const familyId = familyMap.get(famCode) || familyMap.get('FLOOR-STANDS')!;
    const famDef = PRODUCT_FAMILIES.find(f => f.code === famCode);
    const categoryId = famDef ? categoryMap.get(famDef.categoryCode)! : categoryMap.get('CLOTH-DRYING-STANDS')!;

    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {
        name: prod.name,
        description: prod.name,
        productFamilyId: familyId,
        categoryId: categoryId,
        uomId: defaultUomId,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          asin: prod.asin || null,
          mrp: prod.mrp || null,
          source: prod.source,
        },
      },
      create: {
        sku: prod.sku,
        name: prod.name,
        description: prod.name,
        productFamilyId: familyId,
        categoryId: categoryId,
        uomId: defaultUomId,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          asin: prod.asin || null,
          mrp: prod.mrp || null,
          source: prod.source,
        },
      },
    });
    productsCount += 1;
  }
  console.log(`✅ Seeded ${productsCount} Products successfully.`);

  // 7. Materials & Components
  console.log(`🔩 7. Seeding ${raw.materials.length} Raw Materials & Components...`);
  let materialsCount = 0;
  for (const mat of raw.materials) {
    const { type, categoryCode } = resolveMaterialType(mat.name);
    const catId = categoryMap.get(categoryCode);
    const uomKey = toCode(mat.unit || 'PCS');
    const uomId = uomMap.get(uomKey) || defaultUomId;

    await prisma.material.upsert({
      where: { code: mat.code },
      update: {
        name: mat.name,
        description: mat.specs || mat.name,
        materialType: type,
        categoryId: catId || null,
        uomId: uomId,
        specs: {
          description: mat.specs || mat.name,
          source: mat.source,
          rate: mat.rate || null,
        },
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        code: mat.code,
        name: mat.name,
        description: mat.specs || mat.name,
        materialType: type,
        categoryId: catId || null,
        uomId: uomId,
        specs: {
          description: mat.specs || mat.name,
          source: mat.source,
          rate: mat.rate || null,
        },
        status: LifecycleStatus.ACTIVE,
      },
    });
    materialsCount += 1;
  }
  console.log(`✅ Seeded ${materialsCount} Materials successfully.`);

  // 8. Suppliers & Vendors
  console.log('🤝 8. Seeding Vendors...');
  const vendors = [
    {
      code: 'VEND-NATASHA-CAST',
      name: 'Natasha Cast',
      contactPhone: '+91-9826012345',
      taxNumber: '23AAACN4567M1Z2',
      address: {
        street: 'Plot 12, Sector B, Sanwer Road Industrial Area',
        city: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: '23',
        postalCode: '452015',
        country: 'India'
      }
    },
    {
      code: 'VEND-RAJASTHAN-PLASTICS',
      name: 'Rajasthan Plastics',
      contactPhone: '+91-9826098765',
      taxNumber: '08AABCR1234F1Z8',
      address: {
        street: 'RIICO Industrial Area, Phase II',
        city: 'Kota',
        state: 'Rajasthan',
        stateCode: '08',
        postalCode: '324005',
        country: 'India'
      }
    },
    {
      code: 'VEND-RAVI-MISHRA',
      name: 'Ravi Mishra Consignments',
      contactPhone: '+91-9826055555',
      taxNumber: '23AABCR9876L1Z4',
      address: {
        street: '14/2 Transport Nagar',
        city: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: '23',
        postalCode: '452014',
        country: 'India'
      }
    },
    {
      code: 'VEND-SACHIN-SONI',
      name: 'Sachin Soni Polymers',
      contactPhone: '+91-9826066666',
      taxNumber: '23AADCS4321K1Z9',
      address: {
        street: '88 Pologround Industrial Estate',
        city: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: '23',
        postalCode: '452015',
        country: 'India'
      }
    },
  ];

  for (const v of vendors) {
    await prisma.vendor.upsert({
      where: { code: v.code },
      update: {
        name: v.name,
        contactPhone: v.contactPhone,
        taxNumber: v.taxNumber,
        address: v.address,
        status: LifecycleStatus.ACTIVE
      },
      create: {
        code: v.code,
        name: v.name,
        contactPhone: v.contactPhone,
        taxNumber: v.taxNumber,
        address: v.address,
        currency: 'INR',
        status: LifecycleStatus.ACTIVE
      },
    });
  }

  // Seed Vendor Capabilities (Sourced Materials)
  const natashaVendor = await prisma.vendor.findUnique({ where: { code: 'VEND-NATASHA-CAST' } });
  if (natashaVendor) {
    const natashaRodCodes = ['A-ROD-727MM', 'F-ROD-636MM', 'E-ROD-255MM', 'D-ROD-148MM', 'B-ROD-518MM', 'WING-ROD-727MM'];
    const natashaMaterials = await prisma.material.findMany({
      where: { code: { in: natashaRodCodes } },
      select: { id: true, code: true }
    });
    for (const mat of natashaMaterials) {
      const existingCap = await (prisma as any).vendorCapability.findFirst({
        where: { vendorId: natashaVendor.id, materialId: mat.id }
      });
      if (!existingCap) {
        await (prisma as any).vendorCapability.create({
          data: {
            vendorId: natashaVendor.id,
            materialId: mat.id,
            unitPrice: 145.00,
            moq: 100,
            leadTimeDays: 7
          }
        });
      }
    }
  }

  // 9. Authoritative BOM Versions (Module 5) for Cloth Drying Stands
  console.log('📑 9. Seeding Authoritative BOM Versions & Components...');
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (adminUser) {
    const nosUomId = uomMap.get('NOS') || defaultUomId;
    const pipesUomId = uomMap.get('PCS') || defaultUomId;
    const boxUomId = uomMap.get('BOX') || defaultUomId;

    const bomConfigs = [
      {
        skuPrefix: 'CS12',
        bomNumber: 'BOM-CS12-REV01',
        note: 'Official Production Standard for CS12 Floor Stand',
        lines: [
          { name: 'SS 3/4" × 0.8mm Pipe – 12 Feet', qty: 4, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Primary upright structural frame pipes (≈5.18 kg)' },
          { name: 'SS 3/4" × 0.8mm Pipe – 20.5 Feet', qty: 2, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Secondary upper rails & cross-members (≈2.59 kg)' },
          { name: 'Lower Frame (with rods / without rods)', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Pre-welded lower modular deck frame pair (1+1)' },
          { name: 'Top Frame (with rods / without rods)', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Top tier dual folding sub-frame pair (1+1)' },
          { name: 'Top Rod', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Upper reinforcement hanger rods' },
          { name: '748mm Pipe', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Intermediate cross-support deck pipes' },
          { name: '776mm Pipe', qty: 9, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Main hanging rod tier pipes' },
          { name: 'Side Cap', qty: 6, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Moulded virgin polymer protective caps' },
          { name: 'Bottom Cap', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Anti-scratch heavy duty base floor pads' },
          { name: 'SS Hex Bolt 6x40 / 6x50 / 6x60 / 6x70', qty: 12, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Complete fastener set (2 of 6x40, 8 of 6x50, 1 of 6x60, 1 of 6x70)' },
          { name: 'Economy SS Screws', qty: 26, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Stainless steel self-tapping fixing screws' },
          { name: 'SS 8mm Hex Nut', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Grade 304 8mm hexagonal anchor nuts' },
          { name: 'SS 6mm Hex Nut', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Grade 304 6mm hexagonal pivot nuts' },
          { name: 'SS Nylock Nut 6mm', qty: 12, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Vibration-resistant nylon locking nuts' },
        ],
      },
      {
        skuPrefix: 'CS10',
        bomNumber: 'BOM-CS10-REV01',
        note: 'Official Production Standard for CS10 Wing-Frame Stand',
        lines: [
          { name: 'SS (16×16) × 0.6mm Sq Pipe', qty: 2, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Wing frame and outer structural square pipe (≈2.59 kg)' },
          { name: 'SS (18×18) × 0.6mm Sq Pipe', qty: 1, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Main upright column square pipe (≈1.295 kg)' },
          { name: 'Top Frame – 3205mm', qty: 1, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Continuous top span welded frame' },
          { name: 'Side Wing – 1388mm', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Dual foldable lateral wing frames' },
          { name: 'Bottom Legs Frame – 2200mm', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Wide-stance stability base bottom leg frame' },
          { name: 'Main Rods – 1135mm', qty: 5, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Central deck heavy duty hanging rods' },
          { name: 'Wing Rods – 523mm', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Lateral side wing hanging rods' },
          { name: 'Holding Tube / Holding Plate', qty: 5, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '1 Holding tube + 4 SS holding brackets' },
          { name: 'Connecting Tube 5/16"', qty: 6, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Pivot hinge connecting sleeves' },
          { name: 'SS 6x25 Pan Philips Screw', qty: 26, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Precision pan head phillips screws' },
          { name: 'SS Hex Bolt 6x50 / 6x30 / 6x40', qty: 10, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '4 of 6x50, 4 of 6x30, 2 of 6x40 SS bolts' },
          { name: 'SS Hex Nut / Dome Nut / Nylock Nut 6mm', qty: 12, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '2 hex nuts, 2 decorative dome caps, 8 nylock nuts' },
          { name: 'Plain Washer 6x16mm / 6x12mm', qty: 10, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '2 wide (6x16mm) + 8 standard (6x12mm) plain washers' },
          { name: 'Plastic Washer 8mm', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Friction-reducing nylon pivot washers' },
          { name: '16x16 Square Top Cap / Bottom Cap', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '4 square top end caps + 4 bottom shoe caps' },
        ],
      },
      {
        skuPrefix: 'CS11',
        bomNumber: 'BOM-CS11-REV01',
        note: 'Official Production Standard for CS11 Dual-Tier Stand',
        lines: [
          { name: 'SS (18x18) x 0.6mm Sq Pipe', qty: 0.8, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Batch ran in fractional units — round up to 1 per unit' },
          { name: 'SS (20x10) x 0.6mm Sq Pipe', qty: 1.3, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Round up to 1–2 per finished unit' },
          { name: 'SS 1/2" x 0.6mm Pipe', qty: 1.85, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Drying rail pipes for top and lower tiers' },
          { name: 'Frame pipes 1–8 (various 18x18/10x20, 250–1200mm)', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Cut length 250–1200mm with precision punch' },
          { name: 'CS11 Pipe 853mm / 883mm', qty: 17, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '11 of 853mm lower deck rods + 6 of 883mm upper wings rods' },
          { name: '(10x20) Semi Round Cap', qty: 32, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Virgin ABS black polymer anti-scratch end plugs' },
          { name: '(18x18) Square Top/Bottom Cap', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '4 square top caps + 4 heavy duty floor anti-skid shoes' },
          { name: '8mm Plastic Washer', qty: 30, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'High-friction nylon articulation washers' },
          { name: 'SS Pan Head Screw 6x32 / 6x50', qty: 34, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '22 of 6x32 + 12 of 6x50 stainless steel machine screws' },
          { name: 'SS Plain Washer 6x16mm', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Grade 304 load distributing plain washers' },
          { name: 'CS11 Chain 3mm', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Zinc-passivated safety tension lock chain' },
        ],
      },
      {
        skuPrefix: 'CS8',
        bomNumber: 'BOM-CS8-REV01',
        note: 'Official Production Standard for CS8 Compact Stand',
        lines: [
          { name: 'SS 3/4" × 0.8mm Pipe – 12 Feet', qty: 4, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Upright structural frame pipes (≈5.18 kg)' },
          { name: 'SS 3/4" × 0.8mm Pipe – 20.5 Feet', qty: 2, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Upper rails & cross-members (≈2.59 kg)' },
          { name: 'Lower/Top Frame (with & without rods)', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Modular frame tier assembly sets (~1 each)' },
          { name: 'Top Rod', qty: 2, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Top stabilizer rods' },
          { name: '827mm Pipe', qty: 5, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Intermediate deck rod pipes (~4.5 Nos)' },
          { name: '860mm Pipe', qty: 9, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Main tier hanging rod pipes (~9 Nos)' },
          { name: 'Side Cap / Bottom Cap', qty: 9, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Polymer end caps and base floor pads (~5.4 / ~3.6)' },
          { name: 'Hex bolts, nuts, washers', qty: 1, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Similar fastener set to CS12 in slightly lower ratio' },
        ],
      },
      {
        skuPrefix: 'CS9',
        bomNumber: 'BOM-CS9-REV01',
        note: 'Official Production Standard for CS9 Medium Stand',
        lines: [
          { name: 'Frame pipes 1,2,3,6,7 (18x18/10x20 variants)', qty: 5, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '18x18 square and 10x20 rectangular frame upright variants' },
          { name: 'CS9 Pipe 753mm / 783mm', qty: 11, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '8 of 753mm deck rods + 3 of 783mm top rods' },
          { name: '10x20 Semi Round Cap', qty: 16, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Black virgin ABS protective caps' },
          { name: '18x18 Square Top/Bottom Cap', qty: 8, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '4 top end plugs + 4 heavy-duty base leg shoes' },
          { name: '8mm Plastic Washer', qty: 14, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Pivot arm nylon smooth friction washers' },
          { name: 'SS Pan Head Screw 6x32 / 6x50', qty: 22, uomId: nosUomId, lineType: 'COMPONENT' as const, note: '12 of 6x32 + 10 of 6x50 stainless steel screws' },
          { name: 'SS Plain Washer 6x16mm', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Heavy duty SS plain load-distributing washers' },
        ],
      },
      {
        skuPrefix: 'CS3',
        bomNumber: 'BOM-CS3-REV01',
        note: 'Official Production Standard for CS3 Foldable Patti Pack',
        lines: [
          { name: 'CS3 Short Patti', qty: 4, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Laser-cut stainless steel pivot links' },
          { name: 'CS3 Long Patti', qty: 12, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: 'Foldable trellis scissor extension arms' },
          { name: 'CS3 RHS Bend / LHS Bend', qty: 2, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: '1 Right-hand bend + 1 Left-hand bend wall brackets' },
          { name: 'CS3 Inner Box / Outer Box', qty: 2, uomId: boxUomId, lineType: 'PACKAGING' as const, note: '1 printed individual product carton + 1 corrugated outer pack' },
          { name: 'Spot Weld 9.5mm Rods – 2 Feet', qty: 7, uomId: pipesUomId, lineType: 'COMPONENT' as const, note: '7 pre-cut 2ft rods with spot-weld end prep' },
          { name: 'SS Hex Bolt 5x12', qty: 20, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Scissor lattice stainless pivot bolts' },
          { name: 'SS Hex Bolt 5x20', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Wall bracket anchor pivot bolts' },
          { name: 'SS Plain Washer 6mm', qty: 64, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Anti-friction spacing washers for all scissor joints' },
          { name: 'SS Nylock Nut 5mm', qty: 10, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Self-locking nuts for smooth folding articulation' },
          { name: 'SS Screw 8x38 CSK', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Countersunk wall-mounting stainless steel screws' },
          { name: 'Luxury Wall Plug', qty: 4, uomId: nosUomId, lineType: 'COMPONENT' as const, note: 'Heavy-grip nylon masonry wall expansion plugs' },
        ],
      },
    ];

    for (const b of bomConfigs) {
      const targetProduct = await prisma.product.findFirst({
        where: {
          OR: [
            { sku: { contains: b.skuPrefix, mode: 'insensitive' } },
            { name: { contains: b.skuPrefix, mode: 'insensitive' } },
          ],
        },
      });

      if (targetProduct) {
        const existingBom = await prisma.bomVersion.findFirst({ where: { bomNumber: b.bomNumber } });
        if (!existingBom) {
          const created = await prisma.bomVersion.create({
            data: {
              bomNumber: b.bomNumber,
              productId: targetProduct.id,
              variantScopeKey: '',
              version: 1,
              status: 'APPROVED',
              note: b.note,
              createdByActorId: adminUser.id,
              approvedByActorId: adminUser.id,
              approvedAt: new Date(),
              effectiveDate: new Date(),
              lines: {
                create: b.lines.map((l, idx) => ({
                  lineType: l.lineType,
                  uomId: l.uomId,
                  quantityMode: 'FIXED',
                  quantity: l.qty,
                  roundingRule: 'NONE',
                  sequence: idx + 1,
                  note: `${l.name} — ${l.note}`,
                })),
              },
            },
          });
          console.log(`  + Seeded Approved BOM ${b.bomNumber} for Product: ${targetProduct.sku} (${targetProduct.name})`);
        }
      }
    }
  }

  console.log('🎉 Official Plinth International Master Data seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
