import { PrismaClient, LifecycleStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seedExecutionFlow() {
  console.log('🚀 Seeding Production Flow for Execution & Planning Testing...');

  const adminUser = await prisma.user.findFirst({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' }
  });

  if (!adminUser) {
    throw new Error('Admin user not found. Run base seed first.');
  }

  // 1. Ensure Work Centers exist for our departments
  console.log('🏭 1. Seeding Work Centers for Departments...');
  const departments = await prisma.department.findMany();
  const workCenterMap = new Map<string, string>();

  for (const dept of departments) {
    const wcCode = `WC-${dept.code}`;
    const wc = await prisma.workCenter.upsert({
      where: { code: wcCode },
      update: {
        name: `${dept.name} Work Center`,
        departmentId: dept.id,
        status: LifecycleStatus.ACTIVE
      },
      create: {
        code: wcCode,
        name: `${dept.name} Work Center`,
        departmentId: dept.id,
        capacityPerHour: 50,
        status: LifecycleStatus.ACTIVE
      }
    });
    workCenterMap.set(dept.code, wc.id);
  }

  // 2. Seed Employees for Departments
  console.log('👥 2. Seeding Employees for Departments...');
  const employeeData = [
    { code: 'EMP-001', firstName: 'Sufiyan', lastName: 'Mirza', email: 'sufiyan.mirza@synergy.local', role: 'Store Incharge', deptCode: 'ACCESSORIES-IRONING-MAT' },
    { code: 'EMP-002', firstName: 'Jitendra', lastName: 'Alawa', email: 'jitendra.alawa@synergy.local', role: 'Wall Mount Incharge', deptCode: 'WALL-MOUNT-CS3-CS6' },
    { code: 'EMP-003', firstName: 'Haider', lastName: 'Bhanpurawala', email: 'haider.b@synergy.local', role: 'Production Incharge', deptCode: 'SS-STANDS' },
    { code: 'EMP-004', firstName: 'Ashraf', lastName: 'Ansari', email: 'ashraf.ansari@synergy.local', role: 'Laser Incharge', deptCode: 'LUXURY-ECONOMY-GLIDER-FRAME' },
    { code: 'EMP-005', firstName: 'Shyam', lastName: 'Yadav', email: 'shyam.yadav@synergy.local', role: 'Cutting Incharge', deptCode: 'SPOT-WELDING' },
    { code: 'EMP-006', firstName: 'Siddhant', lastName: 'Sharma', email: 'siddhant.s@synergy.local', role: 'Floor Supervisor', deptCode: 'CS19-21-SS-STANDS' },
    { code: 'EMP-007', firstName: 'Manish', lastName: 'Yadav', email: 'manish.yadav@synergy.local', role: 'Store Operator', deptCode: 'ACCESSORIES-IRONING-MAT' },
    { code: 'EMP-008', firstName: 'Ritesh', lastName: 'Patel', email: 'ritesh.p@synergy.local', role: 'Moulding Operator', deptCode: 'MOULDING' },
    { code: 'EMP-009', firstName: 'Shubham', lastName: 'Verma', email: 'shubham.v@synergy.local', role: 'Packaging Specialist', deptCode: 'LUXURY-ECONOMY-FULL-PACK' },
    { code: 'EMP-010', firstName: 'Rajesh', lastName: 'Kumar', email: 'rajesh.k@synergy.local', role: 'Assembly Operator', deptCode: 'ACCESSORIES-IRONING-MAT' },
    { code: 'EMP-011', firstName: 'Vikas', lastName: 'Gupta', email: 'vikas.g@synergy.local', role: 'Floor Technician', deptCode: 'GLIDER-FULL-PACK' },
    { code: 'EMP-012', firstName: 'Amit', lastName: 'Sharma', email: 'amit.s@synergy.local', role: 'Clips Assembler', deptCode: 'CC1-CLIPS' },
  ];

  const empMap = new Map<string, string>(); // code -> id

  for (const emp of employeeData) {
    const dept = departments.find(d => d.code === emp.deptCode) || departments[0];
    const created = await prisma.employee.upsert({
      where: { employeeCode: emp.code },
      update: {
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        role: emp.role,
        departmentId: dept.id,
        status: LifecycleStatus.ACTIVE
      },
      create: {
        employeeCode: emp.code,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        role: emp.role,
        departmentId: dept.id,
        status: LifecycleStatus.ACTIVE
      }
    });
    empMap.set(emp.code, created.id);
  }

  // 3. Ensure Approved Routes exist for Products with BOMs
  console.log('🗺️ 3. Seeding Product Routes and Steps...');
  const boms = await prisma.bomVersion.findMany({
    where: { status: 'APPROVED' },
    include: { product: true }
  });
  type ProductBom = (typeof boms)[number] & {
    product: NonNullable<(typeof boms)[number]['product']>;
    productId: string;
  };
  const productBoms = boms.filter((bom): bom is ProductBom => bom.product !== null && bom.productId !== null);
  if (productBoms.length === 0) {
    throw new Error('No approved product BOMs are available to seed the execution flow.');
  }

  const routeStepDefinitions: Record<string, { name: string; deptCode: string; duration: number; isQc: boolean }[]> = {
    CS12: [
      { name: 'Pipe & Rod Cutting', deptCode: 'SPOT-WELDING', duration: 45, isQc: false },
      { name: 'Frame Punching & Sub-assembly', deptCode: 'SS-STANDS', duration: 60, isQc: true },
      { name: 'Accessories & Pad Fitting', deptCode: 'ACCESSORIES-IRONING-MAT', duration: 30, isQc: false },
      { name: 'Final Inspection & Full Box Packing', deptCode: 'LUXURY-ECONOMY-FULL-PACK', duration: 30, isQc: true },
    ],
    CS10: [
      { name: 'Square Pipe Laser & Bending', deptCode: 'LUXURY-ECONOMY-GLIDER-FRAME', duration: 50, isQc: false },
      { name: 'Wing & Deck Spot Welding', deptCode: 'SPOT-WELDING', duration: 60, isQc: true },
      { name: 'Side Wing Articulation Fitting', deptCode: 'ACCESSORIES-IRONING-MAT', duration: 40, isQc: false },
      { name: 'Packaging & Box Sealing', deptCode: 'LUXURY-ECONOMY-FULL-PACK', duration: 30, isQc: true },
    ],
    CS11: [
      { name: 'Frame Cutting & Punching', deptCode: 'SPOT-WELDING', duration: 40, isQc: false },
      { name: 'Dual Tier Deck Assembly', deptCode: 'CS19-21-SS-STANDS', duration: 50, isQc: true },
      { name: 'Chain & Cap Articulation Assembly', deptCode: 'ACCESSORIES-IRONING-MAT', duration: 35, isQc: false },
      { name: 'Final Packing & Dispatch Staging', deptCode: 'LUXURY-ECONOMY-FULL-PACK', duration: 25, isQc: true },
    ],
    CS8: [
      { name: '3-Tier Structural Cutting', deptCode: 'SPOT-WELDING', duration: 45, isQc: false },
      { name: 'Base & Sub-frame Welding', deptCode: 'SS-STANDS', duration: 55, isQc: true },
      { name: 'Foot Pad & Cap Assembly', deptCode: 'ACCESSORIES-IRONING-MAT', duration: 30, isQc: false },
      { name: 'Full Box Packaging', deptCode: 'LUXURY-ECONOMY-FULL-PACK', duration: 30, isQc: true },
    ],
    'CS3-COMBO': [
      { name: 'Laser Patti Cutting & Bend', deptCode: 'LUXURY-ECONOMY-GLIDER-FRAME', duration: 35, isQc: false },
      { name: 'Scissor Lattice Assembly & Wall Plugs', deptCode: 'WALL-MOUNT-CS3-CS6', duration: 45, isQc: true },
      { name: 'EZEE Cloth Clipper Combo Packing', deptCode: 'ACCESSORIES-IRONING-MAT', duration: 25, isQc: false },
      { name: 'Glider Full Pack Outer Box', deptCode: 'GLIDER-FULL-PACK', duration: 20, isQc: true },
    ],
  };

  const productRouteMap = new Map<string, any>(); // productId -> route

  for (const bom of productBoms) {
    const sku = bom.product.sku;
    const prefix = Object.keys(routeStepDefinitions).find(k => sku.startsWith(k)) || 'CS12';
    const stepDefs = routeStepDefinitions[prefix] || routeStepDefinitions.CS12;
    const routeCode = `ROUTE-${sku}-STD`;

    let route = await prisma.productRoute.findUnique({
      where: { code: routeCode },
      include: { steps: true }
    });

    if (!route) {
      route = await prisma.productRoute.create({
        data: {
          code: routeCode,
          name: `Standard 4-Stage Route for ${bom.product.name}`,
          productId: bom.productId,
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          status: LifecycleStatus.APPROVED,
          steps: {
            create: stepDefs.map((s, idx) => {
              const dept = departments.find(d => d.code === s.deptCode) || departments[0];
              const wcId = workCenterMap.get(dept.code) || Array.from(workCenterMap.values())[0];
              return {
                sequenceNumber: idx + 1,
                stepName: s.name,
                departmentId: dept.id,
                workCenterId: wcId,
                standardDurationMinutes: s.duration,
                isQcRequired: s.isQc,
                status: LifecycleStatus.APPROVED
              };
            })
          }
        },
        include: { steps: true }
      });
      console.log(`  + Created Approved Route ${routeCode} (${route.steps.length} steps)`);
    }

    productRouteMap.set(bom.productId, route);
  }

  // 4. Seed Production Plans across workflow statuses
  console.log('📋 4. Seeding Production Plans across workflow statuses...');
  const pcsUom = await prisma.unitOfMeasure.findUnique({ where: { code: 'PCS' } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const planConfigs = [
    {
      planNumber: 'PLAN-2026-0101',
      skuPrefix: 'CS12',
      scheduleType: 'DAY',
      quantity: 50,
      bufferQuantity: 2,
      priority: 1,
      incharge: 'Haider Bhanpurawala',
      status: 'RELEASED' as const,
      notes: 'High-demand export run for CS12 3-tier stand. Expedited work order.',
      daysOffset: 0
    },
    {
      planNumber: 'PLAN-2026-0102',
      skuPrefix: 'CS10',
      scheduleType: 'DAY',
      quantity: 40,
      bufferQuantity: 2,
      priority: 0,
      incharge: 'Ashraf Ansari',
      status: 'IN_PROGRESS' as const,
      notes: 'Standard batch run for Wing Style Stand. Quality verification active.',
      daysOffset: 0
    },
    {
      planNumber: 'PLAN-2026-0103',
      skuPrefix: 'CS11',
      scheduleType: 'NIGHT',
      quantity: 30,
      bufferQuantity: 1,
      priority: 2,
      incharge: 'Siddhant Sharma',
      status: 'APPROVED' as const,
      notes: 'Night shift run for CS11 Collapsible Design. Materials staged at plant.',
      daysOffset: 1
    },
    {
      planNumber: 'PLAN-2026-0104',
      skuPrefix: 'CS3-COMBO',
      scheduleType: 'DAY',
      quantity: 60,
      bufferQuantity: 3,
      priority: 1,
      incharge: 'Jitendra Alawa',
      status: 'IN_PROGRESS' as const,
      notes: 'Wall mount combo pack with EZEE clippers.',
      daysOffset: -1
    },
    {
      planNumber: 'PLAN-2026-0105',
      skuPrefix: 'CS8',
      scheduleType: 'DAY',
      quantity: 25,
      bufferQuantity: 1,
      priority: 0,
      incharge: 'Haider Bhanpurawala',
      status: 'COMPLETED' as const,
      notes: 'Extra large 3-tier floor stand completed run.',
      daysOffset: -2
    }
  ];

  const seededPlans: any[] = [];

  for (const cfg of planConfigs) {
    const bom = productBoms.find(b => b.product.sku.includes(cfg.skuPrefix)) || productBoms[0];
    const route = productRouteMap.get(bom.productId);
    const scheduleDate = new Date(today);
    scheduleDate.setDate(scheduleDate.getDate() + cfg.daysOffset);

    const existingPlan = await prisma.productionPlan.findUnique({
      where: { planNumber: cfg.planNumber }
    });

    let plan = existingPlan;
    if (!plan) {
      plan = await prisma.productionPlan.create({
        data: {
          planNumber: cfg.planNumber,
          scheduleDate,
          productId: bom.productId,
          bomVersionId: bom.id,
          routeId: route?.id || null,
          scheduleType: cfg.scheduleType,
          quantity: cfg.quantity,
          quantityUomId: pcsUom?.id || bom.product.uomId,
          bufferQuantity: cfg.bufferQuantity,
          priority: cfg.priority,
          incharge: cfg.incharge,
          notes: cfg.notes,
          status: cfg.status,
          batchIdentity: cfg.status === 'RELEASED' || cfg.status === 'IN_PROGRESS' || cfg.status === 'COMPLETED'
            ? `BATCH-${cfg.planNumber.replace('PLAN-', '')}`
            : null,
          createdByActorId: adminUser.id,
          approvedByActorId: ['APPROVED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED'].includes(cfg.status) ? adminUser.id : null,
          releasedByActorId: ['RELEASED', 'IN_PROGRESS', 'COMPLETED'].includes(cfg.status) ? adminUser.id : null,
          releasedAt: ['RELEASED', 'IN_PROGRESS', 'COMPLETED'].includes(cfg.status) ? new Date() : null,
          inProgressAt: ['IN_PROGRESS', 'COMPLETED'].includes(cfg.status) ? new Date() : null,
          completedAt: cfg.status === 'COMPLETED' ? new Date() : null,
          completedQuantity: cfg.status === 'COMPLETED' ? cfg.quantity : null,
        }
      });
      console.log(`  + Seeded Production Plan ${plan.planNumber} [${plan.status}] for Product: ${bom.product.sku}`);
    }
    seededPlans.push({ plan, bom, route });
  }

  // 5. Seed Material Issues and Department Execution Batches
  console.log('⚙️ 5. Seeding Department Execution Batches & Workflows...');

  for (const item of seededPlans) {
    const { plan, bom, route } = item;
    if (!route || !route.steps || route.steps.length === 0) continue;

    // Create a material issue if the plan is RELEASED or IN_PROGRESS or COMPLETED
    let materialIssue = await prisma.productionMaterialIssue.findFirst({
      where: { productionPlanId: plan.id }
    });

    if (!materialIssue && ['RELEASED', 'IN_PROGRESS', 'COMPLETED'].includes(plan.status)) {
      const issueNumber = `ISSUE-${plan.planNumber.replace('PLAN-', '')}`;
      const firstLine = await prisma.bomLine.findFirst({ where: { bomVersionId: bom.id } });
      // Use the active leaf store location selected by the database rather
      // than coupling execution data to a hardcoded warehouse code.
      const mainStoreLocation = await prisma.warehouseLocation.findFirst({
        where: { status: 'ACTIVE', childLocations: { none: {} } },
        orderBy: { code: 'asc' },
      }) || await prisma.warehouseLocation.findFirst({ orderBy: { code: 'asc' } });

      materialIssue = await prisma.productionMaterialIssue.create({
        data: {
          issueNumber,
          productionPlanId: plan.id,
          itemType: firstLine?.lineType === 'COMPONENT' ? 'MATERIAL' : 'PRODUCT',
          itemId: firstLine?.materialId || bom.productId,
          uomId: firstLine?.uomId || bom.product.uomId,
          locationId: mainStoreLocation?.id || '',
          quantity: Number(plan.quantity),
          issuedByActorId: adminUser.id,
          issuedAt: new Date(),
          reason: 'Initial raw material issue from Central Store to Floor'
        }
      });
    }

    // Now seed execution batches for the steps in the route
    const steps = [...route.steps].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      const batchNumber = `BATCH-${plan.planNumber.replace('PLAN-', '')}-STG${step.sequenceNumber}`;

      let batch = await prisma.departmentExecutionBatch.findUnique({
        where: { batchNumber }
      });

      if (!batch) {
        let batchStatus: any = 'AWAITING_RECEIPT';
        let receivedQty = Number(plan.quantity);
        let completedQty = 0;
        let scrapQty = 0;
        let rejectedQty = 0;
        let wastageQty = 0;
        let pendingQty = receivedQty;

        const assignedEmpId = Array.from(empMap.values())[stepIdx % empMap.size];

        if (plan.status === 'RELEASED') {
          // First stage is Awaiting Receipt or Received
          if (step.sequenceNumber === 1) {
            batchStatus = 'AWAITING_RECEIPT';
          } else {
            // Later stages don't exist yet or are pending
            continue;
          }
        } else if (plan.status === 'IN_PROGRESS') {
          if (step.sequenceNumber === 1) {
            // Step 1 is COMPLETE and handed over to Step 2
            batchStatus = 'COMPLETE';
            completedQty = receivedQty - 1;
            scrapQty = 1;
            pendingQty = 0;
          } else if (step.sequenceNumber === 2) {
            // Step 2 is IN_PROGRESS
            batchStatus = 'IN_PROGRESS';
            completedQty = Math.floor(receivedQty / 2);
            pendingQty = receivedQty - completedQty;
          } else if (step.sequenceNumber === 3) {
            // Step 3 is RECEIVED or AWAITING_RECEIPT in Accessories
            batchStatus = 'AWAITING_RECEIPT';
          } else {
            continue;
          }
        } else if (plan.status === 'COMPLETED') {
          batchStatus = 'COMPLETE';
          completedQty = receivedQty;
          pendingQty = 0;
        }

        batch = await prisma.departmentExecutionBatch.create({
          data: {
            batchNumber,
            productionPlanId: plan.id,
            materialIssueId: step.sequenceNumber === 1 ? materialIssue?.id || null : null,
            departmentId: step.departmentId,
            workCenterId: step.workCenterId,
            routeStepId: step.id,
            stageSequenceNumber: step.sequenceNumber,
            status: batchStatus,
            received_qty: receivedQty,
            completed_qty: completedQty,
            scrap_qty: scrapQty,
            rejected_qty: rejectedQty,
            wastage_qty: wastageQty,
            pending_qty: pendingQty,
            notes: `Stage ${step.sequenceNumber} execution for ${step.stepName}`,
            createdByActorId: adminUser.id,
          }
        });

        // Add worker assignment and progress events if batch has started/in progress/complete
        if (['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'PARTIAL', 'COMPLETE'].includes(batchStatus)) {
          await prisma.workerAssignment.create({
            data: {
              batchId: batch.id,
              employeeId: assignedEmpId,
              subtaskDescription: `Primary execution for ${step.stepName}`,
              assignedByActorId: adminUser.id,
            }
          });

          await prisma.progressEvent.create({
            data: {
              batchId: batch.id,
              employeeId: assignedEmpId,
              eventType: 'STARTED',
              quantityDelta: 0,
              notes: 'Batch execution started on floor'
            }
          });

          if (completedQty > 0) {
            await prisma.progressEvent.create({
              data: {
                batchId: batch.id,
                employeeId: assignedEmpId,
                eventType: batchStatus === 'COMPLETE' ? 'COMPLETED' : 'PARTIAL_RECORDED',
                quantityDelta: completedQty,
                notes: `Floor progress recorded: ${completedQty} units passed`
              }
            });
          }

          if (scrapQty > 0) {
            await prisma.exceptionRecord.create({
              data: {
                batchId: batch.id,
                employeeId: assignedEmpId,
                type: 'SCRAP',
                quantity: scrapQty,
                reason: 'Slight weld burr defect off-spec'
              }
            });
          }
        }

        console.log(`    -> Created Stage ${step.sequenceNumber} Batch ${batch.batchNumber} in ${step.departmentId} [${batchStatus}]`);
      }
    }
  }

  console.log('🎉 Production & Shop-Floor Execution seeding completed successfully!');
}

seedExecutionFlow()
  .catch((e) => {
    console.error('❌ Error during execution seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
