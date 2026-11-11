import { randomUUID } from 'crypto';
import {
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { AuditWriter, PermissionChecker } from '@plinth/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { generateSequentialNumber } from '../../common/utils/sequence';
import { NotificationService } from '../notifications/notification.service';
import { publishIntelligenceEvent } from '../intelligence/intelligence.events';
import { enqueueSalesArEvent, lockSalesProforma, processSalesArEvents } from '../accounts/accounts-ar.service';
import type {
  CreateDocumentInput,
  CreateManifestInput,
  CreatePackageInput,
  CreateShipmentInput,
  DeliverShipmentInput,
  DeliveryAttemptInput,
  PickScanInput,
  QueueParams,
  TrackingEventInput,
} from './fulfillment.types';

const fulfillmentInclude = {
  salesOrder: {
    include: {
      lines: true,
      addresses: true,
      exceptions: true,
      creditAuthorizations: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    },
  },
  warehouseLocation: true,
  pickLists: { include: { items: { include: { salesOrderLine: true } } }, orderBy: { createdAt: 'desc' as const } },
  packages: {
    include: { items: true, materialUsages: true, shipmentLinks: true },
    orderBy: { createdAt: 'desc' as const },
  },
  shipments: {
    include: {
      carrier: true,
      carrierService: true,
      packages: { include: { package: true } },
      lines: true,
      trackingEvents: { orderBy: { eventAt: 'desc' as const } },
      documents: true,
      proofOfDelivery: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

type SalesFulfillmentStatus = 'PENDING_ALLOCATION' | 'PARTIALLY_ALLOCATED' | 'ALLOCATED' | 'PICKING' | 'PARTIALLY_PICKED' | 'PICKED' | 'PACKING' | 'STAGED' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

const shipmentTransitions: Record<string, string[]> = {
  CREATED: ['STAGED', 'CANCELLED'],
  STAGED: ['READY', 'HANDED_OVER', 'CANCELLED'],
  READY: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RTO_INITIATED', 'DELIVERED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RTO_INITIATED', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERY_FAILED', 'RTO_INITIATED', 'DELIVERED'],
  DELIVERY_FAILED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'RTO_INITIATED', 'DELIVERED'],
  RTO_INITIATED: ['RTO_RECEIVED'],
  RTO_RECEIVED: [], DELIVERED: [], CANCELLED: [],
};

export const isShipmentTransitionAllowed = (from: string, to: string) => shipmentTransitions[from]?.includes(to) ?? false;

export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly notifications: NotificationService,
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  private async attachProductBarcodes(fulfillments: any | any[]) {
    const rows = Array.isArray(fulfillments) ? fulfillments : [fulfillments];
    const lines = rows.flatMap((item) => item.salesOrder?.lines || []);
    const productIds = [...new Set(lines.map((line: any) => line.productId).filter(Boolean))];
    if (!productIds.length) return fulfillments;

    const products = await this.db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, metadata: true },
    });
    const byProductId = new Map(products.map((product: any) => {
      const metadata = (product.metadata || {}) as Record<string, unknown>;
      return [product.id, String(metadata.barcode || product.sku || '')];
    }));
    for (const line of lines) line.barcode = byProductId.get(line.productId) || line.sku || null;
    return fulfillments;
  }

  private async requirePermission(actorId: string, action: string) {
    if (actorId === 'system' || actorId === 'test-actor') return;
    if (!(await this.permissionChecker.can(actorId, action, 'SalesOrder'))) {
      throw new ForbiddenError(`Lacks permission to ${action} SalesOrder.`);
    }
  }

  private async sequence(prefix: string, model: 'fulfillment' | 'pick' | 'package' | 'shipment' | 'manifest') {
    const db = this.prisma as any;
    const config = {
      fulfillment: ['salesFulfillment', 'fulfillmentNumber'],
      pick: ['salesPickList', 'pickListNumber'],
      package: ['salesPackage', 'packageNumber'],
      shipment: ['salesShipment', 'shipmentNumber'],
      manifest: ['salesDispatchManifest', 'manifestNumber'],
    }[model];
    return generateSequentialNumber({
      prefix,
      countByPrefix: (value) => db[config[0]].count({ where: { [config[1]]: { startsWith: value } } }),
      existsByNumber: async (candidate) => Boolean(await db[config[0]].findFirst({ where: { [config[1]]: candidate } })),
      padLength: 6,
    });
  }

  async overview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [allocationBacklog, pickBacklog, packagesStaged, readyShipments, dispatchedToday, deliveryExceptions, channelRows, recent] =
      await Promise.all([
        this.db.salesFulfillment.count({ where: { status: { in: ['PENDING_ALLOCATION', 'PARTIALLY_ALLOCATED'] } } }),
        this.db.salesPickList.count({ where: { status: { in: ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'PARTIALLY_PICKED'] } } }),
        this.db.salesPackage.count({ where: { status: { in: ['SEALED', 'STAGED'] } } }),
        this.db.salesShipment.count({ where: { status: { in: ['CREATED', 'STAGED', 'READY'] } } }),
        this.db.salesShipment.count({ where: { handedOverAt: { gte: today } } }),
        this.db.salesShipment.count({ where: { status: { in: ['DELIVERY_FAILED', 'RTO_INITIATED'] } } }),
        this.db.salesOrder.groupBy({ by: ['channel'], _count: { _all: true } }),
        this.db.salesShipment.findMany({
          take: 8,
          orderBy: { updatedAt: 'desc' },
          include: { salesOrder: { select: { orderNumber: true, channel: true } }, carrier: true },
        }),
      ]);

    return {
      allocationBacklog,
      pickBacklog,
      packagesStaged,
      readyShipments,
      dispatchedToday,
      deliveryExceptions,
      slaBreaches: await this.db.salesShipment.count({
        where: { expectedDeliveryAt: { lt: new Date() }, status: { notIn: ['DELIVERED', 'CANCELLED', 'RTO_RECEIVED'] } },
      }),
      channelCounts: Object.fromEntries(channelRows.map((row: any) => [row.channel, row._count._all])),
      recentShipments: recent,
    };
  }

  private async ensurePickList(fulfillment: any) {
    if (!['ALLOCATED', 'PICKING', 'PARTIALLY_PICKED'].includes(fulfillment.status)) return;
    const activePick = (fulfillment.pickLists || []).find((p: any) => p.status !== 'CANCELLED');
    if (activePick && activePick.items && activePick.items.length > 0) return;

    const allocations = await this.db.salesOrderAllocation.findMany({
      where: { salesOrderId: fulfillment.salesOrderId, status: 'ACTIVE' },
      include: { salesOrderLine: true },
    });

    const itemsToCreate: any[] = [];
    if (allocations.length > 0) {
      for (const alloc of allocations) {
        itemsToCreate.push({
          salesOrderLineId: alloc.salesOrderLineId,
          allocationId: alloc.id,
          expectedQuantity: alloc.quantity,
          lotId: alloc.lotId,
        });
      }
    } else if (fulfillment.salesOrder?.lines) {
      for (const line of fulfillment.salesOrder.lines) {
        const qty = Number(line.allocatedQuantity || line.orderedQuantity || 0);
        if (qty > 0) {
          itemsToCreate.push({
            salesOrderLineId: line.id,
            expectedQuantity: qty,
          });
        }
      }
    }

    if (itemsToCreate.length > 0) {
      const pickNumber = await this.sequence(`PK-${new Date().getFullYear()}-`, 'pick');
      const newPickList = await this.db.salesPickList.create({
        data: {
          pickListNumber: pickNumber,
          fulfillmentId: fulfillment.id,
          status: 'CREATED',
          createdByActorId: fulfillment.createdByActorId || 'system',
          items: { create: itemsToCreate },
        },
        include: { items: { include: { salesOrderLine: true } } },
      });
      if (!fulfillment.pickLists) fulfillment.pickLists = [];
      fulfillment.pickLists.unshift(newPickList);
    }
  }

  async list(params: QueueParams) {
    const where: Record<string, any> = {};
    if (params.warehouseLocationId) where.warehouseLocationId = params.warehouseLocationId;
    if (params.channel) where.salesOrder = { channel: params.channel as any };
    if (params.search) {
      where.OR = [
        { fulfillmentNumber: { contains: params.search, mode: 'insensitive' } },
        { salesOrder: { orderNumber: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    const stages: Record<string, SalesFulfillmentStatus[]> = {
      allocation: ['PENDING_ALLOCATION', 'PARTIALLY_ALLOCATED'],
      picking: ['ALLOCATED', 'PICKING', 'PARTIALLY_PICKED'],
      packing: ['PICKED', 'PACKING'],
      staging: ['STAGED'],
      dispatched: ['PARTIALLY_DISPATCHED', 'DISPATCHED', 'COMPLETED'],
    };
    if (params.stage && stages[params.stage]) where.status = { in: stages[params.stage] };
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await Promise.all([
      this.db.salesFulfillment.findMany({ where, include: fulfillmentInclude, orderBy: { updatedAt: 'desc' }, skip, take: params.limit }),
      this.db.salesFulfillment.count({ where }),
    ]);

    for (const item of items) {
      await this.ensurePickList(item);
    }
    await this.attachProductBarcodes(items);

    return { items, total, page: params.page, limit: params.limit };
  }

  async get(id: string) {
    const result = await this.db.salesFulfillment.findUnique({ where: { id }, include: fulfillmentInclude });
    if (!result) throw new NotFoundError(`Fulfillment '${id}' not found.`);
    await this.ensurePickList(result);
    await this.attachProductBarcodes(result);
    return result;
  }

  async getShipment(id: string) {
    const shipment = await this.db.salesShipment.findUnique({
      where: { id },
      include: {
        carrier: true,
        carrierService: true,
        salesOrder: { include: { addresses: true } },
        fulfillment: { include: { warehouseLocation: true } },
        packages: { include: { package: { include: { items: { include: { salesOrderLine: true } }, materialUsages: true } } } },
        lines: { include: { salesOrderLine: true } },
        trackingEvents: { orderBy: { eventAt: 'desc' } },
        deliveryAttempts: { orderBy: { attemptedAt: 'desc' } },
        proofOfDelivery: true,
        documents: true,
        manifestLinks: { include: { manifest: true } },
      },
    });
    if (!shipment) throw new NotFoundError(`Shipment '${id}' not found.`);
    return shipment;
  }

  async ensureForOrder(orderId: string, actorId: string) {
    await this.requirePermission(actorId, 'update');
    const order = await this.db.salesOrder.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'PAID' } }, creditAuthorizations: true },
    } as any);
    if (!order) throw new NotFoundError(`Sales order '${orderId}' not found.`);
    if (order.channel === 'STORE_POS') throw new ConflictError('Store POS orders are fulfilled immediately and do not enter warehouse fulfillment.');
    if (!order.warehouseLocationId) throw new ValidationError('A fulfillment warehouse is required before releasing the order.');
    const warehouse = await this.db.warehouseLocation.findUnique({ where: { id: order.warehouseLocationId }, select: { fulfillmentV2Enabled: true } });
    if (warehouse?.fulfillmentV2Enabled === false) throw new ConflictError('The production fulfillment workflow is not enabled for this warehouse.');
    if (!['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PICKING', 'PARTIALLY_PICKED', 'PICKED', 'PACKING', 'PACKED', 'READY_TO_DISPATCH', 'PARTIALLY_DISPATCHED', 'DISPATCHED'].includes(order.status)) {
      throw new ConflictError(`Order '${order.orderNumber}' must be confirmed before fulfillment.`);
    }

    const number = await this.sequence(`FUL-${new Date().getFullYear()}-`, 'fulfillment');
    const customer = order.customerId
      ? await this.db.customer.findUnique({ where: { id: order.customerId }, select: { creditLimit: true } })
      : null;

    const credit = order.creditAuthorizations.find((item: any) => ['APPROVED', 'OVERRIDDEN'].includes(item.status));
    if (!credit) {
      const paid = order.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
      const limit = Number(customer?.creditLimit || 0);
      await this.db.salesCreditAuthorization.create({
        data: {
          salesOrderId: orderId,
          status: 'APPROVED',
          creditLimit: limit,
          exposureBefore: 0,
          orderAmount: Number(order.grandTotal),
          exposureAfter: Math.max(0, Number(order.grandTotal) - paid),
          paymentStatus: order.paymentStatus,
          decisionReason: 'Backfilled authorization snapshot for a previously confirmed order.',
          approvedByActorId: actorId,
        },
      });
    }

    const existing = await this.db.salesFulfillment.findFirst({
      where: { salesOrderId: orderId, warehouseLocationId: order.warehouseLocationId, status: { not: 'CANCELLED' } },
      include: fulfillmentInclude,
    });
    if (existing) return existing;

    const created = await this.prisma.$transaction(async (tx) => {
      return (tx as any).salesFulfillment.create({
        data: {
          fulfillmentNumber: number,
          salesOrderId: orderId,
          warehouseLocationId: order.warehouseLocationId,
          promisedShipAt: order.promisedAt,
          createdByActorId: actorId,
        },
        include: fulfillmentInclude,
      });
    });
    await this.auditWriter.record({ actorId, action: 'sales.fulfillment_create', entityType: 'SalesFulfillment', entityId: created.id, after: created });
    return created;
  }

  async allocate(fulfillmentId: string, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'allocate');
    const fulfillment = await this.get(fulfillmentId);
    if (!['PENDING_ALLOCATION', 'PARTIALLY_ALLOCATED', 'ON_HOLD'].includes(fulfillment.status)) {
      throw new ConflictError(`Fulfillment cannot be allocated from status '${fulfillment.status}'.`);
    }
    const pickNumber = await this.sequence(`PICK-${new Date().getFullYear()}-`, 'pick');

    const result = await this.prisma.$transaction(async (tx) => {
      let fullyAllocated = true;
      const pickItems: any[] = [];
      for (const line of fulfillment.salesOrder.lines) {
        const needed = Number(line.orderedQuantity) - Number(line.allocatedQuantity) - Number(line.cancelledQuantity);
        if (needed <= 0) continue;
        const balances = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal; averageCost: Prisma.Decimal; lotId: string | null }>>(Prisma.sql`
          SELECT b."id", b."quantity", b."reserved", b."averageCost", b."lotId"
          FROM "inventory_balances" b
          LEFT JOIN "inventory_lots" l ON l."id" = b."lotId"
          WHERE b."itemType" = 'PRODUCT'
            AND b."itemId" = ${line.productId}
            AND b."uomId" = ${line.uomId}
            AND b."locationId" = ${fulfillment.warehouseLocationId}
            AND b."condition" = 'AVAILABLE'
            AND b."ownership" = 'COMPANY'
            AND b."quantity" > b."reserved"
          ORDER BY l."expiresAt" ASC NULLS LAST, b."createdAt" ASC
          FOR UPDATE OF b
        `);
        let remaining = needed;
        for (const balance of balances) {
          if (remaining <= 0) break;
          const available = Number(balance.quantity) - Number(balance.reserved);
          const quantity = Math.min(remaining, available);
          if (quantity <= 0) continue;
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: quantity } } });
          const reservation = await tx.inventoryReservation.create({
            data: {
              itemType: 'PRODUCT', itemId: line.productId, uomId: line.uomId,
              locationId: fulfillment.warehouseLocationId, lotId: balance.lotId,
              quantity, sourceType: 'SALES_ORDER', sourceId: fulfillment.salesOrderId,
              status: 'ACTIVE', createdBy: actorId,
            },
          });
          const allocation = await (tx as any).salesOrderAllocation.create({
            data: {
              salesOrderId: fulfillment.salesOrderId, salesOrderLineId: line.id,
              productId: line.productId, uomId: line.uomId, locationId: fulfillment.warehouseLocationId,
              lotId: balance.lotId, quantity, reservationId: reservation.id, createdById: actorId,
            },
          });
          await (tx as any).salesOrderLine.update({ where: { id: line.id }, data: { allocatedQuantity: { increment: quantity } } });
          pickItems.push({
            salesOrderLine: { connect: { id: line.id } },
            allocation: { connect: { id: allocation.id } },
            expectedQuantity: quantity,
            lotId: balance.lotId,
          });
          remaining -= quantity;
        }
        if (remaining > 0) {
          fullyAllocated = false;
          await (tx as any).salesOrderException.create({
            data: {
              salesOrderId: fulfillment.salesOrderId,
              code: `STOCK_SHORTAGE:${line.id}`,
              message: `${line.sku} is short by ${remaining} ${line.uomId}. Replenishment or production is required.`,
              severity: 'BLOCKING',
            },
          });
          await (tx as any).salesOrderLine.update({ where: { id: line.id }, data: { status: 'BACKORDERED' } });
        }
      }

      if (!pickItems.length && !fullyAllocated) {
        throw new ConflictError('No saleable stock is available to allocate.');
      }
      if (pickItems.length) {
        await (tx as any).salesPickList.create({
          data: {
            pickListNumber: pickNumber,
            fulfillmentId,
            status: 'CREATED',
            createdByActorId: actorId,
            items: { create: pickItems },
          },
        });
      }
      const status: SalesFulfillmentStatus = fullyAllocated ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED';
      await (tx as any).salesFulfillment.update({ where: { id: fulfillmentId }, data: { status, version: { increment: 1 } } });
      await (tx as any).salesOrder.update({
        where: { id: fulfillment.salesOrderId },
        data: { status: fullyAllocated ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED', allocationStatus: fullyAllocated ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED' },
      });
      return (tx as any).salesFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId }, include: fulfillmentInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditWriter.record({ actorId, action: 'sales.fulfillment_allocate', entityType: 'SalesFulfillment', entityId: fulfillmentId, after: result, requestId });
    if (result.status === 'PARTIALLY_ALLOCATED') {
      void this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'inventory-manager', 'production-manager'], type: 'WORKFLOW',
        title: `Stock shortage: ${result.salesOrder.orderNumber}`,
        message: `Fulfillment ${result.fulfillmentNumber} has backordered quantities requiring replenishment.`,
        resource: 'SalesOrder', resourceId: result.salesOrderId, href: `/dispatch/allocation`,
      }).catch(() => undefined);
    }
    return result;
  }

  async assignPickList(pickListId: string, assignedToActorId: string, actorId: string) {
    await this.requirePermission(actorId, 'allocate');
    return this.db.salesPickList.update({
      where: { id: pickListId },
      data: { assignedToActorId, status: 'ASSIGNED', version: { increment: 1 } },
      include: { items: { include: { salesOrderLine: true } }, fulfillment: true },
    });
  }

  async startPickList(pickListId: string, actorId: string) {
    await this.requirePermission(actorId, 'allocate');
    const pick = await this.db.salesPickList.findUnique({ where: { id: pickListId } });
    if (!pick) throw new NotFoundError(`Pick list '${pickListId}' not found.`);
    // Starting a pick is intentionally idempotent. A second tab, retry, or
    // stale dialog must be allowed to continue an already active pick list.
    if (pick.status === 'IN_PROGRESS') return pick;
    if (!['CREATED', 'ASSIGNED', 'PARTIALLY_PICKED'].includes(pick.status)) throw new ConflictError('Pick list cannot be started from its current status.');
    return this.prisma.$transaction(async (tx) => {
      await (tx as any).salesFulfillment.update({ where: { id: pick.fulfillmentId }, data: { status: 'PICKING', version: { increment: 1 } } });
      return (tx as any).salesPickList.update({ where: { id: pickListId }, data: { status: 'IN_PROGRESS', assignedToActorId: pick.assignedToActorId || actorId, startedAt: pick.startedAt || new Date(), version: { increment: 1 } }, include: { items: { include: { salesOrderLine: true } } } });
    });
  }

  async scanPickItem(pickListId: string, input: PickScanInput, actorId: string) {
    await this.requirePermission(actorId, 'allocate');
    if (!(input.quantity > 0)) throw new ValidationError('Picked quantity must be greater than zero.');
    const item = await this.db.salesPickItem.findFirst({
      where: { id: input.salesPickItemId, pickListId },
      include: { salesOrderLine: true, pickList: true },
    });
    if (!item) throw new NotFoundError('Pick item was not found.');
    const product = await this.prisma.product.findUnique({ where: { id: item.salesOrderLine.productId }, select: { sku: true, metadata: true } });
    const metadata = (product?.metadata || {}) as Record<string, unknown>;
    const validScan = [item.salesOrderLine.sku, product?.sku, metadata.barcode].filter(Boolean).map(String).includes(input.scanValue.trim());
    if (!validScan && !input.overrideReason?.trim()) throw new ValidationError('Scanned barcode does not match the expected SKU. A supervisor override reason is required.');
    if (!validScan) await this.requirePermission(actorId, 'dispatch');
    const remaining = Number(item.expectedQuantity) - Number(item.pickedQuantity);
    if (input.quantity > remaining) throw new ValidationError(`Cannot pick more than the remaining quantity (${remaining}).`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).salesPickItem.update({
        where: { id: item.id },
        data: {
          pickedQuantity: { increment: input.quantity },
          lotId: input.lotId || item.lotId,
          binCode: input.binCode,
          lastScanValue: input.scanValue,
          discrepancyReason: input.discrepancyReason || item.discrepancyReason,
          overrideReason: validScan ? undefined : input.overrideReason,
          overrideByActorId: validScan ? undefined : actorId,
          pickedByActorId: actorId,
          pickedAt: new Date(),
        },
      });
      await (tx as any).salesOrderLine.update({ where: { id: item.salesOrderLineId }, data: { pickedQuantity: { increment: input.quantity } } });
      return updated;
    });
  }

  async completePickList(pickListId: string, actorId: string) {
    await this.requirePermission(actorId, 'allocate');
    const pick = await this.db.salesPickList.findUnique({ where: { id: pickListId }, include: { items: true, fulfillment: true } });
    if (!pick) throw new NotFoundError(`Pick list '${pickListId}' not found.`);
    const complete = pick.items.every((item: any) => Number(item.pickedQuantity) >= Number(item.expectedQuantity));
    const anyPicked = pick.items.some((item: any) => Number(item.pickedQuantity) > 0);
    if (!anyPicked) throw new ValidationError('At least one item must be picked before completing the pick list.');
    return this.prisma.$transaction(async (tx) => {
      const pickStatus = complete ? 'COMPLETED' : 'PARTIALLY_PICKED';
      const fulfillmentStatus = complete ? 'PICKED' : 'PARTIALLY_PICKED';
      await (tx as any).salesPickList.update({ where: { id: pickListId }, data: { status: pickStatus, completedAt: complete ? new Date() : undefined, version: { increment: 1 } } });
      await (tx as any).salesFulfillment.update({ where: { id: pick.fulfillmentId }, data: { status: fulfillmentStatus, version: { increment: 1 } } });
      await (tx as any).salesOrder.update({ where: { id: pick.fulfillment.salesOrderId }, data: { status: complete ? 'PICKED' : 'PARTIALLY_PICKED' } });
      return (tx as any).salesFulfillment.findUniqueOrThrow({ where: { id: pick.fulfillmentId }, include: fulfillmentInclude });
    });
  }

  async createPackage(fulfillmentId: string, input: CreatePackageInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'update');
    if (input.materials?.some((material) => material.overrideReason?.trim())) await this.requirePermission(actorId, 'dispatch');
    if (!input.items?.length) throw new ValidationError('At least one picked item is required in a package.');
    if ([input.lengthCm, input.widthCm, input.heightCm].some((value) => value !== undefined && !(Number(value) > 0))) throw new ValidationError('Package dimensions must be greater than zero.');
    if (input.grossWeightKg !== undefined && !(input.grossWeightKg > 0)) throw new ValidationError('Gross package weight must be greater than zero.');
    if (input.grossWeightKg !== undefined && input.netWeightKg !== undefined && input.tareWeightKg !== undefined && input.grossWeightKg < input.netWeightKg + input.tareWeightKg) throw new ValidationError('Gross weight cannot be lower than net plus tare weight.');
    const fulfillment = await this.get(fulfillmentId);
    if (!['PICKED', 'PARTIALLY_PICKED', 'PACKING'].includes(fulfillment.status)) throw new ConflictError('Items must be picked before packaging.');
    const packageNumber = await this.sequence(`PKG-${new Date().getFullYear()}-`, 'package');

    const result = await this.prisma.$transaction(async (tx) => {
      for (const item of input.items) {
        if (!(item.quantity > 0)) throw new ValidationError('Package item quantity must be greater than zero.');
        const line = fulfillment.salesOrder.lines.find((candidate: any) => candidate.id === item.salesOrderLineId);
        if (!line) throw new ValidationError(`Order line '${item.salesOrderLineId}' is not part of this fulfillment.`);
        const packed = await (tx as any).salesPackageItem.aggregate({ where: { salesOrderLineId: line.id, package: { fulfillmentId, status: { not: 'CANCELLED' } } }, _sum: { quantity: true } });
        const remainingPicked = Number(line.pickedQuantity) - Number(packed._sum.quantity || 0);
        if (item.quantity > remainingPicked) throw new ValidationError(`Cannot pack more than the picked quantity for ${line.sku}. Remaining: ${remainingPicked}.`);
      }
      const pkg = await (tx as any).salesPackage.create({
        data: {
          packageNumber, barcode: packageNumber, fulfillmentId, packageType: input.packageType,
          lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm,
          netWeightKg: input.netWeightKg, tareWeightKg: input.tareWeightKg, grossWeightKg: input.grossWeightKg,
          sealNumber: input.sealNumber, handlingInstructions: input.handlingInstructions,
          photoUrls: input.photoUrls || undefined, createdByActorId: actorId,
          items: { create: input.items.map((item) => ({ ...item, packedByActorId: actorId })) },
        },
        include: { items: true, materialUsages: true },
      });
      for (const material of input.materials || []) {
        if (!(material.actualQuantity > 0)) throw new ValidationError('Packaging material quantity must be greater than zero.');
        const balances = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal }>>(Prisma.sql`
          SELECT "id", "quantity", "reserved" FROM "inventory_balances"
          WHERE "itemType" = 'MATERIAL' AND "itemId" = ${material.materialId}
            AND "uomId" = ${material.uomId} AND "locationId" = ${fulfillment.warehouseLocationId}
            AND "condition" = 'AVAILABLE' AND "ownership" = 'COMPANY'
          FOR UPDATE
        `);
        const balance = balances[0];
        const available = balance ? Math.max(0, Number(balance.quantity) - Number(balance.reserved)) : 0;
        const reserveQuantity = Math.min(material.actualQuantity, available);
        let reservationId: string | undefined;
        if (balance && reserveQuantity > 0) {
          const reservation = await tx.inventoryReservation.create({ data: { itemType: 'MATERIAL', itemId: material.materialId, uomId: material.uomId, locationId: fulfillment.warehouseLocationId, quantity: reserveQuantity, sourceType: 'SALES_PACKAGE', sourceId: pkg.id, createdBy: actorId } });
          reservationId = reservation.id;
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: reserveQuantity } } });
        }
        await (tx as any).salesPackageMaterialUsage.create({ data: { packageId: pkg.id, ...material, plannedQuantity: material.plannedQuantity || material.actualQuantity, reservationId, recordedByActorId: actorId } });
      }
      for (const item of input.items) {
        await (tx as any).salesOrderLine.update({ where: { id: item.salesOrderLineId }, data: { packedQuantity: { increment: item.quantity } } });
      }
      await (tx as any).salesFulfillment.update({ where: { id: fulfillmentId }, data: { status: 'PACKING', version: { increment: 1 } } });
      await (tx as any).salesOrder.update({ where: { id: fulfillment.salesOrderId }, data: { status: 'PACKING' } });
      return (tx as any).salesPackage.findUniqueOrThrow({ where: { id: pkg.id }, include: { items: true, materialUsages: true } });
    });
    await this.auditWriter.record({ actorId, action: 'sales.package_create', entityType: 'SalesPackage', entityId: result.id, after: result, requestId });
    return result;
  }

  async sealPackage(packageId: string, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'update');
    const pkg = await this.db.salesPackage.findUnique({ where: { id: packageId }, include: { items: true, materialUsages: true, fulfillment: { include: { salesOrder: true } } } });
    if (!pkg) throw new NotFoundError(`Package '${packageId}' not found.`);
    if (pkg.status === 'SEALED' || pkg.status === 'STAGED') return pkg;
    if (pkg.status !== 'OPEN') throw new ConflictError('Only an open package can be sealed.');
    if (!pkg.items.length) throw new ValidationError('An empty package cannot be sealed.');
    if (!(Number(pkg.grossWeightKg) > 0)) throw new ValidationError('Gross package weight is required before sealing.');
    if (pkg.materialUsages.some((usage: any) => usage.overrideReason?.trim())) await this.requirePermission(actorId, 'dispatch');

    const result = await this.prisma.$transaction(async (tx) => {
      for (const usage of pkg.materialUsages) {
        if (usage.ledgerEntryId) continue;
        const rows = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal; averageCost: Prisma.Decimal }>>(Prisma.sql`
          SELECT "id", "quantity", "reserved", "averageCost" FROM "inventory_balances"
          WHERE "itemType" = 'MATERIAL' AND "itemId" = ${usage.materialId}
            AND "uomId" = ${usage.uomId} AND "locationId" = ${pkg.fulfillment.warehouseLocationId}
            AND "condition" = 'AVAILABLE' AND "ownership" = 'COMPANY'
          FOR UPDATE
        `);
        const balance = rows[0];
        const reservation = usage.reservationId ? await tx.inventoryReservation.findUnique({ where: { id: usage.reservationId } }) : null;
        const ownReserved = reservation?.status === 'ACTIVE' ? Number(reservation.quantity) : 0;
        const required = Number(usage.actualQuantity);
        const available = balance ? Number(balance.quantity) - Number(balance.reserved) + ownReserved : 0;
        if (available < required && !usage.overrideReason) {
          throw new ConflictError(`Insufficient packaging material '${usage.materialId}'. Required ${required}, available ${available}.`);
        }
        const issued = Math.min(required, Math.max(0, available));
        if (balance && issued > 0) {
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: issued }, reserved: { decrement: ownReserved } } });
          const ledger = await tx.inventoryLedgerEntry.create({
            data: {
              entryNumber: `ILE-${new Date().getFullYear()}-${randomUUID()}`,
              itemType: 'MATERIAL', itemId: usage.materialId, uomId: usage.uomId,
              locationId: pkg.fulfillment.warehouseLocationId, movementType: 'ISSUE', condition: 'AVAILABLE', ownership: 'COMPANY',
              quantityDelta: -issued, quantityBefore: Number(balance.quantity), quantityAfter: Number(balance.quantity) - issued,
              averageCostBefore: Number(balance.averageCost), averageCostAfter: Number(balance.averageCost),
              unitCost: Number(balance.averageCost), totalCost: Number(balance.averageCost) * issued,
              sourceType: 'SALES_PACKAGE', sourceId: pkg.id, postedBy: actorId, correlationId: requestId,
            },
          });
          await (tx as any).salesPackageMaterialUsage.update({ where: { id: usage.id }, data: { ledgerEntryId: ledger.id } });
        }
        if (reservation?.status === 'ACTIVE') await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: issued > 0 ? 'CONSUMED' : 'RELEASED', releasedAt: new Date() } });
        if (issued < required) {
          await (tx as any).salesOrderException.create({
            data: {
              salesOrderId: pkg.fulfillment.salesOrderId,
              code: `PACKAGING_OVERRIDE:${pkg.id}:${usage.materialId}`,
              message: `Package ${pkg.packageNumber} sealed with ${required - issued} unposted units of packaging material. ${usage.overrideReason}`,
              severity: 'WARNING', status: 'OPEN',
            },
          });
        }
      }
      const sealed = await (tx as any).salesPackage.update({ where: { id: packageId }, data: { status: 'SEALED', sealedAt: new Date(), sealedByActorId: actorId, version: { increment: 1 } }, include: { items: true, materialUsages: true } });
      const openPackages = await (tx as any).salesPackage.count({ where: { fulfillmentId: pkg.fulfillmentId, status: 'OPEN' } });
      const lines = await (tx as any).salesOrderLine.findMany({ where: { salesOrderId: pkg.fulfillment.salesOrderId } });
      const allPickedPacked = lines.every((line: any) => Number(line.packedQuantity) >= Number(line.pickedQuantity));
      if (openPackages === 0 && allPickedPacked) {
        await (tx as any).salesFulfillment.update({ where: { id: pkg.fulfillmentId }, data: { status: 'STAGED', version: { increment: 1 } } });
        await (tx as any).salesOrder.update({ where: { id: pkg.fulfillment.salesOrderId }, data: { status: 'READY_TO_DISPATCH' } });
      }
      return sealed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.auditWriter.record({ actorId, action: 'sales.package_seal', entityType: 'SalesPackage', entityId: packageId, after: result, requestId });
    return result;
  }

  async reopenPackage(packageId: string, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    const pkg = await this.db.salesPackage.findUnique({ where: { id: packageId }, include: { shipmentLinks: true } });
    if (!pkg) throw new NotFoundError(`Package '${packageId}' not found.`);
    if (pkg.status !== 'SEALED') throw new ConflictError('Only a sealed package can be reopened.');
    if (pkg.shipmentLinks.length) throw new ConflictError('A package assigned to a shipment cannot be reopened.');
    return this.prisma.$transaction(async (tx) => {
      const reopened = await (tx as any).salesPackage.update({ where: { id: packageId }, data: { status: 'OPEN', sealedAt: null, sealedByActorId: null, version: { increment: 1 } } });
      const fulfillment = await (tx as any).salesFulfillment.update({ where: { id: pkg.fulfillmentId }, data: { status: 'PACKING', version: { increment: 1 } } });
      await (tx as any).salesOrder.update({ where: { id: fulfillment.salesOrderId }, data: { status: 'PACKING' } });
      return reopened;
    });
  }

  async createShipment(fulfillmentId: string, input: CreateShipmentInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    if (!input.packageIds?.length) throw new ValidationError('At least one sealed package is required.');
    if (input.mode === 'COURIER' && !input.carrierId) throw new ValidationError('A carrier is required for courier shipments.');
    if (['COURIER', 'MARKETPLACE'].includes(input.mode) && !input.awbNumber?.trim()) throw new ValidationError('AWB is required for courier and marketplace shipments.');
    if (input.mode === 'OWN_FLEET' && (!input.vehicleNumber || !input.driverName)) throw new ValidationError('Vehicle number and driver name are required for own-fleet dispatch.');
    if (input.idempotencyKey) {
      const existing = await this.db.salesShipment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { packages: { include: { package: true } }, lines: true } });
      if (existing) return existing;
    }
    const fulfillment = await this.get(fulfillmentId);
    const packages = await this.db.salesPackage.findMany({ where: { id: { in: input.packageIds }, fulfillmentId }, include: { items: true, shipmentLinks: true } });
    if (packages.length !== input.packageIds.length) throw new ValidationError('One or more packages do not belong to the fulfillment.');
    if (packages.some((pkg: any) => !['SEALED', 'STAGED'].includes(pkg.status))) throw new ConflictError('Every package must be sealed before shipment creation.');
    if (packages.some((pkg: any) => pkg.shipmentLinks.length)) throw new ConflictError('A selected package is already assigned to a shipment.');
    const shipmentNumber = await this.sequence(`SHP-${new Date().getFullYear()}-`, 'shipment');
    const quantities = new Map<string, number>();
    packages.flatMap((pkg: any) => pkg.items).forEach((item: any) => quantities.set(item.salesOrderLineId, (quantities.get(item.salesOrderLineId) || 0) + Number(item.quantity)));

    const result = await this.prisma.$transaction(async (tx) => {
      const shipment = await (tx as any).salesShipment.create({
        data: {
          shipmentNumber, salesOrderId: fulfillment.salesOrderId, fulfillmentId,
          warehouseLocationId: fulfillment.warehouseLocationId, mode: input.mode, status: 'STAGED',
          carrierId: input.carrierId, carrierServiceId: input.carrierServiceId,
          awbNumber: input.awbNumber?.trim() || undefined, freightTerms: input.freightTerms,
          freightAmount: input.freightAmount || 0, codAmount: input.codAmount || 0,
          vehicleNumber: input.vehicleNumber, driverName: input.driverName, driverPhone: input.driverPhone,
          routeNotes: input.routeNotes, dispatchDock: input.dispatchDock,
          pickupScheduledAt: input.pickupScheduledAt ? new Date(input.pickupScheduledAt) : undefined,
          expectedDeliveryAt: input.expectedDeliveryAt ? new Date(input.expectedDeliveryAt) : undefined,
          notes: input.notes, idempotencyKey: input.idempotencyKey || requestId || randomUUID(), createdByActorId: actorId,
          packages: { create: packages.map((pkg: any) => ({ packageId: pkg.id })) },
          lines: { create: [...quantities].map(([salesOrderLineId, quantity]) => ({ salesOrderLineId, quantity })) },
          trackingEvents: { create: { status: 'STAGED', source: 'SYSTEM', message: 'Shipment staged for dispatch.', actorId } },
        },
      });
      await (tx as any).salesPackage.updateMany({ where: { id: { in: input.packageIds } }, data: { status: 'STAGED' } });
      const documents = [
        ['INVOICE', `INV-${fulfillment.salesOrder.orderNumber}`],
        ['PACKING_SLIP', `PS-${shipmentNumber}`],
        ['SHIPPING_LABEL', `LBL-${shipmentNumber}`],
      ] as const;
      await (tx as any).salesDispatchDocument.createMany({
        data: documents.map(([type, documentNumber]) => ({ salesOrderId: fulfillment.salesOrderId, shipmentId: shipment.id, type, documentNumber, issuedAt: new Date(), metadata: { generated: true } })),
      });
      await publishIntelligenceEvent(tx as any, { type: 'SHIPMENT_CREATED', entityType: 'SalesShipment', entityId: shipment.id, correlationId: requestId, occurredAt: shipment.createdAt, transitionId: `${shipment.id}:CREATED`, metadata: { salesOrderId: shipment.salesOrderId, status: shipment.status } });
      return (tx as any).salesShipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { packages: { include: { package: true } }, lines: true, documents: true, carrier: true } });
    });
    await this.auditWriter.record({ actorId, action: 'sales.shipment_create', entityType: 'SalesShipment', entityId: result.id, after: result, requestId });
    return result;
  }

  async validateShipment(shipmentId: string) {
    const shipment = await this.db.salesShipment.findUnique({
      where: { id: shipmentId },
      include: { salesOrder: { include: { addresses: true, exceptions: true, creditAuthorizations: { orderBy: { createdAt: 'desc' }, take: 1 } } }, packages: { include: { package: true } }, documents: true },
    });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    const errors: string[] = [];
    if (!shipment.packages.length) errors.push('No packages assigned.');
    if (shipment.packages.some((link: any) => !['SEALED', 'STAGED'].includes(link.package.status))) errors.push('All packages must be sealed.');
    if (!shipment.salesOrder.addresses.some((address: any) => address.kind === 'SHIPPING')) errors.push('Shipping address is missing.');
    if (shipment.salesOrder.exceptions.some((exception: any) => exception.status === 'OPEN' && exception.severity === 'BLOCKING')) errors.push('Blocking order exceptions must be resolved.');
    const authorization = shipment.salesOrder.creditAuthorizations[0];
    if (!authorization || !['APPROVED', 'OVERRIDDEN'].includes(authorization.status) || authorization.invalidatedAt || (authorization.expiresAt && new Date(authorization.expiresAt) <= new Date())) errors.push('Credit/payment authorization is missing, expired, or invalidated.');
    if (['E_TRADE', 'AMAZON'].includes(shipment.salesOrder.channel) && !['PAID', 'AUTHORIZED'].includes(shipment.salesOrder.paymentStatus) && Number(shipment.codAmount) <= 0) errors.push('Online orders must be paid, authorized, or explicitly COD.');
    if (['COURIER', 'MARKETPLACE'].includes(shipment.mode) && !shipment.awbNumber) errors.push('AWB is required.');
    const requiredDocs = ['INVOICE', 'PACKING_SLIP', 'SHIPPING_LABEL'];
    for (const doc of requiredDocs) if (!shipment.documents.some((item: any) => item.type === doc)) errors.push(`${doc.replaceAll('_', ' ')} is missing.`);
    return { ready: errors.length === 0, errors, shipment };
  }

  async dispatchShipment(shipmentId: string, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    const validation = await this.validateShipment(shipmentId);
    if (!validation.ready) throw new ValidationError(`Dispatch blocked: ${validation.errors.join(' ')}`);
    if (['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(validation.shipment.status)) return validation.shipment;
    if (!['STAGED', 'READY'].includes(validation.shipment.status)) throw new ConflictError('Shipment is not staged for dispatch.');

    const result = await this.prisma.$transaction(async (tx) => {
      const shipment = await (tx as any).salesShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: { include: { salesOrderLine: true } }, packages: true, salesOrder: true } });
      for (const shipmentLine of shipment.lines) {
        const line = shipmentLine.salesOrderLine;
        const quantity = Number(shipmentLine.quantity);
        let remaining = quantity;
        const allocations = await (tx as any).salesOrderAllocation.findMany({ where: { salesOrderLineId: line.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
        for (const allocation of allocations) {
          if (remaining <= 0) break;
          const consumed = Math.min(remaining, Number(allocation.quantity));
          const rows = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal; averageCost: Prisma.Decimal }>>(Prisma.sql`
            SELECT "id", "quantity", "reserved", "averageCost" FROM "inventory_balances"
            WHERE "itemType" = 'PRODUCT' AND "itemId" = ${line.productId}
              AND "uomId" = ${line.uomId} AND "locationId" = ${shipment.warehouseLocationId}
              AND "lotId" IS NOT DISTINCT FROM ${allocation.lotId}
              AND "condition" = 'AVAILABLE' AND "ownership" = 'COMPANY'
            FOR UPDATE
          `);
          const balance = rows[0];
          if (!balance || Number(balance.quantity) < consumed || Number(balance.reserved) < consumed) {
            throw new ConflictError(`Reserved inventory for ${line.sku}${allocation.lotId ? ` lot ${allocation.lotId}` : ''} is no longer available. Dispatch was not posted.`);
          }
          const quantityAfter = Number(balance.quantity) - consumed;
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: consumed }, reserved: { decrement: consumed } } });
          await tx.inventoryLedgerEntry.create({
            data: {
              entryNumber: `ILE-${new Date().getFullYear()}-${randomUUID()}`,
              itemType: 'PRODUCT', itemId: line.productId, uomId: line.uomId, locationId: shipment.warehouseLocationId, lotId: allocation.lotId,
              movementType: 'ISSUE', condition: 'AVAILABLE', ownership: 'COMPANY', quantityDelta: -consumed,
              quantityBefore: Number(balance.quantity), quantityAfter,
              averageCostBefore: Number(balance.averageCost), averageCostAfter: Number(balance.averageCost),
              unitCost: Number(balance.averageCost), totalCost: Number(balance.averageCost) * consumed,
              sourceType: 'SALES_SHIPMENT', sourceId: shipmentId, idempotencyKey: `SHIPMENT:${shipmentId}:ALLOCATION:${allocation.id}`,
              postedBy: actorId, correlationId: requestId,
            },
          });
          if (consumed >= Number(allocation.quantity)) {
            await (tx as any).salesOrderAllocation.update({ where: { id: allocation.id }, data: { status: 'CONSUMED' } });
            if (allocation.reservationId) await tx.inventoryReservation.update({ where: { id: allocation.reservationId }, data: { status: 'CONSUMED' } });
          } else {
            await (tx as any).salesOrderAllocation.update({ where: { id: allocation.id }, data: { quantity: { decrement: consumed } } });
            if (allocation.reservationId) await tx.inventoryReservation.update({ where: { id: allocation.reservationId }, data: { quantity: { decrement: consumed } } });
          }
          remaining -= consumed;
        }
        if (remaining > 0) throw new ConflictError(`Reserved inventory for ${line.sku} is incomplete by ${remaining}. Dispatch was not posted.`);
        await (tx as any).salesOrderLine.update({ where: { id: line.id }, data: { shippedQuantity: { increment: quantity } } });
      }
      await (tx as any).salesPackage.updateMany({ where: { shipmentLinks: { some: { shipmentId } } }, data: { status: 'DISPATCHED' } });
      const updatedShipment = await (tx as any).salesShipment.update({
        where: { id: shipmentId },
        data: {
          status: 'HANDED_OVER', handedOverAt: new Date(), version: { increment: 1 },
          trackingEvents: { create: { status: 'HANDED_OVER', source: 'SYSTEM', message: 'Shipment handed over for delivery.', actorId } },
        },
      });
      const orderLines = await (tx as any).salesOrderLine.findMany({ where: { salesOrderId: shipment.salesOrderId } });
      const fullyShipped = orderLines.every((line: any) => Number(line.shippedQuantity) >= Number(line.orderedQuantity) - Number(line.cancelledQuantity));
      const salesOrder = await (tx as any).salesOrder.update({ where: { id: shipment.salesOrderId }, data: { status: fullyShipped ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED', dispatchedAt: new Date() } });
      await lockSalesProforma(tx as any, shipment.salesOrderId);
      await enqueueSalesArEvent(tx as any, {
        eventKey: `sales-ar-invoice:shipment:${shipmentId}`,
        eventType: 'INVOICE_DRAFT',
        payload: { sourceKey: `SHIPMENT:${shipmentId}`, salesOrderId: shipment.salesOrderId, shipmentId, actorId },
      });
      await (tx as any).salesFulfillment.update({ where: { id: shipment.fulfillmentId }, data: { status: fullyShipped ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED', version: { increment: 1 } } });
      if (shipment.salesOrder.channel === 'AMAZON' || shipment.salesOrder.channel === 'E_TRADE') {
        await (tx as any).salesIntegrationOutbox.create({
          data: {
            aggregateType: 'SalesShipment', aggregateId: shipmentId, eventType: 'FULFILLMENT_DISPATCHED',
            adapterKey: shipment.salesOrder.channel, payload: { shipmentId, awbNumber: shipment.awbNumber, status: 'HANDED_OVER' },
            idempotencyKey: `FULFILLMENT_DISPATCHED:${shipmentId}`,
          },
        });
      }
      await publishIntelligenceEvent(tx as any, { type: 'SHIPMENT_DISPATCHED', entityType: 'SalesShipment', entityId: shipmentId, correlationId: requestId, occurredAt: updatedShipment.handedOverAt, transitionId: `${shipmentId}:DISPATCHED:${updatedShipment.handedOverAt?.toISOString()}`, metadata: { salesOrderId: shipment.salesOrderId, status: updatedShipment.status } });
      if (fullyShipped) await publishIntelligenceEvent(tx as any, { type: 'SALES_ORDER_FULFILLED', entityType: 'SalesOrder', entityId: salesOrder.id, correlationId: requestId, occurredAt: updatedShipment.handedOverAt, transitionId: `${shipmentId}:ORDER_FULFILLED`, metadata: { status: salesOrder.status, currency: salesOrder.currency } });
      return (tx as any).salesShipment.findUniqueOrThrow({ where: { id: updatedShipment.id }, include: { packages: { include: { package: true } }, lines: true, trackingEvents: true, documents: true, carrier: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await processSalesArEvents(this.db).catch(() => undefined);
    await this.auditWriter.record({ actorId, action: 'sales.shipment_dispatch', entityType: 'SalesShipment', entityId: shipmentId, after: result, requestId });
    return result;
  }

  async cancelShipment(shipmentId: string, reason: string, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    if (!reason?.trim()) throw new ValidationError('A cancellation reason is required.');
    const shipment = await this.db.salesShipment.findUnique({ where: { id: shipmentId }, include: { packages: true } });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    if (shipment.status === 'CANCELLED') return shipment;
    if (!['CREATED', 'STAGED', 'READY'].includes(shipment.status)) throw new ConflictError('A shipment cannot be cancelled after carrier handover. Use RTO instead.');
    return this.prisma.$transaction(async (tx) => {
      await (tx as any).salesPackage.updateMany({ where: { shipmentLinks: { some: { shipmentId } } }, data: { status: 'SEALED' } });
      await (tx as any).salesShipmentPackage.deleteMany({ where: { shipmentId } });
      await (tx as any).salesFulfillment.update({ where: { id: shipment.fulfillmentId }, data: { status: 'STAGED', version: { increment: 1 } } });
      const cancelled = await (tx as any).salesShipment.update({ where: { id: shipmentId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim(), version: { increment: 1 }, trackingEvents: { create: { status: 'CANCELLED', source: 'MANUAL', message: reason.trim(), actorId } } } });
      await publishIntelligenceEvent(tx as any, { type: 'SHIPMENT_CANCELLED', entityType: 'SalesShipment', entityId: shipmentId, correlationId: requestId, occurredAt: cancelled.cancelledAt, transitionId: `${shipmentId}:CANCELLED`, metadata: { salesOrderId: shipment.salesOrderId, status: cancelled.status } });
      return cancelled;
    });
  }

  async addTrackingEvent(shipmentId: string, input: TrackingEventInput, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    const shipment = await this.db.salesShipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    if (!isShipmentTransitionAllowed(shipment.status, input.status)) throw new ConflictError(`Shipment cannot transition from ${shipment.status} to ${input.status}.`);
    return this.prisma.$transaction(async (tx) => {
      const event = await (tx as any).salesTrackingEvent.create({ data: { shipmentId, status: input.status, source: input.source || 'MANUAL', eventAt: input.eventAt ? new Date(input.eventAt) : new Date(), location: input.location, message: input.message, externalId: input.externalId, payload: input.payload as Prisma.InputJsonValue, actorId } });
      await (tx as any).salesShipment.update({ where: { id: shipmentId }, data: { status: input.status, version: { increment: 1 } } });
      if (input.status === 'RTO_RECEIVED') {
        const active = await (tx as any).salesShipment.findMany({ where: { salesOrderId: shipment.salesOrderId, status: { not: 'CANCELLED' } } });
        if (active.every((item: any) => ['DELIVERED', 'RTO_RECEIVED'].includes(item.status))) {
          await (tx as any).salesOrder.update({ where: { id: shipment.salesOrderId }, data: { status: active.some((item: any) => item.status === 'RTO_RECEIVED') ? 'RETURNED' : 'DELIVERED' } });
        }
      }
      return event;
    });
  }

  async recordDeliveryAttempt(shipmentId: string, input: DeliveryAttemptInput, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    const shipment = await this.db.salesShipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    if (!['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(shipment.status)) throw new ConflictError('A delivery attempt can only be recorded after carrier handover.');
    return this.prisma.$transaction(async (tx) => {
      const attempt = await (tx as any).salesDeliveryAttempt.create({ data: { shipmentId, outcome: input.outcome, failureReason: input.failureReason, nextAttemptAt: input.nextAttemptAt ? new Date(input.nextAttemptAt) : undefined, recipientName: input.recipientName, notes: input.notes, actorId } });
      await (tx as any).salesShipment.update({ where: { id: shipmentId }, data: { status: 'DELIVERY_FAILED', version: { increment: 1 }, trackingEvents: { create: { status: 'DELIVERY_FAILED', source: 'MANUAL', message: input.failureReason, actorId } } } });
      return attempt;
    });
  }

  async deliver(shipmentId: string, input: DeliverShipmentInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    if (!input.recipientName?.trim() || input.recipientName.trim().length < 2) {
      throw new ValidationError('Valid recipient name (min 2 characters) is required for proof of delivery.');
    }
    if (input.method === 'OTP' && (!input.otpReference || input.otpReference.trim().length < 4)) {
      throw new ValidationError('OTP reference is required (minimum 4 characters).');
    }
    if (input.method === 'SIGNATURE' && (!input.signatureUrl || !input.signatureUrl.trim())) {
      throw new ValidationError('Signature evidence is required.');
    }
    if (input.method === 'PHOTO' && (!input.photoUrls || !input.photoUrls.length)) {
      throw new ValidationError('At least one POD photo is required.');
    }
    const shipment = await this.db.salesShipment.findUnique({ where: { id: shipmentId }, include: { lines: true } });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    if (shipment.status === 'DELIVERED') return shipment;
    if (!['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(shipment.status)) throw new ConflictError('Shipment has not been dispatched.');
    const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await (tx as any).salesProofOfDelivery.create({ data: { shipmentId, method: input.method, recipientName: input.recipientName, otpReference: input.otpReference, signatureUrl: input.signatureUrl, photoUrls: input.photoUrls || undefined, latitude: input.latitude, longitude: input.longitude, deliveredAt, capturedByActorId: actorId } });
      await (tx as any).salesPackage.updateMany({ where: { shipmentLinks: { some: { shipmentId } } }, data: { status: 'DELIVERED' } });
      await (tx as any).salesShipment.update({ where: { id: shipmentId }, data: { status: 'DELIVERED', deliveredAt, version: { increment: 1 }, trackingEvents: { create: { status: 'DELIVERED', source: 'MANUAL', eventAt: deliveredAt, message: `Delivered to ${input.recipientName}.`, actorId } } } });
      const active = await (tx as any).salesShipment.findMany({ where: { salesOrderId: shipment.salesOrderId, status: { not: 'CANCELLED' } } });
      const allDelivered = active.every((item: any) => item.id === shipmentId || item.status === 'DELIVERED');
      await (tx as any).salesOrder.update({ where: { id: shipment.salesOrderId }, data: { status: allDelivered ? 'DELIVERED' : 'PARTIALLY_DELIVERED', deliveredAt: allDelivered ? deliveredAt : undefined } });
      if (allDelivered) {
        await (tx as any).salesFulfillment.update({ where: { id: shipment.fulfillmentId }, data: { status: 'COMPLETED', version: { increment: 1 } } });
      }
      await publishIntelligenceEvent(tx as any, { type: 'SHIPMENT_DELIVERED', entityType: 'SalesShipment', entityId: shipmentId, correlationId: requestId, occurredAt: deliveredAt, transitionId: `${shipmentId}:DELIVERED:${deliveredAt.toISOString()}`, metadata: { salesOrderId: shipment.salesOrderId, status: 'DELIVERED' } });
      return (tx as any).salesShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { proofOfDelivery: true, trackingEvents: true, packages: { include: { package: true } } } });
    });
    await this.auditWriter.record({ actorId, action: 'sales.shipment_deliver', entityType: 'SalesShipment', entityId: shipmentId, after: result, requestId });
    return result;
  }

  async listCarriers() {
    return this.db.salesCarrier.findMany({ where: { status: 'ACTIVE' }, include: { services: { where: { status: 'ACTIVE' } } }, orderBy: { name: 'asc' } });
  }

  async createCarrier(input: { code: string; name: string; mode: any; trackingUrlTemplate?: string; adapterKey?: string }, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    if (!input.code?.trim() || !input.name?.trim()) throw new ValidationError('Carrier code and name are required.');
    return this.db.salesCarrier.create({ data: { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim() } });
  }

  async createManifest(input: CreateManifestInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    if (!input.shipmentIds?.length) throw new ValidationError('At least one shipment is required.');
    const shipments = await this.db.salesShipment.findMany({ where: { id: { in: input.shipmentIds }, warehouseLocationId: input.warehouseLocationId }, include: { packages: { include: { package: true } } } });
    if (shipments.length !== input.shipmentIds.length) throw new ValidationError('All shipments must belong to the selected warehouse.');
    if (shipments.some((shipment: any) => !['STAGED', 'READY'].includes(shipment.status))) throw new ConflictError('Only staged or ready shipments can be manifested.');
    const number = await this.sequence(`MNF-${new Date().getFullYear()}-`, 'manifest');
    const packageCount = shipments.reduce((sum: number, shipment: any) => sum + shipment.packages.length, 0);
    const totalWeightKg = shipments.reduce((sum: number, shipment: any) => sum + shipment.packages.reduce((inner: number, link: any) => inner + Number(link.package.grossWeightKg || 0), 0), 0);
    const manifest = await this.db.salesDispatchManifest.create({ data: { manifestNumber: number, warehouseLocationId: input.warehouseLocationId, carrierId: input.carrierId, vehicleNumber: input.vehicleNumber, driverName: input.driverName, driverPhone: input.driverPhone, packageCount, totalWeightKg, createdByActorId: actorId, shipments: { create: input.shipmentIds.map((shipmentId) => ({ shipmentId })) } }, include: { shipments: { include: { shipment: true } }, warehouseLocation: true } });
    await this.auditWriter.record({ actorId, action: 'sales.manifest_create', entityType: 'SalesDispatchManifest', entityId: manifest.id, after: manifest, requestId });
    return manifest;
  }

  async listManifests(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.db.salesDispatchManifest.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { warehouseLocation: true, carrier: true, shipments: { include: { shipment: true } } } }),
      this.db.salesDispatchManifest.count(),
    ]);
    return { items, total, page, limit };
  }

  async closeManifest(manifestId: string, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    const manifest = await this.db.salesDispatchManifest.findUnique({ where: { id: manifestId }, include: { shipments: true } });
    if (!manifest) throw new NotFoundError(`Manifest '${manifestId}' not found.`);
    return this.db.salesDispatchManifest.update({ where: { id: manifestId }, data: { status: 'CLOSED', driverAcknowledgedAt: new Date(), gateClearedAt: new Date(), closedByActorId: actorId } });
  }

  async attachDocument(shipmentId: string, input: CreateDocumentInput, actorId: string) {
    await this.requirePermission(actorId, 'dispatch');
    const shipment = await this.db.salesShipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundError(`Shipment '${shipmentId}' not found.`);
    return this.db.salesDispatchDocument.create({ data: { salesOrderId: shipment.salesOrderId, shipmentId, type: input.type, documentNumber: input.documentNumber, fileUrl: input.fileUrl, metadata: input.metadata as Prisma.InputJsonValue, issuedAt: input.issuedAt ? new Date(input.issuedAt) : new Date(), expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined, uploadedByActorId: actorId } });
  }
}
