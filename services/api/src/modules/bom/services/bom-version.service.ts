import { Prisma, BomStatus, BomLineType, BomQuantityMode, BomRoundingRule } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { prisma } from '../../../database';
import { UomService } from '../../master-data/services/uom.service';
import { MasterDataLifecycleService } from '../../master-data/services/master-data-lifecycle.service';
import {
  BomVersionRepository,
  BomVersionWithLines,
  BomGoldenExampleRepository,
  BomGoldenExampleExpectedResult
} from '../repositories';
import { BomCalculatorService, ResolveFactorFn, BomLineRequirement } from './bom-calculator.service';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';

export interface BomLineInput {
  lineType: BomLineType;
  materialId?: string;
  componentProductId?: string;
  uomId: string;
  quantityMode: BomQuantityMode;
  quantity: number;
  unitCost?: number | null;
  roundingRule?: BomRoundingRule;
  roundingPrecision?: number;
  departmentId?: string;
  sequence?: number;
  note?: string;
}

export interface BomVersionDiffEntry {
  componentKey: string;
  from: BomVersionWithLines['lines'][0];
  to: BomVersionWithLines['lines'][0];
  differences?: string[];
}

export interface BomVersionDiff {
  fromVersion: {
    id: string;
    bomNumber: string;
    version: number;
    status: BomStatus;
  };
  toVersion: {
    id: string;
    bomNumber: string;
    version: number;
    status: BomStatus;
  };
  addedLines: BomVersionWithLines['lines'];
  removedLines: BomVersionWithLines['lines'];
  changedLines: BomVersionDiffEntry[];
  unchangedLines: BomVersionWithLines['lines'];
  added: BomVersionWithLines['lines'];
  removed: BomVersionWithLines['lines'];
  changed: BomVersionDiffEntry[];
}

function selectedVariantKey(note?: string | null): string {
  const marker = String(note || '').split(/\s*·\s*/).find((part) => /^Selected variant:/i.test(part.trim()));
  if (!marker) return '';

  const variantId = marker.match(/\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i)?.[1];
  if (variantId) return `ID:${variantId.toLowerCase()}`;

  const label = marker
    .replace(/^Selected variant:\s*/i, '')
    .replace(/\s*\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)\s*$/i, '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  return label ? `LABEL:${label}` : '';
}

function componentKey(line: { materialId: string | null; componentProductId: string | null; note?: string | null }): string {
  const component = line.materialId ? `MATERIAL:${line.materialId}` : `PRODUCT:${line.componentProductId}`;
  const variant = selectedVariantKey(line.note);
  return variant ? `${component}:VARIANT:${variant}` : component;
}

export class BomVersionService {
  constructor(
    private readonly repository: BomVersionRepository,
    private readonly goldenExampleRepository: BomGoldenExampleRepository,
    private readonly calculator: BomCalculatorService,
    private readonly uomService: UomService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  private resolveFactor: ResolveFactorFn = async (fromUomId, toUomId, date) => {
    const factor = await this.uomService.resolveConversionFactor(fromUomId, toUomId, date);
    return factor.toNumber();
  };

  private async notifyWorkflow(version: BomVersionWithLines, event: 'pending' | 'approved', actorId: string): Promise<void> {
    const label = `${version.bomNumber} (v${version.version})`;
    try {
      await Promise.all([
        notificationService.notifyRoles({
          roles: ['admin', 'super-admin'],
          type: event === 'pending' ? 'APPROVAL_REQUIRED' : 'APPROVED',
          title: event === 'pending' ? 'BOM approval required' : 'BOM approved',
          message: event === 'pending'
            ? `${label} for ${version.product?.name || version.material?.name || 'an inventory item'} was created by a Store Manager and needs your approval.`
            : `${label} for ${version.product?.name || version.material?.name || 'an inventory item'} is approved and ready for production.`,
          resource: 'BomVersion', resourceId: version.id, href: `/production/bom/${version.id}`,
          excludeUserIds: event === 'approved' ? [actorId] : []
        }),
        notificationService.notifyUsers({
          recipientIds: [...new Set([version.createdByActorId, actorId].filter(Boolean))],
          type: event === 'pending' ? 'APPROVAL_REQUIRED' : 'APPROVED',
          title: event === 'pending' ? 'BOM submitted for approval' : 'BOM approved',
          message: event === 'pending' ? `${label} is waiting for Admin approval.` : `${label} is now approved and live.`,
          resource: 'BomVersion', resourceId: version.id, href: `/production/bom/${version.id}`
        })
      ]);
    } catch {
      // Notification delivery must not roll back a saved BOM workflow state.
    }
  }

  async createDraft(
    data: {
      productId?: string;
      materialId?: string;
      productVariantId?: string;
      copyFromVersionId?: string;
      updateVersionId?: string;
      bomNumber?: string;
      note?: string;
      lines?: BomLineInput[];
    },
    actorId: string,
    requestId?: string
  ): Promise<BomVersionWithLines> {
    const canCreate = await this.permissionChecker.can(actorId, 'create', 'BomVersion');
    if (!canCreate) throw new ForbiddenError('Lacks permission to create a BOM version.');

    if (Boolean(data.productId) === Boolean(data.materialId)) {
      throw new ValidationError('A BOM must belong to exactly one product or material.');
    }
    if (data.productVariantId && !data.productId) {
      throw new ValidationError('Material BOMs cannot be scoped to a product variant.');
    }
    if (data.productId) {
      const product = await prisma.product.findUnique({ where: { id: data.productId } });
      if (!product) throw new NotFoundError(`Product [${data.productId}] not found.`);
    } else {
      const material = await prisma.material.findUnique({ where: { id: data.materialId } });
      if (!material) throw new NotFoundError(`Material [${data.materialId}] not found.`);
      MasterDataLifecycleService.assertIsReferenceable('Material', material.id, material.status);
    }

    if (data.productVariantId && data.productId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: data.productVariantId } });
      if (!variant) throw new NotFoundError(`ProductVariant [${data.productVariantId}] not found.`);
      if (variant.productId !== data.productId) {
        throw new ValidationError(`ProductVariant [${data.productVariantId}] does not belong to product [${data.productId}].`);
      }
    }

    let lines: BomLineInput[] = data.lines || [];
    if (data.copyFromVersionId) {
      const source = await this.repository.findById(data.copyFromVersionId);
      if (!source) throw new NotFoundError(`BomVersion [${data.copyFromVersionId}] not found.`);
      lines = source.lines.map((line) => ({
        lineType: line.lineType,
        materialId: line.materialId ?? undefined,
        componentProductId: line.componentProductId ?? undefined,
        uomId: line.uomId,
        quantityMode: line.quantityMode,
        quantity: Number(line.quantity),
        unitCost: line.unitCost != null ? Number(line.unitCost) : undefined,
        roundingRule: line.roundingRule,
        roundingPrecision: line.roundingPrecision ?? undefined,
        departmentId: line.departmentId ?? undefined,
        sequence: line.sequence,
        note: line.note ?? undefined
      }));
    }
    lines = this.mergeDuplicateLines(lines);

    const parent = data.productId ? { productId: data.productId } : { materialId: data.materialId! };
    let effectiveVariantId = data.productVariantId ?? null;
    let sourceForUpdate: any = null;

    if (data.updateVersionId) {
      // A formula edit may reuse its existing name only when it targets that same BOM.
      sourceForUpdate = await this.repository.findById(data.updateVersionId);
      if (!sourceForUpdate) {
        throw new ValidationError('The BOM being updated must belong to this item and variant.');
      }
      // If the caller did not explicitly specify a productVariantId, inherit it from the source BOM being updated
      if (data.productVariantId === undefined && sourceForUpdate.productVariantId) {
        effectiveVariantId = sourceForUpdate.productVariantId;
      }
      const sameParent =
        (sourceForUpdate.productId ?? null) === (parent.productId ?? null) &&
        (sourceForUpdate.materialId ?? null) === (parent.materialId ?? null) &&
        ((sourceForUpdate.productVariantId ?? null) === effectiveVariantId ||
          (!data.productVariantId && sourceForUpdate.productId && sourceForUpdate.productId === parent.productId));
      if (!sameParent) {
        throw new ValidationError('The BOM being updated must belong to this item and variant.');
      }
    }

    const nextVersion = (await this.repository.findMaxVersion(parent, effectiveVariantId)) + 1;
    let bomNumber = data.bomNumber?.trim();
    if (bomNumber) {
      if (await this.repository.existsByBomNumber(bomNumber)) {
        throw new ValidationError(`BOM code/number "${bomNumber}" already exists. Please provide a unique BOM name.`);
      }
    } else {
      bomNumber = await this.generateBomNumber();
    }

    const created = await this.repository.create({
      bomNumber,
      ...parent,
      productVariantId: effectiveVariantId,
      version: nextVersion,
      note: data.note,
      createdByActorId: actorId,
      lines
    });

    await this.auditWriter.record({
      actorId,
      action: 'bom.create_draft',
      entityType: 'BomVersion',
      entityId: created.id,
      after: created,
      requestId
    });

    return created;
  }

  async updateDraft(
    id: string,
    data: { bomNumber?: string; note?: string | null; effectiveDate?: string | null; lines?: BomLineInput[] },
    actorId: string,
    requestId?: string
  ): Promise<BomVersionWithLines> {
    const canUpdate = await this.permissionChecker.can(actorId, 'update', 'BomVersion');
    if (!canUpdate) throw new ForbiddenError('Lacks permission to update a BOM version.');

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (version.status === 'RETIRED' || version.status === 'SUPERSEDED') {
      throw new InvalidStateTransitionError(`Cannot edit BomVersion [${id}] in state [${version.status}]. Only active or draft BOMs may be changed.`);
    }

    const bomNumber = data.bomNumber?.trim();
    if (data.bomNumber !== undefined) {
      if (!bomNumber) throw new ValidationError('BOM name is required.');
      if (await this.repository.existsByBomNumber(bomNumber, version.id)) {
        throw new ValidationError(`BOM name "${bomNumber}" is already in use. Choose a unique name.`);
      }
    }

    if (data.lines) {
      data.lines = this.mergeDuplicateLines(data.lines);
      await this.assertLinesValid(version.productId ?? undefined, version.materialId ?? undefined, data.lines);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const txRepo = new BomVersionRepository(tx);
      if (data.lines) {
        await txRepo.replaceLines(id, data.lines, tx);
      }
      await txRepo.updateHeader(
        id,
        {
          ...(data.bomNumber !== undefined ? { bomNumber } : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : (version.effectiveDate ?? now),
          status: 'APPROVED',
          approvedByActorId: actorId,
          approvedAt: now,
          supersededById: null,
          validatedByActorId: null,
          validatedAt: null
        },
        tx
      );
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`BomVersion [${id}] not found after update.`);

    await this.auditWriter.record({
      actorId,
      action: 'bom.update_draft',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      after: updated,
      requestId
    });

    return updated;
  }

  async deleteDraft(id: string, actorId: string, requestId?: string): Promise<{ id: string; action: 'DELETED' | 'RETIRED' }> {
    const canDelete = await this.permissionChecker.can(actorId, 'delete', 'BomVersion');
    if (!canDelete) throw new ForbiddenError('Lacks permission to delete a BOM version.');

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    const references = await prisma.bomVersion.findUnique({
      where: { id },
      select: {
        _count: { select: { productionPlans: true, materialIssues: true } }
      }
    });
    if (!references) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (references._count.productionPlans > 0 || references._count.materialIssues > 0) {
      await prisma.bomVersion.update({
        where: { id },
        data: { status: 'RETIRED', retiredByActorId: actorId, retiredAt: new Date() }
      });
      await this.auditWriter.record({
        actorId,
        action: 'bom.retire_from_delete',
        entityType: 'BomVersion',
        entityId: id,
        before: version,
        requestId
      });
      return { id, action: 'RETIRED' };
    }

    await prisma.$transaction((tx) => new BomVersionRepository(tx).deleteDraft(id, tx));
    await this.auditWriter.record({
      actorId,
      action: 'bom.delete_draft',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      requestId
    });
    return { id, action: 'DELETED' };
  }

  async deleteDrafts(ids: string[], actorId: string, requestId?: string): Promise<{ requestedCount: number; deletedCount: number; retiredCount: number }> {
    const canDelete = await this.permissionChecker.can(actorId, 'delete', 'BomVersion');
    if (!canDelete) throw new ForbiddenError('Lacks permission to delete a BOM version.');

    const uniqueIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (uniqueIds.length === 0) throw new ValidationError('Select at least one BOM to delete.');
    if (uniqueIds.length > 200) throw new ValidationError('A maximum of 200 BOMs can be deleted at once.');

    const result = await prisma.$transaction(async (tx) => {
      const versions = await tx.bomVersion.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          productId: true,
          _count: { select: { productionPlans: true, materialIssues: true } },
        },
      });
      if (versions.length !== uniqueIds.length) {
        const found = new Set(versions.map((version) => version.id));
        const missingIds = uniqueIds.filter((id) => !found.has(id));
        throw new NotFoundError(`Some selected BOMs could not be found: ${missingIds.join(', ')}.`);
      }

      const retiredIds = versions
        .filter((version) => version._count.productionPlans > 0 || version._count.materialIssues > 0)
        .map((version) => version.id);
      const deletableIds = versions.filter((version) => !retiredIds.includes(version.id)).map((version) => version.id);
      const now = new Date();

      if (retiredIds.length > 0) {
        await tx.bomVersion.updateMany({
          where: { id: { in: retiredIds } },
          data: { status: 'RETIRED', retiredByActorId: actorId, retiredAt: now },
        });
      }

      if (deletableIds.length > 0) {
        await tx.bomSimulationRun.deleteMany({ where: { bomVersionId: { in: deletableIds } } });
        await tx.bomVersion.updateMany({ where: { supersededById: { in: deletableIds } }, data: { supersededById: null } });
        await tx.bomVersion.updateMany({ where: { id: { in: deletableIds } }, data: { supersededById: null } });
        await tx.bomVersion.deleteMany({ where: { id: { in: deletableIds } } });

        const affectedProductIds = [...new Set(versions
          .filter((version) => version.productId && deletableIds.includes(version.id))
          .map((version) => version.productId!))];
        for (const productId of affectedProductIds) {
          const remaining = await tx.bomVersion.count({ where: { productId } });
          if (remaining !== 0) continue;
          const product = await tx.product.findUnique({ where: { id: productId }, select: { metadata: true } });
          if (!product?.metadata || typeof product.metadata !== 'object' || Array.isArray(product.metadata)) continue;
          const metadata = { ...(product.metadata as Record<string, unknown>) };
          delete metadata.bomEnabled;
          delete metadata.bomLines;
          delete metadata.bomFormula;
          await tx.product.update({ where: { id: productId }, data: { metadata: metadata as Prisma.InputJsonObject } });
        }
      }

      return { requestedCount: uniqueIds.length, deletedCount: deletableIds.length, retiredCount: retiredIds.length };
    }, { maxWait: 15000, timeout: 30000 });

    await this.auditWriter.record({
      actorId,
      action: 'bom.bulk_delete',
      entityType: 'BomVersion',
      entityId: uniqueIds[0],
      metadata: { bomVersionIds: uniqueIds, ...result },
      requestId,
    });
    return result;
  }

  async detachFromItem(id: string, actorId: string, requestId?: string): Promise<BomVersionWithLines> {
    const canUpdate = await this.permissionChecker.can(actorId, 'update', 'BomVersion');
    if (!canUpdate) throw new ForbiddenError('Lacks permission to remove a BOM from an inventory item.');

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (!version.productId && !version.materialId) return version;
    if ((version as any).detachedFromItemAt) return version;

    const detachedAt = new Date();
    await this.repository.detachFromItem(id, detachedAt);
    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`BomVersion [${id}] not found after detaching from item.`);

    await this.auditWriter.record({
      actorId,
      action: 'bom.detach_from_item',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      after: updated,
      metadata: { productId: version.productId, materialId: version.materialId, detachedAt: detachedAt.toISOString() },
      requestId
    });
    return updated;
  }

  /**
   * Idempotent/re-runnable: submits DRAFT -> VALIDATION_PENDING on first success, or simply
   * re-stamps validatedAt on a version already in VALIDATION_PENDING. Re-checks every linked
   * golden example fresh every time - never trusts a prior pass.
   */
  async validate(id: string, actorId: string, requestId?: string): Promise<BomVersionWithLines> {
    const canValidate = await this.permissionChecker.can(actorId, 'validate', 'BomVersion');
    if (!canValidate) throw new ForbiddenError('Lacks permission to validate a BOM version.');

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (version.status === 'APPROVED') {
      return version;
    }
    if (version.status !== 'DRAFT' && version.status !== 'VALIDATION_PENDING') {
      throw new InvalidStateTransitionError(`Cannot validate BomVersion [${id}] in state [${version.status}].`);
    }

    await this.runValidationChecks(version);

    const now = new Date();
    if (version.status === 'DRAFT') {
      const count = await this.repository.updateStatusConditional(id, ['DRAFT'], 'VALIDATION_PENDING', {
        submittedByActorId: actorId,
        submittedAt: now,
        validatedByActorId: actorId,
        validatedAt: now
      });
      if (count === 0) {
        throw new InvalidStateTransitionError(`BomVersion [${id}] was modified concurrently; refetch and retry validate.`);
      }
    } else {
      await this.repository.updateHeader(id, { validatedByActorId: actorId, validatedAt: now });
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`BomVersion [${id}] not found after validate.`);

    await this.auditWriter.record({
      actorId,
      action: 'bom.validate',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      after: updated,
      requestId
    });

    return updated;
  }

  /**
   * Requires VALIDATION_PENDING; re-runs the full validation gate inline rather than trusting a
   * stored flag (a version could be approved seconds after its last successful validate() call,
   * and this must still be freshly proven). On success, atomically supersedes the immediately-
   * prior APPROVED version for the same product/variant in the same transaction - never a gap
   * with zero approved versions, never a moment with two.
   */
  async approve(id: string, actorId: string, requestId?: string, direct = false): Promise<BomVersionWithLines> {
    if (!direct) {
      const canApprove = await this.permissionChecker.can(actorId, 'approve', 'BomVersion');
      if (!canApprove) throw new ForbiddenError('Lacks permission to approve a BOM version.');
    }

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (version.status === 'APPROVED') {
      return version;
    }
    const expectedStatus = direct ? 'DRAFT' : 'VALIDATION_PENDING';
    if (version.status !== expectedStatus) {
      throw new InvalidStateTransitionError(`Cannot approve BomVersion [${id}] in state [${version.status}]. Must be ${expectedStatus}.`);
    }

    // Keep only the essential formula integrity checks. Golden fixtures and a
    // separate validation stage are intentionally not part of the workflow.
    await this.assertLinesValid(version.productId ?? undefined, version.materialId ?? undefined, version.lines.map((line) => ({
      lineType: line.lineType,
      materialId: line.materialId ?? undefined,
      componentProductId: line.componentProductId ?? undefined,
      uomId: line.uomId,
      quantityMode: line.quantityMode,
      quantity: Number(line.quantity),
      roundingRule: line.roundingRule,
      roundingPrecision: line.roundingPrecision ?? undefined,
      departmentId: line.departmentId ?? undefined
    })));
    if (!version.lines.some((line) => line.lineType === 'COMPONENT')) {
      throw new ValidationError('A BOM version must have at least one component line.');
    }

    const now = new Date();
    await prisma.$transaction(
      async (tx) => {
        const txRepo = new BomVersionRepository(tx);
        await txRepo.updateHeader(
          id,
          {
            status: 'APPROVED',
            approvedByActorId: actorId,
            approvedAt: now,
            effectiveDate: version.effectiveDate ?? now,
            supersededById: null,
          },
          tx
        );
      },
      { maxWait: 15000, timeout: 30000 }
    );

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`BomVersion [${id}] not found after approve.`);

    await this.auditWriter.record({
      actorId,
      action: 'bom.approve',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      after: updated,
      requestId
    });

    await this.notifyWorkflow(updated, 'approved', actorId);
    return updated;
  }

  /**
   * Explicit, deliberate "pull this out of effect" action - independent of approve()'s automatic
   * swap-on-replacement-approval. With a replacementVersionId it becomes SUPERSEDED; without one
   * it becomes RETIRED (terminal - no more versions will ever supersede it).
   */
  async supersede(
    id: string,
    data: { replacementVersionId?: string },
    actorId: string,
    requestId?: string
  ): Promise<BomVersionWithLines> {
    const canSupersede = await this.permissionChecker.can(actorId, 'supersede', 'BomVersion');
    if (!canSupersede) throw new ForbiddenError('Lacks permission to supersede a BOM version.');

    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    if (version.status !== 'APPROVED') {
      throw new InvalidStateTransitionError(`Cannot supersede BomVersion [${id}] in state [${version.status}]. Must be APPROVED.`);
    }

    if (data.replacementVersionId) {
      const replacement = await this.repository.findById(data.replacementVersionId);
      if (!replacement) throw new NotFoundError(`BomVersion [${data.replacementVersionId}] not found.`);
    }

    const now = new Date();
    const toStatus: BomStatus = data.replacementVersionId ? 'SUPERSEDED' : 'RETIRED';
    const extra: Prisma.BomVersionUncheckedUpdateInput = data.replacementVersionId
      ? { supersededById: data.replacementVersionId }
      : { retiredByActorId: actorId, retiredAt: now };

    const count = await this.repository.updateStatusConditional(id, ['APPROVED'], toStatus, extra);
    if (count === 0) {
      throw new InvalidStateTransitionError(`BomVersion [${id}] was modified concurrently; refetch and retry supersede.`);
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`BomVersion [${id}] not found after supersede.`);

    await this.auditWriter.record({
      actorId,
      action: 'bom.supersede',
      entityType: 'BomVersion',
      entityId: id,
      before: version,
      after: updated,
      metadata: { toStatus },
      requestId
    });

    return updated;
  }

  async addGoldenExample(
    bomVersionId: string,
    data: {
      label: string;
      inputQuantity: number;
      inputUomId: string;
      expectedResults: BomGoldenExampleExpectedResult[];
      sourceReference?: string;
    },
    actorId: string,
    requestId?: string
  ) {
    const canUpdate = await this.permissionChecker.can(actorId, 'update', 'BomVersion');
    if (!canUpdate) throw new ForbiddenError('Lacks permission to add a golden example to a BOM version.');

    const version = await this.repository.findById(bomVersionId);
    if (!version) throw new NotFoundError(`BomVersion [${bomVersionId}] not found.`);
    if (version.status === 'APPROVED' || version.status === 'SUPERSEDED' || version.status === 'RETIRED') {
      throw new InvalidStateTransitionError(`Cannot add a golden example to a BomVersion in state [${version.status}].`);
    }

    const lineIds = new Set(version.lines.map((line) => line.id));
    for (const expected of data.expectedResults) {
      if (!lineIds.has(expected.bomLineId)) {
        throw new ValidationError(`Golden example references bomLineId [${expected.bomLineId}], which does not belong to BomVersion [${bomVersionId}].`);
      }
    }

    const created = await this.goldenExampleRepository.create({
      bomVersionId,
      label: data.label,
      inputQuantity: data.inputQuantity,
      inputUomId: data.inputUomId,
      expectedResults: data.expectedResults,
      sourceReference: data.sourceReference,
      createdByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'bom.add_golden_example',
      entityType: 'BomVersion',
      entityId: bomVersionId,
      after: created,
      requestId
    });

    return created;
  }

  async listGoldenExamples(bomVersionId: string) {
    return this.goldenExampleRepository.listByVersion(bomVersionId);
  }

  /**
   * The actual "requirement calculator" the spec calls for - the enforcement point for
   * "prevent unapproved calculation." Resolves the narrow, APPROVED-only, currently-live
   * version (never the historical-inclusive resolver) and refuses outright if none exists.
   */
  async calculateRequirements(
    params: { productId: string; productVariantId?: string; requestedQuantity: number; requestedUomId: string; date?: Date },
    actorId: string
  ): Promise<{ bomVersion: BomVersionWithLines; requirements: BomLineRequirement[] }> {
    const canExport = await this.permissionChecker.can(actorId, 'export', 'BomVersion');
    if (!canExport) throw new ForbiddenError('Lacks permission to calculate authoritative BOM requirements.');

    const date = params.date ?? new Date();
    const version = await this.repository.findLiveApprovedVersion(params.productId, params.productVariantId ?? null, date);
    if (!version) {
      throw new InvalidStateTransitionError(
        `No approved BOM is effective for product [${params.productId}] as of ${date.toISOString()}.`
      );
    }

    const requirements = await this.calculator.computeRequirements(version, params.requestedQuantity, params.requestedUomId, date, this.resolveFactor);
    return { bomVersion: version, requirements };
  }

  async compareVersions(fromId: string, toId: string): Promise<BomVersionDiff> {
    const [from, to] = await Promise.all([this.repository.findById(fromId), this.repository.findById(toId)]);
    if (!from) throw new NotFoundError(`BomVersion [${fromId}] not found.`);
    if (!to) throw new NotFoundError(`BomVersion [${toId}] not found.`);

    const fromMap = new Map(from.lines.map((line) => [componentKey(line), line]));
    const toMap = new Map(to.lines.map((line) => [componentKey(line), line]));

    const added = [...toMap.entries()].filter(([key]) => !fromMap.has(key)).map(([, line]) => line);
    const removed = [...fromMap.entries()].filter(([key]) => !toMap.has(key)).map(([, line]) => line);
    const changed: BomVersionDiffEntry[] = [];
    const unchanged: BomVersionWithLines['lines'] = [];

    for (const [key, fromLine] of fromMap.entries()) {
      const toLine = toMap.get(key);
      if (!toLine) continue;
      const diffs: string[] = [];
      if (fromLine.quantity.toString() !== toLine.quantity.toString()) {
        diffs.push(`Quantity changed from ${fromLine.quantity} to ${toLine.quantity}`);
      }
      if (fromLine.uomId !== toLine.uomId) {
        diffs.push(`UOM changed from ${fromLine.uom?.code || fromLine.uomId} to ${toLine.uom?.code || toLine.uomId}`);
      }
      if (fromLine.quantityMode !== toLine.quantityMode) {
        diffs.push(`Mode changed from ${fromLine.quantityMode} to ${toLine.quantityMode}`);
      }
      if (fromLine.roundingRule !== toLine.roundingRule) {
        diffs.push(`Rounding rule changed from ${fromLine.roundingRule} to ${toLine.roundingRule}`);
      }
      if (fromLine.roundingPrecision !== toLine.roundingPrecision) {
        diffs.push(`Rounding precision changed from ${fromLine.roundingPrecision ?? 'none'} to ${toLine.roundingPrecision ?? 'none'}`);
      }
      if (fromLine.departmentId !== toLine.departmentId) {
        diffs.push(`Department changed from ${fromLine.department?.name || 'none'} to ${toLine.department?.name || 'none'}`);
      }

      if (diffs.length > 0) {
        changed.push({ componentKey: key, from: fromLine, to: toLine, differences: diffs });
      } else {
        unchanged.push(fromLine);
      }
    }

    return {
      fromVersion: {
        id: from.id,
        bomNumber: from.bomNumber,
        version: from.version,
        status: from.status
      },
      toVersion: {
        id: to.id,
        bomNumber: to.bomNumber,
        version: to.version,
        status: to.status
      },
      addedLines: added,
      removedLines: removed,
      changedLines: changed,
      unchangedLines: unchanged,
      added,
      removed,
      changed
    };
  }

  async getById(id: string): Promise<BomVersionWithLines> {
    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    return version;
  }

  async getHistory(id: string) {
    const version = await this.repository.findById(id);
    if (!version) throw new NotFoundError(`BomVersion [${id}] not found.`);
    return prisma.auditLog.findMany({
      where: { resource: 'BomVersion', resourceId: id },
      orderBy: { createdAt: 'asc' }
    });
  }

  async list(params: { productId?: string; materialId?: string; productVariantId?: string; status?: BomStatus; skip?: number; take?: number; search?: string }) {
    return this.repository.list(params);
  }

  async isBomNameTaken(name: string, excludeId?: string): Promise<boolean> {
    if (!name.trim()) return false;
    return this.repository.existsByBomNumber(name.trim(), excludeId);
  }

  /**
   * Re-verifies every line's referenced material/componentProduct/uom is still
   * APPROVED/ACTIVE and, for componentProduct lines, that it doesn't create a circular
   * reference against the currently-APPROVED component graph - run both when a draft's lines
   * are (re)written and again, fresh, at approve() time (a cycle can be created retroactively
   * when a *different* product's BOM approves later; a component can go inactive at any time).
   */
  private async runValidationChecks(version: BomVersionWithLines): Promise<void> {
    await this.assertLinesValid(
      version.productId ?? undefined,
      version.materialId ?? undefined,
      version.lines.map((line) => ({
        lineType: line.lineType,
        materialId: line.materialId ?? undefined,
        componentProductId: line.componentProductId ?? undefined,
        uomId: line.uomId,
        quantityMode: line.quantityMode,
        quantity: Number(line.quantity),
        roundingRule: line.roundingRule,
        roundingPrecision: line.roundingPrecision ?? undefined,
        departmentId: line.departmentId ?? undefined
      }))
    );

    const componentLines = version.lines.filter((line) => line.lineType === 'COMPONENT');
    if (componentLines.length === 0) {
      throw new ValidationError('A BOM version must have at least one COMPONENT line before it can be validated or approved.');
    }

    // Golden examples are optional QA fixtures. A normal BOM with valid
    // component lines must be publishable without requiring an extra test
    // record that the product-creation workflow does not collect.
    if (version.goldenExamples.length === 0) return;

    const coveredLineIds = new Set<string>();
    const allMismatches: Array<{ goldenExampleId: string; bomLineId: string; expected: number; actual: number | null }> = [];

    for (const example of version.goldenExamples) {
      const expectedResults = example.expectedResults as unknown as BomGoldenExampleExpectedResult[];
      const result = await this.calculator.checkAgainstGoldenExample(
        version,
        { inputQuantity: Number(example.inputQuantity), inputUomId: example.inputUomId, expectedResults },
        version.effectiveDate ?? new Date(),
        this.resolveFactor
      );
      for (const expected of expectedResults) coveredLineIds.add(expected.bomLineId);
      if (!result.matches) {
        for (const mismatch of result.mismatches) allMismatches.push({ goldenExampleId: example.id, ...mismatch });
      }
    }

    if (allMismatches.length > 0) {
      throw new ValidationError(
        'The calculation engine does not reproduce every linked golden example exactly - unresolved formulas remain blocked.',
        { mismatches: allMismatches }
      );
    }

    const uncoveredLines = componentLines.filter((line) => !coveredLineIds.has(line.id));
    if (uncoveredLines.length > 0) {
      throw new ValidationError(
        'Every COMPONENT line must be covered by at least one golden example before this version can be validated or approved.',
        { uncoveredBomLineIds: uncoveredLines.map((line) => line.id) }
      );
    }
  }

  private async assertLinesValid(rootProductId: string | undefined, rootMaterialId: string | undefined, lines: BomLineInput[]): Promise<void> {
    const approvedEdges = await this.repository.findApprovedComponentEdges();
    const approvedMaterialEdges = rootMaterialId ? await this.repository.findApprovedMaterialEdges() : [];
    const seen = new Set<string>();

    for (const line of lines) {
      if (Boolean(line.materialId) === Boolean(line.componentProductId)) {
        throw new ValidationError('A BOM line must reference exactly one of materialId or componentProductId.');
      }
      if (line.roundingRule && line.roundingRule !== 'NONE' && line.roundingPrecision === undefined) {
        throw new ValidationError('roundingPrecision is required whenever roundingRule is not NONE.');
      }
      if (!(Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0)) {
        throw new ValidationError('BOM quantities must be greater than zero.');
      }
      const key = componentKey({
        materialId: line.materialId ?? null,
        componentProductId: line.componentProductId ?? null,
        note: line.note,
      });
      if (seen.has(key)) {
        let itemName = 'item';
        if (line.materialId) {
          const mat = await prisma.material.findUnique({ where: { id: line.materialId }, select: { name: true, code: true } });
          itemName = mat?.name || mat?.code || 'item';
        } else if (line.componentProductId) {
          const prod = await prisma.product.findUnique({ where: { id: line.componentProductId }, select: { name: true, sku: true } });
          itemName = prod?.name || prod?.sku || 'component';
        }
        throw new ValidationError(`Duplicate item "${itemName}" is not allowed in BOM formulation.`);
      }
      seen.add(key);

      if (line.materialId) {
        const material = await prisma.material.findUnique({ where: { id: line.materialId }, include: { uom: true } });
        if (!material) throw new NotFoundError(`Material [${line.materialId}] not found.`);
        MasterDataLifecycleService.assertIsReferenceable('Material', material.id, material.status);
        if (rootMaterialId) {
          const adjacency = new Map<string, string[]>();
          for (const edge of approvedMaterialEdges) {
            const children = adjacency.get(edge.materialId) || [];
            children.push(edge.componentMaterialId);
            adjacency.set(edge.materialId, children);
          }
          const visited = new Set<string>();
          const reachesRoot = (candidate: string): boolean => {
            if (candidate === rootMaterialId) return true;
            if (visited.has(candidate)) return false;
            visited.add(candidate);
            return (adjacency.get(candidate) || []).some(reachesRoot);
          };
          if (reachesRoot(line.materialId)) {
            throw new ValidationError(`Material BOM cycle detected: component ${material.code} already contains ${rootMaterialId}.`);
          }
        }
        const lineUom = await prisma.unitOfMeasure.findUnique({ where: { id: line.uomId } });
        if (lineUom?.dimension && material.uom.dimension && lineUom.dimension !== material.uom.dimension) {
          throw new ValidationError(`UOM dimension mismatch for material ${material.code}: ${lineUom.dimension} cannot be used with ${material.uom.dimension}.`);
        }
      }

      if (line.componentProductId) {
        const componentProduct = await prisma.product.findUnique({ where: { id: line.componentProductId }, include: { uom: true } });
        if (!componentProduct) throw new NotFoundError(`Product [${line.componentProductId}] not found.`);
        MasterDataLifecycleService.assertIsReferenceable('Product', componentProduct.id, componentProduct.status);
        if (rootProductId) this.calculator.detectCycle(rootProductId, line.componentProductId, approvedEdges);
        const lineUom = await prisma.unitOfMeasure.findUnique({ where: { id: line.uomId } });
        if (lineUom?.dimension && componentProduct.uom.dimension && lineUom.dimension !== componentProduct.uom.dimension) {
          throw new ValidationError(`UOM dimension mismatch for component ${componentProduct.sku}: ${lineUom.dimension} cannot be used with ${componentProduct.uom.dimension}.`);
        }
      }

      const uom = await prisma.unitOfMeasure.findUnique({ where: { id: line.uomId } });
      if (!uom) throw new NotFoundError(`UnitOfMeasure [${line.uomId}] not found.`);
      MasterDataLifecycleService.assertIsReferenceable('UnitOfMeasure', uom.id, uom.status);

      if (line.departmentId) {
        const department = await prisma.department.findUnique({ where: { id: line.departmentId } });
        if (!department) throw new NotFoundError(`Department [${line.departmentId}] not found.`);
        MasterDataLifecycleService.assertIsReferenceable('Department', department.id, department.status);
      }
    }
  }

  private mergeDuplicateLines(lines: BomLineInput[]): BomLineInput[] {
    const merged: BomLineInput[] = [];
    const indexByKey = new Map<string, number>();

    for (const line of lines) {
      if (!line.materialId && !line.componentProductId) {
        merged.push(line);
        continue;
      }
      const key = componentKey({
        materialId: line.materialId ?? null,
        componentProductId: line.componentProductId ?? null,
        note: line.note,
      });
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, merged.length);
        merged.push({ ...line });
        continue;
      }

      const existing = merged[existingIndex];
      const existingQty = Number(existing.quantity) || 0;
      const dupQty = Number(line.quantity) || 0;
      const totalQty = Math.round((existingQty + dupQty) * 1000000) / 1000000;

      const existingCost = existing.unitCost != null ? Number(existing.unitCost) * existingQty : 0;
      const dupCost = line.unitCost != null ? Number(line.unitCost) * dupQty : 0;
      const totalCost = existingCost + dupCost;

      let newUnitCost: number | undefined = undefined;
      if (totalQty > 0 && totalCost > 0) {
        newUnitCost = Math.round((totalCost / totalQty) * 10000) / 10000;
      } else if (existing.unitCost != null) {
        newUnitCost = existing.unitCost;
      } else if (line.unitCost != null) {
        newUnitCost = line.unitCost;
      }

      const notes = Array.from(new Set([existing.note?.trim(), line.note?.trim()].filter(Boolean))).join(' · ');

      merged[existingIndex] = {
        ...existing,
        quantity: totalQty,
        unitCost: newUnitCost,
        note: notes || undefined,
      };
    }

    return merged;
  }

  private async generateBomNumber(): Promise<string> {
    return generateSequentialNumber({
      prefix: 'BOM-',
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByBomNumber(candidate),
      padLength: 6
    });
  }
}
