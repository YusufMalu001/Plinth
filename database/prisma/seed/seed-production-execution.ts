import {
  PrismaClient,
  LifecycleStatus,
  ProductionPlanStatus,
  ProductionPlanEventType,
  BatchExecutionStatus,
  AssemblyBatchStatus,
  ProgressEventType,
  HandoverStatus,
  StockDirection,
} from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🏭 [Production Execution Complete Seed] Starting comprehensive execution seeding...');

  // 1. Resolve Admin / Actor
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = admin?.id || (await prisma.user.findFirst())?.id;
  if (!actorId) throw new Error('No user found');

  // 2. Resolve Factory & Warehouse Locations
  const factory = await prisma.factory.findFirst();
  if (!factory) throw new Error('No factory found');

  const rawLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'RAW_MATERIAL' } });
  const fgLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'FINISHED_GOODS' } });
  const wipLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'WIP' } });
  const qcLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'QUARANTINE' } });
  if (!rawLocation || !fgLocation || !wipLocation || !qcLocation) {
    throw new Error('Required warehouse locations missing');
  }

  // 3. Departments & Work Centers
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
      description: 'Multi-bay heavy convergence line, torque verification stations, and FAT testing bay',
      isAssembly: true,
      departmentHead: 'Subhash Chandra',
      workCenters: [
        { code: 'WC-ASSEMBLY-01', name: 'Heavy Portal Convergence Rig 1', capacityPerHour: 12 },
        { code: 'WC-FAT-01', name: 'Hydrostatic & Factory Acceptance Test Bed', capacityPerHour: 8 },
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
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: d.code,
        name: d.name,
        description: d.description,
        isAssembly: d.isAssembly,
        departmentHead: d.departmentHead,
        factory: { connect: { id: factory.id } },
        status: LifecycleStatus.ACTIVE,
      },
    });
    deptMap.set(d.code, dept);

    for (const w of d.workCenters) {
      const wc = await prisma.workCenter.upsert({
        where: { code: w.code },
        update: {
          name: w.name,
          departmentId: dept.id,
          capacityPerHour: w.capacityPerHour,
          status: LifecycleStatus.ACTIVE,
        },
        create: {
          id: randomUUID(),
          code: w.code,
          name: w.name,
          departmentId: dept.id,
          capacityPerHour: w.capacityPerHour,
          status: LifecycleStatus.ACTIVE,
        },
      });
      wcMap.set(w.code, wc);
    }
  }

  // 4. Seed Dedicated Shop-Floor Operators & Technicians
  console.log('👷 Seeding Shop Floor Operators & Assembly Specialists...');
  const employeesData = [
    { code: 'EMP-CUT-01', firstName: 'Rajesh', lastName: 'Solanki', role: 'CNC Plasma Operator', deptCode: 'DEPT-CUTTING' },
    { code: 'EMP-WELD-02', firstName: 'Dinesh', lastName: 'Patel', role: 'Senior SAW Welding Specialist', deptCode: 'DEPT-FITUP-WELD' },
    { code: 'EMP-MACH-03', firstName: 'Sunil', lastName: 'Verma', role: 'Precision Boring Machinist', deptCode: 'DEPT-MACHINING' },
    { code: 'EMP-SURF-04', firstName: 'Kiran', lastName: 'Yadav', role: 'Surface Preparation Inspector', deptCode: 'DEPT-SURFACE-FINISH' },
    { code: 'EMP-ASY-05', firstName: 'Subhash', lastName: 'Chandra', role: 'Assembly & FAT Incharge', deptCode: 'DEPT-FINAL-ASSEMBLY' },
  ];

  const empMap = new Map<string, any>();
  for (const emp of employeesData) {
    const dept = deptMap.get(emp.deptCode);
    const existing = await prisma.employee.findUnique({ where: { employeeCode: emp.code } });
    if (existing) {
      empMap.set(emp.code, existing);
    } else {
      const created = await prisma.employee.create({
        data: {
          id: randomUUID(),
          employeeCode: emp.code,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}@plinth.example`,
          role: emp.role,
          departmentId: dept.id,
          status: LifecycleStatus.ACTIVE,
          designation: emp.role,
        },
      });
      empMap.set(emp.code, created);
    }
  }

  // 5. Seed / Verify Production Routes for Heavy Products
  console.log('🛣️ Seeding Multi-Step Department Routes...');
  const heavySkus = [
    'STEEL-ISMB-450-TRUSS',
    'STEEL-COLUMN-UC305',
    'VESSEL-AIR-RECEIVER-10KL',
    'PIPELINE-SPOOL-DN250-SCH40',
    'CRANE-GIRDER-PLATE-BOX',
    'ANCHOR-BOLT-CAGE-M48',
    'CS10',
    'CS12',
  ];

  const heavyProducts = await prisma.product.findMany({
    where: { sku: { in: heavySkus } },
    include: {
      uom: true,
      bomVersions: {
        where: { status: 'APPROVED' },
        include: { lines: true },
        take: 1,
      },
    },
  });

  const routesMap = new Map<string, any>();
  const assemblyDept = deptMap.get('DEPT-FINAL-ASSEMBLY');

  const stepTemplate = [
    { order: 1, name: 'CNC Profile Cutting & Beveling', deptCode: 'DEPT-CUTTING', wcCode: 'WC-PLASMA-01', duration: 45, qcRequired: true },
    { order: 2, name: 'Jig Fit-up & Submerged Arc Welding', deptCode: 'DEPT-FITUP-WELD', wcCode: 'WC-SAW-WELD-01', duration: 90, qcRequired: true },
    { order: 3, name: 'Precision Milling & Flange Facing', deptCode: 'DEPT-MACHINING', wcCode: 'WC-VBM-01', duration: 60, qcRequired: false },
    { order: 4, name: 'Shot Blasting & Epoxy Coating', deptCode: 'DEPT-SURFACE-FINISH', wcCode: 'WC-PAINT-01', duration: 60, qcRequired: true },
    { order: 5, name: 'Final Convergence & Factory Acceptance Test', deptCode: 'DEPT-FINAL-ASSEMBLY', wcCode: 'WC-ASSEMBLY-01', duration: 120, qcRequired: true },
  ];

  for (const prod of heavyProducts) {
    const routeCode = `ROUTE-${prod.sku}`;
    let route = await prisma.productRoute.findUnique({
      where: { code: routeCode },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    if (!route) {
      const activeBom = prod.bomVersions[0];
      route = await prisma.productRoute.create({
        data: {
          id: randomUUID(),
          code: routeCode,
          name: `Standard Plant Manufacturing Route for ${prod.name.slice(0, 60)}`,
          productId: prod.id,
          version: 1,
          effectiveFrom: new Date(),
          status: LifecycleStatus.ACTIVE,
          assemblyDepartmentId: assemblyDept?.id,
          bomVersionId: activeBom ? activeBom.id : undefined,
          graphReviewedAt: new Date(),
        },
        include: { steps: true },
      });
    }

    if (route.steps.length === 0) {
      let prevStep: any = null;
      for (let i = 0; i < stepTemplate.length; i++) {
        const def = stepTemplate[i];
        const dept = deptMap.get(def.deptCode);
        const wc = wcMap.get(def.wcCode);
        const nextDept = i < stepTemplate.length - 1 ? deptMap.get(stepTemplate[i + 1].deptCode) : null;

        const createdStep = await prisma.routeStep.create({
          data: {
            id: randomUUID(),
            route: { connect: { id: route.id } },
            sequenceNumber: def.order,
            stepOrder: def.order,
            branchKey: 'MAIN',
            stepName: def.name,
            department: { connect: { id: dept.id } },
            nextDepartment: nextDept ? { connect: { id: nextDept.id } } : undefined,
            workCenter: wc ? { connect: { id: wc.id } } : undefined,
            standardDurationMinutes: def.duration,
            isQcRequired: def.qcRequired,
            status: LifecycleStatus.ACTIVE,
            parentStep: prevStep ? { connect: { id: prevStep.id } } : undefined,
          },
        });
        prevStep = createdStep;
      }

      route = await prisma.productRoute.findUnique({
        where: { id: route.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    }

    routesMap.set(prod.id, route);
  }

  // 6. Production Schedules Specification
  console.log('📋 6. Seeding Comprehensive Production Schedules for Today & History...');

  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);

  const daysOffset = (d: number) => {
    const res = new Date(todayNoon.getTime());
    res.setDate(res.getDate() - d);
    return res;
  };

  const scheduleConfigs = [
    // --- TODAY SCHEDULES (Active on Today's View) ---
    {
      planNumber: 'SCH-2026-TODAY-01',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      qty: 30,
      completedQty: 30,
      stageProgress: 1.0, // 100% complete through all 4 departments to assembly
      status: ProductionPlanStatus.COMPLETED,
      date: daysOffset(0),
      shift: 'MORNING',
      incharge: 'Haider Bhanpurawala (Shift Head - Bay A)',
      note: 'Heavy structural truss assembly - FAT hydrostatic deflection test cleared with zero non-conformance.',
    },
    {
      planNumber: 'SCH-2026-TODAY-02',
      prodSku: 'VESSEL-AIR-RECEIVER-10KL',
      qty: 12,
      completedQty: 10,
      stageProgress: 0.85, // About to get complete: 10 of 12 complete, 2 in coating/final FAT
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(0),
      shift: 'MORNING',
      incharge: 'Vikramaditya Rao (Fabrication Incharge)',
      note: 'High-pressure air receivers - 10 units finished and hydro-tested; final 2 units in paint curing bay.',
    },
    {
      planNumber: 'SCH-2026-TODAY-03',
      prodSku: 'PIPELINE-SPOOL-DN250-SCH40',
      qty: 120,
      completedQty: 60,
      stageProgress: 0.50, // Halfway through: exactly 60 of 120 completed at fitup/welding
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(0),
      shift: 'AFTERNOON',
      incharge: 'Irfan Khan (Machine Shop Incharge)',
      note: 'Class 300 WNRF flanged pipe spools - 60 completed through milling; 60 currently at SAW welding rig.',
    },
    {
      planNumber: 'SCH-2026-TODAY-04',
      prodSku: 'CRANE-GIRDER-PLATE-BOX',
      qty: 6,
      completedQty: 1,
      stageProgress: 0.15, // Just begun: CNC cutting completed on 1st girder, 5 girders plate cutting in progress
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(0),
      shift: 'NIGHT',
      incharge: 'Ramesh Sharma (CNC Profiling Incharge)',
      note: '50-Ton EOT crane box girder plates nested and issued - 1st unit cut and beveled; 5 plates on plasma table.',
    },
    {
      planNumber: 'SCH-2026-TODAY-05',
      prodSku: 'ANCHOR-BOLT-CAGE-M48',
      qty: 80,
      completedQty: 0,
      stageProgress: 0.0, // Released to Floor: materials staged, ready to receive on CNC table
      status: ProductionPlanStatus.RELEASED,
      date: daysOffset(0),
      shift: 'MORNING',
      incharge: 'Subhash Chandra (Assembly & Fastener Incharge)',
      note: 'Grade 8.8 foundation bolt cages - Raw alloy rods and base rings staged at cutting and threading workstation.',
    },
    {
      planNumber: 'SCH-2026-TODAY-06',
      prodSku: 'CS10',
      qty: 250,
      completedQty: 125,
      stageProgress: 0.50, // Halfway through commercial line
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(0),
      shift: 'AFTERNOON',
      incharge: 'Prakash Nair (Surface & Packing Incharge)',
      note: 'Super Heavy Duty Large SS Foldable Wing Dryer - 125 units sub-assembled; 125 in wire spot welding.',
    },

    // --- RECENT COMPLETED & PIPELINE SCHEDULES (All Dates View) ---
    {
      planNumber: 'PLAN-2026-TRUSS-01',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      qty: 25,
      completedQty: 25,
      stageProgress: 1.0,
      status: ProductionPlanStatus.COMPLETED,
      date: daysOffset(5),
      shift: 'MORNING',
      incharge: 'Haider Bhanpurawala (Production Head)',
      note: 'Turnkey fabrication for 36m clear-span portal frame truss. 100% completed & passed FAT testing.',
    },
    {
      planNumber: 'PLAN-2026-COLUMN-02',
      prodSku: 'STEEL-COLUMN-UC305',
      qty: 40,
      completedQty: 40,
      stageProgress: 1.0,
      status: ProductionPlanStatus.COMPLETED,
      date: daysOffset(4),
      shift: 'MORNING',
      incharge: 'Vikramaditya Rao (Fit-up Incharge)',
      note: 'Heavy universal columns with M36 base stiffener assemblies. Fully fabricated, blast-coated and cleared to warehouse.',
    },
    {
      planNumber: 'PLAN-2026-VESSEL-03',
      prodSku: 'VESSEL-AIR-RECEIVER-10KL',
      qty: 10,
      completedQty: 5,
      stageProgress: 0.50,
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(2),
      shift: 'AFTERNOON',
      incharge: 'Irfan Khan (Welding & Hydro Head)',
      note: '10,000L Pressure vessel batch. 5 units completed; 5 units currently undergoing fit-up and hydrostatic test.',
    },
    {
      planNumber: 'PLAN-2026-SPOOL-04',
      prodSku: 'PIPELINE-SPOOL-DN250-SCH40',
      qty: 150,
      completedQty: 70,
      stageProgress: 0.47,
      status: ProductionPlanStatus.IN_PROGRESS,
      date: daysOffset(1),
      shift: 'NIGHT',
      incharge: 'Ramesh Sharma (Shop Superintendent)',
      note: 'High-pressure pipeline spool fabrication. 70 units completed; remaining 80 spools at final welding & X-ray stage.',
    },
    {
      planNumber: 'PLAN-2026-CRANE-05',
      prodSku: 'CRANE-GIRDER-PLATE-BOX',
      qty: 4,
      completedQty: 0,
      stageProgress: 0.0,
      status: ProductionPlanStatus.RELEASED,
      date: daysOffset(3),
      shift: 'MORNING',
      incharge: 'Subhash Chandra (Assembly Lead)',
      note: '50-Ton EOT double box crane girder assembly. Materials allocated and queued for CNC plasma profile cutting.',
    },
    {
      planNumber: 'PLAN-2026-ANCHOR-06',
      prodSku: 'ANCHOR-BOLT-CAGE-M48',
      qty: 60,
      completedQty: 0,
      stageProgress: 0.0,
      status: ProductionPlanStatus.RELEASED,
      date: daysOffset(2),
      shift: 'AFTERNOON',
      incharge: 'Dinesh Patel (Senior Technician)',
      note: 'High-tensile foundation bolt cage assemblies. Work order released to machine shop and threading line.',
    },
  ];

  // Clean old assembly batches to avoid orphan conflicts
  await prisma.assemblyWaveIntakeAllocation.deleteMany();
  await prisma.assemblyBatchComponent.deleteMany();
  await prisma.assemblyWorkerAssignment.deleteMany();
  await prisma.assemblyBatch.deleteMany();

  for (const cfg of scheduleConfigs) {
    const prod = heavyProducts.find((p) => p.sku === cfg.prodSku) || heavyProducts[0];
    const route = routesMap.get(prod.id);
    const bom = prod.bomVersions[0];
    const steps = route?.steps || [];

    // 1. Create or Update ProductionPlan
    const plan = await prisma.productionPlan.upsert({
      where: { planNumber: cfg.planNumber },
      update: {
        product: { connect: { id: prod.id } },
        bomVersion: { connect: { id: bom.id } },
        route: route ? { connect: { id: route.id } } : undefined,
        owner: { connect: { id: actorId } },
        createdByActor: { connect: { id: actorId } },
        scheduleType: 'JOB_ORDER',
        scheduleDate: cfg.date,
        quantity: cfg.qty,
        quantityUom: { connect: { id: prod.uomId } },
        completedQuantity: cfg.completedQty,
        partialQuantity: cfg.status === ProductionPlanStatus.IN_PROGRESS ? cfg.completedQty : 0,
        status: cfg.status,
        incharge: cfg.incharge,
        notes: cfg.note,
        targetLocation: { connect: { id: fgLocation.id } },
        plannedStartAt: cfg.date,
        plannedEndAt: new Date(cfg.date.getTime() + 4 * 24 * 60 * 60 * 1000),
        releasedAt: cfg.date,
      },
      create: {
        id: randomUUID(),
        planNumber: cfg.planNumber,
        product: { connect: { id: prod.id } },
        bomVersion: { connect: { id: bom.id } },
        route: route ? { connect: { id: route.id } } : undefined,
        owner: { connect: { id: actorId } },
        createdByActor: { connect: { id: actorId } },
        scheduleType: 'JOB_ORDER',
        scheduleDate: cfg.date,
        quantity: cfg.qty,
        quantityUom: { connect: { id: prod.uomId } },
        completedQuantity: cfg.completedQty,
        partialQuantity: cfg.status === ProductionPlanStatus.IN_PROGRESS ? cfg.completedQty : 0,
        status: cfg.status,
        incharge: cfg.incharge,
        notes: cfg.note,
        targetLocation: { connect: { id: fgLocation.id } },
        plannedStartAt: cfg.date,
        plannedEndAt: new Date(cfg.date.getTime() + 4 * 24 * 60 * 60 * 1000),
        releasedAt: cfg.date,
      },
    });

    // 2. Production Material Issue
    const issueNumber = `ISSUE-${plan.planNumber}`;
    const matIssue = await prisma.productionMaterialIssue.upsert({
      where: { issueNumber },
      update: {
        productionPlan: { connect: { id: plan.id } },
        itemType: 'PRODUCT',
        itemId: prod.id,
        uom: { connect: { id: prod.uomId } },
        locationId: rawLocation.id,
        quantity: cfg.qty,
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
        quantity: cfg.qty,
        issuedByActorId: actorId,
      },
    });

    // 3. Create Multi-Department Batches (for each non-assembly step in route)
    const nonAssemblySteps = steps.filter((s: any) => s.stepOrder < 5);
    const createdBatches: any[] = [];

    for (const step of nonAssemblySteps) {
      const stepIdx = step.stepOrder; // 1 to 4
      const batchNumber = `BATCH-${plan.planNumber}-STG${stepIdx}`;

      // Calculate quantity status for this stage based on overall progress
      let bStatus: BatchExecutionStatus = BatchExecutionStatus.AWAITING_RECEIPT;
      let stageCompleted = 0;
      let stageReceived = cfg.qty;
      let stagePending = 0;

      if (cfg.status === ProductionPlanStatus.COMPLETED) {
        bStatus = BatchExecutionStatus.COMPLETE;
        stageCompleted = cfg.qty;
        stagePending = 0;
      } else if (cfg.status === ProductionPlanStatus.RELEASED) {
        if (stepIdx === 1) {
          bStatus = BatchExecutionStatus.RECEIVED;
          stageCompleted = 0;
          stagePending = cfg.qty;
        } else {
          bStatus = BatchExecutionStatus.AWAITING_RECEIPT;
          stageReceived = 0;
          stageCompleted = 0;
          stagePending = 0;
        }
      } else {
        // IN_PROGRESS: calculate cascading stage completion
        if (stepIdx === 1) {
          // Cutting stage
          stageCompleted = Math.min(cfg.qty, Math.round(cfg.qty * Math.min(1.0, cfg.stageProgress * 1.5)));
          stagePending = cfg.qty - stageCompleted;
          bStatus = stagePending === 0 ? BatchExecutionStatus.COMPLETE : BatchExecutionStatus.IN_PROGRESS;
        } else if (stepIdx === 2) {
          // Welding stage
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * Math.min(1.0, cfg.stageProgress * 1.3)));
          stageCompleted = Math.min(stageReceived, Math.round(cfg.qty * cfg.stageProgress));
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        } else if (stepIdx === 3) {
          // Machining stage
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * cfg.stageProgress));
          stageCompleted = Math.min(stageReceived, Math.round(cfg.qty * Math.max(0, cfg.stageProgress - 0.2)));
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        } else {
          // Surface Finish stage
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * Math.max(0, cfg.stageProgress - 0.2)));
          stageCompleted = Math.min(stageReceived, cfg.completedQty);
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        }
      }

      // Corresponding department employee
      const empCodes = ['EMP-CUT-01', 'EMP-WELD-02', 'EMP-MACH-03', 'EMP-SURF-04'];
      const assignedEmp = empMap.get(empCodes[stepIdx - 1]) || empMap.get('EMP-CUT-01');

      const batch = await prisma.departmentExecutionBatch.upsert({
        where: { batchNumber },
        update: {
          productionPlan: { connect: { id: plan.id } },
          materialIssue: { connect: { id: matIssue.id } },
          department: { connect: { id: step.departmentId } },
          workCenter: step.workCenterId ? { connect: { id: step.workCenterId } } : undefined,
          routeStep: { connect: { id: step.id } },
          stageSequenceNumber: stepIdx,
          expectedOutputQty: cfg.qty,
          received_qty: stageReceived,
          completed_qty: stageCompleted,
          rejected_qty: 0,
          scrap_qty: 0,
          wastage_qty: 0,
          pending_qty: stagePending,
          status: bStatus,
          notes: `Batch operational stage ${stepIdx} (${step.stepName}) for plan ${plan.planNumber}`,
        },
        create: {
          id: randomUUID(),
          batchNumber,
          productionPlan: { connect: { id: plan.id } },
          materialIssue: { connect: { id: matIssue.id } },
          department: { connect: { id: step.departmentId } },
          workCenter: step.workCenterId ? { connect: { id: step.workCenterId } } : undefined,
          routeStep: { connect: { id: step.id } },
          stageSequenceNumber: stepIdx,
          expectedOutputQty: cfg.qty,
          received_qty: stageReceived,
          completed_qty: stageCompleted,
          rejected_qty: 0,
          scrap_qty: 0,
          wastage_qty: 0,
          pending_qty: stagePending,
          status: bStatus,
          createdByActorId: actorId,
          notes: `Batch operational stage ${stepIdx} (${step.stepName}) for plan ${plan.planNumber}`,
        },
      });

      // Assign Operator to Batch
      if (assignedEmp) {
        await prisma.workerAssignment.deleteMany({ where: { batchId: batch.id } });
        await prisma.workerAssignment.create({
          data: {
            id: randomUUID(),
            batchId: batch.id,
            employeeId: assignedEmp.id,
            subtaskDescription: `Execution of ${step.stepName} for batch ${batch.batchNumber}`,
            assignedByActorId: actorId,
            assignedAt: cfg.date,
          },
        });
      }

      // Record Progress Event
      if (stageCompleted > 0) {
        await prisma.progressEvent.deleteMany({ where: { batchId: batch.id } });
        await prisma.progressEvent.create({
          data: {
            id: randomUUID(),
            batchId: batch.id,
            employeeId: assignedEmp.id,
            eventType: stageCompleted >= cfg.qty ? ProgressEventType.COMPLETED : ProgressEventType.PARTIAL_RECORDED,
            quantityDelta: stageCompleted,
            notes: `Progress logged: ${stageCompleted} units completed at ${step.stepName}`,
            timestamp: cfg.date,
          },
        });
      }

      createdBatches.push(batch);
    }

    // 4. Task Material Assignments for Plan
    if (bom.lines.length > 0) {
      await prisma.productionTaskMaterialAssignment.deleteMany({ where: { productionPlanId: plan.id } });
      const cuttingDept = deptMap.get('DEPT-CUTTING');
      const firstBatch = createdBatches[0];

      for (const line of bom.lines) {
        const required = Number(line.quantity) * cfg.qty;
        const issued = cfg.status === ProductionPlanStatus.RELEASED ? 0 : required;
        const received = cfg.status === ProductionPlanStatus.COMPLETED ? required : Math.round(issued * cfg.stageProgress);

        await prisma.productionTaskMaterialAssignment.create({
          data: {
            id: randomUUID(),
            productionPlanId: plan.id,
            batchId: firstBatch?.id,
            destinationDepartmentId: cuttingDept.id,
            bomLineId: line.id,
            itemType: line.lineType === 'COMPONENT' ? 'MATERIAL' : 'PRODUCT',
            itemId: line.materialId || line.componentProductId || prod.id,
            uomId: line.uomId,
            locationId: rawLocation.id,
            requiredQty: required,
            issuedQty: issued,
            receivedQty: received,
            returnedQty: 0,
          },
        });
      }
    }

    // 5. Inter-Department Handovers between sequential stages
    for (let bIdx = 0; bIdx < createdBatches.length - 1; bIdx++) {
      const outBatch = createdBatches[bIdx];
      const inBatch = createdBatches[bIdx + 1];
      const outStep = nonAssemblySteps[bIdx];
      const inStep = nonAssemblySteps[bIdx + 1];

      const outDept = deptMap.get(outStep.deptCode);
      const inDept = deptMap.get(inStep.deptCode);

      const handoverQty = Number(outBatch.completed_qty);
      if (handoverQty > 0) {
        const hKey = `HO-${plan.planNumber}-STG${bIdx + 1}-TO-STG${bIdx + 2}`;
        await prisma.handover.upsert({
          where: { idempotencyKey: hKey },
          update: {
            outgoingBatch: { connect: { id: outBatch.id } },
            outgoingDepartment: { connect: { id: outDept.id } },
            incomingDepartment: { connect: { id: inDept.id } },
            incomingBatch: { connect: { id: inBatch.id } },
            quantity: handoverQty,
            status: HandoverStatus.ACCEPTED,
            proposedByActorId: actorId,
            decidedByActorId: actorId,
            proposedAt: cfg.date,
            decidedAt: cfg.date,
            notes: `Transfer of ${handoverQty} units from ${outDept.name} to ${inDept.name}`,
          },
          create: {
            id: randomUUID(),
            outgoingBatch: { connect: { id: outBatch.id } },
            outgoingDepartment: { connect: { id: outDept.id } },
            incomingDepartment: { connect: { id: inDept.id } },
            incomingBatch: { connect: { id: inBatch.id } },
            quantity: handoverQty,
            status: HandoverStatus.ACCEPTED,
            proposedByActorId: actorId,
            decidedByActorId: actorId,
            proposedAt: cfg.date,
            decidedAt: cfg.date,
            idempotencyKey: hKey,
            notes: `Transfer of ${handoverQty} units from ${outDept.name} to ${inDept.name}`,
          },
        });
      }
    }

    // 6. Assembly Intake Requirements (Final Convergence Handover)
    const lastBatch = createdBatches[createdBatches.length - 1];
    const lastStep = nonAssemblySteps[nonAssemblySteps.length - 1];
    const surfaceDept = deptMap.get(lastStep.deptCode);

    if (lastBatch && lastStep) {
      await prisma.assemblyIntakeRequirement.deleteMany({ where: { productionPlanId: plan.id } });
      const readyForAssembly = Number(lastBatch.completed_qty);

      const intake = await prisma.assemblyIntakeRequirement.create({
        data: {
          id: randomUUID(),
          productionPlanId: plan.id,
          sourceStepId: lastStep.id,
          itemType: 'PRODUCT',
          itemId: prod.id,
          uomId: prod.uomId,
          requiredPerUnit: 1,
          requiredQty: cfg.qty,
          acceptedQty: readyForAssembly,
          allocatedQty: cfg.completedQty,
        },
      });

      // Handover from Surface Finish to Assembly
      if (readyForAssembly > 0) {
        const asyHKey = `HO-${plan.planNumber}-SURF-TO-ASY`;
        await prisma.handover.upsert({
          where: { idempotencyKey: asyHKey },
          update: {
            outgoingBatch: { connect: { id: lastBatch.id } },
            outgoingDepartment: { connect: { id: surfaceDept.id } },
            incomingDepartment: { connect: { id: assemblyDept.id } },
            assemblyIntake: { connect: { id: intake.id } },
            quantity: readyForAssembly,
            status: HandoverStatus.ACCEPTED,
            proposedByActorId: actorId,
            decidedByActorId: actorId,
            proposedAt: cfg.date,
            decidedAt: cfg.date,
            notes: `${readyForAssembly} coated units passed to Assembly & Convergence Line`,
          },
          create: {
            id: randomUUID(),
            outgoingBatch: { connect: { id: lastBatch.id } },
            outgoingDepartment: { connect: { id: surfaceDept.id } },
            incomingDepartment: { connect: { id: assemblyDept.id } },
            assemblyIntake: { connect: { id: intake.id } },
            quantity: readyForAssembly,
            status: HandoverStatus.ACCEPTED,
            proposedByActorId: actorId,
            decidedByActorId: actorId,
            proposedAt: cfg.date,
            decidedAt: cfg.date,
            idempotencyKey: asyHKey,
            notes: `${readyForAssembly} coated units passed to Assembly & Convergence Line`,
          },
        });
      }
    }

    // 7. Assembly Batch & FG Ready Outputs
    const asyBatchNumber = `ASMB-${plan.planNumber}`;
    const asyStatus =
      cfg.status === ProductionPlanStatus.COMPLETED
        ? AssemblyBatchStatus.COMPLETE
        : cfg.completedQty > 0
        ? AssemblyBatchStatus.PARTIAL
        : cfg.stageProgress > 0.5
        ? AssemblyBatchStatus.IN_ASSEMBLY
        : AssemblyBatchStatus.PLANNED;

    const asyBatch = await prisma.assemblyBatch.create({
      data: {
        id: randomUUID(),
        batchNumber: asyBatchNumber,
        product: { connect: { id: prod.id } },
        bomVersion: { connect: { id: bom.id } },
        productRoute: route ? { connect: { id: route.id } } : undefined,
        productionPlan: { connect: { id: plan.id } },
        targetOutputQuantity: cfg.qty,
        actualOutputQuantity: cfg.completedQty,
        scrapQuantity: 0,
        status: asyStatus,
        plannedStartDate: cfg.date,
        actualStartDate: cfg.status !== ProductionPlanStatus.RELEASED ? cfg.date : undefined,
        completedAt: cfg.status === ProductionPlanStatus.COMPLETED ? cfg.date : undefined,
        createdByActor: { connect: { id: actorId } },
        notes: `Assembly wave batch for plan ${plan.planNumber}`,
      },
    });

    // Assign Assembly Specialist
    const asyEmp = empMap.get('EMP-ASY-05');
    if (asyEmp) {
      await prisma.assemblyWorkerAssignment.create({
        data: {
          id: randomUUID(),
          assemblyBatchId: asyBatch.id,
          employeeId: asyEmp.id,
          subtaskDescription: `Final assembly convergence and FAT testing for ${prod.name}`,
          assignedByActorId: actorId,
          assignedAt: cfg.date,
        },
      });
    }

    // FG Ready Output for Completed Units
    if (cfg.completedQty > 0) {
      const outputNumber = `FG-OUT-${plan.planNumber}`;
      await prisma.fgReadyOutput.upsert({
        where: { outputNumber },
        update: {
          assemblyBatch: { connect: { id: asyBatch.id } },
          product: { connect: { id: prod.id } },
          quantity: cfg.completedQty,
          uom: { connect: { id: prod.uomId } },
          notes: `Cleared finished goods for ${prod.name}`,
        },
        create: {
          id: randomUUID(),
          outputNumber,
          assemblyBatch: { connect: { id: asyBatch.id } },
          product: { connect: { id: prod.id } },
          quantity: cfg.completedQty,
          uom: { connect: { id: prod.uomId } },
          notes: `Cleared finished goods for ${prod.name}`,
        },
      });
    }

    // Plan Event Audit Trail
    await prisma.productionPlanEvent.create({
      data: {
        id: randomUUID(),
        productionPlan: { connect: { id: plan.id } },
        eventType:
          cfg.status === ProductionPlanStatus.COMPLETED
            ? ProductionPlanEventType.COMPLETED
            : cfg.status === ProductionPlanStatus.IN_PROGRESS
            ? ProductionPlanEventType.STARTED
            : ProductionPlanEventType.CREATED,
        toStatus: cfg.status,
        reason: `Production schedule ${cfg.planNumber} configured at status ${cfg.status} (${cfg.completedQty}/${cfg.qty} finished)`,
        actor: { connect: { id: actorId } },
        createdAt: cfg.date,
      },
    });
  }

  console.log(`✅ Successfully seeded ${scheduleConfigs.length} Production Schedules across all pipeline stages!`);
  console.log('🎉 PRODUCTION EXECUTION SECTION SEEDING COMPLETE WITH 100% NON-NULL POPULATED FIELDS!');
}

main()
  .catch((e) => {
    console.error('❌ Error during production execution seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
