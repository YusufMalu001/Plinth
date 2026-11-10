import { Prisma } from '@prisma/client';
import { prisma } from '../../database';
import { getActorCapabilities } from '../../common/rbac/permission-cache';

export type DashboardTimeframe = 'month' | 'quarter' | 'year';

const numberValue = (value: Prisma.Decimal | number | string | null | undefined): number => Number(value ?? 0);
const activeStatuses = ['ACTIVE', 'APPROVED'] as const;
const chartColours = ['#f59e0b', '#d97706', '#10b981', '#3b82f6', '#8b5cf6', '#64748b'];

function periodFor(timeframe: DashboardTimeframe, now = new Date()) {
  const from = new Date(now);
  const to = new Date(now);
  if (timeframe === 'month') {
    from.setUTCDate(1);
    to.setUTCMonth(now.getUTCMonth() + 1, 0);
  } else if (timeframe === 'quarter') {
    from.setUTCMonth(Math.floor(now.getUTCMonth() / 3) * 3, 1);
    to.setUTCMonth(Math.floor(now.getUTCMonth() / 3) * 3 + 3, 0);
  } else if (timeframe === 'year') {
    from.setUTCMonth(0, 1);
    to.setUTCMonth(11, 31);
  }
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

function bucketsFor(timeframe: DashboardTimeframe, from: Date, to: Date) {
  const buckets: Array<{ key: string; label: string; from: Date; to: Date }> = [];
  if (timeframe === 'month') {
    let cursor = new Date(from);
    while (cursor <= to) {
      const end = new Date(Math.min(to.getTime(), cursor.getTime() + 7 * 24 * 60 * 60 * 1000 - 1));
      buckets.push({
        key: cursor.toISOString(),
        label: `${cursor.getUTCDate()}–${end.getUTCDate()} ${end.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`,
        from: new Date(cursor),
        to: end,
      });
      cursor = new Date(end.getTime() + 1);
    }
  } else {
    let cursor = new Date(from);
    while (cursor <= to) {
      const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1) - 1);
      buckets.push({
        key: cursor.toISOString(),
        label: cursor.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
        from: new Date(cursor),
        to: new Date(Math.min(end.getTime(), to.getTime())),
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  }
  return buckets;
}

function findBucket<T extends { from: Date; to: Date }>(buckets: T[], date: Date): T | undefined {
  return buckets.find((bucket) => date >= bucket.from && date <= bucket.to);
}

export class DashboardService {
  async getOverview(actorId: string, timeframe: DashboardTimeframe) {
    const now = new Date();
    const { from, to } = periodFor(timeframe, now);
    const capabilities = await getActorCapabilities(prisma, actorId);
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { assignedLocationId: true } });
    const scopedLocationId = capabilities.allLocations ? null : actor?.assignedLocationId ?? '__UNASSIGNED__';
    const balanceScope = scopedLocationId ? { locationId: scopedLocationId } : {};
    const grnScope = scopedLocationId ? { locationId: scopedLocationId } : {};
    const planScope = scopedLocationId ? { targetLocationId: scopedLocationId } : {};
    const period = { gte: from, lte: to };

    const [
      products,
      materials,
      activeVendors,
      purchaseOrders,
      receipts,
      balances,
      policies,
      productionPlans,
      outputs,
      goodsReceiptLedger,
      pendingPurchaseRequisitions,
      pendingPurchaseOrders,
      openPurchaseOrders,
      receiptDiscrepancies,
      pendingReceiptSignoff,
      productionPendingApproval,
      productionShortages,
      overdueExpectedReceipts,
      approvedBoms,
      unreadNotifications,
      openReplenishmentSignals,
      recentPurchaseOrders,
      recentReceipts,
      recentPlans,
      recentLedger,
    ] = await Promise.all([
      prisma.product.findMany({
        where: { status: { in: [...activeStatuses] } },
        select: { id: true, sku: true, name: true, category: { select: { name: true } } },
      }),
      prisma.material.findMany({
        where: { status: { in: [...activeStatuses] } },
        select: { id: true, code: true, name: true, category: { select: { name: true } } },
      }),
      prisma.vendor.count({ where: { status: { in: [...activeStatuses] } } }),
      prisma.purchaseOrder.findMany({
        where: { createdAt: period, status: { notIn: ['CANCELLED', 'REJECTED', 'SUPERSEDED'] } },
        select: { id: true, poNumber: true, status: true, currency: true, totalAmount: true, createdAt: true, vendor: { select: { name: true } } },
      }),
      prisma.goodsReceiptNote.findMany({
        where: { ...grnScope, receivedAt: period },
        select: { id: true, grnNumber: true, status: true, receivedAt: true, finalizedAt: true, vendor: { select: { name: true } }, lines: { select: { acceptedQuantity: true } } },
      }),
      prisma.inventoryBalance.findMany({ where: balanceScope }),
      prisma.replenishmentPolicy.findMany({ where: { ...balanceScope, isActive: true } }),
      prisma.productionPlan.findMany({
        where: { ...planScope, scheduleDate: period, status: { not: 'CANCELLED' } },
        select: { id: true, planNumber: true, status: true, scheduleDate: true, quantity: true, completedQuantity: true, product: { select: { name: true, sku: true } } },
      }),
      prisma.productionOutput.findMany({
        where: { ...(scopedLocationId ? { locationId: scopedLocationId } : {}), recordedAt: period },
        select: { quantity: true, rejectedQuantity: true, damagedQuantity: true, recordedAt: true },
      }),
      prisma.inventoryLedgerEntry.findMany({
        where: { ...balanceScope, sourceType: 'GOODS_RECEIPT', postedAt: period },
        select: { totalCost: true, postedAt: true },
      }),
      prisma.purchaseRequisition.count({ where: { status: 'SUBMITTED' } }),
      prisma.purchaseOrder.count({ where: { status: 'DRAFT' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] } } }),
      prisma.goodsReceiptNote.count({ where: { ...grnScope, status: 'DISCREPANCY_PENDING' } }),
      prisma.goodsReceiptNote.count({ where: { ...grnScope, status: { in: ['VERIFIED', 'SIGNED_OFF'] } } }),
      prisma.productionPlan.count({ where: { ...planScope, status: 'PENDING_APPROVAL' } }),
      prisma.productionPlan.count({ where: { ...planScope, status: { notIn: ['COMPLETED', 'CANCELLED'] }, requirements: { some: { shortageQuantity: { gt: 0 } } } } }),
      prisma.expectedReceipt.count({ where: { expectedDate: { lt: now }, status: { not: 'FULLY_RECEIVED' } } }),
      prisma.bomVersion.count({ where: { status: 'APPROVED', OR: [{ effectiveDate: null }, { effectiveDate: { lte: now } }] } }),
      prisma.notification.count({ where: { recipientId: actorId, readAt: null } }),
      prisma.replenishmentEvent.count({ where: { ...balanceScope, status: 'OPEN' } }),
      prisma.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, poNumber: true, status: true, currency: true, totalAmount: true, createdAt: true, vendor: { select: { name: true } } } }),
      prisma.goodsReceiptNote.findMany({ where: grnScope, orderBy: { receivedAt: 'desc' }, take: 10, select: { id: true, grnNumber: true, status: true, receivedAt: true, vendor: { select: { name: true } }, lines: { select: { acceptedQuantity: true } } } }),
      prisma.productionPlan.findMany({ where: planScope, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, planNumber: true, status: true, updatedAt: true, quantity: true, completedQuantity: true, product: { select: { name: true, sku: true } } } }),
      prisma.inventoryLedgerEntry.findMany({ where: balanceScope, orderBy: { postedAt: 'desc' }, take: 10, select: { id: true, entryNumber: true, itemType: true, itemId: true, movementType: true, quantityDelta: true, postedAt: true } }),
    ]);

    const catalog = new Map<string, { name: string; code: string; category: string }>();
    products.forEach((item) => catalog.set(`PRODUCT:${item.id}`, { name: item.name, code: item.sku, category: item.category.name }));
    materials.forEach((item) => catalog.set(`MATERIAL:${item.id}`, { name: item.name, code: item.code, category: item.category?.name ?? 'Uncategorised' }));

    let inventoryValue = 0;
    let onHandQuantity = 0;
    const availability = new Map<string, number>();
    const categories = new Map<string, { value: number; onHand: number; itemIds: Set<string> }>();
    for (const balance of balances) {
      const quantity = numberValue(balance.quantity);
      const value = quantity * numberValue(balance.averageCost);
      onHandQuantity += quantity;
      inventoryValue += value;
      const itemKey = `${balance.itemType}:${balance.itemId}`;
      if (balance.condition === 'AVAILABLE') availability.set(itemKey, (availability.get(itemKey) ?? 0) + quantity);
      const category = catalog.get(itemKey)?.category ?? 'Uncategorised';
      const aggregate = categories.get(category) ?? { value: 0, onHand: 0, itemIds: new Set<string>() };
      aggregate.value += value;
      aggregate.onHand += quantity;
      aggregate.itemIds.add(itemKey);
      categories.set(category, aggregate);
    }

    const catalogKeys = [...catalog.keys()];
    const stockedItems = catalogKeys.filter((key) => (availability.get(key) ?? 0) > 0).length;
    const outOfStockItems = catalogKeys.filter((key) => (availability.get(key) ?? 0) <= 0).length;
    const lowStockKeys = new Set(policies.filter((policy) => {
      const scopedAvailable = balances
        .filter((balance) => balance.itemType === policy.itemType && balance.itemId === policy.itemId && balance.locationId === policy.locationId && balance.condition === 'AVAILABLE')
        .reduce((sum, balance) => sum + numberValue(balance.quantity) - numberValue(balance.reserved), 0);
      return scopedAvailable <= numberValue(policy.reorderPoint);
    }).map((policy) => `${policy.itemType}:${policy.itemId}`));

    const bucketBase = bucketsFor(timeframe, from, to);
    const productionTrend = bucketBase.map((bucket) => ({ ...bucket, planned: 0, completed: 0, acceptedOutput: 0, rejectedOutput: 0 }));
    productionPlans.forEach((plan) => {
      const bucket = findBucket(productionTrend, plan.scheduleDate);
      if (bucket) {
        bucket.planned += numberValue(plan.quantity);
        bucket.completed += numberValue(plan.completedQuantity);
      }
    });
    outputs.forEach((output) => {
      const bucket = findBucket(productionTrend, output.recordedAt);
      if (bucket) {
        bucket.acceptedOutput += numberValue(output.quantity);
        bucket.rejectedOutput += numberValue(output.rejectedQuantity) + numberValue(output.damagedQuantity);
      }
    });

    const procurementTrend = bucketBase.map((bucket) => ({ ...bucket, orderedValue: 0, receivedValue: 0, poCount: 0, grnCount: 0 }));
    purchaseOrders.filter((po) => po.currency === 'INR').forEach((po) => {
      const bucket = findBucket(procurementTrend, po.createdAt);
      if (bucket) { bucket.orderedValue += numberValue(po.totalAmount); bucket.poCount += 1; }
    });
    goodsReceiptLedger.forEach((entry) => {
      const bucket = findBucket(procurementTrend, entry.postedAt);
      if (bucket) bucket.receivedValue += numberValue(entry.totalCost);
    });
    receipts.forEach((receipt) => {
      const bucket = findBucket(procurementTrend, receipt.receivedAt);
      if (bucket) bucket.grnCount += 1;
    });

    const spendByCurrency = new Map<string, number>();
    purchaseOrders.forEach((po) => spendByCurrency.set(po.currency, (spendByCurrency.get(po.currency) ?? 0) + numberValue(po.totalAmount)));
    const totalPlanned = productionPlans.reduce((sum, plan) => sum + numberValue(plan.quantity), 0);
    const totalOutput = outputs.reduce((sum, output) => sum + numberValue(output.quantity), 0);

    const actions = [
      { id: 'pr-approvals', title: 'Purchase requisitions awaiting review', count: pendingPurchaseRequisitions, href: '/procurement/requisitions', severity: 'warning' },
      { id: 'po-approvals', title: 'Purchase orders awaiting approval', count: pendingPurchaseOrders, href: '/procurement/purchase-orders', severity: 'warning' },
      { id: 'grn-discrepancies', title: 'Goods receipts with unresolved discrepancies', count: receiptDiscrepancies, href: '/receiving/goods-receipts', severity: 'critical' },
      { id: 'grn-signoff', title: 'Receipts awaiting sign-off or inventory posting', count: pendingReceiptSignoff, href: '/receiving/goods-receipts', severity: 'warning' },
      { id: 'production-approvals', title: 'Production plans awaiting approval', count: productionPendingApproval, href: '/production/planning', severity: 'warning' },
      { id: 'production-shortages', title: 'Production plans blocked by shortages', count: productionShortages, href: '/production/planning', severity: 'critical' },
      { id: 'replenishment', title: 'Open replenishment signals', count: openReplenishmentSignals, href: '/stock/reorder', severity: 'critical' },
      { id: 'overdue-receipts', title: 'Expected receipts past due', count: overdueExpectedReceipts, href: '/procurement/expected-receipts', severity: 'critical' },
    ].filter((item) => item.count > 0);

    const recentEvents = [
      ...recentPurchaseOrders.map((po) => ({ id: `po:${po.id}`, type: 'PO', title: po.vendor.name, code: po.poNumber, status: po.status, timestamp: po.createdAt.toISOString(), valueLabel: `${po.currency} ${numberValue(po.totalAmount).toLocaleString('en-IN')}`, href: `/procurement/purchase-orders/${po.id}` })),
      ...recentReceipts.map((grn) => ({ id: `grn:${grn.id}`, type: 'GRN', title: grn.vendor?.name ?? 'Unreferenced receipt', code: grn.grnNumber, status: grn.status, timestamp: grn.receivedAt.toISOString(), valueLabel: `${grn.lines.reduce((sum, line) => sum + line.acceptedQuantity, 0).toLocaleString('en-IN')} accepted`, href: `/receiving/goods-receipts/${grn.id}` })),
      ...recentPlans.map((plan) => ({ id: `plan:${plan.id}`, type: 'PLAN', title: plan.product.name, code: plan.planNumber, status: plan.status, timestamp: plan.updatedAt.toISOString(), valueLabel: `${numberValue(plan.completedQuantity).toLocaleString('en-IN')} / ${numberValue(plan.quantity).toLocaleString('en-IN')}`, href: `/production/planning/${plan.id}` })),
      ...recentLedger.map((entry) => { const item = catalog.get(`${entry.itemType}:${entry.itemId}`); return { id: `ledger:${entry.id}`, type: 'STOCK', title: item?.name ?? 'Inventory item', code: entry.entryNumber, status: entry.movementType, timestamp: entry.postedAt.toISOString(), valueLabel: `${numberValue(entry.quantityDelta) > 0 ? '+' : ''}${numberValue(entry.quantityDelta).toLocaleString('en-IN')}`, href: `/stock/ledger?entryId=${entry.id}` }; }),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);

    return {
      timeframe,
      generatedAt: now.toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      scope: { allLocations: capabilities.allLocations, locationId: scopedLocationId === '__UNASSIGNED__' ? null : scopedLocationId },
      kpis: {
        catalogProducts: products.length,
        catalogMaterials: materials.length,
        activeVendors,
        purchaseOrderCount: purchaseOrders.length,
        openPurchaseOrders,
        goodsReceipts: receipts.length,
        finalizedReceipts: receipts.filter((receipt) => receipt.status === 'FINALIZED').length,
        receiptDiscrepancies,
        inventoryValue,
        inventoryBalanceCount: balances.length,
        stockedItems,
        onHandQuantity,
        availableQuantity: onHandQuantity,
        reservedQuantity: 0,
        lowStockItems: lowStockKeys.size,
        outOfStockItems,
        productionPlannedQuantity: totalPlanned,
        productionOutputQuantity: totalOutput,
        productionCompletedPlans: productionPlans.filter((plan) => plan.status === 'COMPLETED').length,
        productionInProgressPlans: productionPlans.filter((plan) => ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(plan.status)).length,
        productionPendingApproval,
        productionShortagePlans: productionShortages,
        approvedBoms,
        unreadNotifications,
      },
      procurementSpendByCurrency: [...spendByCurrency.entries()].map(([currency, value]) => ({ currency, value })).sort((a, b) => b.value - a.value),
      productionTrend: productionTrend.map(({ key, label, planned, completed, acceptedOutput, rejectedOutput }) => ({ period: key, label, planned, completed, acceptedOutput, rejectedOutput })),
      procurementTrend: procurementTrend.map(({ key, label, orderedValue, receivedValue, poCount, grnCount }) => ({ period: key, label, orderedValue, receivedValue, poCount, grnCount })),
      inventoryByCategory: [...categories.entries()].map(([name, value], index) => ({ name, value: value.value, onHand: value.onHand, itemCount: value.itemIds.size, color: chartColours[index % chartColours.length] })).sort((a, b) => b.value - a.value),
      actions,
      recentEvents,
    };
  }
}
