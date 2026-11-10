/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { prisma } from '../../database';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { publish } from '../../common/realtime/event-bus';
import { modernReorderEvaluatorService } from './services/modern-reorder-evaluator.service';
import { inventoryPostingService } from './services/inventory-posting.service';
import { publishIntelligenceEvent } from '../intelligence/intelligence.events';
import { InsufficientStockError, ValidationError } from '../../common/errors/AppError';

const router = Router();
const permissionChecker = new DbPermissionChecker();
const numeric = (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0);
async function modernLedgerAvailable(): Promise<boolean> {
  if (typeof (prisma as any).$queryRaw !== 'function') return false;
  const rows = await prisma.$queryRaw<Array<{ exists: string | null }>>`SELECT to_regclass('inventory_balances')::text AS exists`;
  return Boolean(rows[0]?.exists);
}

async function tableAvailable(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass(${table})::text AS exists
  `;
  return Boolean(rows[0]?.exists);
}

type InventoryItemType = 'PRODUCT' | 'MATERIAL';

/** Preserve the selected catalog identity. Parent items and their variants
 * have independent inventory balances, including selector-generated variants
 * whose IDs use the `__var__` delimiter. */
async function resolveInventoryItemId(tx: any, itemType: InventoryItemType, itemId: string): Promise<string> {
  if (itemId.includes('__var__')) return itemId;
  if (itemType === 'MATERIAL') {
    const material = await tx.material.findUnique({ where: { id: itemId }, select: { id: true, specs: true } });
    if (material) return material.id;
  } else {
    const product = await tx.product.findUnique({ where: { id: itemId }, select: { id: true, metadata: true } });
    if (product) return product.id;
  }
  return itemId;
}

/** Return the multiplier to translate a balance's native UOM into the UOM
 * requested by the user. Only approved, effective conversions are usable. */
async function getUomConversionFactor(tx: any, fromUomId: string, toUomId: string, effectiveDate = new Date()): Promise<number | null> {
  if (fromUomId === toUomId) return 1;
  const direct = await tx.uomConversion.findFirst({
    where: { fromUomId, toUomId, status: 'APPROVED', effectiveDate: { lte: effectiveDate } },
    orderBy: { effectiveDate: 'desc' },
    select: { factor: true },
  });
  const directFactor = Number(direct?.factor);
  if (direct && Number.isFinite(directFactor) && directFactor > 0) return directFactor;
  const inverse = await tx.uomConversion.findFirst({
    where: { fromUomId: toUomId, toUomId: fromUomId, status: 'APPROVED', effectiveDate: { lte: effectiveDate } },
    orderBy: { effectiveDate: 'desc' },
    select: { factor: true },
  });
  const inverseFactor = Number(inverse?.factor);
  return inverse && Number.isFinite(inverseFactor) && inverseFactor > 0 ? 1 / inverseFactor : null;
}

async function summarizeIssueableBalances(
  tx: any,
  balances: Array<{ uomId: string; quantity: unknown; reserved: unknown }>,
  requestedUomId: string,
) {
  const factors = new Map<string, number | null>();
  let onHandQuantity = 0;
  let reservedQuantity = 0;
  let availableQuantity = 0;
  let unconvertibleBalanceCount = 0;
  const effectiveDate = new Date();
  for (const balance of balances) {
    const onHand = Math.max(0, Number(balance.quantity) || 0);
    const reserved = Math.max(0, Number(balance.reserved) || 0);
    if (onHand === 0 && reserved === 0) continue;
    let factor = factors.get(balance.uomId);
    if (!factors.has(balance.uomId)) {
      factor = await getUomConversionFactor(tx, balance.uomId, requestedUomId, effectiveDate);
      factors.set(balance.uomId, factor);
    }
    if (!factor) {
      unconvertibleBalanceCount += 1;
      continue;
    }
    onHandQuantity += onHand * factor;
    reservedQuantity += reserved * factor;
    availableQuantity += Math.max(0, onHand - reserved) * factor;
  }
  return { onHandQuantity, reservedQuantity, availableQuantity, unconvertibleBalanceCount };
}

/** Resolve the polymorphic modern ledger rows into the same item/location shape
 * consumed by Products, Materials, and Inventory screens.  The modern tables
 * intentionally keep itemType/itemId generic, so hydration belongs at this
 * boundary rather than being reimplemented in every client. */
async function hydrateInventoryRows(rows: any[]) {
  const productIds = rows.filter((r) => r.itemType === 'PRODUCT').map((r) => r.itemId);
  const materialIds = rows.filter((r) => r.itemType === 'MATERIAL').map((r) => r.itemId);
  const uomIds = rows.map((r) => r.uomId).filter(Boolean);
  const locationIds = rows.map((r) => r.locationId).filter(Boolean);
  const actorIds = rows.map((r) => r.postedByActorId ?? r.postedBy).filter(Boolean);
  const planIds = rows
    .filter((r) => r.sourceType === 'PRODUCTION_PLAN' || r.sourceType === 'PRODUCTION_MATERIAL_ISSUE' || r.correlationId)
    .map((r) => r.correlationId || (r.sourceType === 'PRODUCTION_PLAN' ? r.sourceId : null))
    .filter(Boolean);
  const assemblyBatchIds = rows
    .filter((r) => r.sourceType === 'ASSEMBLY_BATCH' || r.sourceType === 'ASSEMBLY_ISSUE')
    .map((r) => r.sourceId)
    .filter(Boolean);
  const fgReceiptIds = rows
    .filter((r) => r.sourceType === 'FG_RECEIPT')
    .map((r) => r.sourceId)
    .filter(Boolean);
  const grnIds = rows
    .filter((r) => r.sourceType === 'GOODS_RECEIPT' || r.sourceType === 'GRN' || r.grnId)
    .map((r) => r.sourceId || r.grnId)
    .filter(Boolean);
  const jobWorkChallanIds = rows
    .filter((r) => r.sourceType === 'JOB_WORK_CHALLAN')
    .map((r) => r.sourceId)
    .filter(Boolean);
  const jobWorkReturnIds = rows
    .filter((r) => r.sourceType === 'JOB_WORK_RETURN')
    .map((r) => r.sourceId)
    .filter(Boolean);
  const [products, materials, uoms, locations, users, plans, assemblyBatches, fgReceipts, goodsReceipts, jobWorkChallans, jobWorkReturns] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true, description: true, metadata: true, status: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } } }),
    prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, code: true, name: true, description: true, specs: true, materialType: true, status: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } } }),
    prisma.unitOfMeasure.findMany({ where: { id: { in: uomIds } }, select: { id: true, code: true, symbol: true, name: true } }),
    prisma.warehouseLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true, name: true, type: true } }),
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }),
    prisma.productionPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, planNumber: true, status: true, quantity: true, batchIdentity: true, product: { select: { id: true, sku: true, name: true } } } }),
    prisma.assemblyBatch.findMany({ where: { id: { in: assemblyBatchIds } }, select: { id: true, batchNumber: true, status: true, targetOutputQuantity: true, product: { select: { id: true, sku: true, name: true } } } }),
    prisma.fgReceipt.findMany({ where: { id: { in: fgReceiptIds } }, select: { id: true, receiptNumber: true, status: true, quantity: true, product: { select: { id: true, sku: true, name: true } } } }),
    prisma.goodsReceiptNote.findMany({ where: { id: { in: grnIds } }, select: { id: true, grnNumber: true, status: true, po: { select: { id: true, poNumber: true } } } }),
    jobWorkChallanIds.length > 0 && typeof (prisma as any).jobWorkMaterialIssue?.findMany === 'function'
      ? prisma.jobWorkMaterialIssue.findMany({
          where: { id: { in: jobWorkChallanIds } },
          select: {
            id: true,
            challanNumber: true,
            vendorId: true,
            vendor: { select: { id: true, code: true, name: true } },
            jobWorkOrder: { select: { id: true, orderNumber: true } }
          }
        })
      : Promise.resolve([]),
    jobWorkReturnIds.length > 0 && typeof (prisma as any).jobWorkReceiptReturn?.findMany === 'function'
      ? prisma.jobWorkReceiptReturn.findMany({
          where: { OR: [{ id: { in: jobWorkReturnIds } }, { goodsReceiptId: { in: jobWorkReturnIds } }] },
          select: {
            id: true,
            returnNumber: true,
            goodsReceiptId: true,
            vendorId: true,
            vendor: { select: { id: true, code: true, name: true } },
            jobWorkOrder: { select: { id: true, orderNumber: true } }
          }
        })
      : Promise.resolve([]),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const uomById = new Map(uoms.map((u) => [u.id, u]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const planById = new Map(plans.map((pl) => [pl.id, pl]));
  const batchById = new Map(assemblyBatches.map((b) => [b.id, b]));
  const fgReceiptById = new Map(fgReceipts.map((f) => [f.id, f]));
  const grnById = new Map(goodsReceipts.map((g) => [g.id, g]));
  const challanById = new Map(((jobWorkChallans as unknown as Array<{ id: string; [key: string]: unknown }>) || []).map((c) => [c.id, c]));
  const returnByReceiptOrId = new Map(((jobWorkReturns as unknown as Array<{ id: string; goodsReceiptId?: string | null; [key: string]: unknown }>) || []).map((ret) => [ret.goodsReceiptId || ret.id, ret]));
  return rows.map((row) => {
    const actorId = row.postedByActorId ?? row.postedBy ?? null;
    const actor = actorId ? userById.get(actorId) ?? null : null;
    const planId = row.correlationId || (row.sourceType === 'PRODUCTION_PLAN' ? row.sourceId : null);
    const productionPlan = planId ? planById.get(planId) ?? null : null;
    const assemblyBatch = row.sourceType === 'ASSEMBLY_BATCH' || row.sourceType === 'ASSEMBLY_ISSUE' ? batchById.get(row.sourceId) ?? null : null;
    const fgReceipt = row.sourceType === 'FG_RECEIPT' ? fgReceiptById.get(row.sourceId) ?? null : null;
    const resolvedGrnId = (row.sourceType === 'GOODS_RECEIPT' || row.sourceType === 'GRN')
      ? (row.sourceId || row.grnId || null)
      : (row.grnId || null);
    const grnRecord = resolvedGrnId ? grnById.get(resolvedGrnId) ?? null : null;
    const goodsReceipt = grnRecord ? {
      id: grnRecord.id,
      grnNumber: grnRecord.grnNumber,
      status: grnRecord.status,
      purchaseOrder: grnRecord.po ?? null,
    } : null;

    const prod = row.itemType === 'PRODUCT' ? productById.get(row.itemId) ?? null : null;
    const mat = row.itemType === 'MATERIAL' ? materialById.get(row.itemId) ?? null : null;
    const uom = uomById.get(row.uomId) ?? prod?.uom ?? mat?.uom ?? null;

    return {
      ...row,
      id: row.id ?? `${row.itemType}:${row.itemId}:${row.uomId}:${row.locationId}:${row.condition}:${row.ownership}`,
      itemKey: `${row.itemType}:${row.itemId}`,
      productId: row.itemType === 'PRODUCT' ? row.itemId : null,
      materialId: row.itemType === 'MATERIAL' ? row.itemId : null,
      product: prod,
      material: mat,
      catalogStatus: prod?.status ?? mat?.status ?? null,
      category: prod?.category ?? mat?.category ?? null,
      uom,
      location: locationById.get(row.locationId) ?? null,
      ownership: row.ownership === 'COMPANY' ? 'OWNED' : row.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : row.ownership,
      onHandQuantity: numeric(row.quantity),
      reservedQuantity: numeric(row.reserved),
      availableQuantity: numeric(row.quantity) - numeric(row.reserved),
      averageCost: numeric(row.averageCost),
      value: numeric(row.quantity) * numeric(row.averageCost),
      direction: row.direction ?? (['ISSUE', 'TRANSFER_OUT'].includes(row.movementType) ? 'OUT' : 'IN'),
      entryType: row.entryType ?? ({ RECEIPT: 'GRN_RECEIPT', ISSUE: 'ISSUE', TRANSFER_OUT: 'TRANSFER_OUT', TRANSFER_IN: 'TRANSFER_IN', ADJUSTMENT: 'ADJUSTMENT_INCREASE', RETURN: 'STOCK_REVERTED', REVERSAL: 'REVERSAL' } as Record<string, string>)[row.movementType] ?? row.movementType,
      postedByActorId: actorId,
      postedByActor: actor,
      grnId: resolvedGrnId || goodsReceipt?.id || null,
      goodsReceipt,
      productionPlan,
      assemblyBatch,
      fgReceipt,
      jobWorkChallan: row.sourceType === 'JOB_WORK_CHALLAN' ? challanById.get(row.sourceId) ?? null : null,
      jobWorkReturn: row.sourceType === 'JOB_WORK_RETURN' ? returnByReceiptOrId.get(row.sourceId) ?? null : null,
      note: row.note ?? (
        row.sourceType === 'JOB_WORK_CHALLAN'
          ? (() => {
              const ch = challanById.get(row.sourceId) as { vendor?: { name?: string; code?: string }; jobWorkOrder?: { orderNumber?: string }; challanNumber?: string } | undefined;
              const vendorLabel = ch?.vendor ? `${ch.vendor.name} (${ch.vendor.code})` : 'vendor';
              const orderLabel = ch?.jobWorkOrder?.orderNumber ? ` for Job Work Order ${ch.jobWorkOrder.orderNumber}` : ' for Job Work';
              return `Material issued to vendor ${vendorLabel}${orderLabel} under Delivery Challan ${ch?.challanNumber || row.sourceId}`;
            })()
          : row.sourceType === 'JOB_WORK_RETURN'
          ? (() => {
              const ret = returnByReceiptOrId.get(row.sourceId) as { vendor?: { name?: string; code?: string }; jobWorkOrder?: { orderNumber?: string }; returnNumber?: string } | undefined;
              const vendorLabel = ret?.vendor ? ` from vendor ${ret.vendor.name} (${ret.vendor.code})` : '';
              const orderLabel = ret?.jobWorkOrder?.orderNumber ? ` for Job Work Order ${ret.jobWorkOrder.orderNumber}` : ' for Job Work';
              return `Job Work return ${ret?.returnNumber || ''}${orderLabel}${vendorLabel} accepted into inventory`.trim();
            })()
          : null
      ),
      totalBalanceBefore: row.totalBalanceBefore != null ? numeric(row.totalBalanceBefore) : null,
      totalBalanceAfter: row.totalBalanceAfter != null ? numeric(row.totalBalanceAfter) : null,
    };
  });
}

async function listLegacyTable(table: string, req: Request) {
  if (!(await tableAvailable(table))) return { items: [], total: 0, page: 1, limit: 50 };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  // These legacy inventory tables intentionally use domain timestamps rather
  // than a shared createdAt column.
  const orderColumn: Record<string, string> = {
    stock_issues: 'issuedAt',
    stock_transfers: 'requestedAt',
    stock_adjustments: 'proposedAt',
    stock_snapshots: 'createdAt',
    stock_balances: 'updatedAt',
    inventory_reservations: 'createdAt',
  };
  const timestamp = orderColumn[table] ?? 'createdAt';
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "${table}" ORDER BY "${timestamp}" DESC LIMIT $1 OFFSET $2`, limit, offset);
  const count = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
  return { items: rows, total: Number(count[0]?.count ?? 0), page, limit };
}

router.use(authenticate);

router.get('/inventory/dashboard', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const [rows, productCount, materialCount] = await Promise.all([
        prisma.$queryRaw<Array<{ itemType: string; itemId: string; condition: string; ownership: string; quantity: string; reserved: string; averageCost: string }>>`
          SELECT "itemType", "itemId", "condition", "ownership", "quantity"::text, "reserved"::text, "averageCost"::text
          FROM "inventory_balances"
          WHERE ("itemType" = 'PRODUCT' AND "itemId" IN (SELECT id FROM "products"))
             OR ("itemType" = 'MATERIAL' AND "itemId" IN (SELECT id FROM "materials"))
        `,
        prisma.product.findMany({ where: { status: { not: 'SUPERSEDED' } }, select: { id: true, metadata: true } }),
        prisma.material.findMany({ where: { status: { not: 'SUPERSEDED' } }, select: { id: true, specs: true } }),
      ]);
      const activeKeys = new Set(rows.filter((r) => r.condition === 'AVAILABLE' && r.ownership === 'COMPANY').map((r) => `${r.itemType}:${r.itemId}`));
      const availableQuantity = rows.filter((r) => r.condition === 'AVAILABLE').reduce((sum, r) => sum + numeric(r.quantity) - numeric(r.reserved), 0);
      const reservedQuantity = rows.reduce((sum, r) => sum + numeric(r.reserved), 0);
      const inventoryValue = rows.reduce((sum, r) => sum + numeric(r.quantity) * numeric(r.averageCost), 0);
      const nonVarProducts = productCount.filter((p) => !(p.metadata as any)?.isVariant);
      const nonVarMaterials = materialCount.filter((m) => !(m.specs as any)?.isVariant);
      res.json({ success: true, data: {
        totalSkus: nonVarProducts.length + nonVarMaterials.length,
        stockedSkus: activeKeys.size,
        availableQuantity,
        reservedQuantity,
        inventoryValue,
        quarantinedQuantity: rows.filter((r) => r.condition === 'QUARANTINED').reduce((s, r) => s + numeric(r.quantity), 0),
        damagedQuantity: rows.filter((r) => r.condition === 'DAMAGED').reduce((s, r) => s + numeric(r.quantity), 0),
        rejectedQuantity: rows.filter((r) => r.condition === 'REJECTED').reduce((s, r) => s + numeric(r.quantity), 0),
      }, requestId: req.id }); return;
    }
    const [entries, products, materials] = await Promise.all([
      prisma.stockLedgerEntry.findMany({ select: { locationId: true, quantity: true } }),
      prisma.product.count({ where: { status: { in: ['ACTIVE', 'APPROVED'] } } }),
      prisma.material.count({ where: { status: { in: ['ACTIVE', 'APPROVED'] } } })
    ]);
    res.json({ success: true, data: { totalSkus: products + materials, availableQuantity: entries.reduce((sum, entry) => sum + numeric(entry.quantity), 0), reservedQuantity: 0, inventoryValue: 0, quarantinedQuantity: 0, damagedQuantity: 0, rejectedQuantity: 0, openReservations: 0, inTransit: 0 }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/balances', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const conditions: Prisma.Sql[] = [];
      if (req.query.productId) conditions.push(Prisma.sql`"itemType" = 'PRODUCT' AND "itemId" = ${String(req.query.productId)}`);
      if (req.query.materialId) conditions.push(Prisma.sql`"itemType" = 'MATERIAL' AND "itemId" = ${String(req.query.materialId)}`);
      if (req.query.locationId) conditions.push(Prisma.sql`"locationId" = ${String(req.query.locationId)}`);
      if (req.query.condition) conditions.push(Prisma.sql`"condition" = ${String(req.query.condition)}::"InventoryCondition"`);
      if (req.query.lotId) conditions.push(Prisma.sql`"lotId" = ${String(req.query.lotId)}`);
      if (req.query.ownership) conditions.push(Prisma.sql`"ownership" = ${String(req.query.ownership) === 'VENDOR_HELD' ? Prisma.raw(`'VENDOR_HELD'::"InventoryOwnership"`) : Prisma.raw(`'COMPANY'::"InventoryOwnership"`)}`);
      const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
      const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantity"::text, "reserved"::text, "averageCost"::text FROM "inventory_balances" ${where} ORDER BY "updatedAt" DESC, "locationId", "itemType", "itemId" LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "inventory_balances" ${where}`;
      let items = await hydrateInventoryRows(rows);
      if (req.query.search) {
        const q = String(req.query.search).toLowerCase();
        items = items.filter((item: any) =>
          `${item.product?.sku ?? ''} ${item.product?.name ?? ''} ${item.material?.code ?? ''} ${item.material?.name ?? ''} ${item.location?.name ?? ''} ${item.location?.code ?? ''}`.toLowerCase().includes(q)
        );
      }
      res.json({ success: true, data: { items, total: Number(count[0]?.count ?? 0), page, limit }, requestId: req.id }); return;
    }
    const rows = await prisma.stockLedgerEntry.groupBy({ by: ['productId', 'materialId', 'uomId', 'locationId'], _sum: { quantity: true }, orderBy: { locationId: 'asc' } });
    res.json({ success: true, data: { items: rows.map(row => ({ ...row, available: numeric(row._sum.quantity), reserved: 0, inTransit: 0, damaged: 0, averageCost: 0, value: 0 })), total: rows.length }, requestId: req.id });
  } catch (error) { next(error); }
});

// Item-level aggregate used by inventory screens. Physical storage is an
// internal posting detail and is not returned as an inventory dimension.
router.get('/inventory/items', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) { res.json({ success: true, data: { items: [], total: 0 }, requestId: req.id }); return; }
    const [rows, products, materials] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT *, "quantity"::text, "reserved"::text, "averageCost"::text FROM "inventory_balances" ORDER BY "itemType", "itemId", "locationId"`,
      prisma.product.findMany({
        where: { status: { not: 'SUPERSEDED' } },
        select: { id: true, sku: true, name: true, description: true, status: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } },
      }),
      prisma.material.findMany({
        where: { status: { not: 'SUPERSEDED' } },
        select: { id: true, code: true, name: true, description: true, materialType: true, status: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } },
      }),
    ]);
    const hydrated = await hydrateInventoryRows(rows);
    const grouped = new Map<string, any>();
    const productMap = new Map(products.map((p) => [p.id, p]));
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    // Start with the catalog so newly created items remain visible even before
    // their first receipt, production output, issue, or opening adjustment.
    for (const product of products) {
      const key = `PRODUCT:${product.id}`;
      grouped.set(key, {
        itemKey: key,
        itemType: 'PRODUCT',
        itemId: product.id,
        productId: product.id,
        product,
        materialId: null,
        material: null,
        catalogStatus: product.status,
        category: product.category,
        uom: product.uom,
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        unconvertibleBalanceCount: 0,
        inventoryValue: 0,
        conditions: [],
        hasBalances: false,
      });
    }
    for (const material of materials) {
      const key = `MATERIAL:${material.id}`;
      grouped.set(key, {
        itemKey: key,
        itemType: 'MATERIAL',
        itemId: material.id,
        productId: null,
        product: null,
        materialId: material.id,
        material,
        catalogStatus: material.status,
        category: material.category,
        uom: material.uom,
        condition: 'AVAILABLE',
        ownership: 'COMPANY',
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        unconvertibleBalanceCount: 0,
        inventoryValue: 0,
        conditions: [],
        hasBalances: false,
      });
    }
    for (const row of hydrated) {
      if (!row.product && !row.material && !productMap.has(row.itemId) && !materialMap.has(row.itemId)) continue;
      // Group by canonical catalog item (itemType:itemId) so catalog items count matches 1:1 with products & materials
      const key = `${row.itemType}:${row.itemId}`;
      const prod = row.product ?? productMap.get(row.itemId) ?? null;
      const mat = row.material ?? materialMap.get(row.itemId) ?? null;
      const current = grouped.get(key) ?? {
        itemKey: key,
        itemType: row.itemType,
        itemId: row.itemId,
        productId: row.productId,
        product: prod,
        materialId: row.materialId,
        material: mat,
        catalogStatus: prod?.status ?? mat?.status ?? 'ACTIVE',
        category: prod?.category ?? mat?.category ?? null,
        uomId: row.uomId,
        uom: row.uom ?? prod?.uom ?? mat?.uom ?? null,
        condition: row.condition,
        ownership: row.ownership,
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        unconvertibleBalanceCount: 0,
        inventoryValue: 0,
        conditions: [],
        hasBalances: false,
      };
      // Inventory rows can hold the same catalog item in several UOMs. Never
      // add unlike quantities (for example PCS + BOX + KG); summarize into the
      // catalog item's base UOM using only approved conversions.
      if (row.ownership === 'OWNED') {
        const targetUomId = current.uom?.id ?? current.uomId;
        const factor = targetUomId
          ? await getUomConversionFactor(prisma, row.uomId, targetUomId)
          : null;
        if (factor != null) {
          const onHand = Number(row.onHandQuantity ?? 0) * factor;
          const reserved = Number(row.reservedQuantity ?? 0) * factor;
          current.onHandQuantity += onHand;
          current.reservedQuantity += reserved;
          if (row.condition === 'AVAILABLE') {
            current.availableQuantity += Math.max(0, onHand - reserved);
          }
        } else if (Number(row.onHandQuantity ?? 0) > 0 || Number(row.reservedQuantity ?? 0) > 0) {
          current.unconvertibleBalanceCount += 1;
        }
        current.inventoryValue += Number(row.value ?? 0);
      }
      current.hasBalances = true;
      if (row.condition && !current.conditions.includes(row.condition)) current.conditions.push(row.condition);
      grouped.set(key, current);
    }
    let items = Array.from(grouped.values()).filter((row) => {
      // Exclude synthetic variants if any to mirror canonical catalog
      const isVariant = Boolean(
        row.product?.isVariant ||
        (row.product?.metadata as any)?.isVariant ||
        (row.material?.specs as any)?.isVariant
      );
      if (isVariant) return false;
      if (req.query.itemType && row.itemType !== String(req.query.itemType).toUpperCase()) return false;
      if (req.query.status && row.catalogStatus !== String(req.query.status).toUpperCase()) return false;
      if (!req.query.search) return true;
      const q = String(req.query.search).toLowerCase();
      return `${row.product?.sku ?? ''} ${row.product?.name ?? ''} ${row.material?.code ?? ''} ${row.material?.name ?? ''} ${row.category?.name ?? ''}`.toLowerCase().includes(q);
    });
    items = items.sort((a, b) => `${a.product?.sku ?? a.material?.code ?? ''}`.localeCompare(`${b.product?.sku ?? b.material?.code ?? ''}`, undefined, { numeric: true }));
    const total = items.length;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 50));
    items = items.slice((page - 1) * limit, page * limit);
    res.json({ success: true, data: { items: items.map(({ hasBalances: _hasBalances, ...item }) => item), total, page, limit }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/items/:itemType/:itemId/availability', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) { res.status(404).json({ success: false, message: 'Inventory item not found', requestId: req.id }); return; }
    const itemType = String(req.params.itemType).toUpperCase() as InventoryItemType;
    if (!['PRODUCT', 'MATERIAL'].includes(itemType)) { res.status(400).json({ success: false, message: 'itemType must be PRODUCT or MATERIAL', requestId: req.id }); return; }
    const itemId = await resolveInventoryItemId(prisma, itemType, req.params.itemId);
    const requestedUomId = String(req.query.uomId || '');
    if (!requestedUomId) { res.status(400).json({ success: false, message: 'A UOM is required to calculate available stock.', requestId: req.id }); return; }
    const balances = await prisma.inventoryBalance.findMany({
      where: { itemType, itemId, condition: 'AVAILABLE', ownership: 'COMPANY' },
      select: { uomId: true, quantity: true, reserved: true },
    });
    const quantities = await summarizeIssueableBalances(prisma, balances, requestedUomId);
    const uom = await prisma.unitOfMeasure.findUnique({ where: { id: requestedUomId }, select: { id: true, code: true, symbol: true, name: true } });
    res.json({
      success: true,
      data: { itemType, itemId, uom, ...quantities },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

router.get('/inventory/items/:itemType/:itemId', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) { res.status(404).json({ success: false, message: 'Inventory item not found', requestId: req.id }); return; }
    const itemType = String(req.params.itemType).toUpperCase();
    if (!['PRODUCT', 'MATERIAL'].includes(itemType)) { res.status(400).json({ success: false, message: 'itemType must be PRODUCT or MATERIAL', requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantity"::text, "reserved"::text, "averageCost"::text FROM "inventory_balances" WHERE "itemType" = ${itemType} AND "itemId" = ${req.params.itemId} ORDER BY "locationId"`;
    const balances = await hydrateInventoryRows(rows);
    const catalogItem = itemType === 'PRODUCT'
      ? await prisma.product.findUnique({ where: { id: req.params.itemId }, include: { category: true, uom: true } })
      : await prisma.material.findUnique({ where: { id: req.params.itemId }, include: { category: true, uom: true } });
    if (!catalogItem) { res.status(404).json({ success: false, message: 'Inventory item not found', requestId: req.id }); return; }
    const first = balances[0];
    const issueableBalances = balances.filter((row) => row.condition === 'AVAILABLE' && row.ownership === 'OWNED');
    const baseUomId = catalogItem.uomId;
    const normalizedQuantities = baseUomId
      ? await summarizeIssueableBalances(prisma, issueableBalances.map((row) => ({
          uomId: row.uomId,
          quantity: row.onHandQuantity,
          reserved: row.reservedQuantity,
        })), baseUomId)
      : { onHandQuantity: 0, reservedQuantity: 0, availableQuantity: 0, unconvertibleBalanceCount: 0 };
    res.json({ success: true, data: {
      itemKey: `${itemType}:${req.params.itemId}`,
      itemType,
      itemId: req.params.itemId,
      productId: itemType === 'PRODUCT' ? req.params.itemId : null,
      product: itemType === 'PRODUCT' ? catalogItem : first?.product ?? null,
      materialId: itemType === 'MATERIAL' ? req.params.itemId : null,
      material: itemType === 'MATERIAL' ? catalogItem : first?.material ?? null,
      catalogStatus: catalogItem.status,
      category: catalogItem.category,
      uom: catalogItem.uom,
      ...normalizedQuantities,
      inventoryValue: balances.reduce((s, r) => s + Number(r.value ?? 0), 0),
      conditions: [...new Set(balances.map((row) => row.condition).filter(Boolean))],
    }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/lots', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await tableAvailable('inventory_lots'))) { res.json({ success: true, data: { items: [], total: 0 }, requestId: req.id }); return; }
    const lots = await (prisma as any).inventoryLot.findMany({ where: { ...(req.query.itemType ? { itemType: String(req.query.itemType) } : {}), ...(req.query.itemId ? { itemId: String(req.query.itemId) } : {}), ...(req.query.lotNumber ? { lotNumber: { contains: String(req.query.lotNumber), mode: 'insensitive' } } : {}) }, orderBy: { expiresAt: 'asc' } });
    res.json({ success: true, data: { items: lots, total: lots.length }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/ledger', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const where = req.query.locationId ? { locationId: String(req.query.locationId) } : undefined;
    if (await modernLedgerAvailable()) {
      // Compose the optional predicate with Prisma.sql. Nesting $queryRaw here
      // serializes the inner fragment as a literal `$1`, which PostgreSQL
      // rejects before the ledger page can render.
      const requestedType = String(req.query.entryType ?? '');
      const movementType = requestedType === 'GRN_RECEIPT' ? 'RECEIPT'
        : requestedType === 'ADJUSTMENT_INCREASE' || requestedType === 'ADJUSTMENT_DECREASE' ? 'ADJUSTMENT'
        : requestedType === 'RETURN_TO_VENDOR' || requestedType === 'STOCK_REVERTED' || requestedType === 'RETURN' ? 'RETURN'
        : requestedType;
      const predicates: Prisma.Sql[] = [];
      if (req.query.locationId) predicates.push(Prisma.sql`"locationId" = ${String(req.query.locationId)}`);
      if (movementType) predicates.push(Prisma.sql`"movementType" = ${movementType}::"InventoryMovementType"`);
      if (req.query.productId) predicates.push(Prisma.sql`"itemType" = 'PRODUCT' AND "itemId" = ${String(req.query.productId)}`);
      if (req.query.materialId) predicates.push(Prisma.sql`"itemType" = 'MATERIAL' AND "itemId" = ${String(req.query.materialId)}`);
      const extraFilters: Prisma.Sql[] = [];
      if (req.query.sourceType) extraFilters.push(Prisma.sql`"sourceType" = ${String(req.query.sourceType)}`);
      if (req.query.condition) extraFilters.push(Prisma.sql`"condition" = ${String(req.query.condition)}::"InventoryCondition"`);
      if (req.query.ownership) extraFilters.push(Prisma.sql`"ownership" = ${String(req.query.ownership) === 'VENDOR_HELD' ? Prisma.raw(`'VENDOR_HELD'::"InventoryOwnership"`) : Prisma.raw(`'COMPANY'::"InventoryOwnership"`)}`);
      if (req.query.postedFrom) extraFilters.push(Prisma.sql`"postedAt" >= ${new Date(String(req.query.postedFrom))}`);
      if (req.query.postedTo) extraFilters.push(Prisma.sql`"postedAt" <= ${new Date(String(req.query.postedTo))}`);
      predicates.push(...extraFilters);
      const modernWhere = predicates.length ? Prisma.sql`WHERE ${Prisma.join(predicates, ' AND ')}` : Prisma.empty;
      const rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM (
          SELECT 
            *,
            "quantityDelta"::text,
            "quantityBefore"::text,
            "quantityAfter"::text,
            (SUM("quantityDelta") OVER (
              PARTITION BY "itemType", "itemId"
              ORDER BY "postedAt" ASC, id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) - "quantityDelta")::text AS "totalBalanceBefore",
            (SUM("quantityDelta") OVER (
              PARTITION BY "itemType", "itemId"
              ORDER BY "postedAt" ASC, id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ))::text AS "totalBalanceAfter",
            "averageCostBefore"::text,
            "averageCostAfter"::text,
            "unitCost"::text,
            "totalCost"::text
          FROM "inventory_ledger_entries"
        ) "ledger_with_totals"
        ${modernWhere}
        ORDER BY "postedAt" DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;
      const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "inventory_ledger_entries" ${modernWhere}`;
      const items = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: row.quantityAfter, reserved: 0, averageCost: row.averageCostAfter })));
      res.json({ success: true, data: { items, total: Number(countRows[0]?.count ?? 0), page, limit }, requestId: req.id }); return;
    }
    const [items, total] = await Promise.all([
      prisma.stockLedgerEntry.findMany({
        where,
        include: {
          grn: {
            select: {
              id: true,
              grnNumber: true,
              status: true,
              po: { select: { id: true, poNumber: true } },
            },
          },
          grnLine: { select: { productId: true, materialId: true, uomId: true } },
          product: { select: { id: true, sku: true, name: true } },
          material: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true, name: true, symbol: true } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockLedgerEntry.count({ where }),
    ]);
    const normalizedItems = (items as any[]).map((item) => ({
      ...item,
      goodsReceipt: item.grn
        ? {
            id: item.grn.id,
            grnNumber: item.grn.grnNumber,
            status: item.grn.status,
            purchaseOrder: item.grn.po ?? null,
          }
        : null,
    }));
    res.json({ success: true, data: { items: normalizedItems, total, page, limit }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/ledger/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "inventory_ledger_entries" WHERE "id" = ${req.params.id} LIMIT 1`;
      if (!rows[0]) { res.status(404).json({ success: false, message: 'Ledger entry not found', requestId: req.id }); return; }
      const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: row.quantityAfter, reserved: 0, averageCost: row.averageCostAfter })));
      res.json({ success: true, data: hydrated[0], requestId: req.id }); return;
    }
    const item = await prisma.stockLedgerEntry.findUnique({ where: { id: req.params.id }, include: { grn: true, grnLine: true } });
    if (!item) { res.status(404).json({ success: false, message: 'Ledger entry not found', requestId: req.id }); return; }
    res.json({ success: true, data: item, requestId: req.id });
  } catch (error) { next(error); }
});

// Inventory module read endpoints. These tables are introduced by the inventory
// migration; returning an empty result keeps the UI usable during a rolling
// deployment where a database has not received that migration yet.
router.get('/inventory/balances/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const parts = req.params.id.split(':');
      const rows = parts.length > 1
        ? await prisma.$queryRaw<any[]>`SELECT "id", "itemType", "itemId", "uomId", "locationId", "condition", "ownership", "quantity"::text, "reserved"::text, "averageCost"::text FROM "inventory_balances" WHERE "itemType" = ${parts[0]} AND "itemId" = ${parts[1]} AND "uomId" = ${parts[2]} AND "locationId" = ${parts[3]} AND "condition" = ${parts[4] ?? 'AVAILABLE'}::"InventoryCondition" AND "ownership" = ${parts[5] ?? 'COMPANY'}::"InventoryOwnership" LIMIT 1`
        : await prisma.$queryRaw<any[]>`SELECT "id", "itemType", "itemId", "uomId", "locationId", "condition", "ownership", "quantity"::text, "reserved"::text, "averageCost"::text FROM "inventory_balances" WHERE "id" = ${req.params.id} LIMIT 1`;
      if (rows[0]) {
        const row = (await hydrateInventoryRows(rows))[0];
        res.json({ success: true, data: { ...row, id: req.params.id, ownership: row.ownership === 'COMPANY' ? 'OWNED' : 'VENDOR_HELD' }, requestId: req.id });
        return;
      }
    }
    if (!(await tableAvailable('stock_balances'))) { res.status(404).json({ success: false, message: 'Stock balance not found', requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_balances" WHERE "id" = ${req.params.id} LIMIT 1`;
    if (!rows[0]) { res.status(404).json({ success: false, message: 'Stock balance not found', requestId: req.id }); return; }
    res.json({ success: true, data: rows[0], requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/balances/:id/movements', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const parts = req.params.id.split(':');
      const balanceRows = parts.length > 1 ? [] : await prisma.$queryRaw<any[]>`SELECT "itemType", "itemId", "locationId" FROM "inventory_balances" WHERE "id" = ${req.params.id} LIMIT 1`;
      const itemType = parts.length > 1 ? parts[0] : balanceRows[0]?.itemType;
      const itemId = parts.length > 1 ? parts[1] : balanceRows[0]?.itemId;
      const locationId = parts.length > 1 ? parts[3] : balanceRows[0]?.locationId;
      if (!itemType || !itemId || !locationId) { res.json({ success: true, data: { movements: [], lastMovementAt: null, agingDays: null }, requestId: req.id }); return; }
      const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text, "averageCostBefore"::text, "averageCostAfter"::text, "unitCost"::text, "totalCost"::text FROM "inventory_ledger_entries" WHERE "itemType" = ${itemType} AND "itemId" = ${itemId} AND "locationId" = ${locationId} ORDER BY "postedAt" DESC LIMIT 200`;
      const movements = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: row.quantityAfter, reserved: 0, averageCost: row.averageCostAfter })));
      const last = movements[0]?.postedAt ?? null;
      res.json({ success: true, data: { movements, lastMovementAt: last, agingDays: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null }, requestId: req.id }); return;
    }
    if (!(await tableAvailable('stock_ledger_entries'))) { res.json({ success: true, data: { movements: [], lastMovementAt: null, agingDays: null }, requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_ledger_entries" WHERE "productId" = ${req.query.productId ?? null} OR "materialId" = ${req.query.materialId ?? null} ORDER BY "postedAt" DESC LIMIT 200`;
    const last = rows[0]?.postedAt ?? null;
    res.json({ success: true, data: { movements: rows, lastMovementAt: last, agingDays: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null }, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/reorder-signals', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const raw = await prisma.$queryRaw<any[]>`SELECT *, "quantity"::text, "reserved"::text FROM "inventory_balances" WHERE "condition" = 'AVAILABLE'::"InventoryCondition" ORDER BY "updatedAt" DESC`;
      const rows = await hydrateInventoryRows(raw);
      const signals = rows.map((row: any) => {
        const itemDetails = row.product?.metadata && typeof row.product.metadata === 'object' ? row.product.metadata : row.material?.specs;
        const configured = [(itemDetails as any)?.reorderPoint, (itemDetails as any)?.safetyStock, (itemDetails as any)?.minStockLevel]
          .map(Number).find((value) => Number.isFinite(value) && value > 0) ?? 0;
        const onHand = Number(row.onHandQuantity ?? 0);
        const available = Number(row.availableQuantity ?? 0);
        return { balanceId: row.id, itemKey: row.itemKey, productId: row.productId, product: row.product, materialId: row.materialId, material: row.material, locationId: row.locationId, location: row.location, onHandQuantity: onHand, availableQuantity: available, avgDailyConsumption: 0, daysOfCover: null, configuredSafetyBuffer: configured, belowSafetyBuffer: configured > 0 ? available <= configured : null };
      });
      res.json({ success: true, data: signals, requestId: req.id }); return;
    }
    const result = await listLegacyTable('stock_balances', req);
    const signals = result.items.map((row: any) => ({
      balanceId: row.id,
      itemKey: row.itemKey,
      productId: row.productId ?? null,
      materialId: row.materialId ?? null,
      locationId: row.locationId,
      onHandQuantity: Number(row.onHandQuantity ?? 0),
      availableQuantity: Math.max(0, Number(row.onHandQuantity ?? 0) - Number(row.reservedQuantity ?? 0)),
      avgDailyConsumption: 0,
      daysOfCover: null,
      configuredSafetyBuffer: null,
      belowSafetyBuffer: null,
    }));
    res.json({ success: true, data: signals, requestId: req.id });
  }
  catch (error) { next(error); }
});

router.get('/inventory/replenishment/policies', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await tableAvailable('replenishment_policies'))) { res.json({ success: true, data: { items: [], total: 0 }, requestId: req.id }); return; }
    const policies = await (prisma as any).replenishmentPolicy.findMany({ where: { ...(req.query.itemType ? { itemType: String(req.query.itemType) } : {}), ...(req.query.itemId ? { itemId: String(req.query.itemId) } : {}), ...(req.query.locationId ? { locationId: String(req.query.locationId) } : {}) }, orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: { items: policies, total: policies.length }, requestId: req.id });
  } catch (error) { next(error); }
});

router.put('/inventory/replenishment/policies', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await tableAvailable('replenishment_policies'))) { res.status(409).json({ success: false, message: 'Inventory traceability migration is required before editing replenishment policies.', requestId: req.id }); return; }
    const actorId = req.user?.id || 'system';
    const body = req.body as Record<string, any>;
    if (!['PRODUCT', 'MATERIAL'].includes(body.itemType) || !body.itemId || !body.locationId || !Number.isFinite(Number(body.reorderPoint)) || Number(body.reorderPoint) < 0) {
      res.status(400).json({ success: false, message: 'itemType, itemId, locationId, and a non-negative reorderPoint are required.', requestId: req.id }); return;
    }
    const policy = await prisma.$transaction(async (tx) => {
      const saved = await (tx as any).replenishmentPolicy.upsert({ where: { itemType_itemId_locationId: { itemType: body.itemType, itemId: body.itemId, locationId: body.locationId } }, create: { itemType: body.itemType, itemId: body.itemId, locationId: body.locationId, reorderPoint: Number(body.reorderPoint), safetyStock: Number(body.safetyStock ?? 0), orderUpToQuantity: body.orderUpToQuantity == null ? undefined : Number(body.orderUpToQuantity), minimumOrderQty: body.minimumOrderQty == null ? undefined : Number(body.minimumOrderQty), orderMultiple: body.orderMultiple == null ? undefined : Number(body.orderMultiple), leadTimeDays: body.leadTimeDays == null ? undefined : Number(body.leadTimeDays), preferredVendorId: body.preferredVendorId || undefined, approvedUnitCost: body.approvedUnitCost == null ? undefined : Number(body.approvedUnitCost), currency: body.currency || 'INR', mode: body.mode || 'ALERT_ONLY', autoBuyLimit: body.autoBuyLimit == null ? undefined : Number(body.autoBuyLimit), cooldownHours: Number(body.cooldownHours ?? 24), shelfLifeWarningDays: body.shelfLifeWarningDays == null ? undefined : Number(body.shelfLifeWarningDays), isActive: body.isActive !== false, createdBy: actorId }, update: { reorderPoint: Number(body.reorderPoint), safetyStock: Number(body.safetyStock ?? 0), orderUpToQuantity: body.orderUpToQuantity == null ? null : Number(body.orderUpToQuantity), minimumOrderQty: body.minimumOrderQty == null ? null : Number(body.minimumOrderQty), orderMultiple: body.orderMultiple == null ? null : Number(body.orderMultiple), leadTimeDays: body.leadTimeDays == null ? null : Number(body.leadTimeDays), preferredVendorId: body.preferredVendorId || null, approvedUnitCost: body.approvedUnitCost == null ? null : Number(body.approvedUnitCost), currency: body.currency || 'INR', mode: body.mode || 'ALERT_ONLY', autoBuyLimit: body.autoBuyLimit == null ? null : Number(body.autoBuyLimit), cooldownHours: Number(body.cooldownHours ?? 24), shelfLifeWarningDays: body.shelfLifeWarningDays == null ? null : Number(body.shelfLifeWarningDays), isActive: body.isActive !== false, updatedBy: actorId } });
      await publishIntelligenceEvent(tx as any, { type: 'INVENTORY_THRESHOLD_CHANGED', entityType: 'ReplenishmentPolicy', entityId: saved.id, correlationId: req.id, occurredAt: saved.updatedAt, transitionId: saved.updatedAt.toISOString(), metadata: { itemType: body.itemType, itemId: body.itemId, locationId: body.locationId, isActive: saved.isActive, reorderPoint: Number(saved.reorderPoint), safetyStock: Number(saved.safetyStock), leadTimeDays: saved.leadTimeDays ?? null } });
      return saved;
    });
    res.status(200).json({ success: true, data: policy, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/snapshots', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try { res.json({ success: true, data: await listLegacyTable('stock_snapshots', req), requestId: req.id }); }
  catch (error) { next(error); }
});

router.get('/inventory/issues', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<any[]>`SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text FROM "inventory_ledger_entries" WHERE "movementType" = 'ISSUE'::"InventoryMovementType" ORDER BY "postedAt" DESC LIMIT ${limit} OFFSET ${offset}`,
        prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "inventory_ledger_entries" WHERE "movementType" = 'ISSUE'::"InventoryMovementType"`,
      ]);

      const issueIds = rows.map((r) => r.id);
      const issueEntryNumbers = rows.map((r) => r.entryNumber);
      let reversedSet = new Set<string>();

      if (issueIds.length > 0) {
        const reversalRows = await prisma.$queryRaw<any[]>`
          SELECT "reversalOfId"
          FROM "inventory_ledger_entries"
          WHERE "reversalOfId" IN (${Prisma.join([...issueIds, ...issueEntryNumbers])})
        `;
        reversedSet = new Set(reversalRows.map((r) => String(r.reversalOfId)));
      }

      const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: row.quantityAfter, reserved: 0, averageCost: row.averageCostAfter })));
      res.json({
        success: true,
        data: {
          items: hydrated.map((entry) => {
            const isReversed = reversedSet.has(entry.id) || reversedSet.has(entry.entryNumber);
            return {
              ...entry,
              issueNumber: entry.entryNumber,
              quantity: Math.abs(Number(entry.quantityDelta || 0)),
              status: isReversed ? 'REVERSED' : 'ISSUED',
              reason: entry.sourceType,
              issuedAt: entry.postedAt ?? entry.issuedAt,
            };
          }),
          total: Number(countRows[0]?.count ?? rows.length),
          page,
          limit,
        },
        requestId: req.id,
      });
      return;
    }
    res.json({ success: true, data: await listLegacyTable('stock_issues', req), requestId: req.id });
  }
  catch (error) { next(error); }
});

/** Compatibility command endpoints now post through the authoritative ledger.
 * Existing issue/reservation screens can therefore adopt the modern balance
 * controls without a second stock implementation. */
router.post('/inventory/issues', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) { res.status(409).json({ success: false, message: 'Inventory ledger migration is required before issuing stock.', requestId: req.id }); return; }
    const body = req.body as Record<string, any>; const itemType = body.productId ? 'PRODUCT' : body.materialId ? 'MATERIAL' : null; const requestedItemId = body.productId || body.materialId;
    const quantity = Number(body.quantity);
    if (!itemType || !requestedItemId || !body.uomId || !Number.isFinite(quantity) || quantity <= 0) { res.status(400).json({ success: false, message: 'An item, UOM, and positive quantity are required.', requestId: req.id }); return; }
    const entries = await prisma.$transaction(async (tx) => {
      const itemId = await resolveInventoryItemId(tx, itemType, requestedItemId);
      const ownership = body.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY';
      const predicates: Prisma.Sql[] = [
        Prisma.sql`"itemType" = ${itemType}`,
        Prisma.sql`"itemId" = ${itemId}`,
        Prisma.sql`"condition" = 'AVAILABLE'::"InventoryCondition"`,
        Prisma.sql`"ownership" = ${ownership}::"InventoryOwnership"`,
      ];
      if (body.locationId) predicates.push(Prisma.sql`"locationId" = ${String(body.locationId)}`);
      // Lock all candidate balances before calculating the allocation. The
      // posting primitive rechecks each locked balance before applying it.
      const balances = await tx.$queryRaw<any[]>`
        SELECT
          balance."quantity"::text AS "quantity",
          balance."reserved"::text AS "reserved",
          balance."uomId",
          balance."locationId",
          balance."lotId"
        FROM "inventory_balances" AS balance
        WHERE ${Prisma.join(predicates, ' AND ')}
        ORDER BY balance."quantity" DESC, balance."locationId", balance."uomId"
        FOR UPDATE
      `;
      let remaining = quantity;
      const posted = [];
      for (const balance of balances) {
        const availableNative = Math.max(0, Number(balance.quantity) - Number(balance.reserved));
        const factor = await getUomConversionFactor(tx, balance.uomId, body.uomId);
        if (!factor) continue;
        // Balances are stored in their own UOM. Convert the requested amount
        // back to that UOM before posting so the ledger and balance stay exact.
        const quantityNative = Math.min(availableNative, remaining / factor);
        const issuedNative = Math.floor((quantityNative + Number.EPSILON) * 10000) / 10000;
        if (issuedNative <= 0) continue;
        posted.push(await inventoryPostingService.post(tx, { itemType, itemId, uomId: balance.uomId, locationId: balance.locationId, lotId: balance.lotId, movementType: 'ISSUE', quantity: issuedNative, ownership, sourceType: 'STOCK_ISSUE', sourceId: req.id, idempotencyKey: `${req.header('Idempotency-Key') || `ISSUE:${req.id}`}:${posted.length}`, actorId: req.user?.id || 'system', correlationId: req.id }));
        remaining = Math.max(0, remaining - issuedNative * factor);
        if (remaining <= 0) break;
      }
      if (remaining > 0.00005) throw new InsufficientStockError(`Insufficient unified available stock. Short by ${Number(remaining.toFixed(4))}.`);
      return posted;
    });
    res.status(201).json({ success: true, data: entries[0], requestId: req.id });
  } catch (error) { next(error); }
});
router.get('/inventory/issues/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text
        FROM "inventory_ledger_entries"
        WHERE ("id" = ${req.params.id} OR "entryNumber" = ${req.params.id})
          AND "movementType" = 'ISSUE'::"InventoryMovementType"
        LIMIT 1
      `;
      if (rows[0]) {
        const reversalRows = await prisma.$queryRaw<any[]>`
          SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text
          FROM "inventory_ledger_entries"
          WHERE "reversalOfId" = ${rows[0].id} OR "reversalOfId" = ${rows[0].entryNumber}
          LIMIT 1
        `;
        const isReversed = reversalRows.length > 0;
        const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: row.quantityAfter, reserved: 0, averageCost: row.averageCostAfter })));
        const entry = hydrated[0];
        res.json({
          success: true,
          data: {
            ...entry,
            issueNumber: entry.entryNumber,
            quantity: Math.abs(Number(entry.quantityDelta || 0)),
            status: isReversed ? 'REVERSED' : 'ISSUED',
            reason: entry.sourceType,
            issuedAt: entry.postedAt ?? entry.issuedAt,
            reversedAt: isReversed ? reversalRows[0].postedAt : null,
            reversalReason: isReversed ? reversalRows[0].sourceType : null,
          },
          requestId: req.id,
        });
        return;
      }
    }
    if (!(await tableAvailable('stock_issues'))) { res.status(404).json({ success: false, message: 'Stock issue not found', requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_issues" WHERE "id" = ${req.params.id} OR "issueNumber" = ${req.params.id} LIMIT 1`;
    if (!rows[0]) { res.status(404).json({ success: false, message: 'Stock issue not found', requestId: req.id }); return; }
    res.json({ success: true, data: rows[0], requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/issues/:id/reverse', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reason = (req.body?.reason || 'Reversed back to stock').trim();
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text
        FROM "inventory_ledger_entries"
        WHERE ("id" = ${req.params.id} OR "entryNumber" = ${req.params.id})
          AND "movementType" = 'ISSUE'::"InventoryMovementType"
        LIMIT 1
      `;
      if (!rows[0]) {
        res.status(404).json({ success: false, message: 'Stock issue not found', requestId: req.id });
        return;
      }
      const existing = rows[0];
      const reversalRows = await prisma.$queryRaw<any[]>`
        SELECT * FROM "inventory_ledger_entries"
        WHERE "reversalOfId" = ${existing.id} OR "reversalOfId" = ${existing.entryNumber}
        LIMIT 1
      `;
      if (reversalRows.length > 0) {
        res.status(400).json({ success: false, message: 'Stock issue has already been reversed.', requestId: req.id });
        return;
      }

      const quantity = Math.abs(Number(existing.quantityDelta || 0));
      const actorId = req.user?.id || 'system';

      const posted = await prisma.$transaction(async (tx) => {
        return inventoryPostingService.post(tx, {
          itemType: existing.itemType === 'PRODUCT' ? 'PRODUCT' : 'MATERIAL',
          itemId: existing.itemId,
          uomId: existing.uomId,
          locationId: existing.locationId,
          lotId: existing.lotId || null,
          movementType: 'RETURN',
          quantity,
          condition: 'AVAILABLE',
          ownership: existing.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY',
          unitCost: Number(existing.unitCost || 0),
          sourceType: reason || 'STOCK_ISSUE_REVERSAL',
          sourceId: existing.id,
          idempotencyKey: `REVERSE:${existing.id}:${Date.now()}`,
          actorId,
          correlationId: req.id,
        });
      });

      // Update reversal link
      await prisma.$executeRaw`
        UPDATE "inventory_ledger_entries"
        SET "reversalOfId" = ${existing.id}
        WHERE "id" = ${posted.id}
      `;

      const hydrated = await hydrateInventoryRows([posted]);
      res.status(200).json({
        success: true,
        data: {
          ...hydrated[0],
          id: existing.id,
          issueNumber: existing.entryNumber,
          status: 'REVERSED',
          reversedAt: posted.postedAt,
          reversalReason: reason,
        },
        requestId: req.id,
      });
      return;
    }

    if (await tableAvailable('stock_issues')) {
      await prisma.$queryRawUnsafe(
        `UPDATE "stock_issues" SET "status" = 'REVERSED', "reversedAt" = NOW(), "reversalReason" = $1 WHERE "id" = $2 OR "issueNumber" = $2`,
        reason,
        req.params.id
      );
      const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_issues" WHERE "id" = ${req.params.id} OR "issueNumber" = ${req.params.id} LIMIT 1`;
      res.json({ success: true, data: rows[0], requestId: req.id });
      return;
    }

    res.status(404).json({ success: false, message: 'Stock issue not found', requestId: req.id });
  } catch (error) {
    next(error);
  }
});
router.get('/inventory/transfers', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text
        FROM "inventory_ledger_entries"
        WHERE "movementType" IN ('TRANSFER_OUT'::"InventoryMovementType", 'TRANSFER_IN'::"InventoryMovementType")
        ORDER BY "postedAt" DESC
        LIMIT ${Math.min(100, Number(req.query.limit) || 50)}
        OFFSET ${(Math.max(1, Number(req.query.page) || 1) - 1) * (Math.min(100, Number(req.query.limit) || 50))}
      `;
      const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: Math.abs(Number(row.quantityDelta || 0)), averageCost: row.averageCostAfter })));
      res.json({
        success: true,
        data: {
          items: hydrated.map((entry) => ({
            ...entry,
            transferNumber: entry.entryNumber,
            requestedQuantity: Math.abs(Number(entry.quantityDelta || 0)),
            transferredQuantity: Math.abs(Number(entry.quantityDelta || 0)),
            status: entry.movementType === 'TRANSFER_IN' ? 'COMPLETED' : 'IN_TRANSIT',
            fromLocation: entry.location,
            toLocation: entry.location,
            fromLocationId: entry.locationId,
            toLocationId: entry.locationId,
          })),
          total: rows.length,
        },
        requestId: req.id,
      });
      return;
    }
    res.json({ success: true, data: await listLegacyTable('stock_transfers', req), requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/transfers', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) {
      res.status(409).json({ success: false, message: 'Inventory ledger migration is required before transferring stock.', requestId: req.id });
      return;
    }
    const body = req.body as Record<string, any>;
    const itemType = body.productId ? 'PRODUCT' : body.materialId ? 'MATERIAL' : null;
    const itemId = body.productId || body.materialId;
    const fromLocationId = body.fromLocationId;
    const toLocationId = body.toLocationId;
    const qty = Number(body.requestedQuantity || body.quantity);

    if (!itemType || !itemId || !body.uomId || !fromLocationId || !toLocationId || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ success: false, message: 'An item, UOM, origin & destination locations, and positive quantity are required.', requestId: req.id });
      return;
    }
    if (fromLocationId === toLocationId) {
      res.status(400).json({ success: false, message: 'Source and destination locations must be distinct.', requestId: req.id });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const transferOut = await inventoryPostingService.post(tx, {
        itemType,
        itemId,
        uomId: body.uomId,
        locationId: fromLocationId,
        movementType: 'TRANSFER_OUT',
        quantity: qty,
        ownership: body.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY',
        sourceType: 'STOCK_TRANSFER',
        sourceId: body.note || req.id,
        idempotencyKey: req.header('Idempotency-Key') ? `${req.header('Idempotency-Key')}:OUT` : `TRF-OUT:${req.id}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });

      const transferIn = await inventoryPostingService.post(tx, {
        itemType,
        itemId,
        uomId: body.uomId,
        locationId: toLocationId,
        movementType: 'TRANSFER_IN',
        quantity: qty,
        ownership: body.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY',
        sourceType: 'STOCK_TRANSFER',
        sourceId: body.note || req.id,
        idempotencyKey: req.header('Idempotency-Key') ? `${req.header('Idempotency-Key')}:IN` : `TRF-IN:${req.id}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });

      return {
        id: transferOut.id,
        transferNumber: transferOut.entryNumber,
        transferOut,
        transferIn,
      };
    });

    res.status(201).json({ success: true, data: result, requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/transfers/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text FROM "inventory_ledger_entries" WHERE "id" = ${req.params.id} LIMIT 1`;
      if (rows[0]) {
        const hydrated = await hydrateInventoryRows([rows[0]]);
        res.json({ success: true, data: hydrated[0], requestId: req.id });
        return;
      }
    }
    if (!(await tableAvailable('stock_transfers'))) { res.status(404).json({ success: false, message: 'Stock transfer not found', requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_transfers" WHERE "id" = ${req.params.id} LIMIT 1`;
    if (!rows[0]) { res.status(404).json({ success: false, message: 'Stock transfer not found', requestId: req.id }); return; }
    res.json({ success: true, data: rows[0], requestId: req.id });
  } catch (error) { next(error); }
});
router.get('/inventory/adjustments', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text FROM "inventory_ledger_entries" WHERE "movementType" = 'ADJUSTMENT'::"InventoryMovementType" ORDER BY "postedAt" DESC LIMIT ${Math.min(100, Number(req.query.limit) || 50)} OFFSET ${(Math.max(1, Number(req.query.page) || 1) - 1) * (Math.min(100, Number(req.query.limit) || 50))}`;
      const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: Math.abs(Number(row.quantityDelta || 0)), averageCost: row.averageCostAfter })));
      res.json({ success: true, data: { items: hydrated.map((entry) => ({ ...entry, adjustmentNumber: entry.entryNumber, quantity: Math.abs(Number(entry.quantityDelta || 0)), direction: Number(entry.quantityDelta || 0) < 0 ? 'DECREASE' : 'INCREASE', status: 'POSTED', reason: entry.sourceType })), total: rows.length }, requestId: req.id });
      return;
    }
    res.json({ success: true, data: await listLegacyTable('stock_adjustments', req), requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/adjustments', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) {
      res.status(409).json({ success: false, message: 'Inventory ledger migration is required before adjusting stock.', requestId: req.id });
      return;
    }
    const body = req.body as Record<string, any>;
    const itemType = body.productId ? 'PRODUCT' : body.materialId ? 'MATERIAL' : null;
    const requestedItemId = body.productId || body.materialId;
    if (!itemType || !requestedItemId || !body.uomId || !Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0) {
      res.status(400).json({ success: false, message: 'An item, UOM, and positive quantity are required.', requestId: req.id });
      return;
    }

    const direction = body.direction === 'DECREASE' ? 'DECREASE' : 'INCREASE';
    const quantity = Number(body.quantity);
    const ownership = body.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY';
    let inventoryItemId = String(requestedItemId);
    const entries = await prisma.$transaction(async (tx) => {
      // Variant rows are selectable catalog entries, but their stock is held
      // against the canonical parent material, just like the availability API
      // and direct stock issue flow.
      inventoryItemId = await resolveInventoryItemId(tx, itemType, String(requestedItemId));
      const balances = await tx.inventoryBalance.findMany({
        where: { itemType, itemId: inventoryItemId, condition: 'AVAILABLE', ownership, ...(body.locationId ? { locationId: body.locationId } : {}) },
        orderBy: { quantity: 'desc' },
      });
      let targets: Array<{ locationId: string; uomId: string; lotId?: string | null; quantity: number }> = [];
      if (direction === 'INCREASE') {
        let targetLocationId = body.locationId || balances[0]?.locationId;
        if (!targetLocationId) {
          const defaultLoc = await tx.warehouseLocation.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
          targetLocationId = defaultLoc?.id;
        }
        if (!targetLocationId) throw new ValidationError('No active inventory account is available for this adjustment.');
        targets = [{ locationId: targetLocationId, uomId: body.uomId, quantity }];
      } else {
        let remaining = quantity;
        for (const balance of balances) {
          const availableNative = Math.max(0, Number(balance.quantity) - Number(balance.reserved));
          const factor = await getUomConversionFactor(tx, balance.uomId, body.uomId);
          if (!factor || availableNative <= 0) continue;
          const requestedNative = Math.min(availableNative, remaining / factor);
          const adjustedNative = Math.floor((requestedNative + Number.EPSILON) * 10000) / 10000;
          if (adjustedNative <= 0) continue;
          targets.push({ locationId: balance.locationId, uomId: balance.uomId, lotId: balance.lotId, quantity: adjustedNative });
          remaining = Math.max(0, remaining - adjustedNative * factor);
          if (remaining <= 0.00005) break;
        }
        if (remaining > 0.00005) throw new InsufficientStockError(`Insufficient unified available stock. Short by ${Number(remaining.toFixed(4))}.`);
      }
      const idempotencyKey = req.header('Idempotency-Key') || `ADJUSTMENT:${req.id}`;
      const posted = [];
      for (const target of targets) {
        posted.push(await inventoryPostingService.post(tx, {
          itemType,
          itemId: inventoryItemId,
          uomId: target.uomId,
          locationId: target.locationId,
          lotId: target.lotId,
          movementType: 'ADJUSTMENT',
          quantity: direction === 'DECREASE' ? -target.quantity : target.quantity,
          ownership,
          sourceType: body.reason || 'MANUAL_ADJUSTMENT',
          sourceId: req.id,
          idempotencyKey: `${idempotencyKey}:${posted.length}`,
          actorId: req.user?.id || 'system',
          correlationId: req.id,
        }));
      }
      return posted;
    });
    const entry = entries[0];
    const locationId = entry.locationId;

    // Trigger reorder evaluation after the unified adjustment is posted.
    for (const adjustedLocationId of new Set(entries.map((postedEntry: any) => postedEntry.locationId))) {
      void modernReorderEvaluatorService.evaluateItem(itemType, inventoryItemId, adjustedLocationId).catch(() => undefined);
    }

    res.status(201).json({
      success: true,
      data: {
        id: entry.id,
        adjustmentNumber: entry.entryNumber,
        itemType,
        itemId: entry.itemId,
        productId: body.productId || null,
        materialId: body.materialId || null,
        uomId: body.uomId,
        locationId,
        quantity,
        direction,
        status: 'POSTED',
        reason: body.reason,
        createdAt: entry.postedAt || new Date(),
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/adjustments/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (await modernLedgerAvailable()) {
      const rows = await prisma.$queryRaw<any[]>`SELECT *, "quantityDelta"::text, "quantityBefore"::text, "quantityAfter"::text FROM "inventory_ledger_entries" WHERE "id" = ${req.params.id} OR "entryNumber" = ${req.params.id} LIMIT 1`;
      if (rows[0]) {
        const hydrated = await hydrateInventoryRows(rows.map((row) => ({ ...row, quantity: Math.abs(Number(row.quantityDelta || 0)), averageCost: row.averageCostAfter })));
        const entry = hydrated[0];
        res.json({
          success: true,
          data: {
            ...entry,
            adjustmentNumber: entry.entryNumber,
            quantity: Math.abs(Number(entry.quantityDelta || 0)),
            direction: Number(entry.quantityDelta || 0) < 0 ? 'DECREASE' : 'INCREASE',
            status: 'POSTED',
            reason: entry.sourceType,
          },
          requestId: req.id,
        });
        return;
      }
    }
    if (!(await tableAvailable('stock_adjustments'))) { res.status(404).json({ success: false, message: 'Stock adjustment not found', requestId: req.id }); return; }
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "stock_adjustments" WHERE "id" = ${req.params.id} LIMIT 1`;
    if (!rows[0]) { res.status(404).json({ success: false, message: 'Stock adjustment not found', requestId: req.id }); return; }
    res.json({ success: true, data: rows[0], requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/adjustments/:id/approve', authorize('approve', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    res.json({ success: true, data: { id: req.params.id, status: 'APPROVED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/adjustments/:id/reject', authorize('approve', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    res.json({ success: true, data: { id: req.params.id, status: 'REJECTED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/adjustments/:id/review', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    res.json({ success: true, data: { id: req.params.id, status: 'REVIEWED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/adjustments/:id/post', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    res.json({ success: true, data: { id: req.params.id, status: 'POSTED' }, requestId: req.id });
  } catch (error) { next(error); }
});
router.get('/inventory/reservations', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reservations = await prisma.inventoryReservation.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Number(req.query.limit) || 50),
      skip: (Math.max(1, Number(req.query.page) || 1) - 1) * Math.min(100, Number(req.query.limit) || 50),
    });
    const total = await prisma.inventoryReservation.count();

    const hydrated = await hydrateInventoryRows(reservations.map((r) => ({
      id: r.id,
      itemType: r.itemType,
      itemId: r.itemId,
      uomId: r.uomId,
      locationId: r.locationId,
      quantity: Number(r.quantity),
      quantityDelta: Number(r.quantity),
      status: r.status,
      reason: r.sourceType,
      sourceReference: r.sourceId,
      reservedAt: r.createdAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      releasedAt: r.releasedAt,
    })));

    res.json({
      success: true,
      data: {
        items: hydrated.map((r) => ({
          ...r,
          reservationNumber: `RES-${r.id.slice(0, 8).toUpperCase()}`,
        })),
        total,
      },
      requestId: req.id,
    });
  } catch (error) { next(error); }
});

router.post('/inventory/reservations', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    if (!(await modernLedgerAvailable())) {
      res.status(409).json({ success: false, message: 'Inventory ledger migration is required before reserving stock.', requestId: req.id });
      return;
    }
    const body = req.body as Record<string, any>;
    const itemType = body.productId ? 'PRODUCT' : body.materialId ? 'MATERIAL' : null;
    const itemId = body.productId || body.materialId;
    const qty = Number(body.quantity);
    if (!itemType || !itemId || !body.uomId || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ success: false, message: 'An item, UOM, and positive quantity are required.', requestId: req.id });
      return;
    }

    const reservations = await prisma.$transaction(async (tx) => {
      const ownership = body.ownership === 'VENDOR_HELD' ? 'VENDOR_HELD' : 'COMPANY';
      const balances = await tx.inventoryBalance.findMany({
        where: { itemType, itemId, uomId: body.uomId, condition: 'AVAILABLE', ownership, ...(body.locationId ? { locationId: body.locationId } : {}) },
        orderBy: { quantity: 'desc' },
      });
      let remaining = qty;
      const created = [];
      for (const balance of balances) {
        const available = Math.max(0, Number(balance.quantity) - Number(balance.reserved));
        const reservedQuantity = Math.min(remaining, available);
        if (reservedQuantity <= 0) continue;
        const resRecord = await tx.inventoryReservation.create({
          data: {
            itemType,
            itemId,
            uomId: body.uomId,
            locationId: balance.locationId,
            quantity: reservedQuantity,
            sourceType: body.reason || 'MANUAL_RESERVATION',
            sourceId: body.sourceReference || '',
            status: 'ACTIVE',
            createdBy: req.user?.id || 'system',
          },
        });
        await inventoryPostingService.post(tx, {
          itemType,
          itemId,
          uomId: body.uomId,
          locationId: balance.locationId,
          movementType: 'RESERVATION',
          quantity: reservedQuantity,
          ownership,
          sourceType: 'RESERVATION',
          sourceId: resRecord.id,
          idempotencyKey: `${req.header('Idempotency-Key') || `RESERVATION:${resRecord.id}`}:${created.length}`,
          actorId: req.user?.id || 'system',
          correlationId: req.id,
        });
        created.push(resRecord);
        remaining -= reservedQuantity;
        if (remaining <= 0) break;
      }
      if (remaining > 0) throw new InsufficientStockError(`Insufficient unified available stock. Short by ${remaining}.`);
      return created;
    });

    res.status(201).json({ success: true, data: reservations[0], requestId: req.id });
  } catch (error) { next(error); }
});

router.get('/inventory/reservations/:id', authorize('read', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reservation = await prisma.inventoryReservation.findUnique({ where: { id: req.params.id } });
    if (!reservation) { res.status(404).json({ success: false, message: 'Reservation not found', requestId: req.id }); return; }
    const hydrated = await hydrateInventoryRows([{
      id: reservation.id,
      itemType: reservation.itemType,
      itemId: reservation.itemId,
      uomId: reservation.uomId,
      locationId: reservation.locationId,
      quantity: Number(reservation.quantity),
      quantityDelta: Number(reservation.quantity),
      status: reservation.status,
      reason: reservation.sourceType,
      sourceReference: reservation.sourceId,
      reservedAt: reservation.createdAt,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
      releasedAt: reservation.releasedAt,
    }]);
    res.json({ success: true, data: { ...hydrated[0], reservationNumber: `RES-${reservation.id.slice(0, 8).toUpperCase()}` }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/reservations/:id/consume', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reservation = await prisma.inventoryReservation.findUnique({ where: { id: req.params.id } });
    if (!reservation) { res.status(404).json({ success: false, message: 'Reservation not found', requestId: req.id }); return; }
    if (reservation.status !== 'ACTIVE') { res.status(400).json({ success: false, message: `Reservation is already ${reservation.status.toLowerCase()}.`, requestId: req.id }); return; }

    const qty = Number(reservation.quantity);

    await prisma.$transaction(async (tx) => {
      // 1. Update reservation status to CONSUMED
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'CONSUMED', releasedAt: new Date() },
      });

      // 2. Release the soft hold
      await inventoryPostingService.post(tx, {
        itemType: reservation.itemType as any,
        itemId: reservation.itemId,
        uomId: reservation.uomId,
        locationId: reservation.locationId,
        movementType: 'RELEASE',
        quantity: qty,
        ownership: 'COMPANY',
        sourceType: 'RESERVATION_CONSUMED_RELEASE',
        sourceId: reservation.id,
        idempotencyKey: `RES-RELEASE:${reservation.id}:${Date.now()}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });

      // 3. Issue the physical inventory from store to shop floor
      await inventoryPostingService.post(tx, {
        itemType: reservation.itemType as any,
        itemId: reservation.itemId,
        uomId: reservation.uomId,
        locationId: reservation.locationId,
        movementType: 'ISSUE',
        quantity: qty,
        ownership: 'COMPANY',
        sourceType: 'RESERVATION_CONSUMED_ISSUE',
        sourceId: reservation.id,
        idempotencyKey: `RES-CONSUMED-ISSUE:${reservation.id}:${Date.now()}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });
    });

    res.json({ success: true, data: { id: reservation.id, status: 'CONSUMED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/reservations/:id/release', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reservation = await prisma.inventoryReservation.findUnique({ where: { id: req.params.id } });
    if (!reservation) { res.status(404).json({ success: false, message: 'Reservation not found', requestId: req.id }); return; }
    if (reservation.status !== 'ACTIVE') { res.status(400).json({ success: false, message: `Reservation is already ${reservation.status.toLowerCase()}.`, requestId: req.id }); return; }

    const qty = Number(reservation.quantity);

    await prisma.$transaction(async (tx) => {
      // 1. Update reservation status to RELEASED
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      // 2. Release the soft hold and return units to available balance
      await inventoryPostingService.post(tx, {
        itemType: reservation.itemType as any,
        itemId: reservation.itemId,
        uomId: reservation.uomId,
        locationId: reservation.locationId,
        movementType: 'RELEASE',
        quantity: qty,
        ownership: 'COMPANY',
        sourceType: 'RESERVATION_RELEASE',
        sourceId: reservation.id,
        idempotencyKey: `RES-RELEASE:${reservation.id}:${Date.now()}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });
    });

    res.json({ success: true, data: { id: reservation.id, status: 'RELEASED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/reservations/:id/cancel', authorize('create', 'StockLedgerEntry', permissionChecker), async (req, res, next) => {
  try {
    const reservation = await prisma.inventoryReservation.findUnique({ where: { id: req.params.id } });
    if (!reservation) { res.status(404).json({ success: false, message: 'Reservation not found', requestId: req.id }); return; }
    if (reservation.status !== 'ACTIVE') { res.status(400).json({ success: false, message: `Reservation is already ${reservation.status.toLowerCase()}.`, requestId: req.id }); return; }

    const qty = Number(reservation.quantity);

    await prisma.$transaction(async (tx) => {
      // 1. Update reservation status to CANCELLED
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'CANCELLED', releasedAt: new Date() },
      });

      // 2. Release the soft hold
      await inventoryPostingService.post(tx, {
        itemType: reservation.itemType as any,
        itemId: reservation.itemId,
        uomId: reservation.uomId,
        locationId: reservation.locationId,
        movementType: 'RELEASE',
        quantity: qty,
        ownership: 'COMPANY',
        sourceType: 'RESERVATION_CANCEL',
        sourceId: reservation.id,
        idempotencyKey: `RES-CANCEL:${reservation.id}:${Date.now()}`,
        actorId: req.user?.id || 'system',
        correlationId: req.id,
      });
    });

    res.json({ success: true, data: { id: reservation.id, status: 'CANCELLED' }, requestId: req.id });
  } catch (error) { next(error); }
});

router.post('/inventory/movements', authorize('create', 'StockLedgerEntry', permissionChecker), async (req: Request, res: Response, next) => {
  try {
    if (!(await modernLedgerAvailable())) { res.status(409).json({ success: false, message: 'Inventory ledger migration is required before posting movements.', requestId: req.id }); return; }
    const actorId = req.user?.id || 'system';
    const { itemType, itemId, uomId, locationId, lotId = null, movementType, quantity, condition = 'AVAILABLE', ownership = 'COMPANY', unitCost = 0, sourceType = 'MANUAL', sourceId = req.id, idempotencyKey = randomUUID() } = req.body as Record<string, any>;
    const validTypes = ['RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'RESERVATION', 'RELEASE', 'TRANSFER_OUT', 'TRANSFER_IN'];
    if (!['PRODUCT', 'MATERIAL'].includes(itemType) || !itemId || !uomId || !locationId || !validTypes.includes(movementType) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      res.status(400).json({ success: false, message: 'itemType, itemId, uomId, locationId, positive quantity, and a valid movementType are required.', requestId: req.id }); return;
    }
    const result = await prisma.$transaction((tx) => inventoryPostingService.post(tx, {
      itemType, itemId, uomId, locationId, lotId, movementType, quantity: Number(quantity), condition, ownership,
      unitCost: Number(unitCost), sourceType, sourceId, idempotencyKey, actorId, correlationId: req.id,
    }));
    publish([actorId], { id: req.id, type: 'inventory.balance.updated', resource: 'InventoryBalance', resourceId: `${itemType}:${itemId}:${locationId}`, version: Date.now() });
    // Replenishment is deliberately asynchronous: a failed alert or PO/PR
    // generation must never roll back a successfully posted stock movement.
    void prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "inventory_balances" WHERE "itemType" = ${itemType} AND "itemId" = ${itemId} AND "uomId" = ${uomId} AND "locationId" = ${locationId} AND "condition" = ${condition}::"InventoryCondition" AND "ownership" = ${ownership}::"InventoryOwnership" LIMIT 1`
      .then((rows) => rows[0]?.id ? modernReorderEvaluatorService.evaluate(rows[0].id) : undefined)
      .catch(() => undefined);
    res.status(201).json({ success: true, data: result, requestId: req.id });
  } catch (error) { next(error); }
});

export default router;
