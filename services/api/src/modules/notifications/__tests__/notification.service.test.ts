import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotificationService } from '../notification.service';
import { notificationWsServer } from '../../../common/websocket/notification-ws.server';
import { prisma } from '../../../database';

jest.mock('../../../database', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    userRole: {
      findMany: jest.fn()
    }
  }
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let sendToUserSpy: jest.SpiedFunction<typeof notificationWsServer.sendToUser>;
  let broadcastSpy: jest.SpiedFunction<typeof notificationWsServer.broadcastToRoleScope>;

  beforeEach(() => {
    service = new NotificationService();
    jest.clearAllMocks();
    sendToUserSpy = jest.spyOn(notificationWsServer, 'sendToUser').mockImplementation(() => {});
    broadcastSpy = jest.spyOn(notificationWsServer, 'broadcastToRoleScope').mockResolvedValue();
  });

  describe('handleAdjustmentEvent', () => {
    it('routes PROPOSED event to role-scoped users with approve permission', async () => {
      await service.handleAdjustmentEvent({
        type: 'PROPOSED',
        adjustmentId: 'adj-123',
        adjustmentNumber: 'ADJ-2026-001',
        proposedByActorId: 'actor-proposer',
        locationId: 'loc-1',
        materialType: 'RAW_MATERIAL'
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approve',
          resource: 'StockAdjustment',
          locationId: 'loc-1',
          materialType: 'RAW_MATERIAL'
        })
      );
    });

    it('routes APPROVED event to the original proposer', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValueOnce({
        id: 'notif-1',
        recipientId: 'actor-proposer',
        type: 'APPROVED',
        title: 'Stock Adjustment Approved (ADJ-2026-001)',
        message: 'Your proposed stock adjustment ADJ-2026-001 has been approved.',
        resource: 'StockAdjustment',
        resourceId: 'adj-123',
        href: '/stock/adjustments',
        createdAt: new Date(),
        readAt: null
      } as never);

      await service.handleAdjustmentEvent({
        type: 'APPROVED',
        adjustmentId: 'adj-123',
        adjustmentNumber: 'ADJ-2026-001',
        proposedByActorId: 'actor-proposer',
        locationId: 'loc-1'
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientId: 'actor-proposer',
            type: 'APPROVED',
            resourceId: 'adj-123'
          })
        })
      );
      expect(sendToUserSpy).toHaveBeenCalledWith('actor-proposer', expect.objectContaining({ id: 'notif-1' }));
    });

    it('routes OVERRIDDEN event to both store managers and the proposer with distinguishable metadata', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValueOnce({
        id: 'notif-override',
        recipientId: 'actor-proposer',
        type: 'WORKFLOW',
        title: 'Stock Adjustment Overridden by Admin (ADJ-2026-001)',
        message: 'Your proposed stock adjustment ADJ-2026-001 was approved via Admin override.',
        resource: 'StockAdjustment',
        resourceId: 'adj-123',
        href: '/stock/adjustments',
        createdAt: new Date(),
        readAt: null
      } as never);

      await service.handleAdjustmentEvent({
        type: 'OVERRIDDEN',
        adjustmentId: 'adj-123',
        adjustmentNumber: 'ADJ-2026-001',
        proposedByActorId: 'actor-proposer',
        locationId: 'loc-1',
        overrideActorId: 'actor-admin'
      });

      // Broadcast to Store Managers
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approve',
          resource: 'StockAdjustment',
          locationId: 'loc-1'
        })
      );

      // Direct notification to proposer
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientId: 'actor-proposer',
            type: 'WORKFLOW'
          })
        })
      );
    });
  });

  describe('handleTransferEvent', () => {
    it('routes REQUESTED event to users with transfer permission at the source location', async () => {
      await service.handleTransferEvent({
        type: 'REQUESTED',
        transferId: 'trf-1',
        transferNumber: 'TRF-2026-001',
        requestedByActorId: 'actor-requester',
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2'
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'transfer',
          resource: 'StockTransfer',
          locationId: 'loc-1'
        })
      );
    });

    it('routes PARTIALLY_RECEIVED event to the requester with shortfall in metadata', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValueOnce({
        id: 'notif-partial',
        recipientId: 'actor-requester',
        type: 'CHANGES_REQUESTED',
        title: 'Stock Transfer Partial Receipt (TRF-2026-001)',
        message: 'Transfer TRF-2026-001 was partially received with a shortfall of 3 units.',
        resource: 'StockTransfer',
        resourceId: 'trf-1',
        href: '/stock/transfers',
        createdAt: new Date(),
        readAt: null
      } as never);

      await service.handleTransferEvent({
        type: 'PARTIALLY_RECEIVED',
        transferId: 'trf-1',
        transferNumber: 'TRF-2026-001',
        requestedByActorId: 'actor-requester',
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        shortfall: 3
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientId: 'actor-requester',
            type: 'CHANGES_REQUESTED',
            resourceId: 'trf-1'
          })
        })
      );
      expect(sendToUserSpy).toHaveBeenCalledWith(
        'actor-requester',
        expect.objectContaining({ metadata: { shortfall: 3 } })
      );
    });
  });

  describe('markAsRead & markAllAsRead', () => {
    it('marks a single notification as read', async () => {
      (prisma.notification.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'notif-1',
        recipientId: 'user-1'
      } as never);
      (prisma.notification.update as jest.Mock).mockResolvedValueOnce({
        id: 'notif-1',
        readAt: new Date()
      } as never);

      const result = await service.markAsRead('user-1', 'notif-1');
      expect(result.readAt).toBeDefined();
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif-1' } })
      );
    });

    it('rejects marking someone else notification as read', async () => {
      (prisma.notification.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'notif-1',
        recipientId: 'user-other'
      } as never);

      await expect(service.markAsRead('user-1', 'notif-1')).rejects.toThrow();
    });

    it('marks all unread notifications for a user as read', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValueOnce({ count: 5 } as never);

      const result = await service.markAllAsRead('user-1');
      expect(result.count).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'user-1', readAt: null },
        data: expect.objectContaining({ readAt: expect.any(Date) })
      });
    });
  });
});
