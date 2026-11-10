import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../../database';
import { logger } from '../../../common/utils/logger';
import { notificationService } from '../../notifications/notification.service';
import { vendorScoringService } from '../../master-data/services/vendor-scoring.service';
import { modernReorderEvaluatorService } from './modern-reorder-evaluator.service';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';

/** Compatibility evaluator for stock flows still writing the legacy ledger. */
export class ReorderEvaluatorService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async evaluateAndTrigger(balanceId: string): Promise<void> {
    try {
      const db = this.prisma as any;
      const balance = await db.stockBalance.findUnique({
        where: { id: balanceId },
        include: {
          product: { include: { category: true, uom: true } },
          material: { include: { category: true, uom: true } },
          location: true,
          uom: true,
        },
      });
      if (!balance) return;
      const itemType = balance.productId ? 'PRODUCT' : 'MATERIAL';
      const itemId = balance.productId || balance.materialId;
      const item = balance.product || balance.material;
      if (!itemId || !item) return;

      // New ledger-backed stock flows are evaluated by the shared policy,
      // consumption, vendor-score and idempotency implementation.
      const modernBalance = await (this.prisma as any).inventoryBalance.findFirst({
        where: { itemType, itemId, locationId: balance.locationId, uomId: balance.uomId, condition: 'AVAILABLE', ownership: 'COMPANY' },
        select: { id: true },
      });
      if (modernBalance) {
        await modernReorderEvaluatorService.evaluateItem(itemType, itemId, balance.locationId);
        return;
      }

      const details = itemType === 'PRODUCT' ? item.metadata || {} : item.specs || {};
      const configuredSafety = Number(details.safetyStock ?? 0);
      const safetyBuffer = configuredSafety > 0 ? configuredSafety : Number(details.minStockLevel ?? 0);
      const threshold = safetyBuffer;
      if (!Number.isFinite(threshold) || threshold <= 0) return;
      const availableNow = Math.max(0, Number(balance.onHandQuantity) - Number(balance.reservedQuantity));
      if (availableNow > threshold) {
        await db.replenishmentEvent.updateMany({
          where: { itemType, itemId, locationId: balance.locationId, status: { in: ['OPEN', 'SUPPRESSED', 'PO_CREATED'] } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        return;
      }
      const activeEvent = await db.replenishmentEvent.findFirst({
        where: { itemType, itemId, locationId: balance.locationId, status: 'PO_CREATED' },
        orderBy: { evaluatedAt: 'desc' },
      });
      if (activeEvent) return;

      const capabilityWhere = [
        itemType === 'PRODUCT' ? { productId: itemId } : { materialId: itemId },
        ...(item.categoryId ? [{ categoryId: item.categoryId }] : []),
      ];
      const capabilities = await db.vendorCapability.findMany({
        where: { OR: capabilityWhere, vendor: { status: { in: ['ACTIVE', 'APPROVED'] } } },
        include: { vendor: { select: { id: true, name: true, currency: true, paymentTerms: true } } },
      });
      const byVendor = new Map<string, any>();
      for (const capability of capabilities) {
        const price = Number(capability.unitPrice ?? 0);
        const previous = byVendor.get(capability.vendorId);
        if (!previous || (price > 0 && (!previous.unitPrice || price < previous.unitPrice))) {
          byVendor.set(capability.vendorId, { ...capability, unitPrice: price > 0 ? price : null });
        }
      }
      const candidates = [...byVendor.values()];
      if (!candidates.length) {
        const scoredSuppliers = await db.vendor.findMany({
          where: { status: { in: ['ACTIVE', 'APPROVED'] } },
          select: { id: true, name: true, currency: true, paymentTerms: true, leadTimeDays: true },
        });
        candidates.push(...scoredSuppliers.map((supplier: any) => ({
          vendorId: supplier.id,
          vendor: supplier,
          unitPrice: null,
          moq: 0,
          leadTimeDays: supplier.leadTimeDays,
        })));
      }
      let scoreReport: { evaluations: any[] } = { evaluations: [] };
      if (candidates.length) {
        try {
          scoreReport = await vendorScoringService.scoreVendors('MATERIAL');
        } catch (error) {
          logger.warn('[ReorderEvaluatorService] vendor scoring unavailable; using quote and lead-time ranking', {
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const scores = new Map(scoreReport.evaluations.map((entry: any) => [entry.vendorId, Number(entry.score) || 0]));
      candidates.sort((a, b) => {
        const scoreDelta = Number(scores.get(b.vendorId) || 0) - Number(scores.get(a.vendorId) || 0);
        if (scoreDelta) return scoreDelta;
        return (Number(a.unitPrice) || Number.POSITIVE_INFINITY) - (Number(b.unitPrice) || Number.POSITIVE_INFINITY);
      });
      const vendor = candidates[0];

      const since = new Date(Date.now() - 90 * 86_400_000);
      const issues = await db.stockLedgerEntry.findMany({
        where: {
          ...(itemType === 'PRODUCT' ? { productId: itemId } : { materialId: itemId }),
          uomId: balance.uomId,
          locationId: balance.locationId,
          direction: 'OUT',
          postedAt: { gte: since },
        },
        select: { quantity: true },
      });
      const averageDailyUse = issues.reduce((sum: number, issue: any) => sum + Number(issue.quantity || 0), 0) / 90;
      const leadTimeDays = Number(vendor?.leadTimeDays ?? details.leadTimeDays ?? 7);
      const targetStock = Math.max(
        threshold,
        averageDailyUse * leadTimeDays + safetyBuffer,
      );
      const itemCost = Number(details.costPrice ?? details.standardCost ?? details.standardPrice ?? 0);
      const unitPrice = Number(vendor?.unitPrice ?? itemCost);
      const reason = !vendor
        ? 'No active vendor with a matching item or category capability was found.'
        : unitPrice <= 0
          ? `Best available vendor ${vendor.vendor.name} has no saved quote or item cost. Review and enter the PO price before approval.`
          : undefined;
      const needDate = new Date(Date.now() + leadTimeDays * 86_400_000);

      const created = await this.prisma.$transaction(async (tx) => {
        const lockKey = `${itemType}:${itemId}:${balance.locationId}:${balance.uomId}`;
        await tx.$queryRaw<Array<{ lock_status: string }>>`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock_status`;
        await tx.$queryRaw`SELECT "id" FROM "stock_balances" WHERE "id" = ${balance.id} FOR UPDATE`;
        const current = await (tx as any).stockBalance.findUnique({ where: { id: balance.id } });
        if (!current) return null;
        const available = Math.max(0, Number(current.onHandQuantity) - Number(current.reservedQuantity));
        if (available > threshold) {
          await (tx as any).replenishmentEvent.updateMany({
            where: { itemType, itemId, locationId: balance.locationId, status: { in: ['OPEN', 'SUPPRESSED', 'PO_CREATED'] } },
            data: { status: 'RESOLVED', resolvedAt: new Date() },
          });
          return null;
        }
        const open = await (tx as any).replenishmentEvent.findFirst({
          where: { itemType, itemId, locationId: balance.locationId, status: 'PO_CREATED' },
        });
        if (open) return null;
        const pending = await (tx as any).replenishmentEvent.findFirst({
          where: { itemType, itemId, locationId: balance.locationId, status: 'OPEN' },
          orderBy: { evaluatedAt: 'desc' },
        });

        const quantity = Math.max(targetStock - available, Number(vendor?.moq ?? 0), 1);
        let purchaseOrderId: string | undefined;
        let eventStatus: 'OPEN' | 'PO_CREATED' = 'OPEN';
        let decisionReason = reason;
        if (vendor) {
          const lineTotal = quantity * unitPrice;
          const po = await tx.purchaseOrder.create({
            data: {
              poNumber: `PO-AUTO-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
              vendorId: vendor.vendorId,
              status: 'DRAFT',
              currency: vendor.unitPrice ? vendor.vendor.currency || 'INR' : 'INR',
              paymentTerms: vendor.vendor.paymentTerms || undefined,
              deliveryLocation: balance.locationId,
              subtotal: lineTotal,
              totalAmount: lineTotal,
              lines: { create: [{
                productId: itemType === 'PRODUCT' ? itemId : undefined,
                materialId: itemType === 'MATERIAL' ? itemId : undefined,
                uomId: balance.uomId,
                quantity,
                unitPrice,
                needDate,
                lineTotal,
              }] },
            },
            select: { id: true },
          });
          purchaseOrderId = po.id;
          eventStatus = 'PO_CREATED';
          decisionReason = unitPrice > 0
            ? `Draft created using ${vendor.vendor.name} (vendor score ${Number(scores.get(vendor.vendorId) || 0)}/100) and 90-day stock consumption.`
            : reason;
          await publishIntelligenceEvent(tx as any, {
            type: 'PO_CREATED', entityType: 'PurchaseOrder', entityId: po.id,
            transitionId: po.id, metadata: { status: 'DRAFT', vendorId: vendor.vendorId },
          });
        }
        const eventData = {
            itemType, itemId, locationId: balance.locationId, availableQuantity: available,
            requiredQuantity: quantity, status: eventStatus, decisionReason, purchaseOrderId,
          };
        const event = pending
          ? await (tx as any).replenishmentEvent.update({ where: { id: pending.id }, data: eventData })
          : await (tx as any).replenishmentEvent.create({ data: eventData });
        return { purchaseOrderId, eventId: event.id, quantity };
      });

      if (!created) return;
      const itemCode = balance.product?.sku || balance.material?.code || itemId;
      const itemName = item.name || itemCode;
      const selectedVendorName = vendor?.vendor?.name || 'the selected supplier';
      await notificationService.notifyRoles({
        roles: ['admin', 'store-manager'],
        type: 'WORKFLOW',
        title: created.purchaseOrderId ? `Hermes created PO draft for ${itemCode}` : `Replenishment needs review: ${itemCode}`,
        message: created.purchaseOrderId
          ? `${itemName} at ${balance.location?.name || balance.locationId} is at ${availableNow} against threshold ${threshold}. Hermes created a draft PO for ${created.quantity} ${balance.uom?.symbol || 'units'} from ${selectedVendorName}${unitPrice > 0 ? '' : ' with no saved quote; enter the price before approval'}. Review the draft before sending.`
          : `${itemName} is at ${availableNow} against threshold ${threshold}. ${reason} No PO was created; procurement review is needed.`,
        resource: created.purchaseOrderId ? 'PurchaseOrder' : 'ReplenishmentEvent',
        resourceId: created.purchaseOrderId || created.eventId,
        href: created.purchaseOrderId ? `/procurement/purchase-orders/${created.purchaseOrderId}` : '/stock/reorder',
      });
    } catch (error) {
      logger.error('[ReorderEvaluatorService] Error evaluating reorder threshold:', {
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const reorderEvaluatorService = new ReorderEvaluatorService();
