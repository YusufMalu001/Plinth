import { ProductRoute, RouteStep, LifecycleStatus } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { RoutingRepository } from '../repositories/routing.repository';
import { OrgStructureRepository } from '../repositories/org-structure.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

export class RoutingService {
  constructor(
    private readonly repository: RoutingRepository,
    private readonly orgRepository: OrgStructureRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async assertNameAvailable(name: string, excludeId?: string): Promise<string> {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const existing = await this.repository.findCurrentRouteByName(normalizedName, excludeId);
    if (existing) throw new ConflictError(`A production route named "${normalizedName}" already exists. Choose a different name.`);
    return normalizedName;
  }

  async createRoute(params: {
    code: string;
    name: string;
    productId?: string | null;
    materialId?: string | null;
    productVariantId?: string | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<ProductRoute> {
    if (params.productId && params.materialId) {
      throw new ValidationError('A production route can belong to a product or a material, not both.');
    }
    if (params.materialId && params.productVariantId) {
      throw new ValidationError('Material production routes cannot be scoped to a product variant.');
    }
    const normalizedCode = RoutingService.normalizeCode(params.code);
    const existing = await this.repository.findRouteByCode(normalizedCode);
    if (existing) throw new ConflictError(`ProductRoute with code [${normalizedCode}] already exists.`);

    const name = await this.assertNameAvailable(params.name);

    const created = await this.repository.createRoute({
      code: normalizedCode,
      name,
      ...(params.productId ? { product: { connect: { id: params.productId } } } : {}),
      ...(params.materialId ? { material: { connect: { id: params.materialId } } } : {}),
      ...(params.productVariantId ? { productVariant: { connect: { id: params.productVariantId } } } : {}),
      effectiveFrom: params.effectiveFrom || new Date(),
      effectiveTo: params.effectiveTo,
      version: 1,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_route.create',
      entityType: 'ProductRoute',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listRoutes(params?: {
    productId?: string;
    materialId?: string;
    productVariantId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductRoute[]; total: number }> {
    const result = await this.repository.listRoutes(params);
    return { ...result, items: result.items.map((route: any) => ({ ...route, steps: route.steps?.map((step: any) => ({ ...step, nextStepId: route.steps.find((candidate: any) => candidate.parentStepId === step.id)?.id || null })) })) };
  }

  async getRouteById(id: string): Promise<ProductRoute> {
    let route = await this.repository.findRouteById(id);
    if (!route) throw new NotFoundError(`ProductRoute [${id}] not found.`);
    // Historical route URLs can remain bookmarked after an edit creates a new
    // version. Resolve the chain so those URLs open the current editable version.
    const visited = new Set<string>([route.id]);
    while (route.status === 'SUPERSEDED' && route.supersededById) {
      if (visited.has(route.supersededById)) {
        throw new ConflictError(`ProductRoute version chain contains a cycle for [${id}].`);
      }
      visited.add(route.supersededById);
      const successor = await this.repository.findRouteById(route.supersededById);
      if (!successor) break;
      route = successor;
    }
    const detailed: any = route;
    return { ...detailed, steps: detailed.steps?.map((step: any) => ({ ...step, nextStepId: detailed.steps.find((candidate: any) => candidate.parentStepId === step.id)?.id || null })) };
  }

  async updateRoute(id: string, params: {
    name?: string;
    productId?: string | null;
    materialId?: string | null;
    productVariantId?: string | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<ProductRoute> {
    const route = await this.getRouteById(id);
    const nextProductId = params.productId !== undefined ? params.productId : route.productId;
    const nextMaterialId = params.materialId !== undefined ? params.materialId : route.materialId;
    const nextVariantId = params.productVariantId !== undefined ? params.productVariantId : route.productVariantId;
    if (nextProductId && nextMaterialId) {
      throw new ValidationError('A production route can belong to a product or a material, not both.');
    }
    if (nextMaterialId && nextVariantId) {
      throw new ValidationError('Material production routes cannot be scoped to a product variant.');
    }

    const requestedName = params.name?.trim().replace(/\s+/g, ' ');
    const currentName = route.name.trim().replace(/\s+/g, ' ');
    const nameUnchanged = requestedName === undefined || requestedName.toLocaleLowerCase() === currentName.toLocaleLowerCase();
    const name = nameUnchanged ? route.name : await this.assertNameAvailable(requestedName!, route.id);

    if (route.status === 'DRAFT' || route.status === 'PENDING_VALIDATION') {
      const updated = await this.repository.updateRoute(route.id, {
        ...(!nameUnchanged ? { name } : {}),
        ...(params.productId !== undefined
          ? params.productId
            ? { product: { connect: { id: params.productId } } }
            : { product: { disconnect: true } }
          : {}),
        ...(params.materialId !== undefined
          ? params.materialId
            ? { material: { connect: { id: params.materialId } } }
            : { material: { disconnect: true } }
          : {}),
        ...(params.productVariantId !== undefined
          ? params.productVariantId
            ? { productVariant: { connect: { id: params.productVariantId } } }
            : { productVariant: { disconnect: true } }
          : {}),
        ...(params.effectiveFrom ? { effectiveFrom: params.effectiveFrom } : {}),
        ...(params.effectiveTo !== undefined ? { effectiveTo: params.effectiveTo } : {})
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product_route.update_draft',
        entityType: 'ProductRoute',
        entityId: updated.id,
        before: route,
        after: updated,
        requestId: params.requestId
      });

      return updated;
    }

    if (route.status === 'APPROVED' || route.status === 'ACTIVE') {
      const nextVersion = route.version + 1;
      const versionSuffix = `-V${nextVersion}`;
      const versionCodeBase = route.code.slice(0, 50 - versionSuffix.length);
      let nextCode = `${versionCodeBase}${versionSuffix}`;
      let collision = 1;
      while (await this.repository.findRouteByCode(nextCode)) {
        const collisionSuffix = `-${collision++}`;
        const suffix = `${versionSuffix}${collisionSuffix}`;
        nextCode = `${route.code.slice(0, 50 - suffix.length)}${suffix}`;
      }
      const { oldRoute, newRoute } = await this.repository.supersedeRoute(route.id, {
        code: nextCode,
        name,
        ...(params.productId !== undefined
          ? params.productId
            ? { product: { connect: { id: params.productId } } }
            : {}
          : route.productId
          ? { product: { connect: { id: route.productId } } }
          : {}),
        ...(params.materialId !== undefined
          ? params.materialId
            ? { material: { connect: { id: params.materialId } } }
            : {}
          : route.materialId
          ? { material: { connect: { id: route.materialId } } }
          : {}),
        ...(params.productVariantId !== undefined
          ? params.productVariantId
            ? { productVariant: { connect: { id: params.productVariantId } } }
            : {}
          : route.productVariantId
          ? { productVariant: { connect: { id: route.productVariantId } } }
          : {}),
        effectiveFrom: params.effectiveFrom || new Date(),
        effectiveTo: params.effectiveTo !== undefined ? params.effectiveTo : route.effectiveTo,
        status: 'DRAFT',
        version: nextVersion
      }, { skipNameUniqueness: nameUnchanged });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product_route.supersede_version',
        entityType: 'ProductRoute',
        entityId: newRoute.id,
        before: oldRoute,
        after: newRoute,
        metadata: { supersededId: oldRoute.id, newVersion: nextVersion },
        requestId: params.requestId
      });

      return newRoute;
    }

    throw new ConflictError(`Cannot edit ProductRoute [${route.code}] with terminal status [${route.status}].`);
  }

  async resolveEffectiveRoute(productId: string, date: Date = new Date(), variantId?: string): Promise<ProductRoute | null> {
    return this.repository.findEffectiveRoute(productId, date, variantId);
  }

  async addRouteStep(params: {
    routeId: string;
    sequenceNumber: number;
    stepName: string;
    workCenterId?: string | null;
    departmentId: string;
    standardDurationMinutes?: number | null;
    isQcRequired?: boolean;
    qcRuleId?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<RouteStep> {
    if (params.sequenceNumber <= 0) {
      throw new ValidationError(`Route step sequence number must be a positive integer.`);
    }

    const route = await this.getRouteById(params.routeId);

    if (route.status !== 'DRAFT' && route.status !== 'PENDING_VALIDATION') {
      throw new ConflictError(`Cannot add step to route [${route.code}] with status [${route.status}]. Edit requires a new route version.`);
    }

    const department = await this.orgRepository.findDepartmentById(params.departmentId);
    if (!department) throw new NotFoundError(`Department [${params.departmentId}] not found.`);

    MasterDataLifecycleService.assertIsReferenceable('Department', department.id, department.status);
    const duplicateDepartmentStep = await prisma.routeStep.findFirst({
      where: { routeId: params.routeId, departmentId: params.departmentId },
      select: { id: true },
    });
    if (duplicateDepartmentStep) {
      throw new ConflictError('A department can appear only once in a production route.');
    }

    const step = await this.repository.addRouteStep({
      route: { connect: { id: params.routeId } },
      sequenceNumber: params.sequenceNumber,
      stepName: params.stepName.trim(),
      ...(params.workCenterId ? { workCenter: { connect: { id: params.workCenterId } } } : {}),
      department: { connect: { id: params.departmentId } },
      standardDurationMinutes: params.standardDurationMinutes,
      isQcRequired: params.isQcRequired || false,
      ...(params.qcRuleId ? { qcRule: { connect: { id: params.qcRuleId } } } : {}),
      status: 'DRAFT'
    } as any);

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'route_step.add',
      entityType: 'RouteStep',
      entityId: step.id,
      after: step,
      requestId: params.requestId
    });

    return step;
  }

  async updateRouteStep(id: string, params: {
    sequenceNumber?: number;
    stepName?: string;
    workCenterId?: string;
    departmentId?: string;
    standardDurationMinutes?: number | null;
    isQcRequired?: boolean;
    qcRuleId?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<RouteStep> {
    const step = await prisma.routeStep.findUnique({ where: { id }, include: { route: true } });
    if (!step) throw new NotFoundError('Route step not found.');
    if (step.route.graphReviewedAt || !['DRAFT', 'PENDING_VALIDATION'].includes(step.route.status)) throw new ConflictError('Review changes in a new route version through the branch editor.');
    if (params.departmentId && params.departmentId !== step.departmentId) {
      const duplicateDepartmentStep = await prisma.routeStep.findFirst({
        where: { routeId: step.routeId, departmentId: params.departmentId, id: { not: step.id } },
        select: { id: true },
      });
      if (duplicateDepartmentStep) {
        throw new ConflictError('A department can appear only once in a production route.');
      }
    }
    const updated = await this.repository.updateRouteStep(id, {
      ...(params.sequenceNumber ? { sequenceNumber: params.sequenceNumber } : {}),
      ...(params.stepName ? { stepName: params.stepName.trim() } : {}),
      ...(params.workCenterId ? { workCenter: { connect: { id: params.workCenterId } } } : {}),
      ...(params.departmentId ? { department: { connect: { id: params.departmentId } } } : {}),
      ...(params.standardDurationMinutes !== undefined ? { standardDurationMinutes: params.standardDurationMinutes } : {}),
      ...(params.isQcRequired !== undefined ? { isQcRequired: params.isQcRequired } : {}),
      ...(params.qcRuleId !== undefined
        ? params.qcRuleId
          ? { qcRule: { connect: { id: params.qcRuleId } } }
          : { qcRule: { disconnect: true } }
        : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'route_step.update',
      entityType: 'RouteStep',
      entityId: updated.id,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async deleteRouteStep(id: string, params: { actorId: string; requestId?: string }): Promise<RouteStep> {
    const step = await prisma.routeStep.findUnique({ where: { id }, include: { route: true } });
    if (!step) throw new NotFoundError('Route step not found.');
    if (step.route.graphReviewedAt || !['DRAFT', 'PENDING_VALIDATION'].includes(step.route.status)) throw new ConflictError('Review changes in a new route version through the branch editor.');
    const deleted = await this.repository.deleteRouteStep(id);

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'route_step.delete',
      entityType: 'RouteStep',
      entityId: deleted.id,
      before: deleted,
      requestId: params.requestId
    });

    return deleted;
  }

  async transitionRouteStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<ProductRoute> {
    const route = await this.repository.findRouteById(params.id);
    if (!route) throw new NotFoundError(`ProductRoute [${params.id}] not found.`);

    // Product routes are maintained operationally by the plant team. Once the
    // route has at least one step, saving it from the route workspace completes
    // its setup; there is no separate validation/approval queue for routes.
    const directRouteApproval = route.status === 'DRAFT' && params.targetStatus === 'APPROVED';
    if (!directRouteApproval) {
      MasterDataLifecycleService.validateTransition(route.status, params.targetStatus, 'ProductRoute');
    }

    if (params.targetStatus === 'APPROVED') {
      if (route.steps.length === 0) {
        throw new ValidationError(`Cannot approve ProductRoute [${route.code}] without any route steps.`);
      }
      if (!directRouteApproval) {
        await MasterDataLifecycleService.assertCanApprove({
          actorId: params.actorId,
          permissionChecker: this.permissionChecker,
          resource: 'ProductRoute'
        });
      }
    }

    const updated = await this.repository.updateRoute(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_route.status_change',
      entityType: 'ProductRoute',
      entityId: updated.id,
      before: { status: route.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
