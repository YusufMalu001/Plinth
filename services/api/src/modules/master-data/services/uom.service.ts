import { UnitOfMeasure, UomConversion, PackSize, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { UomRepository } from '../repositories/uom.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ReferentialIntegrityError, CircularDependencyError, ValidationError } from '../../../common/errors/AppError';

export class UomService {
  constructor(
    private readonly repository: UomRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  // ============================================================================
  // UNIT OF MEASURE
  // ============================================================================

  async createUom(params: {
    code: string;
    name: string;
    symbol: string;
    dimension?: string | null;
    allowFractional?: boolean;
    isBaseUnit?: boolean;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<UnitOfMeasure> {
    const normalizedCode = UomService.normalizeCode(params.code);
    const existing = await this.repository.findUomByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`UnitOfMeasure with code [${normalizedCode}] already exists.`);
    }

    const created = await this.repository.createUom({
      code: normalizedCode,
      name: params.name.trim(),
      symbol: params.symbol.trim(),
      dimension: params.dimension ? params.dimension.trim().toUpperCase() : null,
      allowFractional: params.allowFractional ?? true,
      status: params.activateImmediately ? 'ACTIVE' : 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'uom.create',
      entityType: 'UnitOfMeasure',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listUoms(params?: {
    status?: LifecycleStatus;
    dimension?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: UnitOfMeasure[]; total: number }> {
    return this.repository.listUoms(params);
  }

  async getUomById(id: string): Promise<UnitOfMeasure> {
    const uom = await this.repository.findUomById(id);
    if (!uom) {
      throw new NotFoundError(`UnitOfMeasure [${id}] not found.`);
    }
    return uom;
  }

  async updateUom(id: string, params: {
    name?: string;
    symbol?: string;
    dimension?: string | null;
    allowFractional?: boolean;
    actorId: string;
    requestId?: string;
  }): Promise<UnitOfMeasure> {
    const uom = await this.getUomById(id);

    const updated = await this.repository.updateUom(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.symbol ? { symbol: params.symbol.trim() } : {}),
      ...(params.dimension !== undefined ? { dimension: params.dimension ? params.dimension.trim().toUpperCase() : null } : {}),
      ...(params.allowFractional !== undefined ? { allowFractional: params.allowFractional } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'uom.update',
      entityType: 'UnitOfMeasure',
      entityId: updated.id,
      before: uom,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionUomStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<UnitOfMeasure> {
    const uom = await this.getUomById(params.id);

    MasterDataLifecycleService.validateTransition(uom.status, params.targetStatus, 'UnitOfMeasure');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'UnitOfMeasure'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countUomActiveReferences(params.id);
      const totalRefs = refs.products + refs.materials + refs.conversions + refs.packSizes;
      if (totalRefs > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate UnitOfMeasure [${uom.code}]. It has active references (${refs.products} products, ${refs.materials} materials, ${refs.conversions} conversions, ${refs.packSizes} pack sizes).`,
          refs
        );
      }
    }

    const updated = await this.repository.updateUom(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'uom.status_change',
      entityType: 'UnitOfMeasure',
      entityId: updated.id,
      before: { status: uom.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // UOM CONVERSIONS & CYCLE DETECTION
  // ============================================================================

  public static detectCycle(
    fromId: string,
    toId: string,
    existingConversions: { fromUomId: string; toUomId: string }[]
  ): void {
    if (fromId === toId) {
      throw new CircularDependencyError(`Cannot convert a unit of measure to itself ([${fromId}] -> [${toId}]).`);
    }

    const adjList = new Map<string, string[]>();
    for (const conv of existingConversions) {
      if (!adjList.has(conv.fromUomId)) {
        adjList.set(conv.fromUomId, []);
      }
      adjList.get(conv.fromUomId)!.push(conv.toUomId);
    }

    const visited = new Set<string>();
    const queue: string[] = [toId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === fromId) {
        throw new CircularDependencyError(
          `Circular UOM conversion chain detected. A path already exists from [${toId}] back to [${fromId}]. Adding this conversion would create a cycle.`,
          { fromUomId: fromId, toUomId: toId }
        );
      }

      visited.add(current);
      const neighbors = adjList.get(current) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          queue.push(next);
        }
      }
    }
  }

  /**
   * Resolves the direct, approved conversion factor from one UOM to another as of a given date.
   * Direct-only, by design: composing two independently-approved factors across an intermediate
   * unit would itself be an "invented conversion" nobody has approved - a BOM line whose UOM
   * has no direct approved conversion to the requested unit must fail loudly so a human adds one,
   * rather than silently deriving a multi-hop value.
   */
  async resolveConversionFactor(fromUomId: string, toUomId: string, date: Date = new Date()): Promise<Prisma.Decimal> {
    if (fromUomId === toUomId) {
      return new Prisma.Decimal(1);
    }
    const conversion = await this.repository.findEffectiveConversion(fromUomId, toUomId, date);
    if (!conversion) {
      throw new ValidationError(
        `No approved UOM conversion from [${fromUomId}] to [${toUomId}] effective as of ${date.toISOString()}.`
      );
    }
    return conversion.factor;
  }

  async createConversion(params: {
    fromUomId: string;
    toUomId: string;
    factor?: number;
    conversionFactor?: number;
    effectiveDate?: Date;
    actorId: string;
    requestId?: string;
  }): Promise<UomConversion> {
    const factor = params.factor || params.conversionFactor;
    if (!factor || factor <= 0) {
      throw new ValidationError(`Conversion factor must be a strictly positive number.`);
    }

    const [fromUom, toUom] = await Promise.all([
      this.repository.findUomById(params.fromUomId),
      this.repository.findUomById(params.toUomId)
    ]);

    if (!fromUom) throw new NotFoundError(`From UnitOfMeasure [${params.fromUomId}] not found.`);
    if (!toUom) throw new NotFoundError(`To UnitOfMeasure [${params.toUomId}] not found.`);

    MasterDataLifecycleService.assertIsReferenceable('From UOM', fromUom.id, fromUom.status);
    MasterDataLifecycleService.assertIsReferenceable('To UOM', toUom.id, toUom.status);

    const activeConversions = await this.repository.findActiveConversions();
    UomService.detectCycle(params.fromUomId, params.toUomId, activeConversions);

    const created = await this.repository.createConversion({
      fromUom: { connect: { id: params.fromUomId } },
      toUom: { connect: { id: params.toUomId } },
      factor,
      effectiveDate: params.effectiveDate || new Date(),
      version: 1,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'uom_conversion.create',
      entityType: 'UomConversion',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listConversions(params?: {
    fromUomId?: string;
    toUomId?: string;
    status?: LifecycleStatus;
    skip?: number;
    take?: number;
  }): Promise<{ items: UomConversion[]; total: number }> {
    return this.repository.listConversions(params);
  }

  async getConversionById(id: string): Promise<UomConversion> {
    const conv = await this.repository.findConversionById(id);
    if (!conv) {
      throw new NotFoundError(`UomConversion [${id}] not found.`);
    }
    return conv;
  }

  async transitionConversionStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<UomConversion> {
    const conv = await this.getConversionById(params.id);

    MasterDataLifecycleService.validateTransition(conv.status, params.targetStatus, 'UomConversion');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'UomConversion'
      });
    }

    const updated = await this.repository.updateConversion(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'uom_conversion.status_change',
      entityType: 'UomConversion',
      entityId: updated.id,
      before: { status: conv.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // PACK SIZES
  // ============================================================================

  async createPackSize(params: {
    materialId: string;
    packQty?: number;
    quantity?: number;
    uomId: string;
    effectiveDate?: Date;
    actorId: string;
    requestId?: string;
  }): Promise<PackSize> {
    const qty = params.packQty || params.quantity;
    if (!qty || qty <= 0) {
      throw new ValidationError(`Pack quantity must be a strictly positive number.`);
    }

    const uom = await this.repository.findUomById(params.uomId);
    if (!uom) throw new NotFoundError(`UnitOfMeasure [${params.uomId}] not found.`);
    MasterDataLifecycleService.assertIsReferenceable('UnitOfMeasure', uom.id, uom.status);

    const created = await this.repository.createPackSize({
      material: { connect: { id: params.materialId } },
      packQty: qty,
      uom: { connect: { id: params.uomId } },
      effectiveDate: params.effectiveDate || new Date(),
      version: 1,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'pack_size.create',
      entityType: 'PackSize',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listPackSizes(params?: {
    materialId?: string;
    uomId?: string;
    status?: LifecycleStatus;
    skip?: number;
    take?: number;
  }): Promise<{ items: PackSize[]; total: number }> {
    return this.repository.listPackSizes(params);
  }

  async getPackSizeById(id: string): Promise<PackSize> {
    const packSize = await this.repository.findPackSizeById(id);
    if (!packSize) {
      throw new NotFoundError(`PackSize [${id}] not found.`);
    }
    return packSize;
  }

  async transitionPackSizeStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<PackSize> {
    const packSize = await this.getPackSizeById(params.id);

    MasterDataLifecycleService.validateTransition(packSize.status, params.targetStatus, 'PackSize');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'PackSize'
      });
    }

    const updated = await this.repository.updatePackSize(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'pack_size.status_change',
      entityType: 'PackSize',
      entityId: updated.id,
      before: { status: packSize.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
