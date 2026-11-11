import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => ({
  prisma: {
    purchaseOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    purchaseOrderLine: {
      deleteMany: jest.fn(),
    },
    purchaseRequisition: {
      findUnique: jest.fn(),
    },
    vendor: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    material: {
      findUnique: jest.fn(),
    },
    procurementApproval: {
      create: jest.fn(),
    },
    transmissionLog: {
      create: jest.fn(),
    },
    expectedReceipt: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' } as never),
      createMany: jest.fn(),
    },
    domainEventOutbox: { upsert: jest.fn().mockResolvedValue({} as never) },
    $executeRaw: jest.fn().mockResolvedValue(undefined as never),
    $transaction: jest.fn(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
  },
}));

class MockAuditWriter implements AuditWriter {
  events: any[] = [];
  async record(event: any): Promise<void> {
    this.events.push(event);
  }
}

class MockPermissionChecker implements PermissionChecker {
  rules: Record<string, boolean> = {};
  async can(actorId: string, action: string, _resource: string): Promise<boolean> {
    return this.rules[`${actorId}:${action}`] !== false;
  }
}

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;
  let permissionChecker: MockPermissionChecker;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    permissionChecker = new MockPermissionChecker();
    auditWriter = new MockAuditWriter();
    service = new PurchaseOrderService(permissionChecker, auditWriter);
    jest.resetAllMocks();
    (prisma.purchaseOrder.count as any).mockResolvedValue(0);
    (prisma.purchaseOrder.findMany as any).mockResolvedValue([]);
    (prisma.user.findMany as any).mockResolvedValue([]);
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.notification.create as any).mockResolvedValue({
      id: 'notif-1',
      recipientId: 'user1',
      type: 'INFO',
      title: 'Test Notification',
      message: 'Test Message',
      createdAt: new Date(),
      readAt: null
    });
    (prisma.$transaction as any).mockImplementation(async (operation: any) =>
      typeof operation === 'function' ? operation(prisma) : Promise.all(operation)
    );
  });

  describe('generatePO', () => {
    it('should generate a PO successfully after live validation of masters', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(null); // duplicate check
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce({
        id: 'pr-1',
        status: 'APPROVED',
        lines: [{ id: 'pr-line-1', productId: 'p-1', materialId: 'm-1', uomId: 'uom-1', requestedQuantity: 10 }],
        purchaseOrders: []
      });
      (prisma.vendor.findUnique as any).mockResolvedValueOnce({ id: 'v-1', status: 'APPROVED' });
      (prisma.product.findUnique as any).mockResolvedValueOnce({ id: 'p-1', status: 'ACTIVE' });
      (prisma.material.findUnique as any).mockResolvedValueOnce({ id: 'm-1', status: 'ACTIVE' });
      
      (prisma.purchaseOrder.create as any).mockResolvedValueOnce({ id: 'po-1', revisionNumber: 1, status: 'DRAFT', vendorId: 'v-1', createdAt: new Date() });

      const po = await service.generatePO({
        poNumber: 'PO-001',
        prId: 'pr-1',
        vendorId: 'v-1',
        lines: [{ productId: 'p-1', materialId: 'm-1', uomId: 'uom-1', quantity: 10, needDate: new Date() }]
      }, 'user1');

      expect(po.id).toBe('po-1');
      expect(prisma.purchaseOrder.create).toHaveBeenCalled();
    });

    it('should throw ValidationError if vendor is not APPROVED or ACTIVE', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(null);
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce({
        id: 'pr-1',
        status: 'APPROVED',
        lines: [{ id: 'pr-line-1', productId: 'p-1', materialId: null, uomId: 'uom-1', requestedQuantity: 10 }],
        purchaseOrders: []
      });
      (prisma.vendor.findUnique as any).mockResolvedValueOnce({ id: 'v-1', status: 'DRAFT' });

      await expect(service.generatePO({
        poNumber: 'PO-001', prId: 'pr-1', vendorId: 'v-1', lines: []
      }, 'user1')).rejects.toThrow(ValidationError);
    });

    it('should create a PO without a purchase requisition', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(null);
      (prisma.vendor.findUnique as any).mockResolvedValueOnce({ id: 'v-1', status: 'ACTIVE' });
      (prisma.product.findUnique as any).mockResolvedValueOnce({ id: 'p-1', status: 'ACTIVE' });
      (prisma.purchaseOrder.create as any).mockResolvedValueOnce({ id: 'po-direct', revisionNumber: 1, status: 'DRAFT', vendorId: 'v-1', createdAt: new Date() });

      const po = await service.generatePO({
        poNumber: 'PO-DIRECT', vendorId: 'v-1',
        lines: [{ productId: 'p-1', uomId: 'uom-1', quantity: 1, unitPrice: 25, needDate: new Date() }]
      }, 'user1');

      expect(po.id).toBe('po-direct');
      expect((prisma.purchaseOrder.create as any).mock.calls[0][0].data.prId).toBeUndefined();
    });

    it('should reject a PO line without a product or material', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(null);

      await expect(service.generatePO({
        poNumber: 'PO-002', vendorId: 'v-1',
        lines: [{ uomId: 'uom-1', quantity: 1, needDate: new Date() }]
      }, 'user1')).rejects.toThrow(ValidationError);
    });

    it('should validate direct PO master data before creating the order', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(null);
      (prisma.vendor.findUnique as any).mockResolvedValueOnce({ id: 'v-1', status: 'DRAFT' });

      await expect(service.generatePO({
        vendorId: 'v-1',
        lines: [{ productId: 'p-1', uomId: 'uom-1', quantity: 1, needDate: new Date() }]
      }, 'user1')).rejects.toThrow(ValidationError);
    });
  });

  describe('revisePO', () => {
    it('should revise the existing PO in place and log transmission if SENT', async () => {
      const oldPo = { id: 'po-1', poNumber: 'PO-001', revisionNumber: 1, status: 'SENT' };
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce(oldPo);
      
      // Mocks for inside transaction
      (prisma.purchaseOrder.update as any).mockResolvedValueOnce({ ...oldPo, revisionNumber: 2, status: 'DRAFT' });
      (prisma.transmissionLog.create as any).mockResolvedValueOnce({ id: 't-1' });

      const newPo = await service.revisePO('po-1', 'user1', { lines: [] }, 'Changes needed');

      expect(newPo.id).toBe('po-1');
      expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revisionNumber: 2, status: 'DRAFT' }) }));
      expect(prisma.transmissionLog.create).toHaveBeenCalled();
    });
  });

  describe('cancelPO', () => {
    it('should block cancellation if partial receipt exists', async () => {
      (prisma.purchaseOrder.findUnique as any).mockResolvedValueOnce({ id: 'po-1', status: 'APPROVED' });
      (prisma.expectedReceipt.findMany as any).mockResolvedValueOnce([{ status: 'PARTIALLY_RECEIVED' }]);

      await expect(service.cancelPO('po-1', 'user1')).rejects.toThrow(InvalidStateTransitionError);
    });
  });
});
