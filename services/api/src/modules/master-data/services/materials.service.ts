import { Material, MaterialType, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { MaterialsRepository } from '../repositories/materials.repository';
import { UomRepository } from '../repositories/uom.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ReferentialIntegrityError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
import { assertInventoryNameAvailable } from './inventory-name-uniqueness';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { reorderEvaluatorService } from '../../inventory/services/reorder-evaluator.service';
import { assertUomQuantities } from './uom-quantity.validation';

export class MaterialsService {
  constructor(
    private readonly repository: MaterialsRepository,
    private readonly uomRepository: UomRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async createMaterial(params: {
    code?: string;
    name: string;
    description?: string;
    materialType: MaterialType;
    categoryId?: string;
    uomId: string;
    specs?: Record<string, unknown>;
    initialQuantity?: number;
    minStockLevel?: number;
    reorderPoint?: number;
    leadTimeDays?: number;
    standardCost?: number;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<Material> {
    const userCode = params.code?.trim();
    const rawCode = userCode || `MAT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const normalizedCode = MaterialsService.normalizeCode(rawCode);
    const existing = await this.repository.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Material with code [${normalizedCode}] already exists.`);
    }
    // Variant labels (for example "20 Feet") are scoped to their parent material.
    // They are not standalone catalog names and may legitimately repeat across parents.
    if (params.specs?.isVariant !== true) {
      await assertInventoryNameAvailable(params.name, (name, current) => this.repository.findInventoryNameConflict(name, current));
    }

    const uom = await this.uomRepository.findUomById(params.uomId);
    if (!uom) {
      throw new NotFoundError(`UnitOfMeasure [${params.uomId}] not found.`);
    }
    MasterDataLifecycleService.assertIsReferenceable('UnitOfMeasure', uom.id, uom.status);

    const initialQuantity = params.initialQuantity !== undefined
      ? Number(params.initialQuantity)
      : Number(params.specs?.initialQuantity ?? 0);

    const mergedSpecs = {
      ...(params.specs || {}),
      userCode: userCode || '',
      hasCustomCode: Boolean(userCode),
      initialQuantity,
      ...(params.minStockLevel !== undefined ? { minStockLevel: params.minStockLevel } : {}),
      ...(params.reorderPoint !== undefined ? { reorderPoint: params.reorderPoint } : {}),
      ...(params.leadTimeDays !== undefined ? { leadTimeDays: params.leadTimeDays } : {}),
      ...(params.standardCost !== undefined ? { standardCost: params.standardCost } : {})
    };
    assertUomQuantities(uom, mergedSpecs);

    const created = await this.repository.create({
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description,
      materialType: params.materialType,
      ...(params.categoryId ? { category: { connect: { id: params.categoryId } } } : {}),
      uom: { connect: { id: params.uomId } },
      specs: mergedSpecs as Prisma.InputJsonValue,
      status: params.activateImmediately ? 'ACTIVE' : 'DRAFT',
      version: 1
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'material.create',
      entityType: 'Material',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    const hasSafetyBuffer = Number(params.minStockLevel ?? mergedSpecs.minStockLevel ?? (mergedSpecs as Record<string, unknown>).safetyStock ?? 0) > 0;
    if (Number.isFinite(initialQuantity) && (initialQuantity > 0 || hasSafetyBuffer)) {
      try {
        let locationId = (params.specs?.warehouseLocationId as string) || (params.specs?.locationId as string);
        if (!locationId) {
          const defaultLocation = await prisma.warehouseLocation.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
          });
          if (defaultLocation) locationId = defaultLocation.id;
          else {
            const canonicalLocation = await prisma.warehouseLocation.findFirst({ where: { code: 'MAIN-STORE' } });
            if (canonicalLocation) locationId = canonicalLocation.id;
            else {
              const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' } });
              const provisionedLocation = await prisma.warehouseLocation.create({
                data: {
                  code: 'MAIN-STORE',
                  name: 'Main Store',
                  type: 'STORE',
                  status: 'ACTIVE',
                  factoryId: factory?.id ?? null,
                },
              });
              locationId = provisionedLocation.id;
            }
          }
        }

        if (locationId) {
          if (initialQuantity > 0) {
            try {
              await inventoryPostingService.post(prisma, {
                itemType: 'MATERIAL',
                itemId: created.id,
                uomId: created.uomId,
                locationId,
                movementType: 'RECEIPT',
                quantity: initialQuantity,
                condition: 'AVAILABLE',
                ownership: 'COMPANY',
                unitCost: params.standardCost || 0,
                sourceType: 'MATERIAL_OPENING_BALANCE',
                sourceId: created.id,
                idempotencyKey: `MATERIAL_OPENING_BALANCE:${created.id}`,
                actorId: params.actorId,
                correlationId: params.requestId,
              });
            } catch (postError) {
              console.warn('[MaterialsService.createMaterial] Modern inventory posting note:', postError);
            }
          }

          const stockBalance = await prisma.stockBalance.upsert({
            where: {
              itemKey_uomId_locationId_ownership: {
                itemKey: `MATERIAL:${created.id}`,
                uomId: created.uomId,
                locationId,
                ownership: 'OWNED',
              },
            },
            update: { onHandQuantity: { increment: initialQuantity } },
            create: {
              itemKey: `MATERIAL:${created.id}`,
              materialId: created.id,
              uomId: created.uomId,
              locationId,
              ownership: 'OWNED',
              onHandQuantity: initialQuantity,
              reservedQuantity: 0,
            },
          });
          if (initialQuantity > 0) {
            await prisma.stockLedgerEntry.create({
              data: {
                materialId: created.id,
                uomId: created.uomId,
                locationId,
                quantity: initialQuantity,
                direction: 'IN',
                entryType: 'ADJUSTMENT_INCREASE',
                postedByActorId: params.actorId,
                note: `Opening stock entered during material creation for code [${created.code}]`,
              },
            });
          }
          await reorderEvaluatorService.evaluateAndTrigger(stockBalance.id);
        }
      } catch (stockError) {
        console.warn('[MaterialsService.createMaterial] Opening stock processing note:', stockError);
      }
    }

    return created;
  }

  async listMaterials(params?: {
    materialType?: MaterialType;
    categoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Material[]; total: number }> {
    return this.repository.list(params);
  }

  async getMaterialById(id: string): Promise<Material> {
    const material = await this.repository.findById(id);
    if (!material) {
      throw new NotFoundError(`Material [${id}] not found.`);
    }
    return material;
  }

  async getMaterialVersionHistory(id: string): Promise<Array<{
    entityId: string | null;
    actor: string;
    timestamp: Date;
    action: string;
    summary: string;
    before: Prisma.JsonValue;
    after: Prisma.JsonValue;
  }>> {
    const material = await this.getMaterialById(id);
    const baseCode = material.code.split('__MERGE__')[0];
    const related = await this.repository.list({ search: baseCode, take: 100 });
    const matIds = related.items.filter(m => m.code.startsWith(baseCode)).map(m => m.id);
    if (!matIds.includes(material.id)) matIds.push(material.id);

    const auditLogs = await prisma.auditLog.findMany({
       where: { resource: 'Material', resourceId: { in: matIds } },
       orderBy: { createdAt: 'asc' }
    });

    return auditLogs.map(log => ({
       entityId: log.resourceId,
       actor: log.userId || 'system',
       timestamp: log.createdAt,
       action: log.action,
       summary: `Action: ${log.action}`,
       before: log.before,
       after: log.after
    }));
  }

  async updateMaterial(id: string, params: {
    code?: string;
    name?: string;
    description?: string;
    materialType?: MaterialType;
    categoryId?: string | null;
    uomId?: string;
    specs?: Record<string, unknown>;
    actorId: string;
    requestId?: string;
  }): Promise<Material> {
    const material = await this.getMaterialById(id);
    const existingSpecs = (material.specs || {}) as Record<string, unknown>;
    const isVariantMaterial = params.specs?.isVariant === true
      || existingSpecs.isVariant === true
      || typeof existingSpecs.parentMaterialId === 'string';
    if (!isVariantMaterial && params.name !== undefined && params.name.trim().toLocaleLowerCase() !== material.name.trim().toLocaleLowerCase()) {
      await assertInventoryNameAvailable(
        params.name,
        (name, current) => this.repository.findInventoryNameConflict(name, current),
        { entity: 'MATERIAL', id },
      );
    }

    let normalizedCode: string | undefined;
    const userCode = params.code !== undefined ? params.code.trim() : undefined;
    if (userCode) {
      normalizedCode = MaterialsService.normalizeCode(userCode);
      if (normalizedCode !== material.code) {
        const existing = await this.repository.findByCode(normalizedCode);
        if (existing && existing.id !== material.id) {
          throw new ConflictError(`Material with code [${normalizedCode}] already exists.`);
        }
      }
    }

    const mergedSpecs = {
      ...((material.specs as Record<string, unknown>) || {}),
      ...(params.specs || {}),
      ...(userCode !== undefined
        ? { userCode, hasCustomCode: Boolean(userCode), ...(normalizedCode ? { code: normalizedCode } : {}) }
        : {})
    };

    if (params.categoryId !== undefined || params.specs?.productFamilyId !== undefined) {
      const familyId = typeof (mergedSpecs as any).productFamilyId === 'string' ? (mergedSpecs as any).productFamilyId : null;
      const categoryId = params.categoryId !== undefined ? params.categoryId : material.categoryId;
      if (categoryId) {
        const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, status: true } });
        if (!category) throw new NotFoundError(`Category [${categoryId}] not found.`);
        MasterDataLifecycleService.assertIsReferenceable('Category', category.id, category.status);
      }
      if (familyId) {
        const family = await prisma.productFamily.findUnique({ where: { id: familyId }, select: { id: true, categoryId: true, status: true } });
        if (!family || family.categoryId !== categoryId) {
          throw new ValidationError('The selected subcategory must belong to the selected category.');
        }
        MasterDataLifecycleService.assertIsReferenceable('ProductFamily', family.id, family.status);
      }
    }

    const selectedUom = await this.uomRepository.findUomById(params.uomId || material.uomId);
    if (!selectedUom) throw new NotFoundError(`UnitOfMeasure [${params.uomId || material.uomId}] not found.`);
    assertUomQuantities(selectedUom, mergedSpecs);

    const updateData: Prisma.MaterialUpdateInput = {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(normalizedCode ? { code: normalizedCode } : {}),
      ...(params.materialType ? { materialType: params.materialType } : {}),
      ...(params.categoryId !== undefined
        ? params.categoryId
          ? { category: { connect: { id: params.categoryId } } }
          : material.categoryId
          ? { category: { disconnect: true } }
          : {}
        : {}),
      ...(params.uomId ? { uom: { connect: { id: params.uomId } } } : {}),
      specs: mergedSpecs as Prisma.InputJsonValue
    };

    if (material.status === 'DRAFT' || material.status === 'PENDING_VALIDATION') {
      const updated = await this.repository.update(id, updateData);
      await this.ensureOpeningStockIfMissing(updated, mergedSpecs, params.actorId, params.requestId);

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'material.update_draft',
        entityType: 'Material',
        entityId: updated.id,
        before: material,
        after: updated,
        requestId: params.requestId
      });

      return updated;
    }

    // Material edits update the existing master record in place. A material code
    // is globally unique, so creating a superseding row with the same code
    // causes edits to fail with a unique-constraint error.
    if (material.status === 'APPROVED' || material.status === 'ACTIVE') {
      const updated = await this.repository.update(material.id, updateData);
      await this.ensureOpeningStockIfMissing(updated, mergedSpecs, params.actorId, params.requestId);

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'material.update',
        entityType: 'Material',
        entityId: updated.id,
        before: material,
        after: updated,
        metadata: { editMode: 'in_place' },
        requestId: params.requestId
      });

      return updated;
    }

    throw new ConflictError(`Cannot edit Material [${material.code}] with terminal status [${material.status}].`);
  }

  private async ensureOpeningStockIfMissing(
    material: Material,
    specs: Record<string, unknown>,
    actorId: string,
    requestId?: string,
  ): Promise<void> {
    const quantity = Number(specs.initialQuantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const existingBalance = await prisma.stockBalance.findFirst({
      where: { materialId: material.id, uomId: material.uomId, ownership: 'OWNED' },
      select: { id: true },
    });
    if (existingBalance) {
      // Re-run the threshold check when an existing item's safety buffer is
      // edited, even though no new opening balance needs to be posted.
      await reorderEvaluatorService.evaluateAndTrigger(existingBalance.id);
      return;
    }

    let location = await prisma.warehouseLocation.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!location) {
      location = await prisma.warehouseLocation.findFirst({ where: { code: 'MAIN-STORE' } });
    }
    if (!location) {
      const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' } });
      location = await prisma.warehouseLocation.create({
        data: { code: 'MAIN-STORE', name: 'Main Store', type: 'STORE', status: 'ACTIVE', factoryId: factory?.id ?? null },
      });
    }

    try {
      await inventoryPostingService.post(prisma, {
        itemType: 'MATERIAL',
        itemId: material.id,
        uomId: material.uomId,
        locationId: location.id,
        movementType: 'RECEIPT',
        quantity,
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        unitCost: Number(specs.standardCost ?? 0),
        sourceType: 'MATERIAL_OPENING_BALANCE',
        sourceId: material.id,
        idempotencyKey: `MATERIAL_OPENING_BALANCE:${material.id}`,
        actorId,
        correlationId: requestId,
      });
    } catch (error) {
      console.warn('[MaterialsService.updateMaterial] Modern opening stock posting note:', error);
    }

    const balance = await prisma.stockBalance.upsert({
      where: {
        itemKey_uomId_locationId_ownership: {
          itemKey: `MATERIAL:${material.id}`,
          uomId: material.uomId,
          locationId: location.id,
          ownership: 'OWNED',
        },
      },
      update: {},
      create: {
        itemKey: `MATERIAL:${material.id}`,
        materialId: material.id,
        uomId: material.uomId,
        locationId: location.id,
        ownership: 'OWNED',
        onHandQuantity: quantity,
        reservedQuantity: 0,
      },
    });
    await prisma.stockLedgerEntry.create({
      data: {
        materialId: material.id,
        uomId: material.uomId,
        locationId: location.id,
        quantity,
        direction: 'IN',
        entryType: 'ADJUSTMENT_INCREASE',
        postedByActorId: actorId,
        note: `Opening stock restored during material update for code [${material.code}]`,
      },
    });
    await reorderEvaluatorService.evaluateAndTrigger(balance.id);
  }

  async transitionStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Material> {
    const material = await this.getMaterialById(params.id);

    MasterDataLifecycleService.validateTransition(material.status, params.targetStatus, 'Material');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Material'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countActiveReferences(params.id);
      if (refs.packSizes > 0 || refs.wastageRules > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Material [${material.code}]. It has active references (${refs.packSizes} pack sizes, ${refs.wastageRules} wastage rules).`,
          refs
        );
      }
    }

    const updated = await this.repository.update(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'material.status_change',
      entityType: 'Material',
      entityId: updated.id,
      before: { status: material.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
