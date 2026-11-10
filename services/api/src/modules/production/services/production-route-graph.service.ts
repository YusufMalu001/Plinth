import { randomUUID } from 'crypto';
import { prisma } from '../../../database';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors/AppError';
import type { SaveProductionRouteGraphInput } from '@synergy/validation';

const ASSEMBLY_DEPARTMENT_CODE = 'DEPT-ASSEMBLY-DEPART-W225';

export class ProductionRouteGraphService {
  async save(input: SaveProductionRouteGraphInput, existingId?: string) {
    const keys = new Set(input.steps.map((step) => step.key));
    if (keys.size !== input.steps.length) throw new ValidationError('Route step keys must be unique.');
    const branches = new Map<string, typeof input.steps>();
    for (const step of input.steps) branches.set(step.branchKey, [...(branches.get(step.branchKey) || []), step]);
    for (const [branchKey, steps] of branches) {
      const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
      if (ordered.some((step, index) => step.stepOrder !== index + 1 || step.parentKey !== (index ? ordered[index - 1].key : null))) {
        throw new ValidationError(`Branch ${branchKey} must be a continuous chain starting at step 1.`);
      }
    }
    const allocationDestinations = new Set(
      input.allocations.map((row) => `${row.bomLineId}:${row.stepKey ?? 'ASSEMBLY'}`)
    );
    if (allocationDestinations.size !== input.allocations.length || input.allocations.some((row) => row.stepKey !== null && !keys.has(row.stepKey))) {
      throw new ValidationError('Each BOM line can have only one allocation per destination, and every destination must be a valid route step.');
    }
    const routeStepDepartmentIds = [...new Set(input.steps.map((step) => step.departmentId))];
    const nextDepartmentIds = [...new Set(input.steps.map((step) => step.nextDepartmentId).filter((id): id is string => Boolean(id)))];
    if (routeStepDepartmentIds.length !== input.steps.length) {
      throw new ValidationError('A department can appear only once in a production route.');
    }
    const [bom, assemblyDepartments, departments, nextDepartments, items, uoms] = await Promise.all([
      prisma.bomVersion.findUnique({ where: { id: input.bomVersionId }, include: { lines: true } }),
      prisma.department.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { isAssembly: true },
            { code: ASSEMBLY_DEPARTMENT_CODE },
            { code: { contains: 'ASSEMBLY', mode: 'insensitive' } },
            { name: { contains: 'ASSEMBLY', mode: 'insensitive' } },
          ],
        },
        select: { id: true, code: true, name: true, isAssembly: true },
      }),
      prisma.department.findMany({ where: { id: { in: routeStepDepartmentIds }, status: 'ACTIVE' }, select: { id: true } }),
      prisma.department.findMany({ where: { id: { in: nextDepartmentIds }, status: 'ACTIVE' }, select: { id: true } }),
      Promise.all(input.steps.map((step) => step.outputItemType === 'MATERIAL'
        ? prisma.material.findUnique({ where: { id: step.outputItemId }, select: { id: true } })
        : prisma.product.findUnique({ where: { id: step.outputItemId }, select: { id: true } }))),
      prisma.unitOfMeasure.findMany({ where: { id: { in: input.steps.map((step) => step.outputUomId) } }, select: { id: true } })
    ]);
    const stepAssemblyId = input.steps.map((s) => s.nextDepartmentId).find((id) => id && assemblyDepartments.some((ad) => ad.id === id));
    const resolvedAssemblyId = input.assemblyDepartmentId || stepAssemblyId;
    const assemblyDepartment = (resolvedAssemblyId
      ? assemblyDepartments.find((department) => department.id === resolvedAssemblyId)
      : undefined)
      || assemblyDepartments.find((department) => Boolean((department as any).isAssembly))
      || assemblyDepartments.find((department) => department.code?.trim().toUpperCase() === ASSEMBLY_DEPARTMENT_CODE)
      || assemblyDepartments.find((department) => /^(assembly|assembly department)$/i.test(department.name.trim()))
      || assemblyDepartments.find((department) => /^assembly\b/i.test(department.name.trim()))
      || assemblyDepartments.find((department) => /assembly/i.test(department.code));
    if (!assemblyDepartment) {
      throw new ValidationError('An active Assembly Department must be configured before saving a production route.');
    }
    const allowedNextDepartmentIds = new Set([
      ...routeStepDepartmentIds,
      assemblyDepartment.id,
      ...assemblyDepartments.map((dept) => dept.id)
    ]);
    if (input.steps.some((step) => step.nextDepartmentId && (
      step.nextDepartmentId === step.departmentId || !allowedNextDepartmentIds.has(step.nextDepartmentId)
    ))) {
      throw new ValidationError('A route step must hand off to another department in this route or to Assembly.');
    }
    if (assemblyDepartment && input.steps.some((step) => step.departmentId === assemblyDepartment.id)) {
      throw new ValidationError('Assembly is the final destination and cannot be added as a route operation.');
    }
    if (!bom || bom.status !== 'APPROVED' || bom.productId !== input.productId) throw new ValidationError('An approved BOM for this product is required.');
    const allocationQuantityByLine = new Map<string, number>();
    input.allocations.forEach((allocation) => {
      allocationQuantityByLine.set(
        allocation.bomLineId,
        (allocationQuantityByLine.get(allocation.bomLineId) || 0) + allocation.quantity
      );
    });
    if (
      bom.lines.length !== allocationQuantityByLine.size ||
      bom.lines.some((line) => {
        const allocated = allocationQuantityByLine.get(line.id);
        return allocated === undefined || Math.abs(allocated - Number(line.quantity)) > 0.000001;
      })
    ) {
      throw new ValidationError('The allocations for each approved BOM line must add up to its required quantity.');
    }
    if (input.steps.some((step) => !step.parentKey && !input.allocations.some((allocation) => allocation.stepKey === step.key && allocation.quantity > 0))) {
      throw new ValidationError('Each starting branch step needs at least one assigned BOM input.');
    }
    if (departments.length !== routeStepDepartmentIds.length) throw new ValidationError('All route departments must be active.');
    if (nextDepartments.length !== nextDepartmentIds.length) throw new ValidationError('Every next department must be an active department.');
    if (items.some((item) => !item) || uoms.length !== new Set(input.steps.map((step) => step.outputUomId)).size) throw new ValidationError('Each step needs a valid catalog output item and unit.');

    const saved = await prisma.$transaction(async (tx) => {
      const current = existingId ? await tx.productRoute.findUnique({ where: { id: existingId } }) : null;
      if (existingId && !current) throw new NotFoundError('Production route not found.');
      if (current && current.productId !== input.productId) throw new ValidationError('The product of an existing route cannot change.');
      const nextVersion = current ? current.version + 1 : 1;
      const code = current ? `${current.code.replace(/-V\d+$/, '')}-V${nextVersion}` : input.code.trim().toUpperCase();
      if (await tx.productRoute.findUnique({ where: { code } })) throw new ConflictError('Route code already exists.');
      if (current) await tx.productRoute.update({ where: { id: current.id }, data: { status: 'SUPERSEDED' } });
      const route = await tx.productRoute.create({
        data: {
          code, name: input.name.trim(), productId: input.productId, bomVersionId: input.bomVersionId,
          assemblyDepartmentId: assemblyDepartment.id, effectiveFrom: input.effectiveFrom,
          version: nextVersion, status: 'APPROVED', graphReviewedAt: new Date(),
          ...(current ? { supersedes: { connect: { id: current.id } } } : {})
        }
      });
      const stepIds = new Map(input.steps.map((step) => [step.key, randomUUID()]));
      let sequence = 0;
      for (const [, branchSteps] of branches) {
        for (const step of [...branchSteps].sort((a, b) => a.stepOrder - b.stepOrder)) {
          await tx.routeStep.create({
            data: {
              id: stepIds.get(step.key), routeId: route.id, sequenceNumber: ++sequence,
              branchKey: step.branchKey, stepOrder: step.stepOrder,
              parentStepId: step.parentKey ? stepIds.get(step.parentKey) : null,
              stepName: step.stepName.trim(), departmentId: step.departmentId,
              nextDepartmentId: step.nextDepartmentId
                || input.steps.find((candidate) => candidate.branchKey === step.branchKey && candidate.stepOrder === step.stepOrder + 1)?.departmentId
                || assemblyDepartment.id,
              workCenterId: step.workCenterId || null, standardDurationMinutes: step.standardDurationMinutes ?? null,
              isQcRequired: step.isQcRequired, status: 'APPROVED',
              outputItemType: step.outputItemType, outputItemId: step.outputItemId,
              outputUomId: step.outputUomId, outputQuantityPerUnit: step.outputQuantityPerUnit
            }
          });
        }
      }
      await tx.routeMaterialAllocation.createMany({ data: input.allocations.map((row) => ({
        routeId: route.id, bomLineId: row.bomLineId,
        routeStepId: row.stepKey ? stepIds.get(row.stepKey)! : null,
        quantity: row.quantity
      })) });
      return tx.productRoute.findUniqueOrThrow({
        where: { id: route.id },
        include: { steps: { include: { department: true, nextDepartment: true }, orderBy: [{ branchKey: 'asc' }, { stepOrder: 'asc' }] }, materialAllocations: true, assemblyDepartment: true }
      });
    });
    return { ...saved, steps: saved.steps.map((step) => ({ ...step, nextStepId: saved.steps.find((candidate) => candidate.parentStepId === step.id)?.id || null })) };
  }
}
