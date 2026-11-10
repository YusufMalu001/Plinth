import { PrismaClient, LifecycleStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

interface RouteDefinition {
  productSkuKeywords: string[];
  productCode: string;
  departmentName: string;
  psCode: string;
  psId?: string;
  productionQuantity: number;
  unitNote?: string;
  makeWithoutEntry: number;
  operations: Array<{
    sequence: number;
    operationName: string;
    departmentCode: string;
    workCenterCode: string;
  }>;
}

const PRODUCTION_ROUTES_MASTER: RouteDefinition[] = [
  {
    productCode: 'CS8',
    productSkuKeywords: ['CS8', 'SY-CS8'],
    departmentName: 'CS8',
    psCode: 'CS8',
    productionQuantity: 45,
    unitNote: 'Issue in multiples of 2 if using 20.5 Feet Pipe',
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'RODS CUTTING - 827mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'LASER CUTTING - FRAME', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 3, operationName: 'TUBE BENDING - FRAME', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 4, operationName: 'LASER MARKING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-MARK' },
      { sequence: 5, operationName: 'TOP ROD PUNCHING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 6, operationName: 'LASER CUTTING - 860mm', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 7, operationName: 'RODS CUTTING - 827mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 8, operationName: 'MATERIAL ISSUE', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
      { sequence: 9, operationName: 'ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS9 RAW',
    productSkuKeywords: ['CS9', 'SY-CS9'],
    departmentName: 'CS9 - RAW',
    psCode: 'CS9',
    productionQuantity: 50,
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'LASER CUTTING - FRAME', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 2, operationName: 'LASER MARKING (PIPE no. 1)', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-MARK' },
      { sequence: 3, operationName: 'BUFFING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 4, operationName: 'PIPE CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 5, operationName: 'ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS10 RAW',
    productSkuKeywords: ['CS10', 'SY-CS10'],
    departmentName: 'CS10 - RAW',
    psCode: 'CS10RAW',
    productionQuantity: 1,
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'LASER CUTTING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 2, operationName: 'BUFFING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 3, operationName: 'TUBE BENDING', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 4, operationName: 'LASER MARKING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-MARK' },
      { sequence: 5, operationName: 'PIPE CUTTING - 1135mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 6, operationName: 'PIPE CUTTING - 523mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 7, operationName: 'MATERIAL ISSUE', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
      { sequence: 8, operationName: 'ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS11 RAW',
    productSkuKeywords: ['CS11', 'SY-CS11'],
    departmentName: 'CS11 - RAW',
    psId: 'CS11-0826-8',
    psCode: 'CS11',
    productionQuantity: 10,
    unitNote: 'To be issued in multiples of 10',
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'LASER CUTTING - FRAME', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 2, operationName: 'LASER MARKING (PIPE no. 1)', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-MARK' },
      { sequence: 3, operationName: 'BUFFING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 4, operationName: 'PIPE CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 5, operationName: 'CS11 853mm STOCK', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
      { sequence: 6, operationName: 'CS11 883mm STOCK', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
      { sequence: 7, operationName: 'ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS12 RAW',
    productSkuKeywords: ['CS12', 'SY-CS12'],
    departmentName: 'CS12 - RAW',
    psCode: 'CS12RAW',
    productionQuantity: 100,
    unitNote: 'Issue in units of 2 if using 20.5 Feet Pipe',
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'LASER CUTTING - FRAME', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 2, operationName: 'TUBE BENDING - FRAME', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 3, operationName: 'LASER MARKING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-MARK' },
      { sequence: 4, operationName: 'TOP ROD PUNCHING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 5, operationName: 'PIPE CUTTING - 748mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 6, operationName: 'PIPE CUTTING - 776mm', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 7, operationName: 'MATERIAL ISSUE', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
      { sequence: 8, operationName: 'ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS15',
    productSkuKeywords: ['CS15', 'SY-CS15', 'JHUMER'],
    departmentName: 'CS15 - JHUMER',
    psCode: 'CS15',
    productionQuantity: 25,
    unitNote: '25-Clip Cloth Hanger Unit',
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'WIRE & FRAME CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'FRAME FORMING & BENDING', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 3, operationName: 'SPOT WELDING & RIVETING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 4, operationName: 'CLIP ATTACHMENT & ARTICULATION', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
      { sequence: 5, operationName: 'BUFFING & POLISHING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 6, operationName: 'FINAL QC & PACKAGING', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
    ]
  },
  {
    productCode: 'CS13',
    productSkuKeywords: ['CS13', 'SY-CS13'],
    departmentName: 'CS13',
    psCode: 'CS13',
    productionQuantity: 25,
    makeWithoutEntry: 25,
    operations: [
      { sequence: 1, operationName: 'WIRE & FRAME CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'FRAME FORMING & BENDING', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 3, operationName: 'SPOT WELDING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 4, operationName: 'CLIP ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
      { sequence: 5, operationName: 'BUFFING & POLISHING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 6, operationName: 'FINAL PACKAGING', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
    ]
  },
  {
    productCode: 'CS1',
    productSkuKeywords: ['CS1', 'SY-CS1'],
    departmentName: 'CS1',
    psCode: 'CS1',
    productionQuantity: 10,
    makeWithoutEntry: 10,
    operations: [
      { sequence: 1, operationName: 'ROD & FRAME CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'LASER CUTTING & MARKING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 3, operationName: 'TUBE BENDING', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 4, operationName: 'BASE FRAME WELDING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 5, operationName: 'BUFFING & POLISHING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 6, operationName: 'FINAL ASSEMBLY & PACKAGING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  },
  {
    productCode: 'CS19-21',
    productSkuKeywords: ['CS19', 'SY-CS19', 'CS20', 'SY-CS20', 'CS21', 'SY-CS21'],
    departmentName: 'CS19-21 SS STANDS',
    psCode: 'CS19-21',
    productionQuantity: 20,
    makeWithoutEntry: 20,
    operations: [
      { sequence: 1, operationName: 'TIER FRAME CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'TUBE BENDING & PUNCHING', departmentCode: 'DEPT-TUBE', workCenterCode: 'WC-TUBE-BEND' },
      { sequence: 3, operationName: 'DECK SPOT WELDING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 4, operationName: 'CASTER & PLASTIC FITTING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
      { sequence: 5, operationName: 'BUFFING & INSPECTION', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 6, operationName: 'BOX PACKAGING', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
    ]
  },
  {
    productCode: 'GLIDER',
    productSkuKeywords: ['GL', 'SY-GL', 'SY-CL'],
    departmentName: 'GLIDER / CEILING',
    psCode: 'GLIDER',
    productionQuantity: 30,
    makeWithoutEntry: 30,
    operations: [
      { sequence: 1, operationName: 'PIPE EXTRUSION CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'LASER PATTI & BRACKET CUTTING', departmentCode: 'DEPT-LASER', workCenterCode: 'WC-LASER-CUT' },
      { sequence: 3, operationName: 'PULLEY & ROPE ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
      { sequence: 4, operationName: 'HARDWARE PACKAGING & BOXING', departmentCode: 'DEPT-STORE', workCenterCode: 'WC-STORE-ISSUE' },
    ]
  },
  {
    productCode: 'TROLLEY',
    productSkuKeywords: ['ST', 'SY-ST'],
    departmentName: 'KITCHEN TROLLEY',
    psCode: 'TROLLEY',
    productionQuantity: 20,
    makeWithoutEntry: 20,
    operations: [
      { sequence: 1, operationName: 'SQUARE FRAME CUTTING', departmentCode: 'DEPT-PIPE', workCenterCode: 'WC-PIPE-CUT' },
      { sequence: 2, operationName: 'BASKET MESH WELDING', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-PUNCHING' },
      { sequence: 3, operationName: 'BUFFING & CHROME FINISHING', departmentCode: 'DEPT-BUFF', workCenterCode: 'WC-BUFFING' },
      { sequence: 4, operationName: 'WHEEL & RACK ASSEMBLY', departmentCode: 'DEPT-PROD', workCenterCode: 'WC-ASSEMBLY' },
    ]
  }
];

export async function seedProductionRoutes() {
  console.log('🏭 Seeding authoritative production routes for all Synergy product families...');

  // 1. Factory
  let factory = await prisma.factory.findFirst();
  if (!factory) {
    factory = await prisma.factory.create({
      data: {
        code: 'FAC-01',
        name: 'Main Synergy Production Plant'
      }
    });
  }

  // 2. Canonical Departments
  const deptDefs = [
    { code: 'DEPT-STORE', name: 'Store & Raw Materials' },
    { code: 'DEPT-PROD', name: 'Production & Assembly' },
    { code: 'DEPT-LASER', name: 'Laser Cutting' },
    { code: 'DEPT-TUBE', name: 'Tube Bending' },
    { code: 'DEPT-PIPE', name: 'Pipe Cutting' },
    { code: 'DEPT-BUFF', name: 'Buffing & Finishing' }
  ];

  const deptMap = new Map<string, string>();
  for (const d of deptDefs) {
    const record = await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, factoryId: factory.id, status: LifecycleStatus.ACTIVE },
      create: { code: d.code, name: d.name, factoryId: factory.id, status: LifecycleStatus.ACTIVE }
    });
    deptMap.set(d.code, record.id);
  }

  // 3. Work Centers
  const wcDefs = [
    { code: 'WC-PIPE-CUT', name: 'Pipe Cutting Station', departmentCode: 'DEPT-PIPE' },
    { code: 'WC-LASER-CUT', name: 'CNC Laser Cutting Bed', departmentCode: 'DEPT-LASER' },
    { code: 'WC-TUBE-BEND', name: 'Mandrel Tube Bending Machine', departmentCode: 'DEPT-TUBE' },
    { code: 'WC-LASER-MARK', name: 'Laser Marking & Engraving Station', departmentCode: 'DEPT-LASER' },
    { code: 'WC-PUNCHING', name: 'Hydraulic Punching Press', departmentCode: 'DEPT-PROD' },
    { code: 'WC-BUFFING', name: 'High-Luster Buffing & Polishing Line', departmentCode: 'DEPT-BUFF' },
    { code: 'WC-STORE-ISSUE', name: 'Raw Material Store Dispatch Point', departmentCode: 'DEPT-STORE' },
    { code: 'WC-ASSEMBLY', name: 'Final Assembly & Riveting Station', departmentCode: 'DEPT-PROD' }
  ];

  const wcMap = new Map<string, string>();
  for (const wc of wcDefs) {
    const deptId = deptMap.get(wc.departmentCode);
    if (!deptId) continue;
    const record = await prisma.workCenter.upsert({
      where: { code: wc.code },
      update: { name: wc.name, departmentId: deptId, status: LifecycleStatus.ACTIVE },
      create: { code: wc.code, name: wc.name, departmentId: deptId, status: LifecycleStatus.ACTIVE }
    });
    wcMap.set(wc.code, record.id);
  }

  // 4. Fetch all active catalog products
  const allProducts = await prisma.product.findMany({
    where: { status: 'ACTIVE' }
  });

  // 5. Seed Routes
  for (const routeDef of PRODUCTION_ROUTES_MASTER) {
    // Find all matching products for this CS family
    const matchingProducts = allProducts.filter((p) =>
      routeDef.productSkuKeywords.some(
        (kw) =>
          p.sku.toUpperCase() === kw.toUpperCase() ||
          p.sku.toUpperCase().startsWith(`${kw.toUpperCase()} -`) ||
          p.sku.toUpperCase().startsWith(`${kw.toUpperCase()}RAW`) ||
          p.sku.toUpperCase().startsWith(`${kw.toUpperCase()}-`) ||
          p.sku.toUpperCase().includes(` ${kw.toUpperCase()}`)
      )
    );

    console.log(`\nMapping route [${routeDef.productCode}] to ${matchingProducts.length} matching products:`, matchingProducts.map(p => p.sku).join(', '));

    for (const product of matchingProducts) {
      const routeCode = `ROUTE-${product.sku.replace(/[^A-Z0-9]+/gi, '-').toUpperCase()}`;
      const routeName = `${product.sku} - Standard Production Route`;

      // Upsert Route
      const routeRecord = await prisma.productRoute.upsert({
        where: { code: routeCode },
        update: {
          name: routeName,
          productId: product.id,
          status: LifecycleStatus.APPROVED,
          effectiveFrom: new Date('2026-01-01'),
          version: 1
        },
        create: {
          code: routeCode,
          name: routeName,
          productId: product.id,
          status: LifecycleStatus.APPROVED,
          effectiveFrom: new Date('2026-01-01'),
          version: 1
        }
      });

      // Clear existing steps for idempotent clean seed
      await prisma.routeStep.deleteMany({
        where: { routeId: routeRecord.id }
      });

      // Insert operations precisely preserving duplicate steps like sequence 1 and 7 in CS8
      for (const op of routeDef.operations) {
        const deptId = deptMap.get(op.departmentCode)!;
        const workCenterId = wcMap.get(op.workCenterCode)!;

        await prisma.routeStep.create({
          data: {
            id: randomUUID(),
            routeId: routeRecord.id,
            sequenceNumber: op.sequence,
            stepName: op.operationName,
            departmentId: deptId,
            workCenterId: workCenterId,
            status: LifecycleStatus.APPROVED,
            standardDurationMinutes: 15,
            isQcRequired: op.operationName.includes('BUFFING') || op.operationName.includes('ASSEMBLY')
          }
        });
      }

      console.log(`  ✓ Seeded route ${routeCode} (${routeDef.operations.length} operations) for ${product.sku}`);
    }
  }

  // 6. Ensure any remaining active products without routes get a standard production route
  const remainingProducts = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      routes: { none: {} }
    }
  });

  const defaultDeptId = deptMap.get('DEPT-PROD') || Array.from(deptMap.values())[0];
  const defaultWcId = wcMap.get('WC-ASSEMBLY') || Array.from(wcMap.values())[0];

  for (const product of remainingProducts) {
    const routeCode = `ROUTE-${product.sku.replace(/[^A-Z0-9]+/gi, '-').toUpperCase()}`;
    const routeName = `${product.sku} - Standard Production Route`;

    const routeRecord = await prisma.productRoute.upsert({
      where: { code: routeCode },
      update: {
        name: routeName,
        productId: product.id,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01'),
        version: 1
      },
      create: {
        code: routeCode,
        name: routeName,
        productId: product.id,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01'),
        version: 1
      }
    });

    await prisma.routeStep.deleteMany({
      where: { routeId: routeRecord.id }
    });

    const defaultOps = [
      { sequence: 1, name: 'RAW MATERIAL CUTTING & PREPARATION', dept: deptMap.get('DEPT-PIPE') || defaultDeptId, wc: wcMap.get('WC-PIPE-CUT') || defaultWcId, isQc: false },
      { sequence: 2, name: 'SUB-ASSEMBLY & FORMING', dept: deptMap.get('DEPT-PROD') || defaultDeptId, wc: wcMap.get('WC-PUNCHING') || defaultWcId, isQc: false },
      { sequence: 3, name: 'FINAL ASSEMBLY & QC INSPECTION', dept: deptMap.get('DEPT-PROD') || defaultDeptId, wc: defaultWcId, isQc: true },
      { sequence: 4, name: 'PACKAGING & STORE TRANSFER', dept: deptMap.get('DEPT-STORE') || defaultDeptId, wc: wcMap.get('WC-STORE-ISSUE') || defaultWcId, isQc: false },
    ];

    for (const op of defaultOps) {
      await prisma.routeStep.create({
        data: {
          id: randomUUID(),
          routeId: routeRecord.id,
          sequenceNumber: op.sequence,
          stepName: op.name,
          departmentId: op.dept,
          workCenterId: op.wc,
          status: LifecycleStatus.APPROVED,
          standardDurationMinutes: 20,
          isQcRequired: op.isQc
        }
      });
    }

    console.log(`  ✓ Generated standard route ${routeCode} for remaining product ${product.sku}`);
  }

  // 7. Auto-link any production plans that have routeId: null to their product's approved route
  const plansMissingRoutes = await prisma.productionPlan.findMany({
    where: { routeId: null },
    include: { product: true }
  });

  for (const plan of plansMissingRoutes) {
    const matchingRoute = await prisma.productRoute.findFirst({
      where: {
        productId: plan.productId,
        status: { in: [LifecycleStatus.APPROVED, LifecycleStatus.ACTIVE] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (matchingRoute) {
      await prisma.productionPlan.update({
        where: { id: plan.id },
        data: { routeId: matchingRoute.id }
      });
      console.log(`  ✓ Linked route ${matchingRoute.name} to Production Plan ${plan.planNumber}`);
    }
  }

  console.log('\n✅ Successfully seeded all CS production routes and sequence operations!');
}

if (require.main === module) {
  seedProductionRoutes()
    .catch((err) => {
      console.error('Failed to seed production routes:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
