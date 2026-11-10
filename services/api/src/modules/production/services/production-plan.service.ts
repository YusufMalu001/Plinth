import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../../../database';
import { DbPermissionChecker } from '../../../common/rbac/db-permission-checker';
import { getActorCapabilities } from '../../../common/rbac/permission-cache';
import { ConflictError, ForbiddenError, InvalidStateTransitionError, NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { ProductionPlanRepository } from '../repositories/production-plan.repository';
import { DepartmentExecutionService } from './department-execution.service';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { notificationService } from '../../notifications/notification.service';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import { ParallelExecutionService } from './parallel-execution.service';

type PlanInput = {
  scheduleDate: string | Date; productId: string; bomVersionId: string; productVariantId?: string | null;
  quantityUomId?: string; targetLocationId?: string; targetDepartmentId?: string | null; routeId?: string | null;
  quantity: number; bufferQuantity?: number; scheduleType: string; priority?: number; ownerId?: string | null;
  incharge?: string; notes?: string; sourceReferenceType?: string | null; sourceReferenceId?: string | null;
  plannedStartAt?: string | Date | null; plannedEndAt?: string | Date | null;
  saveAsDraft?: boolean;
  submitDraft?: boolean;
};

type InventoryCheckLineInput = {
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  parentItemId?: string;
  uomId: string;
  quantity: number;
  quantityMode?: 'FIXED' | 'SCALED';
  roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
  roundingPrecision?: number | null;
};

type InventoryAvailabilityInput = {
  scheduleDate: string | Date;
  productId: string;
  quantityUomId?: string;
  quantity: number;
  lines: InventoryCheckLineInput[];
};

type InventoryAvailabilityLine = {
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  itemName: string;
  itemCode: string | null;
  uomId: string;
  uomSymbol: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
};

function selectedBomVariantId(note?: string | null): string | undefined {
  return String(note || '').match(/Selected variant:.*?\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i)?.[1];
}

export class ProductionPlanService {
  private readonly departmentExecutionService = new DepartmentExecutionService();
  private readonly parallelExecutionService = new ParallelExecutionService();
  constructor(private readonly repo = new ProductionPlanRepository(), private readonly permissionChecker = new DbPermissionChecker(prisma as PrismaClient)) {}
  private async assertCan(actorId: string, action: string) { if (!(await this.permissionChecker.can(actorId, action, 'ProductionPlan'))) throw new ForbiddenError(); }
  private normalizeDate(value: string | Date) { const raw = typeof value === 'string' ? value.split('T')[0] : value.toISOString().split('T')[0]; return new Date(`${raw}T00:00:00.000Z`); }
  private duplicateScheduleMessage(scheduleDate: Date, scheduleType: string) {
    const dateLabel = scheduleDate.toISOString().slice(0, 10);
    const shiftLabel = scheduleType.replace(/_/g, ' ').toLowerCase();
    return `A production schedule already exists for this product on ${dateLabel} during the ${shiftLabel} shift. Open the existing schedule or choose a different date or shift.`;
  }

  private async getAvailableInventory(itemType: 'MATERIAL' | 'PRODUCT', itemId: string, requestedUomId: string, effectiveDate: Date): Promise<number> {
    const balances = await prisma.$queryRaw<Array<{ uomId: string; quantity: string; reserved: string }>>`
      SELECT "uomId", "quantity"::text, "reserved"::text
      FROM "inventory_balances"
      WHERE "itemType" = ${itemType}
        AND "itemId" = ${itemId}
        AND "condition" = 'AVAILABLE'::"InventoryCondition"
        AND "ownership" = 'COMPANY'::"InventoryOwnership"
    `;
    let available = 0;
    for (const balance of balances) {
      const onHand = Math.max(0, Number(balance.quantity) - Number(balance.reserved));
      if (balance.uomId === requestedUomId) {
        available += onHand;
        continue;
      }
      const direct = await prisma.uomConversion.findFirst({
        where: { fromUomId: balance.uomId, toUomId: requestedUomId, status: 'APPROVED', effectiveDate: { lte: effectiveDate } },
        orderBy: { effectiveDate: 'desc' },
        select: { factor: true },
      });
      if (direct) {
        available += onHand * Number(direct.factor);
        continue;
      }
      const inverse = await prisma.uomConversion.findFirst({
        where: { fromUomId: requestedUomId, toUomId: balance.uomId, status: 'APPROVED', effectiveDate: { lte: effectiveDate } },
        orderBy: { effectiveDate: 'desc' },
        select: { factor: true },
      });
      if (inverse && Number(inverse.factor) > 0) available += onHand / Number(inverse.factor);
    }
    return available;
  }

  private async resolveUomFactor(fromUomId: string, toUomId: string, effectiveDate: Date): Promise<number> {
    if (fromUomId === toUomId) return 1;
    const conversion = await prisma.uomConversion.findFirst({
      where: { fromUomId, toUomId, status: 'APPROVED', effectiveDate: { lte: effectiveDate } },
      orderBy: { effectiveDate: 'desc' },
      select: { factor: true },
    });
    if (!conversion || !(Number(conversion.factor) > 0)) {
      throw new ValidationError(`No approved UOM conversion exists from [${fromUomId}] to [${toUomId}] for the schedule date.`);
    }
    return Number(conversion.factor);
  }

  private applyRequirementRounding(value: number, rule?: InventoryCheckLineInput['roundingRule'], precision?: number | null): number {
    if (!rule || rule === 'NONE') return value;
    const scale = 10 ** (precision ?? 0);
    if (rule === 'ROUND_UP') return Math.ceil(value * scale) / scale;
    if (rule === 'ROUND_DOWN') return Math.floor(value * scale) / scale;
    if (rule === 'ROUND_NEAREST') return Math.round(value * scale) / scale;
    return value;
  }

  private async calculateInventoryAvailability(input: InventoryAvailabilityInput): Promise<InventoryAvailabilityLine[]> {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true, name: true, sku: true, uomId: true } });
    if (!product) throw new NotFoundError(`Product [${input.productId}] not found.`);
    if (!product.uomId) throw new ValidationError('The selected product does not have a base unit of measure.');

    const effectiveDate = this.normalizeDate(input.scheduleDate);
    const requestedUomId = input.quantityUomId || product.uomId;
    const outputFactor = await this.resolveUomFactor(requestedUomId, product.uomId, effectiveDate);
    const normalizedOutputQuantity = Number(input.quantity) * outputFactor;
    const grouped = new Map<string, {
      itemType: 'MATERIAL' | 'PRODUCT';
      itemId: string;
      parentItemId?: string;
      uomId: string;
      requiredQuantity: number;
    }>();

    for (const line of input.lines) {
      if (!line.itemId || !line.uomId || !(Number(line.quantity) > 0)) {
        throw new ValidationError('Every recipe line must reference an inventory item, quantity, and unit of measure.');
      }
      const quantity = line.quantityMode === 'FIXED'
        ? Number(line.quantity)
        : Number(line.quantity) * normalizedOutputQuantity;
      const requiredQuantity = this.applyRequirementRounding(quantity, line.roundingRule, line.roundingPrecision);
      const key = `${line.itemType}:${line.itemId}:${line.uomId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.requiredQuantity += requiredQuantity;
      } else {
        grouped.set(key, {
          itemType: line.itemType,
          itemId: line.itemId,
          parentItemId: line.parentItemId,
          uomId: line.uomId,
          requiredQuantity,
        });
      }
    }

    const requirements = await Promise.all(Array.from(grouped.values()).map(async (group) => {
      let itemName = '';
      let itemCode: string | null = null;
      if (group.itemType === 'MATERIAL') {
        const material = await prisma.material.findUnique({ where: { id: group.itemId }, select: { id: true, name: true, code: true, specs: true } });
        if (!material) throw new ValidationError(`Material [${group.itemId}] is not a valid inventory item.`);
        itemName = material.name;
        itemCode = material.code;
        if (group.parentItemId && group.parentItemId !== group.itemId) {
          const specs = material.specs && typeof material.specs === 'object' ? material.specs as Record<string, unknown> : {};
          if (String(specs.parentMaterialId || '') !== group.parentItemId) {
            throw new ValidationError(`Material variant [${group.itemId}] does not belong to [${group.parentItemId}].`);
          }
        }
      } else {
        const productItem = await prisma.product.findUnique({ where: { id: group.itemId }, select: { id: true, name: true, sku: true } });
        if (productItem) {
          itemName = productItem.name;
          itemCode = productItem.sku;
          if (group.parentItemId && group.parentItemId !== group.itemId) {
            const metadata = await prisma.product.findUnique({ where: { id: group.itemId }, select: { metadata: true } });
            const productMetadata = metadata?.metadata && typeof metadata.metadata === 'object' ? metadata.metadata as Record<string, unknown> : {};
            if (String(productMetadata.parentProductId || '') !== group.parentItemId) {
              throw new ValidationError(`Product variant [${group.itemId}] does not belong to [${group.parentItemId}].`);
            }
          }
        } else {
          const variant = await prisma.productVariant.findUnique({ where: { id: group.itemId }, include: { product: { select: { id: true } } } });
          if (!variant) throw new ValidationError(`Product [${group.itemId}] is not a valid inventory item.`);
          if (group.parentItemId && variant.productId !== group.parentItemId) {
            throw new ValidationError(`Product variant [${group.itemId}] does not belong to [${group.parentItemId}].`);
          }
          itemName = variant.name;
          itemCode = variant.sku;
        }
      }

      const uom = await prisma.unitOfMeasure.findUnique({ where: { id: group.uomId }, select: { symbol: true, code: true, name: true } });
      if (!uom) throw new ValidationError(`Unit of measure [${group.uomId}] is not valid.`);
      const availableQuantity = await this.getAvailableInventory(group.itemType, group.itemId, group.uomId, effectiveDate);
      return {
        itemType: group.itemType,
        itemId: group.itemId,
        itemName,
        itemCode,
        uomId: group.uomId,
        uomSymbol: uom.symbol || uom.code || uom.name,
        requiredQuantity: group.requiredQuantity,
        availableQuantity,
        shortageQuantity: Math.max(0, group.requiredQuantity - availableQuantity),
      };
    }));

    return requirements.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }

  private getBomInventoryCheckLines(lines: Array<any>): InventoryCheckLineInput[] {
    return lines.map((line) => {
      const itemType = line.materialId ? 'MATERIAL' : 'PRODUCT';
      const parentItemId = line.materialId || line.componentProductId || '';
      if (!parentItemId) throw new ValidationError('A BOM line is missing its material or component product reference.');
      const variantMarker = String(line.note || '').split(/\s*·\s*/).find((part: string) => /^Selected variant:/i.test(part.trim()));
      const variantId = selectedBomVariantId(line.note);
      if (variantMarker && !variantId) {
        throw new ValidationError(`BOM line for ${line.material?.name || line.componentProduct?.name || parentItemId} names a variant without a saved inventory item ID.`);
      }
      return {
        itemType,
        itemId: variantId || parentItemId,
        parentItemId: variantId ? parentItemId : undefined,
        uomId: line.uomId,
        quantity: Number(line.quantity),
        quantityMode: line.quantityMode === 'FIXED' ? 'FIXED' : 'SCALED',
        roundingRule: line.roundingRule || 'NONE',
        roundingPrecision: line.roundingPrecision ?? null,
      };
    });
  }

  private async calculateBomLineAvailability(input: InventoryAvailabilityInput, bomLines: Array<any>) {
    const groupedAvailability = await this.calculateInventoryAvailability(input);
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { uomId: true } });
    if (!product?.uomId) throw new ValidationError('The selected product does not have a base unit of measure.');
    const effectiveDate = this.normalizeDate(input.scheduleDate);
    const outputFactor = await this.resolveUomFactor(input.quantityUomId || product.uomId, product.uomId, effectiveDate);
    const outputQuantity = Number(input.quantity) * outputFactor;
    const availabilityByKey = new Map(groupedAvailability.map((line) => [
      `${line.itemType}:${line.itemId}:${line.uomId}`,
      line,
    ]));

    return bomLines.map((bomLine) => {
      const line = this.getBomInventoryCheckLines([bomLine])[0];
      const requiredQuantity = this.applyRequirementRounding(
        line.quantityMode === 'FIXED' ? line.quantity : line.quantity * outputQuantity,
        line.roundingRule,
        line.roundingPrecision,
      );
      const key = `${line.itemType}:${line.itemId}:${line.uomId}`;
      const grouped = availabilityByKey.get(key);
      if (!grouped) throw new ValidationError(`Inventory availability could not be resolved for BOM item [${line.itemId}].`);
      const availableQuantity = grouped.requiredQuantity > 0
        ? grouped.availableQuantity * (requiredQuantity / grouped.requiredQuantity)
        : 0;
      return {
        bomLineId: bomLine.id,
        itemType: grouped.itemType,
        itemId: grouped.itemId,
        itemName: grouped.itemName,
        itemCode: grouped.itemCode,
        uomId: grouped.uomId,
        requiredQuantity,
        availableQuantity,
        shortageQuantity: Math.max(0, requiredQuantity - availableQuantity),
      };
    });
  }

  private async assertInventoryAvailable(input: InventoryAvailabilityInput): Promise<InventoryAvailabilityLine[]> {
    const requirements = await this.calculateInventoryAvailability(input);
    if (!requirements.length) throw new ValidationError('The selected BOM does not contain any inventory requirements.');
    const shortages = requirements.filter((line) => line.shortageQuantity > 0.000001);
    if (shortages.length) {
      const detail = shortages.map((line) => `${line.itemName}: need ${line.requiredQuantity} ${line.uomSymbol}, available ${line.availableQuantity} ${line.uomSymbol}`).join('; ');
      throw new ValidationError(`Insufficient inventory for this production schedule. ${detail}`);
    }
    return requirements;
  }

  async checkAvailability(input: InventoryAvailabilityInput, actorId: string) {
    const [canCreate, canUpdate] = await Promise.all([
      this.permissionChecker.can(actorId, 'create', 'ProductionPlan'),
      this.permissionChecker.can(actorId, 'update', 'ProductionPlan'),
    ]);
    if (!canCreate && !canUpdate) throw new ForbiddenError();
    const requirements = await this.calculateInventoryAvailability(input);
    if (!requirements.length) throw new ValidationError('Add at least one valid BOM line before checking inventory.');
    return {
      canCreate: requirements.every((line) => line.shortageQuantity <= 0.000001),
      requirements,
    };
  }

  /** Location remains an internal ledger compatibility key; users operate one inventory. */
  private async resolveInternalLocation(locationId?: string) {
    if (locationId) return locationId;
    const location = await prisma.warehouseLocation.findFirst({
      where: { status: 'ACTIVE', childLocations: { none: {} } },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      select: { id: true },
    });
    if (!location) throw new ValidationError('No active inventory location is configured.');
    return location.id;
  }

  private async notifyPlanEvent(input: {
    event: 'created' | 'updated' | 'approved' | 'released';
    plan: any;
    actorId: string;
  }): Promise<void> {
    const { event, plan, actorId } = input;
    const planLabel = plan.planNumber || plan.id;
    const productLabel = plan.product?.name || 'the selected product';
    const messages = {
      created: {
        title: plan.status === 'PENDING_APPROVAL'
          ? `Production schedule ${planLabel} needs approval`
          : plan.status === 'APPROVED'
            ? `Production schedule ${planLabel} is ready for release`
            : `Production schedule ${planLabel} was saved as a draft`,
        message: plan.status === 'PENDING_APPROVAL'
          ? `${productLabel} was created and is awaiting Admin approval.`
          : plan.status === 'APPROVED'
            ? `${productLabel} was approved when created and is ready for release to the floor.`
            : `${productLabel} was saved as a draft and has not entered the approval workflow.`,
      },
      updated: {
        title: `Production schedule ${planLabel} was updated`,
        message: plan.status === 'APPROVED'
          ? `${productLabel} was updated and remains approved, awaiting release to the floor.`
          : `${productLabel} was updated and returned to the Admin approval queue.`,
      },
      approved: {
        title: `Production schedule ${planLabel} was approved`,
        message: `${productLabel} was approved and is waiting for an Admin to release it to the floor.`,
      },
      released: {
        title: `Production schedule ${planLabel} was released to the floor`,
        message: `${productLabel} is released to the floor and ready for department execution.`,
      },
    }[event];

    // Notification delivery must never roll back a valid business transaction.
    // The notification service persists each message and dispatches it to
    // online users when possible.
    try {
      const promises: Promise<any>[] = [
        notificationService.notifyRoles({
          roles: ['admin', 'super-admin'],
          title: messages.title,
          message: messages.message,
          resource: 'ProductionPlan',
          resourceId: plan.id,
          href: `/production/planning/${plan.id}`,
          excludeUserIds: event === 'approved' || event === 'released' ? [actorId] : [],
          dedupeKeyPrefix: `PLAN_EVENT:${plan.id}:${event}:ROLES`,
        }),
        notificationService.notifyUsers({
          recipientIds: [...new Set([actorId, plan.createdByActorId].filter(Boolean))],
          title: ['approved', 'released'].includes(event) ? messages.title : `Production schedule ${planLabel} ${event}`,
          message: messages.message,
          resource: 'ProductionPlan',
          resourceId: plan.id,
          href: `/production/planning/${plan.id}`,
          dedupeKeyPrefix: `PLAN_EVENT:${plan.id}:${event}:CREATOR`,
        }),
      ];

      await Promise.all(promises);
    } catch {
      // The state change and plan event are authoritative. A failed delivery
      // can be retried by an outbox/reconciliation worker without hiding the
      // successful schedule operation from the caller.
    }
  }

  private async getRequired(data: PlanInput, scheduleDate: Date) {
    const [product, bom, location] = await Promise.all([
      prisma.product.findUnique({ where: { id: data.productId } }),
      prisma.bomVersion.findUnique({ where: { id: data.bomVersionId }, include: { lines: true } }),
      data.targetLocationId ? prisma.warehouseLocation.findUnique({ where: { id: data.targetLocationId }, include: { childLocations: { select: { id: true } } } }) : Promise.resolve(null)
    ]);
    if (!product || !['APPROVED', 'ACTIVE'].includes(product.status)) throw new ValidationError('Approved or active product required.');

    let effectiveBom = bom;

    if (effectiveBom && effectiveBom.productId === data.productId && effectiveBom.status !== 'APPROVED') {
      const now = new Date();
      await prisma.bomVersion.update({
        where: { id: effectiveBom.id },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          effectiveDate: effectiveBom.effectiveDate || now,
        },
      });
      effectiveBom.status = 'APPROVED';
      if (!effectiveBom.approvedAt) effectiveBom.approvedAt = now;
      if (!effectiveBom.effectiveDate) effectiveBom.effectiveDate = now;
    }

    // If no BOM provided, or still not approved, auto-bind to the latest approved BOM for this product
    if ((!effectiveBom || effectiveBom.status !== 'APPROVED') && data.productId) {
      const autoBom = await prisma.bomVersion.findFirst({
        where: {
          productId: data.productId,
          status: 'APPROVED',
          effectiveDate: { lte: scheduleDate },
        },
        include: { lines: true },
        orderBy: { version: 'desc' },
      });
      if (autoBom) {
        data.bomVersionId = autoBom.id;
        effectiveBom = autoBom;
      }
    }

    // If an approved template BOM was supplied but belongs to another product or model variant,
    // auto-bind to an existing approved BOM for this product or clone the template BOM as an approved BOM for it.
    if (effectiveBom && effectiveBom.productId !== data.productId && effectiveBom.status === 'APPROVED') {
      let productBom = await prisma.bomVersion.findFirst({
        where: {
          productId: data.productId,
          status: 'APPROVED',
          effectiveDate: { lte: scheduleDate },
        },
        include: { lines: true },
        orderBy: { version: 'desc' },
      });

      if (!productBom) {
        const maxVersion = await prisma.bomVersion.aggregate({
          where: { productId: data.productId, variantScopeKey: 'DEFAULT' },
          _max: { version: true },
        });
        const nextVersion = (maxVersion._max.version ?? 0) + 1;
        const now = new Date();
        productBom = await prisma.bomVersion.create({
          data: {
            bomNumber: `${product.sku || 'BOM'}-REV${String(nextVersion).padStart(2, '0')}`,
            productId: data.productId,
            variantScopeKey: 'DEFAULT',
            version: nextVersion,
            status: 'APPROVED',
            effectiveDate: now,
            approvedAt: now,
            createdByActorId: effectiveBom.createdByActorId || 'system',
            approvedByActorId: effectiveBom.approvedByActorId || 'system',
            lines: {
              create: effectiveBom.lines.map((l, idx) => ({
                lineType: l.lineType,
                materialId: l.materialId,
                componentProductId: l.componentProductId,
                uomId: l.uomId,
                quantityMode: l.quantityMode,
                quantity: l.quantity,
                roundingRule: l.roundingRule,
                sequence: l.sequence ?? idx + 1,
                note: l.note,
              })),
            },
          },
          include: { lines: true },
        });
      }

      data.bomVersionId = productBom.id;
      effectiveBom = productBom;
    }

    // Effective dates are business dates, not time-of-day timestamps. A BOM
    // approved on or before the schedule date is usable. If effectiveDate is omitted,
    // fallback to approvedAt or createdAt.
    const effectiveDateRaw = effectiveBom?.effectiveDate || effectiveBom?.approvedAt || effectiveBom?.createdAt;
    const effectiveDate = effectiveDateRaw ? this.normalizeDate(effectiveDateRaw) : null;
    if (!effectiveBom || effectiveBom.productId !== data.productId || effectiveBom.status !== 'APPROVED' || !effectiveDate || effectiveDate > scheduleDate) {
      throw new ValidationError('An effective approved BOM for this product is required.');
    }
    if (data.productVariantId && bom?.productVariantId && bom.productVariantId !== data.productVariantId) throw new ValidationError('The selected BOM does not match the selected product variant.');
    if (data.targetLocationId && (!location || location.status !== 'ACTIVE' || location.childLocations.length > 0)) throw new ValidationError('The internal inventory location is not active.');
    if (data.targetDepartmentId) {
      const department = await prisma.department.findUnique({ where: { id: data.targetDepartmentId } });
      if (!department) throw new ValidationError('A valid target department is required.');
    }
    if (data.quantityUomId && data.quantityUomId !== product.uomId) {
      const conversion = await prisma.uomConversion.findFirst({ where: { fromUomId: data.quantityUomId, toUomId: product.uomId, status: 'APPROVED', effectiveDate: { lte: scheduleDate } }, orderBy: { effectiveDate: 'desc' } });
      if (!conversion) throw new ValidationError('No approved conversion exists from the requested quantity UOM to the product UOM.');
    }
    if (data.routeId) {
      const route = await prisma.productRoute.findUnique({ where: { id: data.routeId } });
      if (!route || (route.productId && route.productId !== data.productId) || !['APPROVED', 'ACTIVE'].includes(route.status)) throw new ValidationError('Approved or active routing for this product is required.');
    }
    return { product, bom, location };
  }

  private async assertPlanInventoryAvailable(data: PlanInput, scheduleDate: Date): Promise<void> {
    const { product } = await this.getRequired(data, scheduleDate);
    const bom = await prisma.bomVersion.findUnique({
      where: { id: data.bomVersionId },
      include: {
        lines: {
          include: { material: { select: { name: true } }, componentProduct: { select: { name: true } } },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!bom) throw new ValidationError('An effective approved BOM for this product is required.');
    await this.assertInventoryAvailable({
      scheduleDate,
      productId: data.productId,
      quantityUomId: data.quantityUomId || product.uomId,
      quantity: Number(data.quantity),
      lines: this.getBomInventoryCheckLines(bom.lines),
    });
  }

  async list(params: { page?: number | string; limit?: number | string; search?: string; status?: string; scheduleType?: string; productId?: string; scheduleDateFrom?: string; scheduleDateTo?: string }) {
    const page = Math.max(1, Number(params.page ?? 1)); const take = Math.min(100, Math.max(1, Number(params.limit ?? 20))); const where: Record<string, any> = {};
    if (params.status) where.status = params.status; if (params.scheduleType) where.scheduleType = params.scheduleType; if (params.productId) where.productId = params.productId;
    if (params.scheduleDateFrom || params.scheduleDateTo) where.scheduleDate = { ...(params.scheduleDateFrom ? { gte: new Date(params.scheduleDateFrom) } : {}), ...(params.scheduleDateTo ? { lte: new Date(params.scheduleDateTo) } : {}) };
    if (params.search) where.OR = [
      { planNumber: { contains: params.search, mode: 'insensitive' } },
      { incharge: { contains: params.search, mode: 'insensitive' } },
      { notes: { contains: params.search, mode: 'insensitive' } },
      { product: { name: { contains: params.search, mode: 'insensitive' } } },
      { product: { sku: { contains: params.search, mode: 'insensitive' } } },
    ];
    return this.repo.list(where, (page - 1) * take, take).then((result) => ({ ...result, page, limit: take }));
  }
  async getById(id: string) {
    const plan: any = await this.repo.findById(id);
    if (!plan) throw new NotFoundError('Plan not found.');
    // Department is stored as a scoped reference (rather than a Prisma
    // relation) so resolve it for schedule screens and the printable sheet.
    if (plan.targetDepartmentId) {
      plan.targetDepartment = await prisma.department.findUnique({ where: { id: plan.targetDepartmentId }, select: { id: true, code: true, name: true } });
    }
    // Auto-resolve route if missing on the plan record
    if ((!plan.route || !plan.routeId) && plan.productId) {
      const matchingRoute = await prisma.productRoute.findFirst({
        where: {
          productId: plan.productId,
          status: { in: ['APPROVED', 'ACTIVE'] }
        },
        include: {
          steps: {
            orderBy: { sequenceNumber: 'asc' },
            include: { department: true, workCenter: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (matchingRoute) {
        plan.route = matchingRoute;
        plan.routeId = matchingRoute.id;
        await prisma.productionPlan.update({
          where: { id: plan.id },
          data: { routeId: matchingRoute.id }
        }).catch(() => {});
      }
    }
    if (Array.isArray(plan.materialSnapshot?.shortages) && plan.materialSnapshot.shortages.length > 0) {
      const bomLines = plan.bomVersion?.lines ?? [];
      plan.materialSnapshot.shortages = await Promise.all(plan.materialSnapshot.shortages.map(async (s: any) => {
        if (s.item && !s.item.startsWith('MATERIAL · ') && !s.item.startsWith('PRODUCT · ') && s.itemCode) {
          return s;
        }
        const matched = bomLines.find((l: any) => (l.materialId && l.materialId === s.itemId) || (l.componentProductId && l.componentProductId === s.itemId) || (l.id && l.id === s.bomLineId));
        let itemName = matched?.material?.name || matched?.componentProduct?.name || (matched?.note ? matched.note.split(' — ')[0] : null);
        let itemCode = matched?.material?.code || matched?.componentProduct?.sku || s.itemCode || null;
        if (!itemName && s.itemId) {
          if (s.itemType === 'MATERIAL') {
            const mat = await prisma.material.findUnique({ where: { id: s.itemId }, select: { name: true, code: true } });
            if (mat) { itemName = mat.name; itemCode = mat.code; }
          } else {
            const prod = await prisma.product.findUnique({ where: { id: s.itemId }, select: { name: true, sku: true } });
            if (prod) { itemName = prod.name; itemCode = prod.sku; }
          }
        }
        itemName = itemName || s.item || `${s.itemType || 'MATERIAL'} · ${s.itemId}`;
        return {
          ...s,
          item: itemName,
          itemName,
          itemCode
        };
      }));
    }
    return plan;
  }
  async getDetailById(id: string) {
    const plan: any = await this.getById(id);
    plan.executionBatches = await this.repo.findExecutionBatchesByPlanId(id);
    return plan;
  }
  async getRequirements(id: string) { const plan: any = await this.getById(id); return plan.requirements ?? []; }
  async getInventoryMovements(id: string) {
    await this.getById(id);
    return prisma.$queryRaw<any[]>`SELECT * FROM "inventory_ledger_entries" WHERE "sourceId" = ${id} OR ("sourceType" IN ('PRODUCTION_MATERIAL_ISSUE','PRODUCTION_MATERIAL_ISSUE_REVERSAL','PRODUCTION_OUTPUT') AND "sourceId" IN (SELECT "id" FROM "production_material_issues" WHERE "productionPlanId" = ${id} UNION SELECT "id" FROM "production_outputs" WHERE "productionPlanId" = ${id})) ORDER BY "postedAt" DESC`;
  }

  async create(data: PlanInput, actorId: string, correlationId?: string) {
    await this.assertCan(actorId, 'create'); if (!(Number(data.quantity) > 0)) throw new ValidationError('Target quantity must be greater than 0.');
    const capabilities = await getActorCapabilities(prisma as PrismaClient, actorId);
    const saveAsDraft = data.saveAsDraft === true;
    const scheduleDate = this.normalizeDate(data.scheduleDate); const scheduleType = (data.scheduleType || 'DAY').trim().toUpperCase();
    data.targetLocationId = await this.resolveInternalLocation(data.targetLocationId);
    if (!data.routeId && data.productId) {
      const autoRoute = await prisma.productRoute.findFirst({
        where: {
          productId: data.productId,
          bomVersionId: data.bomVersionId,
          status: { in: ['APPROVED', 'ACTIVE'] },
          graphReviewedAt: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (autoRoute) {
        data.routeId = autoRoute.id;
      }
    }
    if (capabilities.admin && !saveAsDraft) {
      const route = data.routeId ? await prisma.productRoute.findUnique({ where: { id: data.routeId } }) : null;
      if (!route?.graphReviewedAt || !['APPROVED', 'ACTIVE'].includes(route.status) || route.bomVersionId !== data.bomVersionId || route.productId !== data.productId) {
        throw new ValidationError('Select a reviewed branch route mapped to the approved BOM before creating this schedule.');
      }
    }
    if (saveAsDraft && data.routeId) {
      const route = await prisma.productRoute.findUnique({ where: { id: data.routeId } });
      if (!route?.graphReviewedAt || !['APPROVED', 'ACTIVE'].includes(route.status) || route.bomVersionId !== data.bomVersionId || route.productId !== data.productId) {
        throw new ValidationError('The draft route must match its selected product and BOM.');
      }
    }
    if (saveAsDraft) await this.getRequired(data, scheduleDate);
    else await this.assertPlanInventoryAvailable(data, scheduleDate);
    const year = scheduleDate.getUTCFullYear();
    const initialStatus = saveAsDraft ? 'DRAFT' : capabilities.admin ? 'APPROVED' : 'PENDING_APPROVAL';
    let created: { id: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        const count = await tx.productionPlan.count({ where: { planNumber: { startsWith: `PLAN-${year}-` } } });
        const planNumber = `PLAN-${year}-${String(count + 1).padStart(4, '0')}`;
        const product = await tx.product.findUniqueOrThrow({ where: { id: data.productId }, select: { uomId: true } });
        const plan = await tx.productionPlan.create({ data: { planNumber, scheduleDate, productId: data.productId, bomVersionId: data.bomVersionId, routeId: data.routeId ?? null, quantityUomId: data.quantityUomId ?? product.uomId, targetLocationId: data.targetLocationId, targetDepartmentId: data.targetDepartmentId ?? null, sourceReferenceType: data.sourceReferenceType ?? null, sourceReferenceId: data.sourceReferenceId ?? null, plannedStartAt: data.plannedStartAt ? new Date(data.plannedStartAt) : null, plannedEndAt: data.plannedEndAt ? new Date(data.plannedEndAt) : null, ownerId: data.ownerId ?? null, scheduleType, quantity: Number(data.quantity), bufferQuantity: Number(data.bufferQuantity ?? 0), priority: Number(data.priority ?? 0), incharge: data.incharge?.trim() || null, notes: data.notes?.trim() || null, status: initialStatus, createdByActorId: actorId }, include: { product: true, bomVersion: { include: { lines: true } }, targetLocation: true } });
        const planEvent = await tx.productionPlanEvent.create({ data: { productionPlanId: plan.id, eventType: 'CREATED', actorId } });
        await publishIntelligenceEvent(tx as unknown as Parameters<typeof publishIntelligenceEvent>[0], { type: 'PRODUCTION_PLANNED', entityType: 'ProductionPlan', entityId: plan.id, correlationId, occurredAt: plan.createdAt, transitionId: planEvent.id, metadata: { status: plan.status, productId: plan.productId, quantity: Number(plan.quantity) } });
        return plan;
      });
    } catch (error: unknown) {
      const err = error as { code?: string; meta?: { target?: string | string[] } };
      if (err?.code === 'P2002' && String(err?.meta?.target).includes('planNumber')) {
        const count = await prisma.productionPlan.count();
        const fallbackPlanNumber = `PLAN-${year}-${String(count + 1).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
        const product = await prisma.product.findUniqueOrThrow({ where: { id: data.productId }, select: { uomId: true } });
        created = await prisma.productionPlan.create({
          data: {
            planNumber: fallbackPlanNumber,
            scheduleDate,
            productId: data.productId,
            bomVersionId: data.bomVersionId,
            routeId: data.routeId ?? null,
            quantityUomId: data.quantityUomId ?? product.uomId,
            targetLocationId: data.targetLocationId,
            targetDepartmentId: data.targetDepartmentId ?? null,
            sourceReferenceType: data.sourceReferenceType ?? null,
            sourceReferenceId: data.sourceReferenceId ?? null,
            plannedStartAt: data.plannedStartAt ? new Date(data.plannedStartAt) : null,
            plannedEndAt: data.plannedEndAt ? new Date(data.plannedEndAt) : null,
            ownerId: data.ownerId ?? null,
            scheduleType,
            quantity: Number(data.quantity),
            bufferQuantity: Number(data.bufferQuantity ?? 0),
            priority: Number(data.priority ?? 0),
            incharge: data.incharge || null,
            notes: data.notes || null,
            status: initialStatus,
            createdByActorId: actorId,
          },
          include: { product: true, bomVersion: true, route: true, targetLocation: true },
        });
      } else {
        throw error;
      }
    }
    if (saveAsDraft) {
      const draft = await this.getById(created.id);
      await this.notifyPlanEvent({ event: 'created', plan: draft, actorId });
      return draft;
    }
    const checked = await this.check(created.id, actorId);
    const shortages = (checked as { materialSnapshot?: { shortages?: unknown[] } })?.materialSnapshot?.shortages ?? [];
    if (shortages.length > 0) {
      await prisma.productionPlan.delete({ where: { id: created.id } }).catch(() => {});
      throw new ValidationError('Material shortage exists. Production schedule cannot be created until all material shortages are resolved.');
    }
    await this.notifyPlanEvent({ event: 'created', plan: checked, actorId });
    return checked;
  }

  async update(id: string, data: Partial<PlanInput>, actorId: string, correlationId?: string) {
    await this.assertCan(actorId, 'update');
    const existing: any = await this.getById(id);
    const editableStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];
    if (!editableStatuses.includes(existing.status)) {
      throw new InvalidStateTransitionError(`Cannot edit a plan in status ${existing.status}. Only pending approval or approved plans can be edited.`);
    }
    if (existing.status === 'APPROVED') {
      const capabilities = await getActorCapabilities(prisma as PrismaClient, actorId);
      if (!capabilities.admin) throw new ForbiddenError('Only an Admin can edit an approved production schedule.');
      if ((existing.requirements ?? []).some((requirement: any) => Number(requirement.issuedQuantity ?? 0) > 0)) {
        throw new InvalidStateTransitionError('This approved schedule already has issued material and can no longer be edited.');
      }
    }
    const scheduleDate = data.scheduleDate ? this.normalizeDate(data.scheduleDate) : existing.scheduleDate;
    const submitDraft = existing.status === 'DRAFT' && data.submitDraft === true;
    const scheduleType = data.scheduleType ? data.scheduleType.trim().toUpperCase() : existing.scheduleType;
    const mergedData: PlanInput = {
      scheduleDate,
      productId: data.productId || existing.productId,
      bomVersionId: data.bomVersionId || existing.bomVersionId,
      productVariantId: data.productVariantId !== undefined ? data.productVariantId : existing.productVariantId,
      quantityUomId: data.quantityUomId || existing.quantityUomId,
      targetLocationId: data.targetLocationId || existing.targetLocationId,
      targetDepartmentId: data.targetDepartmentId !== undefined ? data.targetDepartmentId : existing.targetDepartmentId,
      routeId: data.routeId !== undefined ? data.routeId : existing.routeId,
      quantity: data.quantity !== undefined ? Number(data.quantity) : Number(existing.quantity),
      bufferQuantity: data.bufferQuantity !== undefined ? Number(data.bufferQuantity) : Number(existing.bufferQuantity ?? 0),
      scheduleType,
      priority: data.priority !== undefined ? Number(data.priority) : Number(existing.priority ?? 0),
      ownerId: data.ownerId !== undefined ? data.ownerId : existing.ownerId,
      incharge: data.incharge !== undefined ? data.incharge?.trim() : existing.incharge,
      notes: data.notes !== undefined ? data.notes?.trim() : existing.notes,
      sourceReferenceType: data.sourceReferenceType !== undefined ? data.sourceReferenceType : existing.sourceReferenceType,
      sourceReferenceId: data.sourceReferenceId !== undefined ? data.sourceReferenceId : existing.sourceReferenceId,
      plannedStartAt: data.plannedStartAt !== undefined ? data.plannedStartAt : existing.plannedStartAt,
      plannedEndAt: data.plannedEndAt !== undefined ? data.plannedEndAt : existing.plannedEndAt,
    };

    if (!(mergedData.quantity > 0)) throw new ValidationError('Target quantity must be greater than 0.');
    if (existing.status === 'APPROVED') {
      const { product } = await this.getRequired(mergedData, scheduleDate);
      const bom = await prisma.bomVersion.findUnique({
        where: { id: mergedData.bomVersionId },
        include: { lines: { orderBy: { sequence: 'asc' } } },
      });
      if (!bom) throw new ValidationError('An effective approved BOM for this product is required.');
      const availability = await this.calculateInventoryAvailability({
        scheduleDate,
        productId: mergedData.productId,
        quantityUomId: mergedData.quantityUomId || product.uomId,
        quantity: Number(mergedData.quantity),
        lines: this.getBomInventoryCheckLines(bom.lines),
      });
      const reservedByItem = new Map<string, number>();
      for (const requirement of existing.requirements ?? []) {
        const key = `${requirement.itemType}:${requirement.itemId}:${requirement.inventoryUomId}`;
        reservedByItem.set(key, (reservedByItem.get(key) ?? 0) + Number(requirement.reservedQuantity ?? 0));
      }
      const shortages = availability.filter((line) => {
        const key = `${line.itemType}:${line.itemId}:${line.uomId}`;
        return line.requiredQuantity > line.availableQuantity + (reservedByItem.get(key) ?? 0) + 0.000001;
      });
      if (shortages.length) {
        const detail = shortages.map((line) => `${line.itemName}: need ${line.requiredQuantity} ${line.uomSymbol}, available ${line.availableQuantity + (reservedByItem.get(`${line.itemType}:${line.itemId}:${line.uomId}`) ?? 0)} ${line.uomSymbol}`).join('; ');
        throw new ValidationError(`Insufficient inventory for this approved schedule edit. ${detail}`);
      }
    } else if (existing.status !== 'DRAFT' || submitDraft) {
      await this.assertPlanInventoryAvailable(mergedData, scheduleDate);
    } else {
      await this.getRequired(mergedData, scheduleDate);
      if (mergedData.routeId) {
        const route = await prisma.productRoute.findUnique({ where: { id: mergedData.routeId } });
        if (!route?.graphReviewedAt || !['APPROVED', 'ACTIVE'].includes(route.status) || route.bomVersionId !== mergedData.bomVersionId || route.productId !== mergedData.productId) {
          throw new ValidationError('The draft route must match its selected product and BOM.');
        }
      }
    }
    if (submitDraft) {
      const capabilities = await getActorCapabilities(prisma as PrismaClient, actorId);
      const route = mergedData.routeId ? await prisma.productRoute.findUnique({ where: { id: mergedData.routeId } }) : null;
      if (capabilities.admin && (!route?.graphReviewedAt || route.bomVersionId !== mergedData.bomVersionId || route.productId !== mergedData.productId)) {
        throw new ValidationError('Select a reviewed branch route mapped to the approved BOM before submitting this draft.');
      }
    }

    const updatePayload: Record<string, unknown> = {
      scheduleDate,
      scheduleType,
      productId: mergedData.productId,
      bomVersionId: mergedData.bomVersionId,
      routeId: mergedData.routeId ?? null,
      targetLocationId: mergedData.targetLocationId,
      targetDepartmentId: mergedData.targetDepartmentId ?? null,
      quantity: mergedData.quantity,
      bufferQuantity: mergedData.bufferQuantity ?? 0,
      priority: mergedData.priority ?? 0,
      incharge: mergedData.incharge || null,
      notes: mergedData.notes || null,
      sourceReferenceType: mergedData.sourceReferenceType ?? null,
      sourceReferenceId: mergedData.sourceReferenceId ?? null,
      plannedStartAt: mergedData.plannedStartAt ? new Date(mergedData.plannedStartAt) : null,
      plannedEndAt: mergedData.plannedEndAt ? new Date(mergedData.plannedEndAt) : null,
      status: existing.status === 'APPROVED' ? 'APPROVED' : existing.status === 'DRAFT' && !submitDraft ? 'DRAFT' : 'PENDING_APPROVAL',
      materialSnapshot: null,
      requirementSnapshot: null,
    };

    try {
      await prisma.$transaction(async (tx) => {
        if (existing.status === 'APPROVED') {
          for (const requirement of existing.requirements ?? []) {
            const reserved = Number(requirement.reservedQuantity ?? 0) - Number(requirement.issuedQuantity ?? 0);
            if (reserved <= 0) continue;
            await inventoryPostingService.post(tx, {
              itemType: requirement.itemType,
              itemId: requirement.itemId,
              uomId: requirement.inventoryUomId,
              locationId: requirement.locationId,
              movementType: 'RELEASE',
              quantity: reserved,
              sourceType: 'PRODUCTION_PLAN_EDIT',
              sourceId: id,
              idempotencyKey: `PRODUCTION_EDIT_RELEASE:${id}:${requirement.id}:${existing.updatedAt.toISOString()}`,
              actorId,
              correlationId: correlationId ?? id,
            });
          }
        }
        const updateResult = await (tx.productionPlan as any).updateMany({ where: { id, status: existing.status }, data: updatePayload });
        if (!updateResult.count) throw new InvalidStateTransitionError('The plan changed while it was being edited; refresh and retry.');
        const nextStatus = existing.status === 'APPROVED' ? 'APPROVED' : existing.status === 'DRAFT' && !submitDraft ? 'DRAFT' : 'PENDING_APPROVAL';
        const planEvent = await tx.productionPlanEvent.create({ data: { productionPlanId: id, eventType: 'MODIFIED', fromStatus: existing.status, toStatus: nextStatus, actorId, payload: { updatedFields: Object.keys(data) } } });
        await publishIntelligenceEvent(tx as any, { type: 'PRODUCTION_QUANTITY_CHANGED', entityType: 'ProductionPlan', entityId: id, correlationId, occurredAt: new Date(), transitionId: planEvent.id, metadata: { status: nextStatus, quantity: mergedData.quantity, productId: mergedData.productId } });
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && String(error?.meta?.target).includes('scheduleDate')) {
        throw new ConflictError(this.duplicateScheduleMessage(scheduleDate, scheduleType));
      }
      throw error;
    }

    if (existing.status === 'DRAFT' && !submitDraft) return this.getById(id);

    const checked: any = await this.check(id, actorId);
    if (existing.status === 'APPROVED') {
      if ((checked.materialSnapshot?.shortages ?? []).length) {
        throw new ValidationError('The edited schedule now has a material shortage and cannot remain approved.');
      }
      await this.notifyPlanEvent({ event: 'updated', plan: checked, actorId });
      return checked;
    }

    const pending = await this.queueForApproval(id, actorId, correlationId);
    await this.notifyPlanEvent({ event: 'updated', plan: pending, actorId });
    return pending;
  }

  private async transition(id: string, actorId: string, from: string[], to: any, action: string, eventType: any, data: Record<string, unknown> = {}, correlationId?: string) {
    await this.assertCan(actorId, action); const plan: any = await this.getById(id); if (!from.includes(plan.status)) throw new InvalidStateTransitionError(`Plan must be ${from.join(' or ')}.`);
    await prisma.$transaction(async (tx) => {
      if (!(await this.repo.updateConditional(id, from, { status: to, ...data }, tx))) throw new InvalidStateTransitionError('The plan was modified concurrently; refresh and retry.');
      const planEvent = await this.repo.createEvent({ productionPlanId: id, eventType, fromStatus: plan.status, toStatus: to, actorId }, tx);
      const type = to === 'CANCELLED' ? 'PRODUCTION_CANCELLED'
        : to === 'COMPLETED' ? 'PRODUCTION_COMPLETED'
          : to === 'IN_PROGRESS' ? 'PRODUCTION_STARTED'
            : data.quantity !== undefined || data.partialQuantity !== undefined ? 'PRODUCTION_QUANTITY_CHANGED' : null;
      if (type) await publishIntelligenceEvent(tx as any, { type, entityType: 'ProductionPlan', entityId: id, correlationId, transitionId: planEvent.id, metadata: { fromStatus: plan.status, status: to, productId: plan.productId, quantity: Number(data.partialQuantity ?? data.quantity ?? plan.quantity) } });
    });
    return this.getById(id);
  }

  private async queueForApproval(id: string, actorId: string, correlationId?: string) {
    const plan: any = await this.getById(id);
    if (plan.status === 'PENDING_APPROVAL') return plan;
    return this.transition(id, actorId, ['CHECKED', 'DRAFT'], 'PENDING_APPROVAL', 'update', 'SUBMITTED', {}, correlationId);
  }

  async check(id: string, actorId: string) {
    await this.assertCan(actorId, 'update'); const plan: any = await this.getById(id); if (!['PENDING_APPROVAL', 'APPROVED'].includes(plan.status)) throw new InvalidStateTransitionError('Only pending approval or approved plans can be rechecked.');
    const bomLines = plan.bomVersion?.lines ?? [];
    const availability = await this.calculateBomLineAvailability({
      scheduleDate: plan.scheduleDate,
      productId: plan.productId,
      quantityUomId: plan.quantityUomId || plan.product?.uomId,
      quantity: Number(plan.quantity),
      lines: this.getBomInventoryCheckLines(bomLines),
    }, bomLines);
    const requirements = availability.map((line) => ({
      bomLineId: line.bomLineId,
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      itemCode: line.itemCode,
      requiredUomId: line.uomId,
      requiredQuantity: line.requiredQuantity,
      inventoryUomId: line.uomId,
      inventoryQuantity: line.requiredQuantity,
      reservedQuantity: 0,
      issuedQuantity: 0,
      shortageQuantity: line.shortageQuantity,
      availableQuantity: line.availableQuantity,
      locationId: plan.targetLocationId,
      lotStrategy: 'FIFO',
    }));
    const shortages = requirements.filter((r: any) => r.shortageQuantity > 0).map((r: any) => ({
      itemType: r.itemType,
      itemId: r.itemId,
      item: r.itemName,
      itemCode: r.itemCode,
      required: r.requiredQuantity,
      available: r.availableQuantity,
      shortage: r.shortageQuantity,
      uomId: r.requiredUomId,
      locationId: r.locationId
    }));
    const nextStatus = plan.status;
    await prisma.$transaction(async (tx) => {
      const requirementRepo = (tx as any).productionPlanRequirement;
      await requirementRepo.deleteMany({ where: { productionPlanId: id } });
      if (requirements.length) {
        await requirementRepo.createMany({
          data: requirements.map((r: any) => ({
            bomLineId: r.bomLineId,
            itemType: r.itemType,
            itemId: r.itemId,
            requiredUomId: r.requiredUomId,
            requiredQuantity: r.requiredQuantity,
            inventoryUomId: r.inventoryUomId,
            inventoryQuantity: r.inventoryQuantity,
            reservedQuantity: 0,
            issuedQuantity: 0,
            shortageQuantity: r.shortageQuantity,
            locationId: r.locationId,
            lotStrategy: r.lotStrategy,
            productionPlanId: id
          }))
        });
      }
      await (tx.productionPlan as any).update({
        where: { id },
        data: {
          requirementSnapshot: { bomVersionId: plan.bomVersionId, quantity: Number(plan.quantity), generatedAt: new Date().toISOString(), lines: requirements } as any,
          materialSnapshot: { shortages } as any,
          status: nextStatus,
          checkedByActorId: actorId
        }
      });
      await tx.productionPlanEvent.create({
        data: {
          productionPlanId: id,
          eventType: 'CHECKED',
          fromStatus: plan.status,
          toStatus: plan.status,
          actorId,
          payload: { requirementCount: requirements.length, shortageCount: shortages.length }
        }
      });
    });
    return this.getById(id);
  }
  async submit(id: string, actorId: string, correlationId?: string) { return this.transition(id, actorId, ['CHECKED', 'DRAFT', 'PENDING_APPROVAL'], 'PENDING_APPROVAL', 'submit', 'SUBMITTED', {}, correlationId); }
  async approve(id: string, actorId: string, correlationId?: string) {
    const capabilities = await getActorCapabilities(prisma as PrismaClient, actorId);
    if (!capabilities.admin) throw new ForbiddenError('Only an Admin can approve a production schedule.');
    // Always re-read the authoritative inventory ledger immediately before
    // approval. A snapshot taken at creation time may be stale after a receipt
    // or another production issue changes available stock.
    const checked: any = await this.check(id, actorId);
    if (!checked.route?.graphReviewedAt || checked.route?.bomVersionId !== checked.bomVersionId) throw new ValidationError('Review route branches and map this approved BOM before schedule approval.');
    if (checked.status === 'CHECKED') await this.queueForApproval(id, actorId, correlationId);
    if ((checked.materialSnapshot?.shortages ?? []).length) throw new ValidationError('Material shortage must be resolved before approval.');
    await this.transition(id, actorId, ['PENDING_APPROVAL'], 'APPROVED', 'approve', 'APPROVED', { approvedByActorId: actorId }, correlationId);
    const approved = await this.getById(id);
    await this.notifyPlanEvent({ event: 'approved', plan: approved, actorId });
    return approved;
  }

  async release(id: string, actorId: string, _correlationId?: string) {
    await this.assertCan(actorId, 'release');
    const plan: any = await this.getById(id);
    if (plan.status !== 'APPROVED') throw new InvalidStateTransitionError('Only approved plans can be released.');
    if (!plan.route?.graphReviewedAt) throw new ValidationError('Review the route branches and map every BOM item before releasing this schedule.');
    const released = await this.parallelExecutionService.release(id, actorId);
    const hydrated = await this.getById(id);
    await this.notifyPlanEvent({ event: 'released', plan: hydrated, actorId });
    return released;
  }
  async start(id: string, actorId: string, correlationId?: string) {
    const plan = await this.getById(id);
    if (plan.route?.graphReviewedAt) {
      return this.transition(id, actorId, ['RELEASED'], 'IN_PROGRESS', 'update', 'STARTED', { inProgressAt: new Date() }, correlationId);
    }
    const updated = await this.transition(id, actorId, ['APPROVED', 'IN_PROGRESS'], 'IN_PROGRESS', 'update', 'STARTED', { inProgressAt: new Date() }, correlationId);
    try {
      await this.departmentExecutionService.initializeBatch({ productionPlanId: id }, actorId);
    } catch (batchErr) {
      console.warn('Auto batch initialization on start warning:', batchErr);
    }
    return updated;
  }
  async partialComplete(id: string, actorId: string, data: { partialQuantity: number | string; reason?: string }, correlationId?: string) { await this.assertCan(actorId, 'update'); const plan: any = await this.getById(id); if (plan.route?.graphReviewedAt) throw new ValidationError('Assembly waves and QC determine completed output for this schedule.'); if (!['IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(plan.status)) throw new InvalidStateTransitionError('Plan must be in progress.'); const increment = Number(data.partialQuantity); const completed = Number(plan.completedQuantity ?? 0) + increment; if (!(increment > 0) || completed > Number(plan.quantity)) throw new ValidationError('Completion quantity exceeds the planned quantity.'); return this.transition(id, actorId, ['IN_PROGRESS', 'PARTIALLY_COMPLETED'], completed === Number(plan.quantity) ? 'COMPLETED' : 'PARTIALLY_COMPLETED', 'update', completed === Number(plan.quantity) ? 'COMPLETED' : 'PARTIAL_COMPLETION', { partialQuantity: increment, completedQuantity: completed, completedAt: completed === Number(plan.quantity) ? new Date() : null }, correlationId); }
  async interrupt(id: string, actorId: string, data: { reason: string }, correlationId?: string) { if (!data.reason?.trim()) throw new ValidationError('Interruption reason is required.'); return this.transition(id, actorId, ['RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'], 'INTERRUPTED', 'update', 'INTERRUPTED', { interruptionReason: data.reason.trim(), interruptedAt: new Date(), interruptedByActorId: actorId }, correlationId); }
  async cancel(
    id: string,
    actorId: string,
    reason?: string,
    correlationId?: string,
    allowedStatuses = ['PENDING_APPROVAL', 'APPROVED', 'RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED']
  ) {
    await this.assertCan(actorId, 'update');
    const plan: any = await this.getById(id);
    if (plan.route?.graphReviewedAt && Number(plan.completedQuantity || 0) > 0) throw new ValidationError('A schedule with accepted finished output cannot be cancelled.');
    const allowed = allowedStatuses;
    if (!allowed.includes(plan.status)) throw new InvalidStateTransitionError('Completed or already cancelled plans cannot be cancelled.');
    await prisma.$transaction(async (tx) => {
      if (plan.route?.graphReviewedAt && plan.status !== 'APPROVED') {
        await tx.$queryRaw`SELECT "id" FROM "production_plans" WHERE "id" = ${id} FOR UPDATE`;
        const assignments = await tx.productionTaskMaterialAssignment.findMany({ where: { productionPlanId: id } });
        const batches = await tx.departmentExecutionBatch.findMany({ where: { productionPlanId: id }, select: { id: true, completed_qty: true, status: true } });
        const activeWave = await tx.assemblyBatch.count({ where: { productionPlanId: id } });
        const transferred = await tx.handover.count({ where: { outgoingBatchId: { in: batches.map((batch) => batch.id) } } });
        if (activeWave || transferred || batches.some((batch) => Number(batch.completed_qty) > 0 || !['PENDING', 'AWAITING_RECEIPT', 'RECEIVED'].includes(batch.status)) || assignments.some((assignment) => Number(assignment.receivedQty) > 0)) {
          throw new ValidationError('Return received materials and resolve active work or handovers before cancelling this schedule.');
        }
        for (const assignment of assignments) {
          const remaining = Number(assignment.issuedQty) - Number(assignment.returnedQty);
          if (remaining <= 0) continue;
          await inventoryPostingService.post(tx, { itemType: assignment.itemType as 'MATERIAL' | 'PRODUCT', itemId: assignment.itemId, uomId: assignment.uomId, locationId: assignment.locationId, lotId: assignment.lotId, movementType: 'RETURN', quantity: remaining, sourceType: 'PRODUCTION_TASK_MATERIAL_RETURN', sourceId: assignment.id, idempotencyKey: `PRODUCTION_TASK_CANCEL_RETURN:${id}:${assignment.id}`, actorId, correlationId: correlationId ?? id });
          await tx.productionTaskMaterialAssignment.update({ where: { id: assignment.id }, data: { returnedQty: assignment.issuedQty } });
        }
        await tx.departmentExecutionBatch.updateMany({ where: { productionPlanId: id }, data: { status: 'CANCELLED' } });
      }
      if (['APPROVED', 'RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(plan.status)) {
        for (const requirement of plan.requirements ?? []) {
          const reserved = Number(requirement.reservedQuantity ?? 0) - Number(requirement.issuedQuantity ?? 0);
          if (reserved <= 0) continue;
          await inventoryPostingService.post(tx, { itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId, locationId: requirement.locationId, movementType: 'RELEASE', quantity: reserved, sourceType: 'PRODUCTION_PLAN_CANCEL', sourceId: id, idempotencyKey: `PRODUCTION_CANCEL_RELEASE:${id}:${requirement.id}`, actorId, correlationId: correlationId ?? id });
          await (tx as any).productionPlanRequirement.update({ where: { id: requirement.id }, data: { reservedQuantity: 0 } });
        }
      }
      const result = await (tx.productionPlan as any).updateMany({ where: { id, status: { in: allowed } }, data: { status: 'CANCELLED', cancelledByActorId: actorId, cancelledAt: new Date(), interruptionReason: reason?.trim() || 'Cancelled' } });
      if (!result.count) throw new InvalidStateTransitionError('The plan was modified concurrently; refresh and retry.');
      const planEvent = await tx.productionPlanEvent.create({ data: { productionPlanId: id, eventType: 'CANCELLED', fromStatus: plan.status, toStatus: 'CANCELLED', actorId, reason: reason?.trim() || 'Cancelled' } });
      await publishIntelligenceEvent(tx as any, { type: 'PRODUCTION_CANCELLED', entityType: 'ProductionPlan', entityId: id, correlationId, transitionId: planEvent.id, metadata: { fromStatus: plan.status, status: 'CANCELLED', productId: plan.productId, quantity: Number(plan.quantity) } });
    });
    return this.getById(id);
  }

  async delete(id: string, actorId: string) {
    await this.assertCan(actorId, 'update');
    const plan: any = await this.getById(id);
    const capabilities = await getActorCapabilities(prisma as PrismaClient, actorId);
    if (!capabilities.admin) throw new ForbiddenError('Only an Admin can cancel a production schedule from the planning list.');
    const deletableStatuses = ['PENDING_APPROVAL', 'APPROVED'];
    if (!deletableStatuses.includes(plan.status)) {
      throw new InvalidStateTransitionError(
        `${plan.planNumber} is ${String(plan.status).replace(/_/g, ' ').toLowerCase()} and cannot be deleted from the planning list. Only approved or pending-approval schedules can be cancelled here.`
      );
    }
    // Keep the schedule and its audit trail available for review. Cancellation
    // also releases any outstanding inventory reservations in the same transaction.
    const cancelled = await this.cancel(
      id,
      actorId,
      'Cancelled by an administrator from production planning.',
      undefined,
      deletableStatuses
    );
    return { ...cancelled, id, planNumber: plan.planNumber };
  }

  async issueMaterial(id: string, actorId: string, data: { requirementId: string; quantity: number; locationId?: string; lotId?: string | null; reason?: string; idempotencyKey?: string }) {
    await this.assertCan(actorId, 'update');
    const plan: any = await this.getById(id);
    if (plan.route?.graphReviewedAt) throw new ValidationError('Materials for a reviewed branch route are issued when the schedule is released.');
    if (!['IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(plan.status)) throw new InvalidStateTransitionError('Materials can only be issued for an in-progress plan.');
    const quantity = Number(data.quantity);
    if (!(quantity > 0)) throw new ValidationError('Issue quantity must be greater than 0.');
    const key = data.idempotencyKey || `PRODUCTION_ISSUE:${id}:${data.requirementId}:${quantity}`;
    const existing: any = await (prisma as any).productionMaterialIssue.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.getById(id);
    await prisma.$transaction(async (tx) => {
      const requirement: any = await (tx as any).productionPlanRequirement.findUnique({ where: { id: data.requirementId } });
      if (!requirement || requirement.productionPlanId !== id) throw new ValidationError('Production requirement not found.');
      const remaining = Number(requirement.inventoryQuantity) - Number(requirement.issuedQuantity ?? 0);
      const reservedRemaining = Number(requirement.reservedQuantity ?? 0) - Number(requirement.issuedQuantity ?? 0);
      if (quantity > remaining || quantity > reservedRemaining) throw new ValidationError('Issue quantity exceeds the reserved or remaining requirement.');
      const issueLocationId = data.locationId || requirement.locationId;
      const issueLocation = await (tx as any).warehouseLocation.findUnique({ where: { id: issueLocationId } });
      if (!issueLocation || issueLocation.status !== 'ACTIVE') throw new ValidationError('An active issue location is required.');
      const issue = await (tx as any).productionMaterialIssue.create({ data: { issueNumber: `ISS-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`, productionPlanId: id, idempotencyKey: key, itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId, locationId: data.locationId || requirement.locationId, lotId: data.lotId || null, quantity, issuedByActorId: actorId, reason: data.reason?.trim() || null } });
      await inventoryPostingService.post(tx, { itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId, locationId: issueLocationId, lotId: data.lotId || null, movementType: 'RELEASE', quantity, sourceType: 'PRODUCTION_MATERIAL_ISSUE', sourceId: issue.id, idempotencyKey: `${key}:RELEASE`, actorId, correlationId: id });
      const ledger = await inventoryPostingService.post(tx, { itemType: requirement.itemType, itemId: requirement.itemId, uomId: requirement.inventoryUomId, locationId: issueLocationId, lotId: data.lotId || null, movementType: 'ISSUE', quantity, sourceType: 'PRODUCTION_MATERIAL_ISSUE', sourceId: issue.id, idempotencyKey: key, actorId, correlationId: id });
      await (tx as any).productionMaterialIssue.update({ where: { id: issue.id }, data: { inventoryLedgerEntryId: ledger.id } });
      await (tx as any).productionPlanRequirement.update({ where: { id: requirement.id }, data: { issuedQuantity: Number(requirement.issuedQuantity ?? 0) + quantity } });
      await tx.productionPlanEvent.create({ data: { productionPlanId: id, eventType: 'UPDATED', actorId, payload: { action: 'MATERIAL_ISSUED', issueId: issue.id, quantity } } });
    });
    return this.getById(id);
  }

  async reverseMaterialIssue(id: string, issueId: string, actorId: string, reason?: string) {
    await this.assertCan(actorId, 'update');
    const issue: any = await (prisma as any).productionMaterialIssue.findUnique({ where: { id: issueId } });
    if (!issue || issue.productionPlanId !== id) throw new NotFoundError('Material issue not found.');
    if (issue.reversedAt) throw new ConflictError('Material issue is already reversed.');
    await prisma.$transaction(async (tx) => {
      const ledger = await inventoryPostingService.post(tx, { itemType: issue.itemType, itemId: issue.itemId, uomId: issue.uomId, locationId: issue.locationId, lotId: issue.lotId, movementType: 'RETURN', quantity: Number(issue.quantity), sourceType: 'PRODUCTION_MATERIAL_ISSUE_REVERSAL', sourceId: issue.id, idempotencyKey: `PRODUCTION_ISSUE_REVERSAL:${issue.id}`, actorId, correlationId: id });
      await (tx as any).productionMaterialIssue.update({ where: { id: issue.id }, data: { reversedAt: new Date(), reversalLedgerEntryId: ledger.id, reason: reason?.trim() || issue.reason } });
      const requirement: any = await (tx as any).productionPlanRequirement.findFirst({ where: { productionPlanId: id, itemType: issue.itemType, itemId: issue.itemId, inventoryUomId: issue.uomId, locationId: issue.locationId } });
      if (requirement) await (tx as any).productionPlanRequirement.update({ where: { id: requirement.id }, data: { issuedQuantity: Math.max(0, Number(requirement.issuedQuantity ?? 0) - Number(issue.quantity)) } });
      await tx.productionPlanEvent.create({ data: { productionPlanId: id, eventType: 'UPDATED', actorId, payload: { action: 'MATERIAL_ISSUE_REVERSED', issueId: issue.id } } });
    });
    return this.getById(id);
  }

  async recordOutput(_id: string, _actorId: string, _data: { quantity: number; rejectedQuantity?: number; damagedQuantity?: number; uomId?: string; locationId?: string; lotId?: string; note?: string; idempotencyKey?: string }) {
    throw new ForbiddenError('Finished product output is created by a completed Assembly batch after QC.');
  }
}
