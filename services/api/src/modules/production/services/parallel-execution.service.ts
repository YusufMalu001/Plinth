import { randomUUID } from 'crypto';
import { prisma } from '../../../database';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { notificationService } from '../../notifications/notification.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { availableGoodOutput, buildableKits } from './production-flow.math';
import { markReleasedPlanInProgress } from './production-plan-status';

const normalized = (value: string) => value.toLowerCase().replace(/[\s-]+/g, '_');

export async function notifyAssemblyReadiness(planId: string) {
  const plan = await prisma.productionPlan.findUnique({ where: { id: planId }, include: { product: true, route: true, assemblyIntakeRequirements: true } });
  if (!plan?.route?.assemblyDepartmentId || !plan.assemblyIntakeRequirements.length) return;
  const buildable = buildableKits(plan.assemblyIntakeRequirements);
  if (!buildable) return;
  await notificationService.notifyDepartment({
    departmentId: plan.route.assemblyDepartmentId, title: 'Complete Assembly kits ready',
    message: `${buildable} complete kits for ${plan.product.name} are ready to allocate.`,
    resource: 'ProductionPlan', resourceId: planId, href: `/production/execution/plans/${planId}`,
    dedupeKeyPrefix: `ASSEMBLY_READY:${planId}:${buildable}`
  });
}

export async function autoCreateReadyAssemblyWave(planId: string, _actorId?: string) {
  return new ParallelExecutionService().createReadyAssemblyWave(planId, 'system');
}

export async function productionActorScope(actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      role: true,
      assignedDepartmentId: true,
      department: true,
      employeeRefId: true,
      employeeRef: { select: { departmentId: true } },
      userRoles: { select: { role: { select: { name: true } } } }
    }
  });
  if (!user) throw new ForbiddenError('User is not assigned to production.');
  const roles = [user.role, ...user.userRoles.map((row) => row.role.name)].map(normalized);
  const global = roles.some((role) => ['admin', 'super_admin', 'system_admin', 'store_manager', 'production_manager'].includes(role));
  const departmentId = user.assignedDepartmentId || user.employeeRef?.departmentId || user.department || null;
  if (!global && !departmentId) throw new ForbiddenError('A department assignment is required.');
  const incharge = roles.some((role) => ['department_head', 'department_incharge', 'dept_head'].includes(role));
  const operator = !global && !incharge && roles.some((role) => ['operator', 'shop_floor_operator', 'employee'].includes(role));
  if (!global && !incharge && !operator) throw new ForbiddenError('This role cannot access department production work.');
  if (operator && !user.employeeRefId) throw new ForbiddenError('An employee profile is required for workstation access.');
  return { global, departmentId, employeeId: user.employeeRefId, operator };
}

export class ParallelExecutionService {
  async createReadyAssemblyWave(planId: string, actorId: string) {
    const scope = actorId === 'system'
      ? { global: true, operator: false, departmentId: null, employeeId: null }
      : await productionActorScope(actorId);
    const plan = await prisma.productionPlan.findUnique({
      where: { id: planId }, include: {
        route: { select: { assemblyDepartmentId: true } },
        assemblyIntakeRequirements: true,
        assemblyBatches: { select: { targetOutputQuantity: true } }
      }
    });
    if (!plan?.route?.assemblyDepartmentId) return null;
    if (!scope.global && scope.departmentId !== plan.route.assemblyDepartmentId) throw new ForbiddenError();
    const remainingScheduleQty = Math.max(0, Math.floor(Number(plan.quantity) - plan.assemblyBatches.reduce((sum, batch) => sum + Number(batch.targetOutputQuantity), 0)));
    const quantity = Math.min(buildableKits(plan.assemblyIntakeRequirements), remainingScheduleQty);
    if (quantity < 1) return null;
    try {
      return await this.createAssemblyWave(planId, quantity, actorId, `AUTO-ASSEMBLY:${planId}:${randomUUID()}`);
    } catch (error) {
      // Another accepted input may have allocated the newly available kits first.
      if (error instanceof ValidationError || error instanceof ConflictError) return null;
      throw error;
    }
  }

  async release(planId: string, actorId: string) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "production_plans" WHERE "id" = ${planId} FOR UPDATE`;
      const plan = await tx.productionPlan.findUnique({
        where: { id: planId },
        include: {
          product: true,
          requirements: true,
          route: { include: { steps: true, materialAllocations: { include: { bomLine: true } } } }
        }
      });
      if (!plan) throw new NotFoundError('Production schedule not found.');
      if (plan.status === 'RELEASED') return {
        plan,
        departmentIds: [...new Set([...(plan.route?.steps.map((step) => step.departmentId) || []), ...(plan.route?.assemblyDepartmentId ? [plan.route.assemblyDepartmentId] : [])])],
        rootDepartmentIds: plan.route?.steps.filter((step) => !step.parentStepId).map((step) => step.departmentId) || []
      };
      if (plan.status !== 'APPROVED') throw new ValidationError('Only an approved schedule can be released.');
      const route = plan.route;
      if (!route?.graphReviewedAt || !route.assemblyDepartmentId || route.bomVersionId !== plan.bomVersionId || !route.steps.length) {
        throw new ValidationError('A reviewed branch route mapped to this approved BOM is required.');
      }
      const allocationsByBomLine = new Map<string, typeof route.materialAllocations>();
      for (const allocation of route.materialAllocations) {
        allocationsByBomLine.set(allocation.bomLineId, [
          ...(allocationsByBomLine.get(allocation.bomLineId) || []),
          allocation
        ]);
      }
      if (plan.requirements.length !== allocationsByBomLine.size || plan.requirements.some((row) => !row.bomLineId || !allocationsByBomLine.has(row.bomLineId))) {
        throw new ValidationError('Every schedule material must have one route or Assembly destination.');
      }
      const batches = new Map<string, string>();
      for (const step of route.steps) {
        if (!step.branchKey || !step.stepOrder || !step.outputItemType || !step.outputItemId || !step.outputUomId || !step.outputQuantityPerUnit) {
          throw new ValidationError('Every step needs a branch and a catalog output.');
        }
        const target = Number(step.outputQuantityPerUnit) * Number(plan.quantity);
        const batch = await tx.departmentExecutionBatch.create({
          data: {
            batchNumber: `BATCH-${plan.planNumber}-${step.branchKey}-${step.stepOrder}`,
            productionPlanId: plan.id, departmentId: step.departmentId, routeStepId: step.id,
            workCenterId: step.workCenterId, stageSequenceNumber: step.stepOrder,
            status: step.parentStepId ? 'PENDING' : 'AWAITING_RECEIPT',
            received_qty: step.parentStepId ? 0 : target, pending_qty: step.parentStepId ? 0 : target, expectedOutputQty: target,
            outputItemType: step.outputItemType, outputItemId: step.outputItemId, outputUomId: step.outputUomId,
            createdByActorId: actorId
          }
        });
        batches.set(step.id, batch.id);
      }
      const assemblyDepts = await tx.department.findMany({
        where: {
          OR: [
            { id: route.assemblyDepartmentId || '' },
            { isAssembly: true },
            { code: { contains: 'ASSEMBLY', mode: 'insensitive' } },
            { name: { contains: 'ASSEMBLY', mode: 'insensitive' } }
          ]
        },
        select: { id: true }
      });
      const assemblyDeptIds = new Set(assemblyDepts.map((d) => d.id));
      const terminal = route.steps.filter((step) =>
        (step.nextDepartmentId && assemblyDeptIds.has(step.nextDepartmentId))
        || step.nextDepartmentId === route.assemblyDepartmentId
        || (!step.nextDepartmentId && !route.steps.some((child) => child.parentStepId === step.id))
      );
      for (const step of terminal) {
        await tx.assemblyIntakeRequirement.create({
          data: {
            productionPlanId: plan.id, sourceStepId: step.id,
            itemType: step.outputItemType!, itemId: step.outputItemId!, uomId: step.outputUomId!,
            requiredPerUnit: step.outputQuantityPerUnit!, requiredQty: Number(step.outputQuantityPerUnit) * Number(plan.quantity)
          }
        });
      }
      for (const requirement of plan.requirements) {
        const allocations = allocationsByBomLine.get(requirement.bomLineId!)!;
        const bomQuantity = Number(allocations[0].bomLine.quantity);
        const requiredQuantity = Number(requirement.inventoryQuantity);
        if (!bomQuantity || Math.abs(allocations.reduce((sum, row) => sum + Number(row.quantity), 0) - bomQuantity) > 0.000001) {
          throw new ValidationError('Material route allocations do not match the BOM quantity.');
        }
        const reservedForRequirement = Number(requirement.reservedQuantity) >= requiredQuantity;
        let issuedQuantity = 0;
        let lastIssuedLocationId = requirement.locationId;

        for (let index = 0; index < allocations.length; index += 1) {
          const allocation = allocations[index];
          const step = allocation.routeStepId ? route.steps.find((candidate) => candidate.id === allocation.routeStepId) : null;
          if (allocation.routeStepId && !step) throw new ValidationError('Material assignment targets a missing route step.');
          const remainingRequirement = Number(Math.max(0, requiredQuantity - issuedQuantity).toFixed(6));
          const proportionalQuantity = Number((requiredQuantity * Number(allocation.quantity) / bomQuantity).toFixed(6));
          const quantity = index === allocations.length - 1
            ? remainingRequirement
            : Math.min(remainingRequirement, proportionalQuantity);
          if (quantity <= 0) continue;

          const balance = await tx.inventoryBalance.findFirst({
            where: {
              itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId,
              condition: 'AVAILABLE', ownership: 'COMPANY', quantity: { gte: quantity },
              ...(reservedForRequirement ? { locationId: requirement.locationId, reserved: { gte: quantity } } : {})
            }, orderBy: { quantity: 'desc' }
          });
          if (!balance) throw new ValidationError('Insufficient inventory for a production material assignment.');
          lastIssuedLocationId = balance.locationId;
          const assignment = await tx.productionTaskMaterialAssignment.create({
            data: {
              productionPlanId: plan.id, batchId: step ? batches.get(step.id) : null,
              destinationDepartmentId: step?.departmentId || route.assemblyDepartmentId!,
              bomLineId: requirement.bomLineId!, itemType: requirement.itemType, itemId: requirement.itemId,
              uomId: requirement.inventoryUomId, locationId: balance.locationId, lotId: balance.lotId,
              requiredQty: quantity, issuedQty: quantity
            }
          });
          const ledger = await inventoryPostingService.post(tx, {
            itemType: requirement.itemType as 'MATERIAL' | 'PRODUCT', itemId: requirement.itemId,
            uomId: requirement.inventoryUomId, locationId: balance.locationId, lotId: balance.lotId,
            movementType: 'ISSUE', quantity, consumeReserved: reservedForRequirement,
            sourceType: 'PRODUCTION_TASK_MATERIAL', sourceId: assignment.id,
            idempotencyKey: `PRODUCTION_TASK_ISSUE:${plan.id}:${assignment.id}`, actorId, correlationId: plan.id
          });
          await tx.productionTaskMaterialAssignment.update({ where: { id: assignment.id }, data: { ledgerEntryId: ledger.id } });
          if (!step) await tx.assemblyIntakeRequirement.create({
            data: {
              productionPlanId: plan.id, bomLineId: requirement.bomLineId!,
              itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId,
              requiredPerUnit: quantity / Number(plan.quantity), requiredQty: quantity
            }
          });
          issuedQuantity = Number((issuedQuantity + quantity).toFixed(6));
        }

        await tx.productionPlanRequirement.update({
          where: { id: requirement.id },
          data: { issuedQuantity, locationId: lastIssuedLocationId }
        });
      }
      const updated = await tx.productionPlan.updateMany({
        where: { id: plan.id, status: 'APPROVED' }, data: {
          status: 'RELEASED', releasedAt: new Date(), releasedByActorId: actorId, batchIdentity: `BATCH-${plan.planNumber}`
        }
      });
      if (updated.count !== 1) throw new ConflictError('This schedule was released by another request.');
      await tx.productionPlanEvent.create({ data: { productionPlanId: plan.id, actorId, eventType: 'RELEASED', fromStatus: 'APPROVED', toStatus: 'RELEASED' } });
      return { plan, departmentIds: [...new Set([...route.steps.map((step) => step.departmentId), route.assemblyDepartmentId])], rootDepartmentIds: route.steps.filter((step) => !step.parentStepId).map((step) => step.departmentId) };
    }).catch(async (error) => {
      if (String((error as Error).message).toLowerCase().includes('insufficient')) {
        await notificationService.notifyRoles({
          roles: ['admin', 'store_manager', 'production_manager'],
          title: 'Production release shortage', message: `Schedule ${planId} could not be released because assigned material stock is insufficient.`,
          resource: 'ProductionPlan', resourceId: planId, href: `/production/execution/plans/${planId}`,
          dedupeKeyPrefix: `PRODUCTION_RELEASE_SHORTAGE:${planId}`
        }).catch(() => undefined);
      }
      throw error;
    });
    for (const departmentId of result.departmentIds) {
      await notificationService.notifyDepartment({
        departmentId, title: 'Production schedule released', message: result.rootDepartmentIds.includes(departmentId)
          ? `Materials for ${result.plan.product.name} are issued. The starting task is ready to receive.`
          : `Materials for ${result.plan.product.name} are issued. Dependent work awaits upstream delivery.`,
        resource: 'ProductionPlan', resourceId: planId, href: `/production/execution/plans/${planId}`,
        dedupeKeyPrefix: `PARALLEL_RELEASE:${planId}:${departmentId}`
      });
    }
    return prisma.productionPlan.findUniqueOrThrow({ where: { id: planId } });
  }

  async receiveAssignment(assignmentId: string, actorId: string, acceptedQuantity?: number) {
    const scope = await productionActorScope(actorId);
    const received = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "production_task_material_assignments" WHERE "id" = ${assignmentId} FOR UPDATE`;
      const assignment = await tx.productionTaskMaterialAssignment.findUnique({ where: { id: assignmentId } });
      if (!assignment) throw new NotFoundError('Material assignment not found.');
      if (!scope.global && scope.departmentId !== assignment.destinationDepartmentId) throw new ForbiddenError();
      if (scope.operator && (!assignment.batchId || !await tx.workerAssignment.findFirst({ where: { batchId: assignment.batchId, employeeId: scope.employeeId! } }))) throw new ForbiddenError('This material is not assigned to your workstation task.');
      const remainingQty = Number(assignment.issuedQty) - Number(assignment.receivedQty);
      if (remainingQty <= 0) return assignment;
      const quantity = acceptedQuantity === undefined ? remainingQty : Number(acceptedQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remainingQty) {
        throw new ValidationError(`Accepted quantity must be greater than zero and no more than ${remainingQty}.`);
      }
      const newReceivedQty = Number((Number(assignment.receivedQty) + quantity).toFixed(6));
      const updated = await tx.productionTaskMaterialAssignment.update({ where: { id: assignmentId }, data: { receivedQty: newReceivedQty } });
      if (assignment.batchId) {
        const batch = await tx.departmentExecutionBatch.findUniqueOrThrow({ where: { id: assignment.batchId }, include: { routeStep: true, materialAssignments: true, incomingHandovers: true } });
        const allReceived = batch.materialAssignments.every((row) => row.id === assignmentId
          ? newReceivedQty >= Number(row.issuedQty)
          : Number(row.receivedQty) >= Number(row.issuedQty));
        const upstreamReady = !batch.routeStep?.parentStepId || batch.incomingHandovers.some((row) => row.status === 'ACCEPTED');
        if (allReceived && upstreamReady && ['PENDING', 'AWAITING_RECEIPT'].includes(batch.status)) {
          await tx.departmentExecutionBatch.update({ where: { id: batch.id }, data: { status: 'RECEIVED' } });
        }
      } else {
        await tx.assemblyIntakeRequirement.update({
          where: { productionPlanId_bomLineId: { productionPlanId: assignment.productionPlanId, bomLineId: assignment.bomLineId } },
          data: { acceptedQty: { increment: quantity } }
        });
      }
      return updated;
    });
    if (!received.batchId) {
      await notifyAssemblyReadiness(received.productionPlanId);
      await this.createReadyAssemblyWave(received.productionPlanId, actorId).catch(() => null);
    }
    return received;
  }

  async createAssemblyWave(planId: string, quantity: number, actorId: string, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length < 8) throw new ValidationError('A stable allocation request key is required.');
    const scope = actorId === 'system'
      ? { global: true, operator: false, departmentId: null, employeeId: null }
      : await productionActorScope(actorId);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "production_plans" WHERE "id" = ${planId} FOR UPDATE`;
      const plan = await tx.productionPlan.findUnique({ where: { id: planId }, include: { route: true, assemblyIntakeRequirements: true, assemblyBatches: true, product: true } });
      if (!plan?.route?.graphReviewedAt || !plan.route.assemblyDepartmentId) throw new NotFoundError('Graph production schedule not found.');
      if (!scope.global && scope.departmentId !== plan.route.assemblyDepartmentId) throw new ForbiddenError();
      if (scope.operator) throw new ForbiddenError('Assembly allocation requires an incharge or manager.');
      const previous = await tx.assemblyBatch.findUnique({ where: { allocationIdempotencyKey: idempotencyKey } });
      if (previous) {
        if (previous.productionPlanId !== planId || Number(previous.targetOutputQuantity) !== quantity) throw new ConflictError('Allocation request key is already used for another wave.');
        return previous;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) throw new ValidationError('Wave quantity must be a positive whole number.');
      if (!plan.assemblyIntakeRequirements.length) throw new ValidationError('Assembly has no configured inputs.');
      const alreadyPlanned = plan.assemblyBatches.reduce((sum, wave) => sum + Number(wave.targetOutputQuantity), 0);
      if (alreadyPlanned + quantity > Number(plan.quantity)) throw new ValidationError('Assembly wave exceeds the scheduled quantity.');
      const buildable = buildableKits(plan.assemblyIntakeRequirements);
      if (quantity > buildable) throw new ValidationError(`Only ${Math.max(0, buildable)} complete kits are ready.`);
      const waveIndex = plan.assemblyBatches.length + 1;
      const effectiveActorId = actorId === 'system'
        ? (plan.approvedByActorId || plan.releasedByActorId || (await tx.user.findFirst({ select: { id: true } }))?.id || '')
        : actorId;
      const wave = await tx.assemblyBatch.create({
        data: {
          batchNumber: `ASY-${plan.planNumber}-${waveIndex}`,
          productId: plan.productId, productionPlanId: plan.id, bomVersionId: plan.bomVersionId,
          productRouteId: plan.route.id, targetOutputQuantity: quantity, status: 'ALLOCATED',
          allocationIdempotencyKey: idempotencyKey, createdByActorId: effectiveActorId
        }
      });
      for (const intake of plan.assemblyIntakeRequirements) {
        const allocatedQuantity = Number(intake.requiredPerUnit) * quantity;
        const sourceBatch = intake.sourceStepId ? await tx.departmentExecutionBatch.findFirst({ where: { productionPlanId: plan.id, routeStepId: intake.sourceStepId } }) : null;
        await tx.assemblyWaveIntakeAllocation.create({ data: { assemblyBatchId: wave.id, intakeId: intake.id, quantity: allocatedQuantity } });
        await tx.assemblyIntakeRequirement.update({ where: { id: intake.id }, data: { allocatedQty: { increment: allocatedQuantity } } });
        await tx.assemblyBatchComponent.create({
          data: {
            assemblyBatchId: wave.id, bomLineId: intake.bomLineId,
            componentType: sourceBatch ? 'BATCH_SOURCED' : 'ISSUE_LINE_SOURCED',
            sourceBatchId: sourceBatch?.id, uomId: intake.uomId,
            unitRatio: intake.requiredPerUnit, requiredQuantity: allocatedQuantity
          }
        });
      }
      await markReleasedPlanInProgress(tx, plan.id, actorId);
      return wave;
    });
    return result;
  }

  async getSchedule(planId: string, actorId: string) {
    const scope = await productionActorScope(actorId);
    const plan = await prisma.productionPlan.findUnique({
      where: { id: planId }, include: {
        product: { select: { id: true, name: true } }, quantityUom: { select: { name: true, symbol: true } },
        route: { include: { steps: { include: { department: { select: { id: true, name: true } }, nextDepartment: { select: { id: true, name: true } } }, orderBy: [{ branchKey: 'asc' }, { stepOrder: 'asc' }] }, assemblyDepartment: { select: { id: true, name: true } } } },
        batches: {
          where: scope.global ? {} : { departmentId: scope.departmentId! }, include: {
            department: { select: { id: true, name: true } }, routeStep: true,
            materialAssignments: true, incomingHandovers: { include: { outgoingBatch: { select: { outputItemId: true, outputItemType: true, outputUomId: true } } } }, outgoingHandovers: true,
            progressEvents: { orderBy: { timestamp: 'desc' }, take: 5 },
            workerAssignments: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } }
          }
        },
        taskMaterialAssignments: { where: scope.global ? {} : { destinationDepartmentId: scope.departmentId! } },
        assemblyIntakeRequirements: {
          include: {
            sourceStep: { select: { stepName: true, departmentId: true, department: { select: { id: true, name: true, code: true } } } },
            handovers: {
              include: {
                outgoingDepartment: { select: { id: true, name: true, code: true } },
                outgoingBatch: { select: { id: true, batchNumber: true, status: true, completed_qty: true } }
              },
              orderBy: { proposedAt: 'desc' }
            }
          }
        },
        assemblyBatches: {
          where: scope.operator ? { workerAssignments: { some: { employeeId: scope.employeeId! } } } : {},
          include: {
            intakeAllocations: true,
            components: true,
            workerAssignments: {
              include: {
                employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } }
              }
            },
            fgReadyOutputs: {
              include: {
                packagingRecord: true,
                fgReceipt: {
                  include: {
                    location: { select: { id: true, name: true, code: true } }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!plan) throw new NotFoundError('Production schedule not found.');
    if (!scope.global && !plan.batches.length && !plan.taskMaterialAssignments.length && plan.route?.assemblyDepartmentId !== scope.departmentId) throw new ForbiddenError();
    const visibleBatches = scope.operator
      ? plan.batches.filter((batch) => batch.workerAssignments.some((row) => row.employeeId === scope.employeeId))
      : plan.batches;
    if (scope.operator && !visibleBatches.length && !plan.assemblyBatches.length) throw new ForbiddenError('This schedule has no assigned workstation tasks.');
    const allItems = [...plan.taskMaterialAssignments.map((row) => [row.itemType, row.itemId] as const), ...plan.batches.map((row) => [row.outputItemType || '', row.outputItemId || ''] as const), ...plan.batches.flatMap((row) => row.incomingHandovers.map((handover) => [handover.outgoingBatch.outputItemType || '', handover.outgoingBatch.outputItemId || ''] as const)), ...(scope.global || plan.route?.assemblyDepartmentId === scope.departmentId ? plan.assemblyIntakeRequirements.map((row) => [row.itemType, row.itemId] as const) : [])];
    const [materials, products, units, assignmentDepartments, lots] = await Promise.all([
      prisma.material.findMany({ where: { id: { in: allItems.filter((row) => row[0] === 'MATERIAL').map((row) => row[1]) } }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { id: { in: allItems.filter((row) => row[0] === 'PRODUCT').map((row) => row[1]) } }, select: { id: true, name: true } }),
      prisma.unitOfMeasure.findMany({ where: { id: { in: [...plan.taskMaterialAssignments.map((row) => row.uomId), ...plan.batches.map((row) => row.outputUomId || ''), ...plan.batches.flatMap((row) => row.incomingHandovers.map((handover) => handover.outgoingBatch.outputUomId || '')), ...plan.assemblyIntakeRequirements.map((row) => row.uomId)] } }, select: { id: true, name: true, symbol: true } }),
      prisma.department.findMany({ where: { id: { in: plan.taskMaterialAssignments.map((row) => row.destinationDepartmentId) } }, select: { id: true, name: true } }),
      prisma.inventoryLot.findMany({ where: { id: { in: plan.taskMaterialAssignments.map((row) => row.lotId).filter((id): id is string => Boolean(id)) } }, select: { id: true, lotNumber: true } })
    ]);
    const names = new Map([...materials, ...products].map((item) => [item.id, item.name]));
    const unitNames = new Map(units.map((unit) => [unit.id, unit.symbol || unit.name]));
    const departmentNames = new Map(assignmentDepartments.map((department) => [department.id, department.name]));
    const lotNames = new Map(lots.map((lot) => [lot.id, lot.lotNumber]));
    const canSeeAssembly = scope.global || plan.route?.assemblyDepartmentId === scope.departmentId;
    return {
      ...plan,
      assembledQuantity: plan.assemblyBatches.reduce((sum, wave) => sum + Number(wave.actualOutputQuantity), 0),
      buildableQuantity: canSeeAssembly ? buildableKits(plan.assemblyIntakeRequirements) : 0,
      route: plan.route ? { ...plan.route, steps: (scope.global ? plan.route.steps : plan.route.steps.filter((step) => scope.operator ? visibleBatches.some((batch) => batch.routeStepId === step.id) : step.departmentId === scope.departmentId)).map((step) => ({ ...step, nextStepId: plan.route!.steps.find((candidate) => candidate.parentStepId === step.id)?.id || null })) } : null,
      assemblyIntakeRequirements: canSeeAssembly ? plan.assemblyIntakeRequirements.map((row) => ({ ...row, itemName: names.get(row.itemId) || '', unitName: unitNames.get(row.uomId) || '' })) : [],
      assemblyBatches: canSeeAssembly ? plan.assemblyBatches : [],
      batches: visibleBatches.map((batch) => ({
        ...batch,
        outputItemName: names.get(batch.outputItemId || '') || '',
        outputUnitName: unitNames.get(batch.outputUomId || '') || '',
        destinationDepartmentId: batch.routeStep?.nextDepartmentId || plan.route?.steps.find((step) => step.parentStepId === batch.routeStepId)?.departmentId || plan.route?.assemblyDepartmentId || null,
        destinationDepartmentName: plan.route?.steps.find((step) => step.departmentId === batch.routeStep?.nextDepartmentId)?.department.name || plan.route?.steps.find((step) => step.parentStepId === batch.routeStepId)?.department.name || plan.route?.assemblyDepartment?.name || '',
        incomingHandovers: batch.incomingHandovers.map((row) => ({ ...row, itemName: names.get(row.outgoingBatch.outputItemId || '') || '', unitName: unitNames.get(row.outgoingBatch.outputUomId || '') || '' })),
        materialAssignments: batch.materialAssignments.map((row) => ({ ...row, itemName: names.get(row.itemId) || '', unitName: unitNames.get(row.uomId) || '', lotNumber: lotNames.get(row.lotId || '') || null })),
        availableToSend: availableGoodOutput(batch.completed_qty, batch.outgoingHandovers)
      })), taskMaterialAssignments: plan.taskMaterialAssignments.filter((row) => !scope.operator || visibleBatches.some((batch) => batch.id === row.batchId)).map((row) => ({ ...row, itemName: names.get(row.itemId) || '', unitName: unitNames.get(row.uomId) || '', destinationDepartmentName: departmentNames.get(row.destinationDepartmentId) || '', lotNumber: lotNames.get(row.lotId || '') || null }))
    };
  }

  async listSchedules(actorId: string, search?: string) {
    const scope = await productionActorScope(actorId);
    const plans = await prisma.productionPlan.findMany({
      where: {
        status: { in: ['RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED'] },
        ...(scope.global ? {} : scope.operator ? { OR: [{ batches: { some: { departmentId: scope.departmentId!, workerAssignments: { some: { employeeId: scope.employeeId! } } } } }, { route: { assemblyDepartmentId: scope.departmentId! }, assemblyBatches: { some: { workerAssignments: { some: { employeeId: scope.employeeId! } } } } }] } : { OR: [{ batches: { some: { departmentId: scope.departmentId! } } }, { taskMaterialAssignments: { some: { destinationDepartmentId: scope.departmentId! } } }, { route: { assemblyDepartmentId: scope.departmentId! } }] }),
        ...(search ? { product: { name: { contains: search, mode: 'insensitive' } } } : {})
      },
      include: { product: { select: { name: true } }, quantityUom: { select: { symbol: true, name: true } }, route: { select: { assemblyDepartmentId: true } }, batches: { where: scope.global ? {} : { departmentId: scope.departmentId!, ...(scope.operator ? { workerAssignments: { some: { employeeId: scope.employeeId! } } } : {}) }, select: { id: true, departmentId: true, department: { select: { name: true } }, status: true, completed_qty: true, expectedOutputQty: true, routeStep: { select: { branchKey: true, stepOrder: true, stepName: true } } } }, assemblyBatches: { where: scope.operator ? { workerAssignments: { some: { employeeId: scope.employeeId! } } } : {}, select: { status: true, actualOutputQuantity: true, targetOutputQuantity: true } }, assemblyIntakeRequirements: { include: { sourceStep: { select: { stepName: true, department: { select: { id: true, name: true } } } }, handovers: { select: { id: true, quantity: true, status: true } } } } },
      orderBy: { scheduleDate: 'desc' }, take: 100
    });
    if (plans.length === 0) {
      return [];
    }
    const intakeUomIds = plans.flatMap((plan) => plan.assemblyIntakeRequirements.map((row) => row.uomId));
    const [intakeMaterials, intakeProducts, intakeUnits] = await Promise.all([
      prisma.material ? prisma.material.findMany({ where: { id: { in: [...new Set(plans.flatMap((plan) => plan.assemblyIntakeRequirements.filter((row) => row.itemType === 'MATERIAL').map((row) => row.itemId)))] } }, select: { id: true, name: true } }) : Promise.resolve([]),
      prisma.product ? prisma.product.findMany({ where: { id: { in: [...new Set(plans.flatMap((plan) => plan.assemblyIntakeRequirements.filter((row) => row.itemType === 'PRODUCT').map((row) => row.itemId)))] } }, select: { id: true, name: true } }) : Promise.resolve([]),
      prisma.unitOfMeasure ? prisma.unitOfMeasure.findMany({ where: { id: { in: [...new Set(intakeUomIds)] } }, select: { id: true, name: true, symbol: true } }) : Promise.resolve([])
    ]);
    const intakeItemNames = new Map([...intakeMaterials, ...intakeProducts].map((item) => [item.id, item.name]));
    const intakeUnitNames = new Map(intakeUnits.map((unit) => [unit.id, unit.symbol || unit.name]));
    return plans.map((plan) => ({
      ...plan,
      assembledQuantity: plan.assemblyBatches.reduce((sum, wave) => sum + Number(wave.actualOutputQuantity), 0),
      buildableQuantity: scope.global || plan.route?.assemblyDepartmentId === scope.departmentId ? buildableKits(plan.assemblyIntakeRequirements) : 0,
      assemblyBatches: scope.global || plan.route?.assemblyDepartmentId === scope.departmentId ? plan.assemblyBatches : [],
      assemblyIntakeRequirements: scope.global || plan.route?.assemblyDepartmentId === scope.departmentId ? plan.assemblyIntakeRequirements.map((intake) => ({ ...intake, itemName: intakeItemNames.get(intake.itemId) || 'Unknown item', unitName: intakeUnitNames.get(intake.uomId) || 'units' })) : []
    }));
  }
}
