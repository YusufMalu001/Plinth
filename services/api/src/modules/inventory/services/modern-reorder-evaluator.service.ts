import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../../database';
import { logger } from '../../../common/utils/logger';
import { notificationService } from '../../notifications/notification.service';
import { vendorScoringService } from '../../master-data/services/vendor-scoring.service';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';

type ItemType = 'PRODUCT' | 'MATERIAL';

interface ReorderEvaluationResult {
  purchaseOrderId?: string;
  replenishmentEventId?: string;
  wasCreated?: boolean;
  orderedQuantity?: number;
}

/**
 * Evaluates committed inventory balances and creates a review-only PO draft
 * when stock reaches the configured item threshold. Vendor selection uses the
 * existing supplier scorecard plus item/category capability and quote data.
 */
export class ModernReorderEvaluatorService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async evaluate(balanceId: string): Promise<void> {
    try {
      const db = this.prisma as any;
      const balance = await db.inventoryBalance.findUnique({ where: { id: balanceId } });
      if (!balance) return;
      await this.evaluateBalance(balance);
    } catch (error) {
      logger.error('[ModernReorderEvaluatorService] evaluation failed', {
        details: `${balanceId}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** Called by the inventory outbox consumer so every posted stock movement is evaluated. */
  async evaluateItem(itemType: ItemType, itemId: string, locationId: string): Promise<void> {
    try {
      const db = this.prisma as any;
      const balances = await db.inventoryBalance.findMany({ where: { itemType, itemId, locationId } });
      await Promise.all(balances.map((balance: any) => this.evaluateBalance(balance)));
    } catch (error) {
      logger.error('[ModernReorderEvaluatorService] item evaluation failed', {
        details: `${itemType}:${itemId}:${locationId}: ${error instanceof Error ? error.message : String(error)}`,
      });
      // Let the outbox consumer retry the stock event. Swallowing this error
      // would mark a failed replenishment evaluation as completed permanently.
      throw error;
    }
  }

  private async evaluateBalance(balance: any): Promise<void> {
    const db = this.prisma as any;
    const itemType = balance.itemType as ItemType;
    if (!['PRODUCT', 'MATERIAL'].includes(itemType)) return;

    const [policy, item] = await Promise.all([
      db.replenishmentPolicy.findUnique({
        where: { itemType_itemId_locationId: { itemType, itemId: balance.itemId, locationId: balance.locationId } },
      }),
      itemType === 'PRODUCT'
        ? db.product.findUnique({ where: { id: balance.itemId }, include: { category: true } })
        : db.material.findUnique({ where: { id: balance.itemId }, include: { category: true } }),
    ]);
    if (!item || (policy && !policy.isActive)) return;
    if (balance.condition !== 'AVAILABLE' || balance.ownership !== 'COMPANY') return;

    const itemData = item as any;
    const itemCode = itemType === 'PRODUCT' ? itemData.sku : itemData.code;
    const itemName = itemData.name || itemCode || balance.itemId;
    const detail = itemType === 'PRODUCT'
      ? (itemData.metadata && typeof itemData.metadata === 'object' ? itemData.metadata : {})
      : (itemData.specs && typeof itemData.specs === 'object' ? itemData.specs : {});
    // A persisted policy can contain default zeroes. Those must not mask a
    // non-zero buffer configured on the item itself.
    const itemReorderPoint = Number(detail.reorderPoint ?? itemData.reorderPoint ?? 0);
    const itemSafetyBuffer = Number(detail.safetyStock ?? 0);
    const itemMinStockLevel = Number(detail.minStockLevel ?? itemData.minStockLevel ?? 0);
    const policySafetyBuffer = Number(policy?.safetyStock ?? 0);
    // The item's Safety Buffer is the user-configured threshold. A legacy
    // policy value must not silently override it; use policy data only when
    // the catalog item has no buffer configured.
    const safetyBuffer = Number(policy?.reorderPoint ?? 0) > 0
      ? Number(policy.reorderPoint)
      : itemReorderPoint > 0
        ? itemReorderPoint
        : itemSafetyBuffer > 0
          ? itemSafetyBuffer
          : itemMinStockLevel > 0
            ? itemMinStockLevel
            : policySafetyBuffer;
    const threshold = safetyBuffer;
    if (!Number.isFinite(threshold) || threshold <= 0) return;

    const balances = await db.inventoryBalance.findMany({
      where: { itemType, itemId: balance.itemId, locationId: balance.locationId, uomId: balance.uomId, condition: 'AVAILABLE', ownership: 'COMPANY' },
    });
    const initialAvailable = balances.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity) - Number(row.reserved)), 0);
    if (initialAvailable > threshold) {
      await db.replenishmentEvent.updateMany({
        where: { itemType, itemId: balance.itemId, locationId: balance.locationId, status: { in: ['OPEN', 'SUPPRESSED', 'PR_CREATED', 'PO_CREATED'] } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      return;
    }

    const activeEvent = await db.replenishmentEvent.findFirst({
      where: { itemType, itemId: balance.itemId, locationId: balance.locationId, status: { in: ['PR_CREATED', 'PO_CREATED'] } },
      orderBy: { evaluatedAt: 'desc' },
    });
    if (activeEvent) return;

    const needDate = new Date(Date.now() + Number(policy?.leadTimeDays ?? detail.leadTimeDays ?? itemData.leadTimeDays ?? 7) * 86_400_000);
    const candidates = await this.getVendorCandidates(itemType, itemData, policy);
    let scores: { evaluations: Array<{ vendorId: string; score: number }> } = { evaluations: [] };
    if (candidates.length) {
      try {
        const rawScores = await vendorScoringService.scoreVendors('MATERIAL');
        scores = {
          evaluations: rawScores.evaluations.map((e) => ({
            vendorId: e.vendorId,
            score: e.score ?? 0,
          })),
        };
      } catch (error) {
        // Supplier scoring enriches the recommendation but must not prevent a
        // reviewable draft from being created when scorecard data is unavailable.
        logger.warn('[ModernReorderEvaluatorService] vendor scoring unavailable; using quote and lead-time ranking', {
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const scoreById = new Map(scores.evaluations.map((evaluation) => [evaluation.vendorId, evaluation.score]));
    candidates.sort((a: any, b: any) => {
      const preferredDelta = Number(b.vendorId === policy?.preferredVendorId) - Number(a.vendorId === policy?.preferredVendorId);
      if (preferredDelta) return preferredDelta;
      const scoreDelta = Number(scoreById.get(b.vendorId) ?? 0) - Number(scoreById.get(a.vendorId) ?? 0);
      if (scoreDelta) return scoreDelta;
      const priceDelta = (Number(a.unitPrice) > 0 ? Number(a.unitPrice) : Number.POSITIVE_INFINITY)
        - (Number(b.unitPrice) > 0 ? Number(b.unitPrice) : Number.POSITIVE_INFINITY);
      if (priceDelta) return priceDelta;
      return Number(a.leadTimeDays ?? Number.POSITIVE_INFINITY) - Number(b.leadTimeDays ?? Number.POSITIVE_INFINITY);
    });
    const selectedVendor = candidates[0];

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
    const issues = await this.prisma.$queryRaw<Array<{ consumed: number | string }>>`
      SELECT COALESCE(SUM(ABS("quantityDelta")), 0)::float AS "consumed"
      FROM "inventory_ledger_entries"
      WHERE "itemType" = ${itemType} AND "itemId" = ${balance.itemId}
        AND "locationId" = ${balance.locationId} AND "uomId" = ${balance.uomId}
        AND "movementType" = 'ISSUE'::"InventoryMovementType" AND "postedAt" >= ${ninetyDaysAgo}
    `;
    const averageDailyUse = Number(issues[0]?.consumed ?? 0) / 90;
    const leadTimeDays = Number(policy?.leadTimeDays ?? selectedVendor?.leadTimeDays ?? detail.leadTimeDays ?? itemData.leadTimeDays ?? 7);
    const policyTarget = Number(policy?.orderUpToQuantity ?? 0);
    const targetStock = policyTarget > 0
      ? policyTarget
      : Math.max(threshold, averageDailyUse * Math.max(0, leadTimeDays) + safetyBuffer);
    const orderMultiple = Number(policy?.orderMultiple ?? 0);
    const minimumOrder = Math.max(Number(policy?.minimumOrderQty ?? 0), Number(selectedVendor?.moq ?? 0), orderMultiple > 0 ? orderMultiple : 1);
    const getRequiredQuantity = (available: number) => {
      let required = Math.max(targetStock - available, minimumOrder);
      if (orderMultiple > 0) required = Math.ceil(required / orderMultiple) * orderMultiple;
      return required;
    };
    const requiredQuantity = getRequiredQuantity(initialAvailable);
    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) return;

    const orderCurrency = selectedVendor?.vendor.currency || policy?.currency || 'INR';
    const historicalRates = await db.purchaseOrderLine.findMany({
      where: {
        ...(itemType === 'PRODUCT' ? { productId: balance.itemId } : { materialId: balance.itemId }),
        uomId: balance.uomId,
        unitPrice: { gt: 0 },
        purchaseOrder: {
          currency: orderCurrency,
          status: { notIn: ['CANCELLED', 'REJECTED', 'SUPERSEDED'] },
        },
      },
      select: { unitPrice: true },
    });
    const historicalAverageRate = historicalRates.length
      ? historicalRates.reduce((sum: number, row: any) => sum + Number(row.unitPrice), 0) / historicalRates.length
      : 0;
    const availableCost = Number(balance.averageCost ?? 0);
    const fallbackItemCost = Number(detail.costPrice ?? detail.standardCost ?? detail.standardPrice ?? 0);
    const quotedUnitPrice = Number(selectedVendor?.unitPrice ?? 0);
    const approvedPolicyCost = Number(policy?.approvedUnitCost ?? 0);
    const unitPrice = historicalAverageRate > 0
      ? historicalAverageRate
      : quotedUnitPrice > 0
        ? quotedUnitPrice
        : approvedPolicyCost > 0
          ? approvedPolicyCost
          : availableCost > 0
            ? availableCost
            : fallbackItemCost;
    const priceSource = historicalAverageRate > 0
      ? `average of ${historicalRates.length} previous purchase order rate${historicalRates.length === 1 ? '' : 's'}`
      : quotedUnitPrice > 0
        ? 'vendor quote'
        : approvedPolicyCost > 0
          ? 'approved replenishment policy cost'
          : availableCost > 0
            ? 'inventory average cost'
            : fallbackItemCost > 0 ? 'catalog item cost' : 'no available rate';
    const currency = (historicalAverageRate > 0 || quotedUnitPrice > 0)
      ? selectedVendor?.vendor.currency || policy?.currency || 'INR'
      : policy?.currency || 'INR';
    const decisionReason = !selectedVendor
      ? 'No approved or active supplier is available. Add or approve a supplier before a purchase order can be drafted.'
      : undefined;

    const result: ReorderEvaluationResult = await this.prisma.$transaction(async (tx) => {
      // Serialize evaluators for the same item and location, including when
      // stock is split across lots. Fresh balance/event checks prevent duplicates.
      const lockKey = `${itemType}:${balance.itemId}:${balance.locationId}:${balance.uomId}`;
      // Prisma cannot deserialize PostgreSQL's `void` return value. Cast the
      // lock result so the transaction keeps the lock without failing before
      // the replenishment event and draft PO are written.
      await tx.$queryRaw<Array<{ lock_status: string }>>`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock_status`;
      await tx.$queryRaw`
        SELECT "id" FROM "inventory_balances"
        WHERE "itemType" = ${itemType} AND "itemId" = ${balance.itemId}
          AND "locationId" = ${balance.locationId} AND "uomId" = ${balance.uomId}
          AND "condition" = 'AVAILABLE'::"InventoryCondition" AND "ownership" = 'COMPANY'::"InventoryOwnership"
        FOR UPDATE
      `;
      const lockedBalances = await (tx as any).inventoryBalance.findMany({
        where: { itemType, itemId: balance.itemId, locationId: balance.locationId, uomId: balance.uomId, condition: 'AVAILABLE', ownership: 'COMPANY' },
      });
      if (!lockedBalances.length) return {};
      const available = lockedBalances.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity) - Number(row.reserved)), 0);
      if (available > threshold) {
        await (tx as any).replenishmentEvent.updateMany({
          where: { itemType, itemId: balance.itemId, locationId: balance.locationId, status: { in: ['OPEN', 'SUPPRESSED', 'PR_CREATED', 'PO_CREATED'] } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        return {};
      }
      const existing = await (tx as any).replenishmentEvent.findFirst({
        where: { itemType, itemId: balance.itemId, locationId: balance.locationId, status: { in: ['PR_CREATED', 'PO_CREATED'] } },
        orderBy: { evaluatedAt: 'desc' },
      });
      if (existing) return {};
      const pendingEvent = await (tx as any).replenishmentEvent.findFirst({
        where: { itemType, itemId: balance.itemId, locationId: balance.locationId, status: 'OPEN' },
        orderBy: { evaluatedAt: 'desc' },
      });

      const required = getRequiredQuantity(available);
      let purchaseOrderId: string | undefined;
      let status: 'OPEN' | 'PO_CREATED' = 'OPEN';
      let reason = decisionReason;
      if (selectedVendor) {
        const lineTotal = required * unitPrice;
        const po = await tx.purchaseOrder.create({
          data: {
            poNumber: `PO-AUTO-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
            vendorId: selectedVendor.vendorId,
            status: 'DRAFT',
            currency,
            paymentTerms: selectedVendor.vendor.paymentTerms || undefined,
            deliveryLocation: balance.locationId,
            subtotal: lineTotal,
            totalAmount: lineTotal,
            lines: {
              create: [{
                productId: itemType === 'PRODUCT' ? balance.itemId : undefined,
                materialId: itemType === 'MATERIAL' ? balance.itemId : undefined,
                uomId: balance.uomId,
                quantity: required,
                unitPrice,
                needDate,
                lineTotal,
              }],
            },
          },
          select: { id: true, poNumber: true },
        });
        purchaseOrderId = po.id;
        status = 'PO_CREATED';
        const vendorScore = Number(scoreById.get(selectedVendor.vendorId) ?? 0);
        const vendorReason = selectedVendor.vendorId === policy?.preferredVendorId
          ? 'the preferred supplier in the replenishment policy'
          : `the highest available supplier score (${vendorScore}/100), with quote and lead time used to break ties`;
        const rateReason = unitPrice > 0
          ? `Rate ₹${unitPrice.toFixed(2)} uses ${priceSource}${historicalAverageRate > 0 ? ` (average of ${historicalRates.length} matching PO lines)` : ''}.`
          : `No positive quote, prior PO rate, approved policy cost, inventory cost, or catalog cost is available for ${itemName}; the draft has a zero placeholder rate that must be replaced before approval.`;
        reason = `Draft created using ${selectedVendor.vendor.name} because it was ${vendorReason}. ${rateReason} Quantity ${required} covers current available stock ${available}, threshold ${threshold}, and safety buffer / observed lead-time demand.`;
        await publishIntelligenceEvent(tx as any, {
          type: 'PO_CREATED',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          transitionId: po.id,
          metadata: { status: 'DRAFT', vendorId: selectedVendor.vendorId },
        });
      }
      const eventData = {
          policyId: policy?.id,
          itemType,
          itemId: balance.itemId,
          locationId: balance.locationId,
          availableQuantity: available,
          requiredQuantity: required,
          status,
          decisionReason: reason,
          purchaseOrderId,
        };
      const event = pendingEvent
        ? await (tx as any).replenishmentEvent.update({ where: { id: pendingEvent.id }, data: eventData })
        : await (tx as any).replenishmentEvent.create({ data: eventData });
      return { purchaseOrderId, replenishmentEventId: event.id, wasCreated: true, orderedQuantity: required };
    });

    if (!result.wasCreated || !result.replenishmentEventId) return;
    const selectedName = selectedVendor?.vendor?.name;
    await notificationService.notifyRoles({
      roles: ['admin', 'store-manager'],
      type: 'WORKFLOW',
      title: result.purchaseOrderId ? `Hermes created PO draft for ${itemCode ?? itemName}` : `Replenishment needs review: ${itemCode ?? itemName}`,
      message: result.purchaseOrderId
        ? `Stock for ${itemName} is at ${initialAvailable} against threshold ${threshold}. Hermes created a draft PO for ${result.orderedQuantity ?? requiredQuantity} units from ${selectedName}${unitPrice > 0 ? '' : '. No defensible price was available; enter and save a rate before approval'}. Review the draft before sending.`
        : `Stock for ${itemName} is at ${initialAvailable} against threshold ${threshold}. ${decisionReason} No PO was created; procurement review is needed.`,
      resource: result.purchaseOrderId ? 'PurchaseOrder' : 'ReplenishmentEvent',
      resourceId: result.purchaseOrderId || result.replenishmentEventId,
      href: result.purchaseOrderId ? `/procurement/purchase-orders/${result.purchaseOrderId}` : '/stock/reorder',
    });
  }

  private async getVendorCandidates(itemType: ItemType, item: any, policy: any): Promise<any[]> {
    const db = this.prisma as any;
    const capabilityItemFilter = itemType === 'PRODUCT' ? { productId: item.id } : { materialId: item.id };
    const capabilityClauses: any[] = [capabilityItemFilter];
    if (item.categoryId) capabilityClauses.push({ categoryId: item.categoryId });
    const capabilities = await db.vendorCapability.findMany({
      where: {
        OR: capabilityClauses,
        vendor: { status: { in: ['ACTIVE', 'APPROVED'] } },
      },
      include: { vendor: { select: { id: true, name: true, currency: true, paymentTerms: true, status: true } } },
    });
    const byVendor = new Map<string, any>();
    for (const capability of capabilities) {
      const current = byVendor.get(capability.vendorId);
      const quote = capability.unitPrice == null ? null : Number(capability.unitPrice);
      if (!current || (quote != null && (current.unitPrice == null || quote < current.unitPrice))) {
        byVendor.set(capability.vendorId, {
          ...capability,
          unitPrice: quote,
          leadTimeDays: capability.leadTimeDays,
          moq: capability.moq == null ? 0 : Number(capability.moq),
        });
      }
    }
    const candidates = [...byVendor.values()];
    if (policy?.preferredVendorId) {
      candidates.sort((a, b) => Number(b.vendorId === policy.preferredVendorId) - Number(a.vendorId === policy.preferredVendorId));
    }
    if (candidates.length) return candidates;

    // Items do not always have explicit capability links. In that case,
    // score active material suppliers and keep the resulting PO as a draft
    // so a manager can review Hermes's broader supplier recommendation.
    const scoredSuppliers = await db.vendor.findMany({
      where: { status: { in: ['ACTIVE', 'APPROVED'] } },
      select: { id: true, name: true, currency: true, paymentTerms: true, leadTimeDays: true },
    });
    return scoredSuppliers.map((vendor: any) => ({
      vendorId: vendor.id,
      vendor,
      unitPrice: null,
      moq: 0,
      leadTimeDays: vendor.leadTimeDays,
    }));
  }
}

export const modernReorderEvaluatorService = new ModernReorderEvaluatorService();
