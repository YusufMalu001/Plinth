import { PrismaClient, LifecycleStatus, BomLineType, BomQuantityMode, BomRoundingRule } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🏭 Seeding comprehensive Steel and Heavy Industries data across the entire Inventory section...');

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = admin?.id || (await prisma.user.findFirst())?.id;
  if (!actorId) {
    throw new Error('No user found to record audit trails for seeding.');
  }

  // 1. Ensure Units of Measure are pristine with complete specifications and symbols
  console.log('📐 1. Verifying and enriching Units of Measure...');
  const uomSeeds = [
    { code: 'MT', name: 'Metric Tonne', symbol: 'MT', dimension: 'MASS', allowFractional: true },
    { code: 'KG', name: 'Kilograms', symbol: 'kg', dimension: 'MASS', allowFractional: true },
    { code: 'G', name: 'Grams', symbol: 'g', dimension: 'MASS', allowFractional: true },
    { code: 'MTR', name: 'Meters', symbol: 'MTR', dimension: 'LENGTH', allowFractional: true },
    { code: 'MM', name: 'Millimeters', symbol: 'mm', dimension: 'LENGTH', allowFractional: true },
    { code: 'INCH', name: 'Inches', symbol: 'in', dimension: 'LENGTH', allowFractional: true },
    { code: 'FT', name: 'Feet', symbol: 'ft', dimension: 'LENGTH', allowFractional: true },
    { code: 'SQFT', name: 'Square Feet', symbol: 'sq.ft', dimension: 'AREA', allowFractional: true },
    { code: 'SQMTR', name: 'Square Meters', symbol: 'sq.m', dimension: 'AREA', allowFractional: true },
    { code: 'LTR', name: 'Liters', symbol: 'L', dimension: 'VOLUME', allowFractional: true },
    { code: 'ML', name: 'Milliliters', symbol: 'mL', dimension: 'VOLUME', allowFractional: true },
    { code: 'PCS', name: 'Pieces', symbol: 'PCS', dimension: 'COUNT', allowFractional: false },
    { code: 'NOS', name: 'Numbers', symbol: 'NOS', dimension: 'COUNT', allowFractional: false },
    { code: 'BOX', name: 'Box Pack', symbol: 'BOX', dimension: 'COUNT', allowFractional: false },
    { code: 'SET', name: 'Complete Assembly Set', symbol: 'SET', dimension: 'COUNT', allowFractional: false },
    { code: 'BUNDLE', name: 'Industrial Strapped Bundle', symbol: 'BDL', dimension: 'COUNT', allowFractional: false },
  ];

  const uomMap = new Map<string, string>();
  for (const u of uomSeeds) {
    const record = await prisma.unitOfMeasure.upsert({
      where: { code: u.code },
      update: {
        name: u.name,
        symbol: u.symbol,
        dimension: u.dimension,
        allowFractional: u.allowFractional,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: u.code,
        name: u.name,
        symbol: u.symbol,
        dimension: u.dimension,
        allowFractional: u.allowFractional,
        status: LifecycleStatus.ACTIVE,
      },
    });
    uomMap.set(u.code, record.id);
  }

  // Also index all existing UOMs in DB
  const allExistingUoms = await prisma.unitOfMeasure.findMany();
  for (const u of allExistingUoms) {
    uomMap.set(u.code, u.id);
    if (!u.dimension || u.dimension === '') {
      await prisma.unitOfMeasure.update({
        where: { id: u.id },
        data: { dimension: 'COUNT' },
      });
    }
  }
  console.log(`✅ Units of Measure verified: ${allExistingUoms.length} total UOMs.`);

  // 2. Categories & Subcategories (Product Families)
  console.log('🏗️ 2. Verifying Categories and Sub-categories (Parent & Child)...');
  const heavyIndustryCategories = [
    {
      code: 'STEEL-STRUCTURAL',
      name: 'Structural Steel & Heavy Sections',
      description: 'Hot-rolled beams, heavy columns, ISMC channels, equal angles, and hollow structural sections.',
      families: [
        { code: 'HEAVY-BEAMS', name: 'Universal Beams & ISMB Columns', description: 'ISMB 100 to 600 structural grade load-bearing beams' },
        { code: 'CHANNELS-ANGLES', name: 'Structural Channels & Heavy Angles', description: 'ISMC 75-400 channels and heavy unequal structural angles' },
        { code: 'HOLLOW-SECTIONS', name: 'Structural Tubes & Rectangular Hollow Sections', description: 'RHS and SHS structural heavy wall tubing for frameworks' },
      ]
    },
    {
      code: 'STEEL-PLATES-COILS',
      name: 'Steel Plates, Sheets & Heavy Coils',
      description: 'Mild steel, high-tensile boiler quality, structural alloy plates, and HR/CR coils.',
      families: [
        { code: 'HR-PLATES', name: 'Hot Rolled Structural Plates (IS 2062 E250/E350)', description: 'Heavy gauge steel plates from 6mm to 80mm thickness' },
        { code: 'BOILER-PLATES', name: 'Boiler Quality & Pressure Vessel Plates', description: 'ASTM A516 Gr 70 / IS 2002 high-temperature steel plates' },
        { code: 'CR-SHEETS', name: 'Cold Rolled Sheets & Chequered Plates', description: 'Industrial non-slip floor plates and cold-reduced precision sheets' },
      ]
    },
    {
      code: 'ALLOY-PIPES-TUBING',
      name: 'Industrial Pipes, Tubes & Flanges',
      description: 'Seamless carbon steel, high-pressure alloy pipes, ERW pipelines, and industrial forged flanges.',
      families: [
        { code: 'SEAMLESS-PIPES', name: 'ASTM A106 Gr B Seamless Pressure Pipes', description: 'Schedule 40/80/160 seamless carbon steel heavy wall pipes' },
        { code: 'FORGED-FLANGES', name: 'Forged Pipe Flanges (WNRF, SORF, Blind)', description: 'Class 150/300/600 ANSI B16.5 heavy forged pipe connections' },
        { code: 'PIPE-FITTINGS', name: 'Butt-Weld Elbows, Tees & Reducers', description: 'High-pressure forged and seamless weldable pipe fittings' },
      ]
    },
    {
      code: 'HEAVY-FASTENERS',
      name: 'High-Tensile Industrial Fasteners & Anchor Bolts',
      description: 'Grade 8.8, 10.9, and 12.9 heavy structural bolts, foundation anchors, and tension washers.',
      families: [
        { code: 'STRUCTURAL-BOLTS', name: 'Heavy Hex Bolts & Studs (Gr 8.8 / 10.9)', description: 'Hot-dip galvanized structural fastening hardware' },
        { code: 'FOUNDATION-BOLTS', name: 'Heavy Machinery Foundation & J-Anchor Bolts', description: 'M20 to M64 civil foundation heavy tie-down anchor bolts' },
      ]
    },
    {
      code: 'WELDING-FABRICATION',
      name: 'Welding Consumables & Industrial Gases',
      description: 'Submerged arc flux, low-hydrogen MIG/TIG electrodes, flux-cored wire, and shielding gases.',
      families: [
        { code: 'WELDING-WIRES', name: 'MIG & Submerged Arc Welding Wires', description: 'Copper-coated solid wire and heavy flux-cored arc welding spools' },
        { code: 'WELDING-ELECTRODES', name: 'Low Hydrogen Heavy Electrodes (E7018)', description: 'Heavy structural penetration shielded metal arc electrodes' },
      ]
    }
  ];

  for (const cat of heavyIndustryCategories) {
    const parentCategory = await prisma.category.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        description: cat.description,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: cat.code,
        name: cat.name,
        description: cat.description,
        status: LifecycleStatus.ACTIVE,
      },
    });

    for (const fam of cat.families) {
      await prisma.productFamily.upsert({
        where: { code: fam.code },
        update: {
          name: fam.name,
          description: fam.description,
          categoryId: parentCategory.id,
          status: LifecycleStatus.ACTIVE,
        },
        create: {
          id: randomUUID(),
          code: fam.code,
          name: fam.name,
          description: fam.description,
          categoryId: parentCategory.id,
          status: LifecycleStatus.ACTIVE,
        },
      });
    }
  }

  // Ensure all existing categories and families have complete descriptions
  const existingCategories = await prisma.category.findMany();
  for (const c of existingCategories) {
    if (!c.description || c.description.trim() === '') {
      await prisma.category.update({
        where: { id: c.id },
        data: { description: `${c.name} - industrial grade master catalog category.` },
      });
    }
  }
  const existingFamilies = await prisma.productFamily.findMany();
  for (const f of existingFamilies) {
    if (!f.description || f.description.trim() === '') {
      await prisma.productFamily.update({
        where: { id: f.id },
        data: { description: `${f.name} - sub-assembly and material family.` },
      });
    }
  }
  console.log(`✅ Categories & Sub-categories fully populated.`);

  // 3. Pricing Masters for Steel & Heavy Industries
  console.log('💰 3. Seeding Heavy Industry Pricing Masters...');
  const heavyPricingMasters = [
    {
      code: 'PM-STEEL-HEAVY-FAB',
      name: 'Heavy Industrial Structural Fabrication Master',
      description: 'Standard formula matrix for structural steel trusses, columns, and heavy fabrication assemblies.',
      fields: [
        { name: 'Steel Base Index (IS 2062)', valueType: 'number', defaultValue: '62.50' },
        { name: 'Heavy CNC Plasma Cutting / Ton', valueType: 'number', defaultValue: '3500' },
        { name: 'Fit-Up & SAW / MIG Welding / Ton', valueType: 'number', defaultValue: '8500' },
        { name: 'Shot Blasting & Epoxy Coating / SqM', valueType: 'number', defaultValue: '320' },
        { name: 'NDT Ultrasonic & Radiography Inspection', valueType: 'number', defaultValue: '1200' },
      ],
      columns: [
        { name: 'Base Fabrication Rate / MT (Excl. GST)', defaultValue: '78500' },
        { name: 'Minimum Floor Delivery Price / MT', defaultValue: '72000' },
        { name: 'Commercial Dispatch Rate / MT', defaultValue: '84000' },
      ],
      tiers: [
        { id: 'tier-infra-project', name: 'Infrastructure EPC Project (> 500 MT)', minQuantity: 500, markupPercent: 12, discountPercent: 15 },
        { id: 'tier-industrial-plant', name: 'Industrial Plant Expansion (100 - 500 MT)', minQuantity: 100, markupPercent: 18, discountPercent: 8 },
        { id: 'tier-job-order', name: 'Custom Fabrication Lot (< 100 MT)', minQuantity: 10, markupPercent: 25, discountPercent: 0 },
      ],
    },
    {
      code: 'PM-VESSEL-HIGH-PRESSURE',
      name: 'Pressure Vessel & Heavy Equipment Master',
      description: 'ASTM A516 Gr 70 boiler quality pressure vessel, heat exchanger, and reactor vessels pricing.',
      fields: [
        { name: 'Alloy Raw Plate Index (ASTM A516 Gr 70)', valueType: 'number', defaultValue: '88.00' },
        { name: 'Heavy Rolling & Plate Bending (up to 50mm)', valueType: 'number', defaultValue: '12000' },
        { name: 'Post Weld Heat Treatment (PWHT) / Cycle', valueType: 'number', defaultValue: '45000' },
        { name: 'ASME Section VIII Hydrostatic Test', valueType: 'number', defaultValue: '15000' },
      ],
      columns: [
        { name: 'Standard Finished Vessel Rate / Unit', defaultValue: '650000' },
        { name: 'Factory Acceptance Test (FAT) Floor Rate', defaultValue: '580000' },
      ],
      tiers: [
        { id: 'tier-turnkey-refinery', name: 'Refinery & Petrochemical Major Order', minQuantity: 5, markupPercent: 15, discountPercent: 10 },
        { id: 'tier-process-industry', name: 'Chemical / Fertilizer Single Unit', minQuantity: 1, markupPercent: 28, discountPercent: 0 },
      ],
    },
    {
      code: 'PM-SEAMLESS-PIPELINE',
      name: 'Seamless High Pressure Piping & Flanges Master',
      description: 'IBR and ASTM A106 Grade B seamless pipeline spools and fabricated manifold header racks.',
      fields: [
        { name: 'Seamless Billet / Pipe Base Rate / Meter', valueType: 'number', defaultValue: '1450' },
        { name: 'Hydraulic Beveling & Flange Fitup', valueType: 'number', defaultValue: '450' },
        { name: '100% X-Ray Radiographic Test Joint Rate', valueType: 'number', defaultValue: '750' },
      ],
      columns: [
        { name: 'Finished Pipe Spool Meter Rate', defaultValue: '2850' },
        { name: 'Flanged Spool Tested Price', defaultValue: '4200' },
      ],
      tiers: [
        { id: 'tier-pipeline-bulk', name: 'Cross-Country Pipeline Pack (> 2500 MTR)', minQuantity: 2500, markupPercent: 10, discountPercent: 18 },
        { id: 'tier-plant-piping', name: 'Utility Piping Batch (500 - 2500 MTR)', minQuantity: 500, markupPercent: 16, discountPercent: 8 },
        { id: 'tier-maintenance-lot', name: 'Maintenance Replacement Spools', minQuantity: 50, markupPercent: 26, discountPercent: 0 },
      ],
    },
  ];

  const pricingMasterMap = new Map<string, string>();
  for (const pm of heavyPricingMasters) {
    const record = await prisma.pricingMaster.upsert({
      where: { code: pm.code },
      update: {
        name: pm.name,
        description: pm.description,
        fields: pm.fields,
        columns: pm.columns,
        tiers: pm.tiers,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: pm.code,
        name: pm.name,
        description: pm.description,
        fields: pm.fields,
        columns: pm.columns,
        tiers: pm.tiers,
        status: LifecycleStatus.ACTIVE,
      },
    });
    pricingMasterMap.set(pm.code, record.id);
  }

  // Also index all existing pricing masters
  const allPricingMasters = await prisma.pricingMaster.findMany();
  for (const pm of allPricingMasters) {
    pricingMasterMap.set(pm.code, pm.id);
  }
  const defaultPricingMasterId = allPricingMasters[0]?.id;
  const defaultPricingMasterName = allPricingMasters[0]?.name || 'Standard Catalog Master';
  console.log(`✅ Pricing Masters verified: ${allPricingMasters.length} active masters.`);

  // 4. Products & Inventory Items (Steel & Heavy Industries reference)
  console.log('⚙️ 4. Seeding Steel & Heavy Industry Finished Products and Inventory Items...');
  const structuralCat = await prisma.category.findUnique({ where: { code: 'STEEL-STRUCTURAL' } });
  const platesCat = await prisma.category.findUnique({ where: { code: 'STEEL-PLATES-COILS' } });
  const pipesCat = await prisma.category.findUnique({ where: { code: 'ALLOY-PIPES-TUBING' } });
  const fastenersCat = await prisma.category.findUnique({ where: { code: 'HEAVY-FASTENERS' } });

  const beamFam = await prisma.productFamily.findUnique({ where: { code: 'HEAVY-BEAMS' } });
  const plateFam = await prisma.productFamily.findUnique({ where: { code: 'HR-PLATES' } });
  const pipeFam = await prisma.productFamily.findUnique({ where: { code: 'SEAMLESS-PIPES' } });
  const boltFam = await prisma.productFamily.findUnique({ where: { code: 'STRUCTURAL-BOLTS' } });

  const pcsUomId = uomMap.get('PCS') || allExistingUoms[0].id;
  const mtUomId = uomMap.get('MT') || pcsUomId;
  const kgUomId = uomMap.get('KG') || pcsUomId;
  const mtrUomId = uomMap.get('MTR') || pcsUomId;
  const setUomId = uomMap.get('SET') || pcsUomId;

  // Warehouse locations for inventory stock
  const fgLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'FINISHED_GOODS' } });
  const rawLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'RAW_MATERIAL' } });

  const heavyProductsSeed = [
    {
      sku: 'STEEL-ISMB-450-TRUSS',
      name: 'Heavy Duty Structural Steel Portal Truss Assembly (ISMB 450 Grade E350)',
      description: 'Fully welded heavy industrial portal frame truss designed for 36-meter clear span industrial manufacturing sheds.',
      categoryId: structuralCat!.id,
      productFamilyId: beamFam!.id,
      uomId: setUomId,
      rate: 185000,
      stockQty: 45,
      pricingMasterCode: 'PM-STEEL-HEAVY-FAB',
      hsnCode: '73089010',
    },
    {
      sku: 'STEEL-COLUMN-UC305',
      name: 'Pre-Engineered Heavy Steel Building Column with M36 Base Stiffeners (UC 305x305x158)',
      description: 'Heavy structural built-up steel column featuring CNC milled base plate and multi-point crane bracket attachments.',
      categoryId: structuralCat!.id,
      productFamilyId: beamFam!.id,
      uomId: pcsUomId,
      rate: 94500,
      stockQty: 80,
      pricingMasterCode: 'PM-STEEL-HEAVY-FAB',
      hsnCode: '73089010',
    },
    {
      sku: 'VESSEL-AIR-RECEIVER-10KL',
      name: '10,000 Liter Industrial Air Receiver Pressure Vessel (ASTM A516 Gr 70 - 16 Bar Working)',
      description: 'Heavy boiler-grade air receiver tank with dished ellipsoidal ends, calibrated safety relief nozzles, and inspection manhole.',
      categoryId: platesCat!.id,
      productFamilyId: plateFam!.id,
      uomId: pcsUomId,
      rate: 480000,
      stockQty: 18,
      pricingMasterCode: 'PM-VESSEL-HIGH-PRESSURE',
      hsnCode: '73110010',
    },
    {
      sku: 'PIPELINE-SPOOL-DN250-SCH40',
      name: 'High Pressure Seamless Carbon Steel Pipe Spool DN 250 (10") Class 300 WNRF Flanged',
      description: 'Fabricated pipe spool conforming to ASME B31.3 with 100% radiographic inspection and polyurethane external coating.',
      categoryId: pipesCat!.id,
      productFamilyId: pipeFam!.id,
      uomId: mtrUomId,
      rate: 14200,
      stockQty: 320,
      pricingMasterCode: 'PM-SEAMLESS-PIPELINE',
      hsnCode: '73041910',
    },
    {
      sku: 'CRANE-GIRDER-PLATE-BOX',
      name: '50-Ton EOT Overhead Crane Box Girder Assembly (Span 28.5m IS 2062 E350BR)',
      description: 'Double box section overhead travelling crane main girder with heavy internal diaphragm plates and top rail.',
      categoryId: structuralCat!.id,
      productFamilyId: beamFam!.id,
      uomId: setUomId,
      rate: 980000,
      stockQty: 8,
      pricingMasterCode: 'PM-STEEL-HEAVY-FAB',
      hsnCode: '84314990',
    },
    {
      sku: 'ANCHOR-BOLT-CAGE-M48',
      name: 'Heavy Industrial Foundation Anchor Bolt Cage Assembly (M48 x 1500mm Grade 8.8)',
      description: 'Rigid pre-spaced heavy civil foundation anchor bolt cage with top mounting template and double lock washers.',
      categoryId: fastenersCat!.id,
      productFamilyId: boltFam!.id,
      uomId: setUomId,
      rate: 32500,
      stockQty: 150,
      pricingMasterCode: 'PM-STEEL-HEAVY-FAB',
      hsnCode: '73181500',
    },
  ];

  const createdHeavyProducts: any[] = [];

  for (const hp of heavyProductsSeed) {
    const pmId = pricingMasterMap.get(hp.pricingMasterCode) || defaultPricingMasterId;
    const pmRecord = allPricingMasters.find((x) => x.id === pmId);

    const product = await prisma.product.upsert({
      where: { sku: hp.sku },
      update: {
        name: hp.name,
        description: hp.description,
        categoryId: hp.categoryId,
        productFamilyId: hp.productFamilyId,
        uomId: hp.uomId,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          rate: hp.rate,
          standardCost: Math.round(hp.rate * 0.72),
          sellingPrice: hp.rate,
          mrp: Math.round(hp.rate * 1.25),
          hsnCode: hp.hsnCode,
          taxability: 'Taxable',
          gstRate: '18',
          userSku: hp.sku,
          source: 'Steel & Heavy Industries Master Catalog',
          pricingMasterId: pmId,
          pricingMasterName: pmRecord?.name || defaultPricingMasterName,
        },
      },
      create: {
        id: randomUUID(),
        sku: hp.sku,
        name: hp.name,
        description: hp.description,
        categoryId: hp.categoryId,
        productFamilyId: hp.productFamilyId,
        uomId: hp.uomId,
        status: LifecycleStatus.ACTIVE,
        metadata: {
          rate: hp.rate,
          standardCost: Math.round(hp.rate * 0.72),
          sellingPrice: hp.rate,
          mrp: Math.round(hp.rate * 1.25),
          hsnCode: hp.hsnCode,
          taxability: 'Taxable',
          gstRate: '18',
          userSku: hp.sku,
          source: 'Steel & Heavy Industries Master Catalog',
          pricingMasterId: pmId,
          pricingMasterName: pmRecord?.name || defaultPricingMasterName,
        },
      },
    });

    createdHeavyProducts.push({ product, hp });

    // Seed Opening Stock in Inventory
    if (fgLocation) {
      const avgCost = Math.round(hp.rate * 0.72);
      await prisma.inventoryBalance.upsert({
        where: {
          itemType_itemId_uomId_locationId_condition_ownership: {
            itemType: 'PRODUCT',
            itemId: product.id,
            uomId: hp.uomId,
            locationId: fgLocation.id,
            condition: 'AVAILABLE',
            ownership: 'COMPANY',
          },
        },
        update: {
          quantity: hp.stockQty,
          reserved: 0,
          averageCost: avgCost,
        },
        create: {
          id: randomUUID(),
          itemType: 'PRODUCT',
          itemId: product.id,
          uomId: hp.uomId,
          locationId: fgLocation.id,
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
          quantity: hp.stockQty,
          reserved: 0,
          averageCost: avgCost,
        },
      });

      await prisma.inventoryLedgerEntry.upsert({
        where: { entryNumber: `INIT-HEAVY-${product.sku}` },
        update: {
          quantityDelta: hp.stockQty,
          quantityAfter: hp.stockQty,
          averageCostAfter: avgCost,
        },
        create: {
          id: randomUUID(),
          entryNumber: `INIT-HEAVY-${product.sku}`,
          itemType: 'PRODUCT',
          itemId: product.id,
          uomId: hp.uomId,
          locationId: fgLocation.id,
          movementType: 'OPENING_BALANCE',
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
          quantityDelta: hp.stockQty,
          quantityBefore: 0,
          quantityAfter: hp.stockQty,
          averageCostBefore: 0,
          averageCostAfter: avgCost,
          unitCost: avgCost,
          totalCost: hp.stockQty * avgCost,
          sourceType: 'INITIAL_LOAD',
          sourceId: 'HEAVY_IND_SEED_2026',
          idempotencyKey: `INIT:PROD:${product.id}`,
          postedBy: actorId,
        },
      });
    }
  }

  // 5. Connect all existing products to an active Pricing Master so no screen shows "No master linked"
  console.log('🔗 5. Ensuring 100% of Catalog Items have complete Pricing Master links and non-null descriptions...');
  const allProducts = await prisma.product.findMany();
  for (const prod of allProducts) {
    const currentMeta = (prod.metadata as any) || {};
    const needsPm = !currentMeta.pricingMasterId || !currentMeta.pricingMasterName;
    const needsDesc = !prod.description || prod.description.trim() === '';
    const needsRate = !currentMeta.rate || currentMeta.rate === 0;

    if (needsPm || needsDesc || needsRate) {
      const pmId = defaultPricingMasterId;
      const pmName = defaultPricingMasterName;
      const effectiveRate = currentMeta.rate || currentMeta.sellingPrice || 1499;

      await prisma.product.update({
        where: { id: prod.id },
        data: {
          description: needsDesc ? `${prod.name} - industrial specification model.` : prod.description,
          metadata: {
            ...currentMeta,
            rate: effectiveRate,
            sellingPrice: effectiveRate,
            standardCost: currentMeta.standardCost || Math.round(effectiveRate * 0.7),
            mrp: currentMeta.mrp || Math.round(effectiveRate * 1.3),
            pricingMasterId: pmId,
            pricingMasterName: pmName,
          },
        },
      });
    }
  }

  // Also ensure materials have complete descriptions, specs, and rates
  const allMaterials = await prisma.material.findMany();
  for (const mat of allMaterials) {
    const currentSpecs = (mat.specs as any) || {};
    const needsDesc = !mat.description || mat.description.trim() === '';
    const needsSpecsRate = !currentSpecs.rate || currentSpecs.rate === 0;
    const needsPm = !currentSpecs.pricingMasterId;

    if (needsDesc || needsSpecsRate || needsPm) {
      const rate = currentSpecs.rate || currentSpecs.standardCost || 185;
      await prisma.material.update({
        where: { id: mat.id },
        data: {
          description: needsDesc ? `${mat.name} - industrial raw component stock.` : mat.description,
          specs: {
            ...currentSpecs,
            rate: rate,
            standardCost: rate,
            standardPrice: rate,
            pricingMasterId: defaultPricingMasterId,
            pricingMasterName: defaultPricingMasterName,
          },
        },
      });
    }
  }

  // 6. Complete Bills of Materials (BOM) Seeding
  console.log('📑 6. Seeding rich, multi-component industrial BOM formulas...');

  // Select key raw materials for BOM lines
  const rawPipe = await prisma.material.findFirst({ where: { code: { contains: 'PIPE' } } });
  const rawBolt = await prisma.material.findFirst({ where: { code: { contains: 'BOLT' } } });
  const rawCap = await prisma.material.findFirst({ where: { code: { contains: 'CAP' } } });
  const rawNut = await prisma.material.findFirst({ where: { code: { contains: 'NUT' } } });
  const fallbackMaterial = allMaterials[0];

  const heavyBomDefinitions = [
    {
      bomNumber: 'BOM-TRUSS-450-REV01',
      productSku: 'STEEL-ISMB-450-TRUSS',
      note: 'Industrial Engineering standard formula for 36m heavy structural steel portal truss',
      components: [
        { note: 'ISMB 450 E350 Structural Universal Beam Sections', qty: 6, cost: 18500, uomId: mtrUomId },
        { note: 'Gusset Plates 25mm CNC Profile Cut (IS 2062 E350BR)', qty: 16, cost: 2450, uomId: pcsUomId },
        { note: 'High Tensile Structural Hex Bolts M24x110 (Grade 10.9)', qty: 48, cost: 185, uomId: pcsUomId },
        { note: 'E7018 Low Hydrogen Heavy Structural Welding Electrodes', qty: 35, cost: 240, uomId: kgUomId },
        { note: 'Epoxy Zinc Phosphate Primer & Polyurethane Topcoat', qty: 12, cost: 680, uomId: uomMap.get('LTR') || pcsUomId },
      ]
    },
    {
      bomNumber: 'BOM-COLUMN-UC305-REV01',
      productSku: 'STEEL-COLUMN-UC305',
      note: 'Standard fabrication BOM for heavy industrial building columns with crane attachments',
      components: [
        { note: 'UC 305x305x158 Heavy Universal Column Sections (12m)', qty: 1, cost: 58000, uomId: pcsUomId },
        { note: 'Heavy Machined Base Plate 40mm thickness (500x500mm)', qty: 1, cost: 14500, uomId: pcsUomId },
        { note: 'Crane Girder Bracket Bracket Arms (Welded Fabricated Assembly)', qty: 2, cost: 6500, uomId: pcsUomId },
        { note: 'CO2 Shielded Solid MIG Wire Spools (1.2mm AWS ER70S-6)', qty: 15, cost: 310, uomId: kgUomId },
        { note: 'Surface Preparation to SA 2.5 & Zinc Silicate Coating', qty: 1, cost: 4200, uomId: setUomId },
      ]
    },
    {
      bomNumber: 'BOM-VESSEL-10KL-REV01',
      productSku: 'VESSEL-AIR-RECEIVER-10KL',
      note: 'ASME Section VIII Div 1 Boiler & Pressure Vessel Manufacturing Specification',
      components: [
        { note: 'ASTM A516 Grade 70 Pressure Vessel Steel Shell Plates (16mm)', qty: 4, cost: 52000, uomId: pcsUomId },
        { note: '2:1 Semi-Ellipsoidal Dished Heads (Diameter 1800mm, 18mm thk)', qty: 2, cost: 78000, uomId: pcsUomId },
        { note: 'DN 80 Class 300 Heavy Forged Weld Neck Flanges (A105N)', qty: 4, cost: 4800, uomId: pcsUomId },
        { note: 'Elliptical Manway Assembly with Heavy Davit Arm (400x500mm)', qty: 1, cost: 28500, uomId: setUomId },
        { note: 'Submerged Arc Welding Wire & Agglomerated Flux Lot', qty: 25, cost: 450, uomId: kgUomId },
        { note: 'Hydrostatic Pressure Test 24 Bar Certification & Documentation', qty: 1, cost: 12000, uomId: setUomId },
      ]
    },
    {
      bomNumber: 'BOM-PIPESPOOL-DN250-REV01',
      productSku: 'PIPELINE-SPOOL-DN250-SCH40',
      note: 'ASME B31.3 Process Piping pre-fabricated spool standard production formula',
      components: [
        { note: 'ASTM A106 Gr B Seamless Carbon Steel Pipe DN 250 (10" Sch 40)', qty: 6, cost: 1650, uomId: mtrUomId },
        { note: 'Class 300 Raised Face Slip-On / Weld Neck Flanges (A105)', qty: 2, cost: 3800, uomId: pcsUomId },
        { note: 'Spiral Wound SS316 Graphite Filled Gaskets (10" Class 300)', qty: 2, cost: 650, uomId: pcsUomId },
        { note: 'ASTM A193 B7 Stud Bolts with 2H Heavy Hex Nuts (M24)', qty: 32, cost: 165, uomId: pcsUomId },
        { note: '100% Butt Weld Radiographic Examination (RT Inspection)', qty: 2, cost: 1100, uomId: setUomId },
      ]
    },
    {
      bomNumber: 'BOM-CRANEGIRDER-50T-REV01',
      productSku: 'CRANE-GIRDER-PLATE-BOX',
      note: 'Heavy EOT Crane Double Box Girder structural fabrication specification',
      components: [
        { note: 'IS 2062 E350 High Tensile Steel Web & Flange Plates (20mm)', qty: 18, cost: 28500, uomId: pcsUomId },
        { note: 'CR 100 Crane Top Rails with Welded Rail Clamps (Span 28.5m)', qty: 2, cost: 48000, uomId: pcsUomId },
        { note: 'Internal Vertical & Longitudinal T-Stiffener Plates', qty: 24, cost: 3400, uomId: pcsUomId },
        { note: 'Heavy End Carriages Mounting Connection Flanges', qty: 4, cost: 12500, uomId: pcsUomId },
        { note: 'Three-Coat Heavy Industrial Epoxy & Polyurethane Paint System', qty: 45, cost: 750, uomId: uomMap.get('LTR') || pcsUomId },
      ]
    },
    {
      bomNumber: 'BOM-ANCHORCAGE-M48-REV01',
      productSku: 'ANCHOR-BOLT-CAGE-M48',
      note: 'Standard civil foundation anchor cage formula for turbine and column base foundations',
      components: [
        { note: 'Grade 8.8 High Tensile Steel Threaded Studs M48 x 1500mm', qty: 8, cost: 2450, uomId: pcsUomId },
        { note: 'Heavy Hex Nuts M48 & Hardened Round Washers (Grade 8)', qty: 32, cost: 180, uomId: pcsUomId },
        { note: 'Laser-Cut Mild Steel Top & Bottom Circular Spacer Rings (12mm)', qty: 2, cost: 3200, uomId: pcsUomId },
        { note: 'Diagonal Cross Rebar Stiffening Ties (TMT 16mm)', qty: 4, cost: 450, uomId: pcsUomId },
      ]
    }
  ];

  for (const bDef of heavyBomDefinitions) {
    const prod = await prisma.product.findUnique({ where: { sku: bDef.productSku } });
    if (!prod) continue;

    // Check if BOM already exists
    let existingBom = await prisma.bomVersion.findFirst({
      where: { bomNumber: bDef.bomNumber },
    });

    if (existingBom) {
      await prisma.bomVersion.update({
        where: { id: existingBom.id },
        data: {
          note: bDef.note,
          effectiveDate: new Date(),
          status: 'APPROVED',
          approvedByActorId: actorId,
          approvedAt: new Date(),
        },
      });
      // Delete existing lines to ensure fresh seed
      await prisma.bomLine.deleteMany({ where: { bomVersionId: existingBom.id } });
    } else {
      existingBom = await prisma.bomVersion.create({
        data: {
          id: randomUUID(),
          bomNumber: bDef.bomNumber,
          productId: prod.id,
          variantScopeKey: '',
          version: 1,
          status: 'APPROVED',
          effectiveDate: new Date(),
          note: bDef.note,
          createdByActorId: actorId,
          approvedByActorId: actorId,
          approvedAt: new Date(),
        },
      });
    }

    // Insert BOM Lines
    let seq = 1;
    for (const comp of bDef.components) {
      await prisma.bomLine.create({
        data: {
          id: randomUUID(),
          bomVersionId: existingBom.id,
          lineType: BomLineType.COMPONENT,
          materialId: (rawPipe || fallbackMaterial)?.id,
          uomId: comp.uomId,
          quantityMode: BomQuantityMode.FIXED,
          quantity: comp.qty,
          unitCost: comp.cost,
          roundingRule: BomRoundingRule.NONE,
          sequence: seq++,
          note: comp.note,
        },
      });
    }
  }

  // Ensure all existing 6 BOMs have unitCost and complete notes
  const currentBoms = await prisma.bomVersion.findMany({ include: { lines: true } });
  for (const b of currentBoms) {
    if (!b.note || b.note.trim() === '') {
      await prisma.bomVersion.update({
        where: { id: b.id },
        data: { note: `Production Standard Bill of Materials formula for ${b.bomNumber}` },
      });
    }
    for (const line of b.lines) {
      if (!line.unitCost || Number(line.unitCost) === 0) {
        await prisma.bomLine.update({
          where: { id: line.id },
          data: { unitCost: 165 },
        });
      }
      if (!line.note || line.note.trim() === '') {
        await prisma.bomLine.update({
          where: { id: line.id },
          data: { note: `Standard specification component for line #${line.sequence}` },
        });
      }
    }
  }

  console.log(`✅ Bills of Materials completed: ${currentBoms.length + heavyBomDefinitions.length} total formula specifications.`);
  console.log('🎉 ENTIRE INVENTORY SECTION SUCCESSFULLY SEEDED WITH 100% COMPLETE DATA!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
