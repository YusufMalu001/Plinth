import { PrismaClient, BatchExecutionStatus, ProgressEventType, ExceptionRecordType, HandoverStatus, WipExceptionType, WipExceptionStatus, WipExceptionSeverity, LifecycleStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Canonical real departments
const CANONICAL_DEPARTMENT_CODES = [
  'DEPT-STORE',
  'DEPT-PROD',
  'DEPT-LASER',
  'DEPT-TUBE',
  'DEPT-PIPE',
  'DEPT-BUFF'
];

// Real employee profiles for the 6 real production departments
const employeeProfiles = [
  { code: 'EMP-PROD-01', firstName: 'Haider', lastName: 'Bhanpurawala', role: 'Production Supervisor', deptCode: 'DEPT-PROD' },
  { code: 'EMP-STORE-01', firstName: 'Sufiyan', lastName: 'Mirza', role: 'Store Manager', deptCode: 'DEPT-STORE' },
  { code: 'EMP-LASER-01', firstName: 'Ashraf', lastName: 'Ansari', role: 'Laser Specialist', deptCode: 'DEPT-LASER' },
  { code: 'EMP-TUBE-01', firstName: 'Mohsin', lastName: 'Khan', role: 'Tube Bending Lead', deptCode: 'DEPT-TUBE' },
  { code: 'EMP-PIPE-01', firstName: 'Shyam', lastName: 'Yadav', role: 'Pipe Cutting Operator', deptCode: 'DEPT-PIPE' },
  { code: 'EMP-BUFF-01', firstName: 'Wasim', lastName: 'Baig', role: 'Buffing Technician', deptCode: 'DEPT-BUFF' }
];

// Production Multi-Department Workflow Routings spanning ONLY genuine departments
const workflows = [
  // Stand & Frame workflow: Laser -> Pipe Cutting -> Buffing -> Production
  {
    name: 'Stand & Frame Fabrication Lineage',
    stages: ['DEPT-LASER', 'DEPT-PIPE', 'DEPT-BUFF', 'DEPT-PROD']
  },
  // Ceiling / Cloth Dryer workflow: Store -> Pipe Cutting -> Tube Bending -> Production
  {
    name: 'Ceiling Cloth Dryer Lineage',
    stages: ['DEPT-STORE', 'DEPT-PIPE', 'DEPT-TUBE', 'DEPT-PROD']
  },
  // Laser & Full Precision Fabrication Lineage: Store -> Laser -> Tube Bending -> Buffing -> Production
  {
    name: 'Full Precision Fabrication Lineage',
    stages: ['DEPT-STORE', 'DEPT-LASER', 'DEPT-TUBE', 'DEPT-BUFF', 'DEPT-PROD']
  },
  // Tube & Pipe Assembly Lineage: Store -> Pipe Cutting -> Production
  {
    name: 'Direct Tube & Pipe Lineage',
    stages: ['DEPT-STORE', 'DEPT-PIPE', 'DEPT-PROD']
  },
  // High Finish Luxury Lineage: Laser -> Buffing -> Production
  {
    name: 'Laser & Polish Lineage',
    stages: ['DEPT-LASER', 'DEPT-BUFF', 'DEPT-PROD']
  },
  // Bent Tube Lineage: Store -> Tube Bending -> Buffing -> Production
  {
    name: 'Curved Frame Lineage',
    stages: ['DEPT-STORE', 'DEPT-TUBE', 'DEPT-BUFF', 'DEPT-PROD']
  }
];

async function seed() {
  console.log('🌱 Starting comprehensive real data seed for Shop Floor & WIP Tracking...');

  // 1. Fetch admin user
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!adminUser) throw new Error('No admin user found.');

  // 2. Clean out old batches, handovers, exceptions, assignments, events
  console.log('🧹 Cleaning previous execution batches for clean idempotent seed...');
  await prisma.wipReconciliationException.deleteMany();
  await prisma.handover.deleteMany();
  await prisma.exceptionRecord.deleteMany();
  await prisma.progressEvent.deleteMany();
  await prisma.workerAssignment.deleteMany();
  await prisma.departmentExecutionBatch.deleteMany();

  // 3. Clean up extraneous non-department rows (e.g. product materials/assemblies mistakenly placed in departments)
  console.log('🧹 Cleaning up extraneous material/assembly rows from departments table...');
  const nonCanonicalDepts = await prisma.department.findMany({
    where: { code: { notIn: CANONICAL_DEPARTMENT_CODES } }
  });

  if (nonCanonicalDepts.length > 0) {
    const nonCanonicalIds = nonCanonicalDepts.map((d: any) => d.id);
    // Delete any employees associated with these non-canonical departments
    await prisma.employee.deleteMany({
      where: { departmentId: { in: nonCanonicalIds } }
    });
    // Delete the non-canonical departments
    const deleteResult = await prisma.department.deleteMany({
      where: { id: { in: nonCanonicalIds } }
    });
    console.log(`🗑️ Deleted ${deleteResult.count} non-department records from departments table.`);
  }

  // 4. Fetch the canonical 6 departments
  const depts = await prisma.department.findMany();
  const deptMap = new Map<string, typeof depts[0]>();
  for (const d of depts) {
    deptMap.set(d.code, d);
  }
  console.log(`🏢 Canonical departments loaded (${depts.length}):`, depts.map(d => `${d.code} (${d.name})`));

  // 5. Seed Employees for canonical departments
  console.log('👥 Seeding Employees for canonical departments...');
  const employeeMap = new Map<string, any>();
  for (const emp of employeeProfiles) {
    const dept = deptMap.get(emp.deptCode);
    const existing = await prisma.employee.findUnique({ where: { employeeCode: emp.code } });
    if (!existing) {
      const created = await prisma.employee.create({
        data: {
          employeeCode: emp.code,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}@plinth.local`,
          role: emp.role,
          departmentId: dept ? dept.id : null,
          status: LifecycleStatus.ACTIVE
        }
      });
      employeeMap.set(emp.code, created);
    } else {
      // Update employee's departmentId if needed
      const updated = await prisma.employee.update({
        where: { id: existing.id },
        data: {
          departmentId: dept ? dept.id : null,
          role: emp.role
        }
      });
      employeeMap.set(emp.code, updated);
    }
  }
  console.log(`✅ Employees initialized (${employeeMap.size} active employees).`);

  // 6. Fetch active Production Plans
  const productionPlans = await prisma.productionPlan.findMany({
    include: { product: true }
  });
  console.log(`📦 Found ${productionPlans.length} production plans.`);

  const now = Date.now();
  let batchCounter = 1000;
  let totalBatchesCreated = 0;
  let totalHandoversCreated = 0;
  const createdBatchesByDept = new Map<string, number>();

  // Process plans to generate realistic multi-stage chains
  for (let pIdx = 0; pIdx < productionPlans.length; pIdx++) {
    const plan = productionPlans[pIdx];
    const planQty = Number(plan.quantity) || 50;

    // Pick workflow based on index
    const workflow = workflows[pIdx % workflows.length];
    const numStages = workflow.stages.length;

    // Determine state of this plan:
    // 0 -> fully completed
    // 1 -> in progress at stage 2 or 3
    // 2 -> awaiting receipt at stage 1 or 2
    // 3 -> active in progress with rework / scraps
    const planProgressMode = pIdx % 4;

    let prevBatch: any = null;
    let prevDeptId: string | null = null;
    let runningQty = planQty;

    for (let sIdx = 0; sIdx < numStages; sIdx++) {
      const stageDeptCode = workflow.stages[sIdx];
      const dept = deptMap.get(stageDeptCode);
      if (!dept) continue;

      batchCounter++;
      const batchNumber = `BATCH-${dept.code.replace('DEPT-', '')}-${batchCounter}`;
      const stageSeq = sIdx + 1;

      // Assign employee for this department
      const empProfile = employeeProfiles.find(e => e.deptCode === stageDeptCode) || employeeProfiles[0];
      const employee = employeeMap.get(empProfile.code);

      // Determine batch execution status for this stage
      let stageStatus: BatchExecutionStatus;
      let receivedQty = 0;
      let completedQty = 0;
      let rejectedQty = 0;
      let scrapQty = 0;
      let wastageQty = 0;
      let pendingQty = 0;

      // Timing timestamps
      const hoursAgo = (numStages - sIdx) * 4 + (pIdx % 3);
      const createdAt = new Date(now - hoursAgo * 3600 * 1000);
      let completedAt: Date | null = null;

      if (planProgressMode === 0) {
        // Fully completed chain
        stageStatus = (sIdx === numStages - 1) ? BatchExecutionStatus.COMPLETE : BatchExecutionStatus.NEXT_STAGE_ACCEPTED;
        receivedQty = runningQty;
        // Minor scrap in middle stages
        if (sIdx === 1 && runningQty > 5) {
          scrapQty = 1;
        }
        completedQty = receivedQty - scrapQty;
        runningQty = completedQty;
        completedAt = new Date(createdAt.getTime() + (2.5 * 3600 * 1000));
      } else if (planProgressMode === 1) {
        // In Progress at stage 2
        if (sIdx === 0) {
          stageStatus = BatchExecutionStatus.NEXT_STAGE_ACCEPTED;
          receivedQty = runningQty;
          completedQty = runningQty;
          completedAt = new Date(createdAt.getTime() + (2 * 3600 * 1000));
        } else if (sIdx === 1) {
          stageStatus = BatchExecutionStatus.IN_PROGRESS;
          receivedQty = runningQty;
          completedQty = Math.floor(runningQty * 0.6);
          pendingQty = receivedQty - completedQty;
        } else {
          stageStatus = BatchExecutionStatus.AWAITING_RECEIPT;
          receivedQty = 0;
        }
      } else if (planProgressMode === 2) {
        // Queued / Awaiting Receipt
        if (sIdx === 0) {
          stageStatus = BatchExecutionStatus.IN_PROGRESS;
          receivedQty = runningQty;
          completedQty = Math.floor(runningQty * 0.4);
          pendingQty = receivedQty - completedQty;
        } else {
          stageStatus = BatchExecutionStatus.AWAITING_RECEIPT;
          receivedQty = 0;
        }
      } else {
        // Active with Rework & Paused events
        if (sIdx === 0) {
          stageStatus = BatchExecutionStatus.NEXT_STAGE_ACCEPTED;
          receivedQty = runningQty;
          completedQty = runningQty;
          completedAt = new Date(createdAt.getTime() + (3 * 3600 * 1000));
        } else if (sIdx === 1) {
          stageStatus = BatchExecutionStatus.PAUSED;
          receivedQty = runningQty;
          rejectedQty = 2;
          completedQty = Math.floor(runningQty * 0.5);
          pendingQty = receivedQty - completedQty - rejectedQty;
        } else {
          stageStatus = BatchExecutionStatus.AWAITING_RECEIPT;
          receivedQty = 0;
        }
      }

      // Create DepartmentExecutionBatch
      const batch = await prisma.departmentExecutionBatch.create({
        data: {
          batchNumber,
          productionPlanId: plan.id,
          departmentId: dept.id,
          stageSequenceNumber: stageSeq,
          status: stageStatus,
          received_qty: receivedQty,
          completed_qty: completedQty,
          rejected_qty: rejectedQty,
          scrap_qty: scrapQty,
          wastage_qty: wastageQty,
          pending_qty: pendingQty,
          notes: `Stage ${stageSeq}: ${dept.name} execution for ${plan.product.name}`,
          createdByActorId: adminUser.id,
          createdAt,
          updatedAt: completedAt || createdAt
        }
      });

      totalBatchesCreated++;
      createdBatchesByDept.set(dept.name, (createdBatchesByDept.get(dept.name) || 0) + 1);

      // Create Worker Assignment if active or completed
      if (employee && receivedQty > 0) {
        await prisma.workerAssignment.create({
          data: {
            batchId: batch.id,
            employeeId: employee.id,
            subtaskDescription: `Execution on ${dept.name} station`,
            assignedByActorId: adminUser.id,
            assignedAt: new Date(createdAt.getTime() + 15 * 60 * 1000)
          }
        });
      }

      // Create Progress Events
      if (employee && receivedQty > 0) {
        // 1. STARTED
        await prisma.progressEvent.create({
          data: {
            batchId: batch.id,
            employeeId: employee.id,
            eventType: ProgressEventType.STARTED,
            quantityDelta: 0,
            notes: 'Batch received and setup started',
            timestamp: new Date(createdAt.getTime() + 20 * 60 * 1000)
          }
        });

        if (stageStatus === BatchExecutionStatus.PAUSED) {
          await prisma.progressEvent.create({
            data: {
              batchId: batch.id,
              employeeId: employee.id,
              eventType: ProgressEventType.PAUSED,
              quantityDelta: 0,
              notes: 'Paused for tool adjustment / quality re-check',
              timestamp: new Date(createdAt.getTime() + 90 * 60 * 1000)
            }
          });
        }

        if (completedQty > 0) {
          await prisma.progressEvent.create({
            data: {
              batchId: batch.id,
              employeeId: employee.id,
              eventType: ProgressEventType.PARTIAL_RECORDED,
              quantityDelta: completedQty,
              notes: `Recorded completion of ${completedQty} units`,
              timestamp: completedAt || new Date(createdAt.getTime() + 120 * 60 * 1000)
            }
          });
        }

        if (completedAt) {
          await prisma.progressEvent.create({
            data: {
              batchId: batch.id,
              employeeId: employee.id,
              eventType: ProgressEventType.COMPLETED,
              quantityDelta: 0,
              notes: 'Stage execution completed successfully',
              timestamp: completedAt
            }
          });
        }
      }

      // Create Exception Records (Scrap / Rejection)
      if (employee && (scrapQty > 0 || rejectedQty > 0)) {
        if (scrapQty > 0) {
          await prisma.exceptionRecord.create({
            data: {
              batchId: batch.id,
              type: ExceptionRecordType.SCRAP,
              quantity: scrapQty,
              reason: 'Corner weld defect / edge burr exceeding tolerance',
              employeeId: employee.id,
              timestamp: new Date(createdAt.getTime() + 45 * 60 * 1000)
            }
          });
        }
        if (rejectedQty > 0) {
          await prisma.exceptionRecord.create({
            data: {
              batchId: batch.id,
              type: ExceptionRecordType.REJECTION,
              quantity: rejectedQty,
              reason: 'Dimensional variation flagged for secondary rework',
              employeeId: employee.id,
              timestamp: new Date(createdAt.getTime() + 60 * 1000)
            }
          });
        }
      }

      // Create Handover between prevBatch and current batch
      if (prevBatch && prevDeptId) {
        const handoverQty = receivedQty > 0 ? receivedQty : completedQty || planQty;
        const isPrevAccepted = (prevBatch.status === BatchExecutionStatus.NEXT_STAGE_ACCEPTED || completedAt != null);
        const handoverStatus = isPrevAccepted
          ? HandoverStatus.ACCEPTED
          : (stageStatus === BatchExecutionStatus.AWAITING_RECEIPT ? HandoverStatus.PROPOSED : HandoverStatus.ACCEPTED);

        const handover = await prisma.handover.create({
          data: {
            outgoingBatchId: prevBatch.id,
            outgoingDepartmentId: prevDeptId,
            incomingDepartmentId: dept.id,
            quantity: handoverQty,
            status: handoverStatus,
            proposedByActorId: adminUser.id,
            proposedAt: new Date(createdAt.getTime() - 30 * 60 * 1000),
            decidedByActorId: handoverStatus === HandoverStatus.ACCEPTED ? adminUser.id : null,
            decidedAt: handoverStatus === HandoverStatus.ACCEPTED ? createdAt : null,
            idempotencyKey: `HO-${prevBatch.id}-${batch.id}`,
            notes: `Material transfer from ${workflow.stages[sIdx - 1]} to ${stageDeptCode}`
          }
        });

        // Link batch sourceHandoverId
        await prisma.departmentExecutionBatch.update({
          where: { id: batch.id },
          data: { sourceHandoverId: handover.id }
        });

        totalHandoversCreated++;
      }

      prevBatch = batch;
      prevDeptId = dept.id;
    }
  }

  // 7. Seed realistic WIP Reconciliation Exceptions for anomaly engine investigation
  console.log('🛡️ Seeding WIP Reconciliation Invariant Anomalies...');
  const sampleBatches = await prisma.departmentExecutionBatch.findMany({
    take: 6,
    where: { status: { in: [BatchExecutionStatus.IN_PROGRESS, BatchExecutionStatus.PAUSED] } },
    include: { department: true, productionPlan: true }
  });

  if (sampleBatches.length >= 2) {
    // Exception 1: Conservation Mismatch
    await prisma.wipReconciliationException.create({
      data: {
        batchId: sampleBatches[0].id,
        productionPlanId: sampleBatches[0].productionPlanId,
        departmentId: sampleBatches[0].departmentId,
        exceptionType: WipExceptionType.CONSERVATION_MISMATCH,
        severity: WipExceptionSeverity.HIGH,
        description: `Quantity conservation check failed: received quantity (${sampleBatches[0].received_qty}) has pending audit discrepancy with downstream count.`,
        details: { expected: Number(sampleBatches[0].received_qty), counted: Number(sampleBatches[0].completed_qty) },
        status: WipExceptionStatus.OPEN,
        detectedAt: new Date(now - 2 * 3600 * 1000)
      }
    });

    // Exception 2: Broken Genealogy Chain
    await prisma.wipReconciliationException.create({
      data: {
        batchId: sampleBatches[1].id,
        productionPlanId: sampleBatches[1].productionPlanId,
        departmentId: sampleBatches[1].departmentId,
        exceptionType: WipExceptionType.BROKEN_GENEALOGY_CHAIN,
        severity: WipExceptionSeverity.MEDIUM,
        description: `Handover verification pending: Source batch record marked next stage accepted but receipt confirmation delayed over 4 hours.`,
        details: { batchNumber: sampleBatches[1].batchNumber },
        status: WipExceptionStatus.INVESTIGATING,
        detectedAt: new Date(now - 5 * 3600 * 1000),
        investigatedByActorId: adminUser.id,
        investigatedAt: new Date(now - 1 * 3600 * 1000),
        investigationNotes: 'Contacted shift supervisor Ashraf Ansari to verify physical cart location.'
      }
    });
  }

  console.log('====================================================');
  console.log(`🎉 Seeding Complete!`);
  console.log(`- Total Batches Created: ${totalBatchesCreated}`);
  console.log(`- Total Handovers Created: ${totalHandoversCreated}`);
  console.log(`- Departments populated with active load:`);
  for (const [name, count] of createdBatchesByDept.entries()) {
    console.log(`  * ${name}: ${count} batches`);
  }
  console.log('====================================================');
}

seed()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
