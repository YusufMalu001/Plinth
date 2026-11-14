import {
  PrismaClient,
  LifecycleStatus,
  ProductionPlanStatus,
  ProductionPlanEventType,
  BatchExecutionStatus,
  AssemblyBatchStatus,
  JobWorkOrderStatus,
  StockDirection,
  JobWorkCustodyEntryType,
} from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🏭 Starting Complete Seeding for "Manufacturing & Plant" Section...');

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = admin?.id || (await prisma.user.findFirst())?.id;
  if (!actorId) throw new Error('No user found');

  const factory = await prisma.factory.findFirst();
  if (!factory) throw new Error('No factory found');

  const rawLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'RAW_MATERIAL' } });
  const fgLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'FINISHED_GOODS' } });
  const wipLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'WIP' } });
  if (!rawLocation || !fgLocation || !wipLocation) throw new Error('Warehouse locations missing');

  // 1. Departments and Work Centers
  console.log('🏛️ 1. Seeding Manufacturing Departments and Work Centers...');
  const departmentsData = [
    {
      code: 'DEPT-CUTTING',
      name: 'Plate & Section CNC Cutting Bay',
      description: 'Heavy plate CNC plasma, oxy-fuel profile cutting, and high-speed cold circular sawing',
      isAssembly: false,
      departmentHead: 'Ramesh Sharma',
      workCenters: [
        { code: 'WC-PLASMA-01', name: 'High-Definition CNC Plasma Table 1', capacityPerHour: 45 },
        { code: 'WC-SAW-01', name: 'Automatic Heavy Mitre Band Saw Station', capacityPerHour: 30 },
      ],
    },
    {
      code: 'DEPT-FITUP-WELD',
      name: 'Structural Fit-Up & Heavy Welding Shop',
      description: 'Heavy structural fit-up jigs, submerged arc welding (SAW) gantries, and flux-cored MIG stations',
      isAssembly: false,
      departmentHead: 'Vikramaditya Rao',
      workCenters: [
        { code: 'WC-FITUP-01', name: 'Heavy Portal Truss Hydraulic Fit-up Bed', capacityPerHour: 20 },
        { code: 'WC-SAW-WELD-01', name: 'Submerged Arc Column Welder (Tandem Arc)', capacityPerHour: 15 },
      ],
    },
    {
      code: 'DEPT-MACHINING',
      name: 'Precision Milling & Flange Facing Bay',
      description: 'Heavy floor boring mills, radial drills, and portable flange facing machines',
      isAssembly: false,
      departmentHead: 'Irfan Khan',
      workCenters: [
        { code: 'WC-VBM-01', name: 'Vertical Boring & Flange Facing Lathe', capacityPerHour: 10 },
        { code: 'WC-DRILL-01', name: 'Multi-Spindle CNC Base Plate Drilling Bed', capacityPerHour: 25 },
      ],
    },
    {
      code: 'DEPT-SURFACE-FINISH',
      name: 'Shot Blasting & Protective Coating Line',
      description: 'Enclosed automatic grit blast chamber SA 2.5 and airless industrial spray booths',
      isAssembly: false,
      departmentHead: 'Prakash Nair',
      workCenters: [
        { code: 'WC-BLAST-01', name: 'Turbine Wheel Shot Blasting Chamber', capacityPerHour: 60 },
        { code: 'WC-PAINT-01', name: 'Automated Temperature-Controlled Epoxy Spray Line', capacityPerHour: 40 },
      ],
    },
    {
      code: 'DEPT-FINAL-ASSEMBLY',
      name: 'Heavy Industrial Final Assembly & Convergence Line',
      description: 'Final multi-point torque tightening, hydraulic pressure testing, and factory acceptance test bay',
      isAssembly: true,
      departmentHead: 'Anand Kumar',
      workCenters: [
        { code: 'WC-ASSEMBLY-01', name: 'Main Frame Convergence Line (Bay A)', capacityPerHour: 15 },
        { code: 'WC-FAT-TEST-01', name: 'Hydrostatic & Ultrasonic FAT Quality Station', capacityPerHour: 12 },
      ],
    },
  ];

  const deptMap = new Map<string, any>();
  const wcMap = new Map<string, any>();

  for (const d of departmentsData) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      update: {
        name: d.name,
        description: d.description,
        isAssembly: d.isAssembly,
        departmentHead: d.departmentHead,
        factoryId: factory.id,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: d.code,
        name: d.name,
        description: d.description,
        isAssembly: d.isAssembly,
        departmentHead: d.departmentHead,
        factoryId: factory.id,
        status: LifecycleStatus.ACTIVE,
      },
    });
    deptMap.set(d.code, dept);

    for (const w of d.workCenters) {
      const wc = await prisma.workCenter.upsert({
        where: { code: w.code },
        update: {
          name: w.name,
          capacityPerHour: w.capacityPerHour,
          departmentId: dept.id,
          status: LifecycleStatus.ACTIVE,
        },
        create: {
          id: randomUUID(),
          code: w.code,
          name: w.name,
          capacityPerHour: w.capacityPerHour,
          departmentId: dept.id,
          status: LifecycleStatus.ACTIVE,
        },
      });
      wcMap.set(w.code, wc);
    }
  }

  // 2. Production Routes (Shop Floor Routes)
  console.log('🛣️ 2. Seeding Production Routes (Shop Floor Routes)...');
  const heavyProducts = await prisma.product.findMany({
    where: {
      OR: [
        { sku: 'STEEL-ISMB-450-TRUSS' },
        { sku: 'STEEL-COLUMN-UC305' },
        { sku: 'VESSEL-AIR-RECEIVER-10KL' },
        { sku: 'PIPELINE-SPOOL-DN250-SCH40' },
        { sku: 'CRANE-GIRDER-PLATE-BOX' },
        { sku: 'ANCHOR-BOLT-CAGE-M48' },
        { sku: 'CS12' },
        { sku: 'CS10' },
      ],
    },
    include: { bomVersions: true, uom: true },
  });

  const routesMap = new Map<string, any>();
  const assemblyDept = deptMap.get('DEPT-FINAL-ASSEMBLY');

  for (const prod of heavyProducts) {
    const activeBom = prod.bomVersions[0];
    const routeCode = `ROUTE-${prod.sku}`;

    let route = await prisma.productRoute.findUnique({ where: { code: routeCode } });
    if (!route) {
      route = await prisma.productRoute.create({
        data: {
          id: randomUUID(),
          code: routeCode,
          name: `Standard Plant Manufacturing Route for ${prod.name.slice(0, 60)}`,
          product: { connect: { id: prod.id } },
          version: 1,
          effectiveFrom: new Date(),
          status: LifecycleStatus.ACTIVE,
          assemblyDepartment: { connect: { id: assemblyDept?.id } },
          bomVersion: activeBom ? { connect: { id: activeBom.id } } : undefined,
          graphReviewedAt: new Date(),
        },
      });
    }

    routesMap.set(prod.id, route);

    // Seed Route Steps
    await prisma.routeStep.deleteMany({ where: { routeId: route.id } });

    const stepDefs = [
      {
        order: 1,
        name: 'CNC Profile Cutting & Beveling',
        deptCode: 'DEPT-CUTTING',
        wcCode: 'WC-PLASMA-01',
        duration: 45,
        qcRequired: true,
      },
      {
        order: 2,
        name: 'Jig Fit-up & Submerged Arc Welding',
        deptCode: 'DEPT-FITUP-WELD',
        wcCode: 'WC-SAW-WELD-01',
        duration: 90,
        qcRequired: true,
      },
      {
        order: 3,
        name: 'Precision Milling & Flange Facing',
        deptCode: 'DEPT-MACHINING',
        wcCode: 'WC-VBM-01',
        duration: 60,
        qcRequired: false,
      },
      {
        order: 4,
        name: 'Shot Blasting & Epoxy Coating',
        deptCode: 'DEPT-SURFACE-FINISH',
        wcCode: 'WC-PAINT-01',
        duration: 60,
        qcRequired: true,
      },
      {
        order: 5,
        name: 'Final Convergence & Factory Acceptance Test',
        deptCode: 'DEPT-FINAL-ASSEMBLY',
        wcCode: 'WC-ASSEMBLY-01',
        duration: 120,
        qcRequired: true,
      },
    ];

    for (let sIdx = 0; sIdx < stepDefs.length; sIdx++) {
      const s = stepDefs[sIdx];
      const dept = deptMap.get(s.deptCode);
      const wc = wcMap.get(s.wcCode);
      const nextDept = sIdx < stepDefs.length - 1 ? deptMap.get(stepDefs[sIdx + 1].deptCode) : null;

      await prisma.routeStep.create({
        data: {
          id: randomUUID(),
          route: { connect: { id: route.id } },
          sequenceNumber: s.order,
          stepOrder: s.order,
          branchKey: 'MAIN',
          stepName: s.name,
          department: { connect: { id: dept.id } },
          nextDepartment: nextDept ? { connect: { id: nextDept.id } } : undefined,
          workCenter: wc ? { connect: { id: wc.id } } : undefined,
          standardDurationMinutes: s.duration,
          isQcRequired: s.qcRequired,
          status: LifecycleStatus.ACTIVE,
        },
      });
    }
  }
  console.log(`✅ Seeded ${heavyProducts.length} Production Routes with structured operational steps.`);

  // 3. Production Schedules & Execution Plans
  console.log('📋 3. Seeding Completed and In-Progress Production Schedules & Plans...');

  const planConfigs = [
    {
      planNumber: 'PLAN-2026-TRUSS-01',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      qty: 25,
      completedQty: 25,
      status: ProductionPlanStatus.COMPLETED,
      scheduleDaysAgo: 5,
      note: 'Turnkey fabrication for 36m clear-span portal frame truss. 100% completed & passed FAT testing.',
    },
    {
      planNumber: 'PLAN-2026-COLUMN-02',
      prodSku: 'STEEL-COLUMN-UC305',
      qty: 40,
      completedQty: 40,
      status: ProductionPlanStatus.COMPLETED,
      scheduleDaysAgo: 4,
      note: 'Heavy universal columns with M36 base stiffener assemblies. Fully fabricated, blast-coated and cleared to warehouse.',
    },
    {
      planNumber: 'PLAN-2026-VESSEL-03',
      prodSku: 'VESSEL-AIR-RECEIVER-10KL',
      qty: 10,
      completedQty: 5,
      status: ProductionPlanStatus.IN_PROGRESS,
      scheduleDaysAgo: 2,
      note: '10,000L Pressure vessel batch. 5 units completed; 5 units currently undergoing fit-up and hydrostatic test.',
    },
    {
      planNumber: 'PLAN-2026-SPOOL-04',
      prodSku: 'PIPELINE-SPOOL-DN250-SCH40',
      qty: 150,
      completedQty: 70,
      status: ProductionPlanStatus.IN_PROGRESS,
      scheduleDaysAgo: 1,
      note: 'High-pressure pipeline spool fabrication. 70 units completed; remaining 80 spools at final welding & X-ray stage.',
    },
    {
      planNumber: 'PLAN-2026-CRANE-05',
      prodSku: 'CRANE-GIRDER-PLATE-BOX',
      qty: 4,
      completedQty: 0,
      status: ProductionPlanStatus.RELEASED,
      scheduleDaysAgo: -1,
      note: '50-Ton EOT double box crane girder assembly. Materials allocated and queued for CNC plasma profile cutting.',
    },
    {
      planNumber: 'PLAN-2026-ANCHOR-06',
      prodSku: 'ANCHOR-BOLT-CAGE-M48',
      qty: 60,
      completedQty: 0,
      status: ProductionPlanStatus.RELEASED,
      scheduleDaysAgo: 0,
      note: 'High-tensile foundation bolt cage assemblies. Work order released to machine shop and threading line.',
    },
  ];

  for (const pc of planConfigs) {
    const prod = heavyProducts.find((p) => p.sku === pc.prodSku) || heavyProducts[0];
    const route = routesMap.get(prod.id);
    const bom = prod.bomVersions[0];

    const planDate = new Date();
    planDate.setDate(planDate.getDate() - pc.scheduleDaysAgo);

    const plan = await prisma.productionPlan.upsert({
      where: { planNumber: pc.planNumber },
      update: {
        product: { connect: { id: prod.id } },
        bomVersion: { connect: { id: bom.id } },
        route: route ? { connect: { id: route.id } } : undefined,
        owner: { connect: { id: actorId } },
        createdByActor: { connect: { id: actorId } },
        scheduleType: 'JOB_ORDER',
        scheduleDate: planDate,
        quantity: pc.qty,
        quantityUom: { connect: { id: prod.uomId } },
        completedQuantity: pc.completedQty,
        partialQuantity: pc.status === ProductionPlanStatus.IN_PROGRESS ? pc.completedQty : 0,
        status: pc.status,
        incharge: 'Haider Bhanpurawala (Production Head)',
        notes: pc.note,
        targetLocation: { connect: { id: fgLocation.id } },
        plannedStartAt: planDate,
        plannedEndAt: new Date(planDate.getTime() + 4 * 24 * 60 * 60 * 1000),
        releasedAt: planDate,
      },
      create: {
        id: randomUUID(),
        planNumber: pc.planNumber,
        product: { connect: { id: prod.id } },
        bomVersion: { connect: { id: bom.id } },
        route: route ? { connect: { id: route.id } } : undefined,
        owner: { connect: { id: actorId } },
        createdByActor: { connect: { id: actorId } },
        scheduleType: 'JOB_ORDER',
        scheduleDate: planDate,
        quantity: pc.qty,
        quantityUom: { connect: { id: prod.uomId } },
        completedQuantity: pc.completedQty,
        partialQuantity: pc.status === ProductionPlanStatus.IN_PROGRESS ? pc.completedQty : 0,
        status: pc.status,
        incharge: 'Haider Bhanpurawala (Production Head)',
        notes: pc.note,
        targetLocation: { connect: { id: fgLocation.id } },
        plannedStartAt: planDate,
        plannedEndAt: new Date(planDate.getTime() + 4 * 24 * 60 * 60 * 1000),
        releasedAt: planDate,
      },
    });

    // Plan Event Audit Trail
    await prisma.productionPlanEvent.create({
      data: {
        id: randomUUID(),
        productionPlan: { connect: { id: plan.id } },
        eventType: pc.status === ProductionPlanStatus.COMPLETED ? ProductionPlanEventType.COMPLETED : pc.status === ProductionPlanStatus.IN_PROGRESS ? ProductionPlanEventType.STARTED : ProductionPlanEventType.CREATED,
        toStatus: pc.status,
        reason: `Production schedule created and set to ${pc.status}`,
        actor: { connect: { id: actorId } },
      },
    });

    // Material Issue for the Plan
    const issueNumber = `ISSUE-${plan.planNumber}`;
    const matIssue = await prisma.productionMaterialIssue.upsert({
      where: { issueNumber },
      update: {
        productionPlan: { connect: { id: plan.id } },
        itemType: 'PRODUCT',
        itemId: prod.id,
        uom: { connect: { id: prod.uomId } },
        locationId: rawLocation.id,
        quantity: pc.qty,
        issuedByActorId: actorId,
      },
      create: {
        id: randomUUID(),
        issueNumber,
        productionPlan: { connect: { id: plan.id } },
        itemType: 'PRODUCT',
        itemId: prod.id,
        uom: { connect: { id: prod.uomId } },
        locationId: rawLocation.id,
        quantity: pc.qty,
        issuedByActorId: actorId,
      },
    });

    // 4. Shop Floor WIP Batches (Department Execution Batches)
    const cuttingDept = deptMap.get('DEPT-CUTTING');
    const plasmaWc = wcMap.get('WC-PLASMA-01');

    const batchStatus =
      pc.status === ProductionPlanStatus.COMPLETED
        ? BatchExecutionStatus.COMPLETE
        : pc.status === ProductionPlanStatus.IN_PROGRESS
        ? BatchExecutionStatus.IN_PROGRESS
        : BatchExecutionStatus.RECEIVED;

    const batchNumber = `BATCH-${plan.planNumber}-STG1`;
    await prisma.departmentExecutionBatch.upsert({
      where: { batchNumber },
      update: {
        productionPlan: { connect: { id: plan.id } },
        materialIssue: { connect: { id: matIssue.id } },
        department: { connect: { id: cuttingDept.id } },
        workCenter: { connect: { id: plasmaWc.id } },
        stageSequenceNumber: 1,
        expectedOutputQty: pc.qty,
        received_qty: pc.qty,
        completed_qty: pc.completedQty,
        pending_qty: pc.qty - pc.completedQty,
        status: batchStatus,
        createdByActorId: actorId,
        notes: `Operational stage 1 batch for ${plan.planNumber}`,
      },
      create: {
        id: randomUUID(),
        batchNumber,
        productionPlan: { connect: { id: plan.id } },
        materialIssue: { connect: { id: matIssue.id } },
        department: { connect: { id: cuttingDept.id } },
        workCenter: { connect: { id: plasmaWc.id } },
        stageSequenceNumber: 1,
        expectedOutputQty: pc.qty,
        received_qty: pc.qty,
        completed_qty: pc.completedQty,
        pending_qty: pc.qty - pc.completedQty,
        status: batchStatus,
        createdByActorId: actorId,
        notes: `Operational stage 1 batch for ${plan.planNumber}`,
      },
    });

    // 5. Completed Production Outputs
    if (pc.completedQty > 0) {
      const outputNumber = `PROD-OUT-${plan.planNumber}`;
      await prisma.productionOutput.upsert({
        where: { outputNumber },
        update: {
          productionPlan: { connect: { id: plan.id } },
          quantity: pc.completedQty,
          rejectedQuantity: 0,
          damagedQuantity: 0,
          uom: { connect: { id: prod.uomId } },
          locationId: fgLocation.id,
          recordedByActorId: actorId,
          note: `Completed production output batch for ${plan.planNumber}`,
        },
        create: {
          id: randomUUID(),
          outputNumber,
          productionPlan: { connect: { id: plan.id } },
          quantity: pc.completedQty,
          rejectedQuantity: 0,
          damagedQuantity: 0,
          uom: { connect: { id: prod.uomId } },
          locationId: fgLocation.id,
          recordedByActorId: actorId,
          note: `Completed production output batch for ${plan.planNumber}`,
        },
      });
    }

    // 6. Assembly Batches (Convergence & In-Progress / Completed Assemblies)
    const assemblyStatus =
      pc.status === ProductionPlanStatus.COMPLETED
        ? AssemblyBatchStatus.COMPLETE
        : pc.status === ProductionPlanStatus.IN_PROGRESS
        ? AssemblyBatchStatus.IN_ASSEMBLY
        : AssemblyBatchStatus.PLANNED;

    const asmbBatchNumber = `ASMB-${plan.planNumber}`;
    const asmbBatch = await prisma.assemblyBatch.upsert({
      where: { batchNumber: asmbBatchNumber },
      update: {
        product: { connect: { id: prod.id } },
        productionPlan: { connect: { id: plan.id } },
        bomVersion: { connect: { id: bom.id } },
        productRoute: route ? { connect: { id: route.id } } : undefined,
        targetOutputQuantity: pc.qty,
        actualOutputQuantity: pc.completedQty,
        status: assemblyStatus,
        notes: `Assembly & convergence execution run for ${prod.name.slice(0, 50)}`,
        createdByActor: { connect: { id: actorId } },
        plannedStartDate: planDate,
        actualStartDate: planDate,
        completedAt: pc.status === ProductionPlanStatus.COMPLETED ? new Date() : null,
      },
      create: {
        id: randomUUID(),
        batchNumber: asmbBatchNumber,
        product: { connect: { id: prod.id } },
        productionPlan: { connect: { id: plan.id } },
        bomVersion: { connect: { id: bom.id } },
        productRoute: route ? { connect: { id: route.id } } : undefined,
        targetOutputQuantity: pc.qty,
        actualOutputQuantity: pc.completedQty,
        status: assemblyStatus,
        notes: `Assembly & convergence execution run for ${prod.name.slice(0, 50)}`,
        createdByActor: { connect: { id: actorId } },
        plannedStartDate: planDate,
        actualStartDate: planDate,
        completedAt: pc.status === ProductionPlanStatus.COMPLETED ? new Date() : null,
      },
    });

    // 7. Finished Goods Ready Output (for completed assemblies)
    if (pc.completedQty > 0) {
      const fgReadyNumber = `FG-READY-${asmbBatch.batchNumber}`;
      await prisma.fgReadyOutput.upsert({
        where: { outputNumber: fgReadyNumber },
        update: {
          assemblyBatch: { connect: { id: asmbBatch.id } },
          product: { connect: { id: prod.id } },
          quantity: pc.completedQty,
          uom: { connect: { id: prod.uomId } },
          notes: `Inspected and verified ready for dispatch from ${asmbBatch.batchNumber}`,
        },
        create: {
          id: randomUUID(),
          outputNumber: fgReadyNumber,
          assemblyBatch: { connect: { id: asmbBatch.id } },
          product: { connect: { id: prod.id } },
          quantity: pc.completedQty,
          uom: { connect: { id: prod.uomId } },
          notes: `Inspected and verified ready for dispatch from ${asmbBatch.batchNumber}`,
        },
      });
    }
  }

  // 8. Dedicated Job Work Vendors, Orders, and Custody Material Issues
  console.log('🤝 4. Seeding Job Work & Outsourcing Vendors, Orders, and Material Custody...');
  const jwVendorsData = [
    {
      code: 'VEND-MEHTA-FABRICATORS',
      name: 'Mehta Heavy Industrial Fabricators',
      legalName: 'Mehta Fabricators Private Limited',
      contactEmail: 'orders@mehtafab.com',
      contactPhone: '+91-20-27129999',
      taxNumber: '27AABCM5678K1Z3',
      paymentTerms: 'NET 45 Days',
      leadTimeDays: 14,
      address: {
        street: 'Plot 7, MIDC Industrial Area, Bhosari',
        city: 'Pune',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '411026',
        country: 'India',
      },
    },
    {
      code: 'VEND-PIONEER-POWDER-COAT',
      name: 'Pioneer Automated Powder Coating & Galvanizers',
      legalName: 'Pioneer Protective Surface Coatings LLP',
      contactEmail: 'coatings@pioneercoat.com',
      contactPhone: '+91-731-4048888',
      taxNumber: '23AABCP1234J1Z6',
      paymentTerms: 'NET 30 Days',
      leadTimeDays: 7,
      address: {
        street: 'Sector C, Sanwer Road Industrial Area',
        city: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: '23',
        postalCode: '452015',
        country: 'India',
      },
    },
    {
      code: 'VEND-SHREE-PRECISION-CNC',
      name: 'Shree Heavy CNC Boring & Milling Works',
      legalName: 'Shree Precision Machining Works',
      contactEmail: 'machining@shreeprecision.in',
      contactPhone: '+91-265-2634444',
      taxNumber: '24AAACS7890H1Z5',
      paymentTerms: 'NET 30 Days',
      leadTimeDays: 10,
      address: {
        street: 'Makarpura GIDC Industrial Estate',
        city: 'Vadodara',
        state: 'Gujarat',
        stateCode: '24',
        postalCode: '390010',
        country: 'India',
      },
    },
  ];

  const jwVendorMap = new Map<string, any>();
  for (const jwv of jwVendorsData) {
    const v = await prisma.vendor.upsert({
      where: { code: jwv.code },
      update: {
        name: jwv.name,
        legalName: jwv.legalName,
        contactEmail: jwv.contactEmail,
        contactPhone: jwv.contactPhone,
        taxNumber: jwv.taxNumber,
        paymentTerms: jwv.paymentTerms,
        leadTimeDays: jwv.leadTimeDays,
        address: jwv.address,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: jwv.code,
        name: jwv.name,
        legalName: jwv.legalName,
        contactEmail: jwv.contactEmail,
        contactPhone: jwv.contactPhone,
        taxNumber: jwv.taxNumber,
        currency: 'INR',
        paymentTerms: jwv.paymentTerms,
        leadTimeDays: jwv.leadTimeDays,
        address: jwv.address,
        status: LifecycleStatus.ACTIVE,
      },
    });
    jwVendorMap.set(jwv.code, v);
  }

  // Job Work Orders with Material Custody Issues & Returns
  const jwOrdersData = [
    {
      orderNumber: 'JWO-2026-MEHTA-001',
      vendorCode: 'VEND-MEHTA-FABRICATORS',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      natureOfProcessing: 'Heavy Portal Truss SAW Submerged Arc Welding & Fit-Up',
      targetQty: 30,
      rawInputQty: 38,
      status: JobWorkOrderStatus.CLOSED,
      challanNumber: 'JWC-2026-MEHTA-001',
      challanQty: 38,
      returnedQty: 30,
      scrapQty: 8,
      notes: 'Outsourced heavy structural portal truss welding. 30 assembled trusses returned successfully; scrap accounted for.',
    },
    {
      orderNumber: 'JWO-2026-PIONEER-002',
      vendorCode: 'VEND-PIONEER-POWDER-COAT',
      prodSku: 'STEEL-COLUMN-UC305',
      natureOfProcessing: 'High-Durability Zinc Primer & Pure Polyester Powder Coating (80-100 Microns)',
      targetQty: 50,
      rawInputQty: 50,
      status: JobWorkOrderStatus.ISSUED,
      challanNumber: 'JWC-2026-PIONEER-002',
      challanQty: 50,
      returnedQty: 20,
      scrapQty: 0,
      notes: '50 Columns dispatched to Pioneer Powder Coat. 20 returned cleared; 30 remaining in active vendor processing custody.',
    },
    {
      orderNumber: 'JWO-2026-SHREE-003',
      vendorCode: 'VEND-SHREE-PRECISION-CNC',
      prodSku: 'VESSEL-AIR-RECEIVER-10KL',
      natureOfProcessing: 'Heavy Manway Flange Face Turning, Serration & Blind Hole Tapping',
      targetQty: 15,
      rawInputQty: 15,
      status: JobWorkOrderStatus.ISSUED,
      challanNumber: 'JWC-2026-SHREE-003',
      challanQty: 15,
      returnedQty: 0,
      scrapQty: 0,
      notes: '15 High-pressure ellipsoidal vessel nozzles issued for precision CNC machining. Currently in vendor custody.',
    },
  ];

  for (const jwo of jwOrdersData) {
    const vendor = jwVendorMap.get(jwo.vendorCode);
    const prod = heavyProducts.find((p) => p.sku === jwo.prodSku) || heavyProducts[0];

    const order = await prisma.jobWorkOrder.upsert({
      where: { orderNumber: jwo.orderNumber },
      update: {
        vendor: { connect: { id: vendor.id } },
        product: { connect: { id: prod.id } },
        targetQuantity: jwo.targetQty,
        targetUom: { connect: { id: prod.uomId } },
        rawMaterialInputQty: jwo.rawInputQty,
        expectedScrapRate: 2.5,
        status: jwo.status,
        deliveryLocation: { connect: { id: rawLocation.id } },
        natureOfProcessing: jwo.natureOfProcessing,
        specifications: `Job work processing specification per engineering drawing #DWG-${jwo.prodSku}`,
        createdBy: { connect: { id: actorId } },
        approvedBy: { connect: { id: actorId } },
        approvedAt: new Date(),
        notes: jwo.notes,
      },
      create: {
        id: randomUUID(),
        orderNumber: jwo.orderNumber,
        vendor: { connect: { id: vendor.id } },
        product: { connect: { id: prod.id } },
        targetQuantity: jwo.targetQty,
        targetUom: { connect: { id: prod.uomId } },
        rawMaterialInputQty: jwo.rawInputQty,
        expectedScrapRate: 2.5,
        status: jwo.status,
        deliveryLocation: { connect: { id: rawLocation.id } },
        natureOfProcessing: jwo.natureOfProcessing,
        specifications: `Job work processing specification per engineering drawing #DWG-${jwo.prodSku}`,
        createdBy: { connect: { id: actorId } },
        approvedBy: { connect: { id: actorId } },
        approvedAt: new Date(),
        notes: jwo.notes,
      },
    });

    // Material Issue Challan (sending material into Vendor Custody)
    const challan = await prisma.jobWorkMaterialIssue.upsert({
      where: { challanNumber: jwo.challanNumber },
      update: {
        jobWorkOrder: { connect: { id: order.id } },
        vendor: { connect: { id: vendor.id } },
        dispatchLocation: { connect: { id: rawLocation.id } },
        product: { connect: { id: prod.id } },
        uom: { connect: { id: prod.uomId } },
        quantity: jwo.challanQty,
        vehicleNumber: 'MP-09-HH-8841',
        transporterName: 'Standard Industrial Dedicated Transport',
        driverContact: '+91-9826019999',
        issuedBy: { connect: { id: actorId } },
        notes: `Delivery Challan for outsourced processing under GST Rule 45(1) & 55`,
      },
      create: {
        id: randomUUID(),
        challanNumber: jwo.challanNumber,
        jobWorkOrder: { connect: { id: order.id } },
        vendor: { connect: { id: vendor.id } },
        dispatchLocation: { connect: { id: rawLocation.id } },
        product: { connect: { id: prod.id } },
        uom: { connect: { id: prod.uomId } },
        quantity: jwo.challanQty,
        vehicleNumber: 'MP-09-HH-8841',
        transporterName: 'Standard Industrial Dedicated Transport',
        driverContact: '+91-9826019999',
        issuedBy: { connect: { id: actorId } },
        notes: `Delivery Challan for outsourced processing under GST Rule 45(1) & 55`,
      },
    });

    // Vendor Custody Ledger Entry (IN into vendor custody)
    const custodyInNumber = `JW-CUSTODY-IN-${challan.challanNumber}`;
    await prisma.jobWorkCustodyLedger.upsert({
      where: { entryNumber: custodyInNumber },
      update: {
        vendor: { connect: { id: vendor.id } },
        jobWorkOrder: { connect: { id: order.id } },
        materialIssue: { connect: { id: challan.id } },
        product: { connect: { id: prod.id } },
        uom: { connect: { id: prod.uomId } },
        entryType: JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE,
        direction: StockDirection.IN,
        quantity: jwo.challanQty,
        runningBalance: jwo.challanQty - jwo.returnedQty,
        referenceType: 'CHALLAN',
        referenceId: challan.id,
        note: `Material delivered to ${vendor.name} custody under challan ${challan.challanNumber}`,
      },
      create: {
        id: randomUUID(),
        entryNumber: custodyInNumber,
        vendor: { connect: { id: vendor.id } },
        jobWorkOrder: { connect: { id: order.id } },
        materialIssue: { connect: { id: challan.id } },
        product: { connect: { id: prod.id } },
        uom: { connect: { id: prod.uomId } },
        entryType: JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE,
        direction: StockDirection.IN,
        quantity: jwo.challanQty,
        runningBalance: jwo.challanQty - jwo.returnedQty,
        referenceType: 'CHALLAN',
        referenceId: challan.id,
        note: `Material delivered to ${vendor.name} custody under challan ${challan.challanNumber}`,
      },
    });

    // If there were returns received back from the vendor
    if (jwo.returnedQty > 0) {
      const returnNumber = `JWR-${order.orderNumber}`;
      await prisma.jobWorkReceiptReturn.upsert({
        where: { returnNumber },
        update: {
          jobWorkOrder: { connect: { id: order.id } },
          vendor: { connect: { id: vendor.id } },
          location: { connect: { id: fgLocation.id } },
          product: { connect: { id: prod.id } },
          uom: { connect: { id: prod.uomId } },
          expectedQuantity: jwo.targetQty,
          receivedQuantity: jwo.returnedQty,
          acceptedQuantity: jwo.returnedQty,
          scrapQuantity: jwo.scrapQty,
          consumedRawMaterial: jwo.rawInputQty,
          shortQuantity: 0,
          excessQuantity: 0,
          receivedBy: { connect: { id: actorId } },
          receivedAt: new Date(),
          notes: `Processed return from vendor ${vendor.name} for job work order ${order.orderNumber}`,
        },
        create: {
          id: randomUUID(),
          returnNumber,
          jobWorkOrder: { connect: { id: order.id } },
          vendor: { connect: { id: vendor.id } },
          location: { connect: { id: fgLocation.id } },
          product: { connect: { id: prod.id } },
          uom: { connect: { id: prod.uomId } },
          expectedQuantity: jwo.targetQty,
          receivedQuantity: jwo.returnedQty,
          acceptedQuantity: jwo.returnedQty,
          scrapQuantity: jwo.scrapQty,
          consumedRawMaterial: jwo.rawInputQty,
          shortQuantity: 0,
          excessQuantity: 0,
          receivedBy: { connect: { id: actorId } },
          receivedAt: new Date(),
          notes: `Processed return from vendor ${vendor.name} for job work order ${order.orderNumber}`,
        },
      });

      const custodyOutNumber = `JW-CUSTODY-OUT-${order.orderNumber}`;
      await prisma.jobWorkCustodyLedger.upsert({
        where: { entryNumber: custodyOutNumber },
        update: {
          vendor: { connect: { id: vendor.id } },
          jobWorkOrder: { connect: { id: order.id } },
          product: { connect: { id: prod.id } },
          uom: { connect: { id: prod.uomId } },
          entryType: JobWorkCustodyEntryType.RETURN_PROCESSING,
          direction: StockDirection.OUT,
          quantity: jwo.returnedQty,
          runningBalance: jwo.challanQty - jwo.returnedQty,
          referenceType: 'GRN_RECEIPT',
          note: `Received processed items back from ${vendor.name}`,
        },
        create: {
          id: randomUUID(),
          entryNumber: custodyOutNumber,
          vendor: { connect: { id: vendor.id } },
          jobWorkOrder: { connect: { id: order.id } },
          product: { connect: { id: prod.id } },
          uom: { connect: { id: prod.uomId } },
          entryType: JobWorkCustodyEntryType.RETURN_PROCESSING,
          direction: StockDirection.OUT,
          quantity: jwo.returnedQty,
          runningBalance: jwo.challanQty - jwo.returnedQty,
          referenceType: 'GRN_RECEIPT',
          note: `Received processed items back from ${vendor.name}`,
        },
      });
    }
  }

  console.log(`✅ Seeded ${jwOrdersData.length} Job Work Orders with Material Challans and Vendor Custody records!`);
  console.log('🎉 ENTIRE MANUFACTURING & PLANT SECTION FULLY SEEDED WITH COMPLETE DATA!');
}

main()
  .catch((e) => {
    console.error('❌ Error during manufacturing seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
