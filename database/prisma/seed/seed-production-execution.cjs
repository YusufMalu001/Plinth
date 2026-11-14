const {
  PrismaClient,
  LifecycleStatus,
  ProductionPlanStatus,
  ProductionPlanEventType,
  BatchExecutionStatus,
  AssemblyBatchStatus,
  ProgressEventType,
  HandoverStatus,
} = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

async function run() {
  console.log('🏭 [Production Execution Master Seeder] Starting database population...');

  // 1. Resolve Master references
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = admin?.id || (await prisma.user.findFirst())?.id;
  if (!actorId) throw new Error('No user found');

  const rawLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'RAW_MATERIAL' } });
  const fgLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'FINISHED_GOODS' } });
  if (!rawLocation || !fgLocation) throw new Error('Locations missing');

  const depts = await prisma.department.findMany();
  const deptMap = new Map(depts.map((d) => [d.code, d]));
  const assemblyDept = deptMap.get('DEPT-FINAL-ASSEMBLY');

  const employees = await prisma.employee.findMany();
  const empMap = new Map(employees.map((e) => [e.employeeCode, e]));

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
      routes: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      bomVersions: { where: { status: 'APPROVED' }, include: { lines: true }, take: 1 },
    },
  });

  const prodMap = new Map(heavyProducts.map((p) => [p.sku, p]));

  // Dates: Today at 12:00 UTC (matching local 2026-11-13)
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const getOffsetDate = (daysAgo) => {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - daysAgo);
    return d;
  };

  const scheduleConfigs = [
    // --- TODAY'S SCHEDULES (5 Active on Default "Today" View) ---
    {
      planNumber: 'SCH-2026-TODAY-01',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      qty: 30,
      completedQty: 30,
      stageProgress: 1.0, // 100% Completed
      status: ProductionPlanStatus.COMPLETED,
      date: getOffsetDate(0),
      shift: 'MORNING',
      incharge: 'Haider Bhanpurawala (Shift Head - Bay A)',
      note: 'Heavy structural truss assembly - FAT hydrostatic deflection test cleared with zero non-conformance.',
    },
    {
      planNumber: 'SCH-2026-TODAY-02',
      prodSku: 'VESSEL-AIR-RECEIVER-10KL',
      qty: 12,
      completedQty: 10,
      stageProgress: 0.85, // About to get complete: 10 of 12 complete, remaining in paint curing
      status: ProductionPlanStatus.IN_PROGRESS,
      date: getOffsetDate(0),
      shift: 'MORNING',
      incharge: 'Vikramaditya Rao (Fabrication Incharge)',
      note: 'High-pressure air receivers - 10 units finished and hydro-tested; final 2 units in paint curing bay.',
    },
    {
      planNumber: 'SCH-2026-TODAY-03',
      prodSku: 'PIPELINE-SPOOL-DN250-SCH40',
      qty: 120,
      completedQty: 60,
      stageProgress: 0.50, // Halfway through: 60 of 120 spools
      status: ProductionPlanStatus.IN_PROGRESS,
      date: getOffsetDate(0),
      shift: 'AFTERNOON',
      incharge: 'Irfan Khan (Machine Shop Incharge)',
      note: 'Class 300 WNRF flanged pipe spools - 60 completed through milling; 60 currently at SAW welding rig.',
    },
    {
      planNumber: 'SCH-2026-TODAY-04',
      prodSku: 'CRANE-GIRDER-PLATE-BOX',
      qty: 6,
      completedQty: 1,
      stageProgress: 0.17, // Just begun: 1 of 6 cut & beveled
      status: ProductionPlanStatus.IN_PROGRESS,
      date: getOffsetDate(0),
      shift: 'NIGHT',
      incharge: 'Ramesh Sharma (CNC Profiling Incharge)',
      note: '50-Ton EOT crane box girder plates nested and issued - 1st unit cut and beveled; 5 plates on plasma table.',
    },
    {
      planNumber: 'SCH-2026-TODAY-05',
      prodSku: 'ANCHOR-BOLT-CAGE-M48',
      qty: 80,
      completedQty: 0,
      stageProgress: 0.0, // Released to Floor: materials staged
      status: ProductionPlanStatus.RELEASED,
      date: getOffsetDate(0),
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
      date: getOffsetDate(0),
      shift: 'AFTERNOON',
      incharge: 'Prakash Nair (Surface & Packing Incharge)',
      note: 'Super Heavy Duty Large SS Foldable Wing Dryer - 125 units sub-assembled; 125 in wire spot welding.',
    },

    // --- RECENT COMPLETED & HISTORICAL SCHEDULES ---
    {
      planNumber: 'PLAN-2026-TRUSS-01',
      prodSku: 'STEEL-ISMB-450-TRUSS',
      qty: 25,
      completedQty: 25,
      stageProgress: 1.0,
      status: ProductionPlanStatus.COMPLETED,
      date: getOffsetDate(5),
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
      date: getOffsetDate(4),
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
      date: getOffsetDate(2),
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
      date: getOffsetDate(1),
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
      date: getOffsetDate(3),
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
      date: getOffsetDate(2),
      shift: 'AFTERNOON',
      incharge: 'Dinesh Patel (Senior Technician)',
      note: 'High-tensile foundation bolt cage assemblies. Work order released to machine shop and threading line.',
    },
  ];

  // Clean old execution records to ensure a fresh clean state
  console.log('🧹 Clearing legacy execution schedules...');
  await prisma.fgPackagingRecord.deleteMany();
  await prisma.fgReceipt.deleteMany();
  await prisma.fgReadyOutput.deleteMany();
  await prisma.handover.deleteMany();
  await prisma.assemblyWaveIntakeAllocation.deleteMany();
  await prisma.assemblyBatchComponent.deleteMany();
  await prisma.assemblyWorkerAssignment.deleteMany();
  await prisma.assemblyProgressEvent.deleteMany();
  await prisma.assemblyBatch.deleteMany();
  await prisma.assemblyIntakeRequirement.deleteMany();
  await prisma.workerAssignment.deleteMany();
  await prisma.progressEvent.deleteMany();
  await prisma.exceptionRecord.deleteMany();
  await prisma.productionTaskMaterialAssignment.deleteMany();
  await prisma.departmentExecutionBatch.deleteMany();
  await prisma.productionMaterialIssue.deleteMany();
  await prisma.productionPlanEvent.deleteMany();
  await prisma.productionPlan.deleteMany();

  console.log('🌱 Seeding production execution records...');

  for (const cfg of scheduleConfigs) {
    const prod = prodMap.get(cfg.prodSku) || heavyProducts[0];
    const route = prod.routes[0];
    const bom = prod.bomVersions[0];
    const steps = route?.steps || [];

    // 1. Create ProductionPlan
    const plan = await prisma.productionPlan.create({
      data: {
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
    const matIssue = await prisma.productionMaterialIssue.create({
      data: {
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

    // 3. Batches for each non-assembly step
    const nonAssemblySteps = steps.filter((s) => s.stepOrder < 5);
    const createdBatches = [];

    for (const step of nonAssemblySteps) {
      const stepIdx = step.stepOrder;
      const batchNumber = `BATCH-${plan.planNumber}-STG${stepIdx}`;

      let bStatus = BatchExecutionStatus.AWAITING_RECEIPT;
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
        // Cascading stage progress
        if (stepIdx === 1) {
          stageCompleted = Math.min(cfg.qty, Math.round(cfg.qty * Math.min(1.0, cfg.stageProgress * 1.5)));
          stagePending = cfg.qty - stageCompleted;
          bStatus = stagePending === 0 ? BatchExecutionStatus.COMPLETE : BatchExecutionStatus.IN_PROGRESS;
        } else if (stepIdx === 2) {
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * Math.min(1.0, cfg.stageProgress * 1.3)));
          stageCompleted = Math.min(stageReceived, Math.round(cfg.qty * cfg.stageProgress));
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        } else if (stepIdx === 3) {
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * cfg.stageProgress));
          stageCompleted = Math.min(stageReceived, Math.round(cfg.qty * Math.max(0, cfg.stageProgress - 0.2)));
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        } else {
          stageReceived = Math.min(cfg.qty, Math.round(cfg.qty * Math.max(0, cfg.stageProgress - 0.2)));
          stageCompleted = Math.min(stageReceived, cfg.completedQty);
          stagePending = stageReceived - stageCompleted;
          bStatus = stageCompleted === cfg.qty ? BatchExecutionStatus.COMPLETE : stageReceived > 0 ? BatchExecutionStatus.IN_PROGRESS : BatchExecutionStatus.AWAITING_RECEIPT;
        }
      }

      const empCodes = ['EMP-CUT-01', 'EMP-WELD-02', 'EMP-MACH-03', 'EMP-SURF-04'];
      const assignedEmp = empMap.get(empCodes[stepIdx - 1]) || empMap.get('EMP-CUT-01');

      const batch = await prisma.departmentExecutionBatch.create({
        data: {
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

      if (assignedEmp) {
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

      if (stageCompleted > 0 && assignedEmp) {
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

    // 4. Task Material Assignments
    if (bom.lines.length > 0) {
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

    // 5. Inter-Department Handovers
    for (let bIdx = 0; bIdx < createdBatches.length - 1; bIdx++) {
      const outBatch = createdBatches[bIdx];
      const inBatch = createdBatches[bIdx + 1];
      const outStep = nonAssemblySteps[bIdx];
      const inStep = nonAssemblySteps[bIdx + 1];

      const outDeptId = outStep.departmentId;
      const inDeptId = inStep.departmentId;

      const handoverQty = Number(outBatch.completed_qty);
      if (handoverQty > 0) {
        const hKey = `HO-${plan.planNumber}-STG${bIdx + 1}-TO-STG${bIdx + 2}`;
        await prisma.handover.create({
          data: {
            id: randomUUID(),
            outgoingBatch: { connect: { id: outBatch.id } },
            outgoingDepartment: { connect: { id: outDeptId } },
            incomingDepartment: { connect: { id: inDeptId } },
            incomingBatch: { connect: { id: inBatch.id } },
            quantity: handoverQty,
            status: HandoverStatus.ACCEPTED,
            proposedByActorId: actorId,
            decidedByActorId: actorId,
            proposedAt: cfg.date,
            decidedAt: cfg.date,
            idempotencyKey: hKey,
            notes: `Transfer of ${handoverQty} units from stage ${bIdx + 1} to stage ${bIdx + 2}`,
          },
        });
      }
    }

    // 6. Assembly Intake Requirements
    const lastBatch = createdBatches[createdBatches.length - 1];
    const lastStep = nonAssemblySteps[nonAssemblySteps.length - 1];

    if (lastBatch && lastStep) {
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

      if (readyForAssembly > 0) {
        const asyHKey = `HO-${plan.planNumber}-SURF-TO-ASY`;
        await prisma.handover.create({
          data: {
            id: randomUUID(),
            outgoingBatch: { connect: { id: lastBatch.id } },
            outgoingDepartment: { connect: { id: lastStep.departmentId } },
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

    // 7. Assembly Batch & FG Outputs
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

    if (cfg.completedQty > 0) {
      const outputNumber = `FG-OUT-${plan.planNumber}`;
      await prisma.fgReadyOutput.create({
        data: {
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

    console.log(`  ✓ Seeded Schedule: ${cfg.planNumber} (${cfg.status}) - ${cfg.completedQty}/${cfg.qty} units`);
  }

  console.log('🎉 Complete Production Execution seeding finished successfully!');
}

run()
  .catch((err) => {
    console.error('Error during execution seeding:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
