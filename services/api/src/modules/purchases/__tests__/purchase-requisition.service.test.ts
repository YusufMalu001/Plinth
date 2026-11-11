import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PurchaseRequisitionService } from '../services/purchase-requisition.service';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError, DuplicateError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => ({
  prisma: {
    purchaseRequisition: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    purchaseRequisitionLine: {
      findFirst: jest.fn(),
    },
    purchaseOrder: {
      findMany: jest.fn(),
    },
    procurementApproval: {
      create: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((promises: any[]) => Promise.all(promises)),
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

describe('PurchaseRequisitionService', () => {
  let service: PurchaseRequisitionService;
  let permissionChecker: MockPermissionChecker;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    permissionChecker = new MockPermissionChecker();
    auditWriter = new MockAuditWriter();
    service = new PurchaseRequisitionService(permissionChecker, auditWriter);
    jest.clearAllMocks();
  });

  describe('createPR', () => {
    it('should throw DuplicateError if PR number already exists', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce({  id: 'existing-id' });
      await expect(service.createPR({ prNumber: 'PR-001', departmentId: 'dept1', needDate: new Date(), lines: [] }, 'user1'))
        .rejects.toThrow(DuplicateError);
    });

    it('should allow multiple PRs for the same product/material', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce(null);
      (prisma.purchaseRequisition.create as any).mockResolvedValueOnce({ id: 'new-pr' });

      await expect(service.createPR({ prNumber: 'PR-001', departmentId: 'dept1', needDate: new Date(), lines: [{ productId: 'product-1', uomId: 'uom1', requestedQuantity: 10 }] }, 'user1'))
        .resolves.toEqual({ id: 'new-pr' });
    });

    it('should create PR without a duplicate-warning override audit', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce(null);
      (prisma.purchaseRequisition.create as any).mockResolvedValueOnce({  id: 'new-pr' });

      await service.createPR({ prNumber: 'PR-001', departmentId: 'dept1', needDate: new Date(), lines: [] }, 'user1');

      expect(auditWriter.events).toHaveLength(1);
      expect(auditWriter.events[0].action).toBe('purchase_requisition.create');
    });
  });

  describe('approvePR', () => {
    it('should prevent creator from self-approving without permission', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValue({
        id: 'pr-1',
        requesterId: 'user1',
        status: 'SUBMITTED',
        lines: [{}]
      });

      permissionChecker.rules['user1:self_approve'] = false;

      await expect(service.approvePR('pr-1', 'user1')).rejects.toThrow(ForbiddenError);
      await expect(service.approvePR('pr-1', 'user1')).rejects.toThrow(/cannot self-approve/);
    });

    it('should allow another user with approve permission to approve', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce({ 
        id: 'pr-1',
        requesterId: 'user1',
        status: 'SUBMITTED',
        lines: [{}]
      });
      (prisma.purchaseRequisition.update as any).mockResolvedValueOnce({  id: 'pr-1', status: 'APPROVED' });
      (prisma.procurementApproval.create as any).mockResolvedValueOnce({  id: 'appr-1' });

      await service.approvePR('pr-1', 'user2');

      expect(prisma.purchaseRequisition.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: expect.objectContaining({ status: 'APPROVED' })
      });
    });
  });

  describe('requestChangesPR', () => {
    it('should transition to CHANGES_REQUESTED and log reason', async () => {
      (prisma.purchaseRequisition.findUnique as any).mockResolvedValueOnce({ 
        id: 'pr-1',
        status: 'SUBMITTED',
        lines: [{}]
      });
      (prisma.purchaseRequisition.update as any).mockResolvedValueOnce({  id: 'pr-1', status: 'CHANGES_REQUESTED' });
      (prisma.procurementApproval.create as any).mockResolvedValueOnce({  id: 'appr-1' });

      await service.requestChangesPR('pr-1', 'user2', 'Need more details');

      expect(prisma.purchaseRequisition.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: { status: 'CHANGES_REQUESTED' }
      });
      expect(prisma.procurementApproval.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ decision: 'CHANGES_REQUESTED', reason: 'Need more details' })
      });
    });
  });
});
