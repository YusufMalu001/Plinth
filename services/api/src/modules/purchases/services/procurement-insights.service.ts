import { prisma } from '../../../database';

export class ProcurementInsightsService {
  async dashboard() {
    const now = new Date();
    const overdueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [
      totalPrs,
      awaitingApproval,
      cancelledPos,
      activePos,
      pendingReceipts,
      overdueReceipts,
      recentPrs,
      recentPos
    ] = await Promise.all([
      prisma.purchaseRequisition.count(),
      prisma.purchaseOrder.count({ where: { status: 'DRAFT' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['CANCELLED', 'REJECTED', 'SUPERSEDED'] } } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'] } } }),
      prisma.expectedReceipt.count({ where: { status: { not: 'FULLY_RECEIVED' } } }),
      prisma.expectedReceipt.count({ where: { status: { not: 'FULLY_RECEIVED' }, expectedDate: { lt: overdueDate } } }),
      prisma.purchaseRequisition.findMany({
        take: 6,
        orderBy: { updatedAt: 'desc' },
        include: { requester: { select: { id: true, name: true, email: true } }, department: true, preferredVendor: true, purchaseOrders: { select: { id: true, poNumber: true, status: true } } }
      }),
      prisma.purchaseOrder.findMany({
        take: 6,
        orderBy: { updatedAt: 'desc' },
        include: { vendor: true, sourcePr: { select: { id: true, prNumber: true } }, _count: { select: { lines: true, goodsReceiptNotes: true } } }
      })
    ]);
    return { metrics: { totalPrs, awaitingApproval, cancelledPos, activePos, pendingReceipts, overdueReceipts }, recentPrs, recentPos };
  }

  async notifications(recipientId: string, take = 50) {
    try {
      // Supabase's transaction pool is configured with a single connection in
      // this environment. Promise.all here makes the second query wait for a
      // connection and eventually hit Prisma's 10s pool timeout. An interactive
      // transaction keeps both reads on the same connection and avoids that
      // queue entirely.
      const [items, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({ where: { recipientId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(take, 1), 100) }),
        prisma.notification.count({ where: { recipientId, readAt: null } }),
      ]);
      return { items, unreadCount };
    } catch (error) {
      // During a rolling deployment the API can briefly run ahead of the
      // migration. Treat an absent notification table as an empty inbox rather
      // than turning every dashboard request into a 500/retry cycle.
      if ((error as { code?: string }).code === 'P2021') return { items: [], unreadCount: 0 };
      throw error;
    }
  }

  async markNotificationRead(id: string, recipientId: string) {
    await prisma.notification.updateMany({ where: { id, recipientId }, data: { readAt: new Date() } });
    return { id, read: true };
  }

  async markAllNotificationsRead(recipientId: string) {
    const result = await prisma.notification.updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }
}
