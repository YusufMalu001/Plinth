import { PrismaClient } from '@prisma/client';
import { SalesMetrics, SalesOrderChannel } from './sales.types';

export const salesOrderInclude = {
  lines: true,
  addresses: true,
  charges: true,
  taxes: true,
  payments: true,
  approvals: { orderBy: { createdAt: 'desc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  externalReferences: true,
  exceptions: { orderBy: { createdAt: 'desc' as const } },
  allocations: true,
  fulfillments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      warehouseLocation: true,
      pickLists: { include: { items: true } },
      packages: { include: { items: true, materialUsages: true } },
      shipments: { include: { carrier: true, trackingEvents: { orderBy: { eventAt: 'desc' as const } }, documents: true } },
    },
  },
};

export class SalesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    where: Record<string, unknown>,
    skip: number,
    take: number,
    orderBy: Record<string, 'asc' | 'desc'> = { orderedAt: 'desc' }
  ) {
    const db = this.prisma as any;
    const [items, total] = await Promise.all([
      db.salesOrder.findMany({
        where,
        include: salesOrderInclude,
        orderBy,
        skip,
        take,
      }),
      db.salesOrder.count({ where }),
    ]);
    return [items, total] as const;
  }

  findById(id: string) {
    return (this.prisma as any).salesOrder.findUnique({
      where: { id },
      include: salesOrderInclude,
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return (this.prisma as any).salesOrder.findUnique({
      where: { idempotencyKey },
      include: salesOrderInclude,
    });
  }

  findByExternalOrderId(externalOrderId: string) {
    return (this.prisma as any).salesOrder.findFirst({
      where: { externalOrderId },
      include: salesOrderInclude,
    });
  }

  async getMetrics(): Promise<SalesMetrics> {
    const db = this.prisma as any;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      openOrders,
      awaitingApproval,
      allocationNeeded,
      fulfillmentQueue,
      readyToDispatch,
      dispatchedToday,
      revenueResult,
      openExceptions,
      eTradeCount,
      posCount,
      amazonCount,
      physicalCount,
    ] = await Promise.all([
      db.salesOrder.count({
        where: {
          status: { notIn: ['CLOSED', 'CANCELLED', 'DELIVERED', 'RETURNED'] },
        },
      }),
      db.salesOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
      db.salesOrder.count({
        where: { status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED'] } },
      }),
      db.salesOrder.count({
        where: { status: { in: ['ALLOCATED', 'PICKING', 'PARTIALLY_PICKED', 'PICKED', 'PACKING'] } },
      }),
      db.salesOrder.count({
        where: { status: { in: ['PACKED', 'READY_TO_DISPATCH'] } },
      }),
      db.salesOrder.count({
        where: {
          status: { in: ['DISPATCHED', 'DELIVERED'] },
          dispatchedAt: { gte: todayStart },
        },
      }),
      db.salesOrder.aggregate({
        where: {
          status: { notIn: ['CANCELLED', 'VALIDATION_FAILED', 'DRAFT'] },
        },
        _sum: { grandTotal: true },
      }),
      db.salesOrderException.count({ where: { status: 'OPEN' } }),
      db.salesOrder.count({ where: { channel: 'E_TRADE' } }),
      db.salesOrder.count({ where: { channel: 'STORE_POS' } }),
      db.salesOrder.count({ where: { channel: 'AMAZON' } }),
      db.salesOrder.count({ where: { channel: 'PHYSICAL' } }),
    ]);

    const totalRevenue = Number(revenueResult?._sum?.grandTotal || 0);

    const channelCounts: Record<SalesOrderChannel, number> = {
      E_TRADE: eTradeCount,
      STORE_POS: posCount,
      AMAZON: amazonCount,
      PHYSICAL: physicalCount,
    };

    return {
      openOrders,
      awaitingApproval,
      allocationNeeded,
      fulfillmentQueue,
      readyToDispatch,
      dispatchedToday,
      totalRevenue,
      openExceptions,
      channelCounts,
    };
  }
}
