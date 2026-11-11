import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TallyIntegrationService } from '../services/tally-integration.service';
import { MappingConfigRepository } from '../repositories/mapping-config.repository';
import { IntegrationJobRepository } from '../repositories/integration-job.repository';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import { TallyExportAdapter } from '../adapters/tally-export.adapter';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import {
  TransactionSourceType,
  LifecycleStatus,
  IntegrationJobItemStatus,
  InternalReconciliationStatus,
  Prisma
} from '@prisma/client';

class MockAuditWriter implements AuditWriter {
  events: any[] = [];
  async record(event: any): Promise<void> {
    this.events.push(event);
  }
}

class AllowAllChecker implements PermissionChecker {
  async can(
    _actorId: string,
    _action: string,
    _resource: string,
    _scope?: any
  ): Promise<boolean> {
    return true;
  }
}

class DenyChecker implements PermissionChecker {
  async can(
    _actorId: string,
    _action: string,
    _resource: string,
    _scope?: any
  ): Promise<boolean> {
    return false;
  }
}

describe('TallyIntegrationService Unit Tests', () => {
  let mappingRepo: jest.Mocked<MappingConfigRepository>;
  let jobRepo: jest.Mocked<IntegrationJobRepository>;
  let reconRepo: jest.Mocked<ReconciliationRepository>;
  let exportAdapter: jest.Mocked<TallyExportAdapter>;
  let auditWriter: MockAuditWriter;
  let mockDb: any;

  beforeEach(() => {
    mappingRepo = {
      findById: jest.fn(),
      findApprovedBySourceType: jest.fn(),
      list: jest.fn(),
      getLatestVersionNumber: jest.fn(),
      create: jest.fn(),
      approve: jest.fn()
    } as unknown as jest.Mocked<MappingConfigRepository>;

    jobRepo = {
      findJobById: jest.fn(),
      findJobItemById: jest.fn(),
      findItemByFingerprint: jest.fn(),
      findItemsBySourceId: jest.fn(),
      listJobs: jest.fn(),
      listJobItems: jest.fn(),
      createJobWithItems: jest.fn(),
      updateJobExportSuccess: jest.fn(),
      updateItemStatus: jest.fn(),
      countTotalActiveByFingerprint: jest.fn()
    } as unknown as jest.Mocked<IntegrationJobRepository>;

    reconRepo = {
      create: jest.fn(),
      list: jest.fn()
    } as unknown as jest.Mocked<ReconciliationRepository>;

    exportAdapter = {
      export: jest.fn()
    } as unknown as jest.Mocked<TallyExportAdapter>;

    auditWriter = new MockAuditWriter();

    mockDb = {
      purchaseOrder: {
        findMany: jest.fn()
      }
    };
  });

  describe('Readiness and Eligibility', () => {
    it('reports every legacy source as unavailable, including approved purchase-order mappings', async () => {
      mappingRepo.findApprovedBySourceType.mockImplementation(async (sourceType) => {
        if (sourceType === 'PURCHASE_ORDER') {
          return { id: 'map-po-1', sourceType: 'PURCHASE_ORDER', version: 1, status: LifecycleStatus.APPROVED } as any;
        }
        return null;
      });

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const readiness = await service.getReadinessStatus();

      expect(readiness).toHaveLength(6);

      const poStatus = readiness.find((r) => r.sourceType === 'PURCHASE_ORDER');
      expect(poStatus?.status).toBe('NOT_YET_SUPPORTED');
      expect(poStatus?.supported).toBe(false);
      expect(poStatus?.reason).toContain('Purchase orders are commitments');
      expect(poStatus?.hasApprovedMapping).toBe(true);

      const salesStatus = readiness.find((r) => r.sourceType === 'SALES_INVOICE');
      expect(salesStatus?.status).toBe('NOT_YET_SUPPORTED');
      expect(salesStatus?.supported).toBe(false);

      const cogsStatus = readiness.find((r) => r.sourceType === 'INVENTORY_COGS');
      expect(cogsStatus?.status).toBe('NOT_YET_SUPPORTED');
      expect(cogsStatus?.supported).toBe(false);
      expect(cogsStatus?.reason).toContain('StockLedgerEntry lacks populated unitCost/totalValue');
    });

    const nonPoSourceTypes: TransactionSourceType[] = [
      'SALES_INVOICE',
      'DEBIT_NOTE',
      'JOB_WORK',
      'RETURN',
      'INVENTORY_COGS'
    ];

    nonPoSourceTypes.forEach((sourceType) => {
      it(`explicitly returns NOT_YET_SUPPORTED for ${sourceType} on eligibility check`, async () => {
        const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
        const result = await service.checkEligibility(sourceType);

        expect(result.status).toBe('NOT_YET_SUPPORTED');
        expect(result.supported).toBe(false);
        expect(result.eligibleCount).toBe(0);
        expect(result.items).toHaveLength(0);
        expect(result.message).toContain('no verified posted voucher exchange');
      });
    });

    it('does not make approved purchase orders eligible for accounting export', async () => {
      mappingRepo.findApprovedBySourceType.mockResolvedValueOnce({
        id: 'map-po-1', sourceType: 'PURCHASE_ORDER', version: 1, status: LifecycleStatus.APPROVED
      } as any);
      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const result = await service.checkEligibility('PURCHASE_ORDER');
      expect(result.status).toBe('NOT_YET_SUPPORTED');
      expect(result.supported).toBe(false);
      expect(result.eligibleCount).toBe(0);
      expect(result.message).toContain('commitments');
      expect(mockDb.purchaseOrder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Mapping Configuration & Segregation of Duties', () => {
    it('creates mapping configuration in DRAFT status', async () => {
      mappingRepo.getLatestVersionNumber.mockResolvedValueOnce(1);
      mappingRepo.create.mockResolvedValueOnce({
        id: 'map-new',
        sourceType: 'PURCHASE_ORDER',
        version: 2,
        status: LifecycleStatus.DRAFT,
        createdById: 'user-creator'
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const res = await service.createMappingConfiguration('user-creator', {
        sourceType: 'PURCHASE_ORDER',
        fieldMapping: { voucher: 'Purchase' }
      });

      expect(res.status).toBe(LifecycleStatus.DRAFT);
      expect(res.version).toBe(2);
      expect(auditWriter.events).toHaveLength(1);
    });

    it('enforces segregation of duties: creator cannot approve their own mapping configuration', async () => {
      mappingRepo.findById.mockResolvedValueOnce({
        id: 'map-1',
        sourceType: 'PURCHASE_ORDER',
        version: 1,
        status: LifecycleStatus.DRAFT,
        createdById: 'user-creator'
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);

      await expect(
        service.approveMappingConfiguration('user-creator', 'map-1')
      ).rejects.toThrow('Segregation of duties violation: Creator cannot approve their own mapping configuration');
    });

    it('allows a distinct authorized approver to approve the mapping configuration', async () => {
      mappingRepo.findById.mockResolvedValueOnce({
        id: 'map-1',
        sourceType: 'PURCHASE_ORDER',
        version: 1,
        status: LifecycleStatus.DRAFT,
        createdById: 'user-creator'
      } as any);

      mappingRepo.approve.mockResolvedValueOnce({
        id: 'map-1',
        sourceType: 'PURCHASE_ORDER',
        version: 1,
        status: LifecycleStatus.APPROVED,
        approvedById: 'user-approver'
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const approved = await service.approveMappingConfiguration('user-approver', 'map-1');

      expect(approved.status).toBe(LifecycleStatus.APPROVED);
      expect(approved.approvedById).toBe('user-approver');
      expect(auditWriter.events).toHaveLength(1);
    });
  });

  describe('Retired legacy queue', () => {
    it('rejects purchase-order and other source queueing', async () => {
      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      await expect(service.queueTransactions('actor-1', 'PURCHASE_ORDER', ['po-1'])).rejects.toThrow(/Legacy Tally queue is retired/);
      await expect(service.queueTransactions('actor-1', 'SALES_INVOICE', ['inv-1'])).rejects.toThrow(/Legacy Tally queue is retired/);
      expect(jobRepo.createJobWithItems).not.toHaveBeenCalled();
    });
  });

  describe('Export, Manual Acknowledgement & Internal Reconciliation Lifecycle', () => {
    it('rejects new legacy exports while preserving historic acknowledgement', async () => {
      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      await expect(service.exportBatch('actor-1', 'job-1')).rejects.toThrow(/Legacy Tally export is retired/);
      expect(exportAdapter.export).not.toHaveBeenCalled();
    });

    it('requires a manual finance acknowledgement step to transition from SENT to ACKNOWLEDGED', async () => {
      jobRepo.findJobItemById.mockResolvedValueOnce({
        id: 'item-1',
        status: IntegrationJobItemStatus.SENT
      } as any);

      jobRepo.updateItemStatus.mockResolvedValueOnce({
        id: 'item-1',
        status: IntegrationJobItemStatus.ACKNOWLEDGED,
        acknowledgedById: 'finance-user'
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const result = await service.manualAcknowledge('finance-user', 'item-1', {
        externalReference: 'TALLY-VCH-999',
        notes: 'Confirmed in Tally by accountant'
      });

      expect(result.status).toBe(IntegrationJobItemStatus.ACKNOWLEDGED);
      expect(result.acknowledgedById).toBe('finance-user');
    });

    it('performs internal reconciliation on ACKNOWLEDGED item and leaves externalAmount null', async () => {
      jobRepo.findJobItemById.mockResolvedValueOnce({
        id: 'item-1',
        status: IntegrationJobItemStatus.ACKNOWLEDGED,
        amount: new Prisma.Decimal('1000.00'),
        payloadFingerprint: 'fp-unique-1'
      } as any);

      jobRepo.countTotalActiveByFingerprint.mockResolvedValueOnce(1); // exactly 1

      reconRepo.create.mockResolvedValueOnce({
        id: 'recon-1',
        jobItemId: 'item-1',
        internalAmount: new Prisma.Decimal('1000.00'),
        externalAmount: null, // explicitly null in this pass
        status: InternalReconciliationStatus.INTERNALLY_CONSISTENT
      } as any);

      jobRepo.updateItemStatus.mockResolvedValueOnce({
        id: 'item-1',
        status: IntegrationJobItemStatus.RECONCILED,
        reconciliationStatus: InternalReconciliationStatus.INTERNALLY_CONSISTENT
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const recon = await service.reconcileInternal('finance-user', 'item-1');

      expect(recon.reconciliationRecord.status).toBe(InternalReconciliationStatus.INTERNALLY_CONSISTENT);
      expect(recon.reconciliationRecord.externalAmount).toBeNull();
      expect(recon.item.status).toBe(IntegrationJobItemStatus.RECONCILED);
    });

    it('rejects internal reconciliation on items that are not yet ACKNOWLEDGED (invalid state transition)', async () => {
      jobRepo.findJobItemById.mockResolvedValueOnce({
        id: 'item-1',
        status: IntegrationJobItemStatus.SENT // Not acknowledged yet
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);

      await expect(
        service.reconcileInternal('finance-user', 'item-1')
      ).rejects.toThrow('Invalid state transition: Cannot reconcile item from status SENT. Expected ACKNOWLEDGED.');
    });
  });

  describe('Controlled Error and Retry', () => {
    it('allows investigating and retrying a FAILED item back into QUEUED status', async () => {
      jobRepo.findJobItemById.mockResolvedValueOnce({
        id: 'item-failed-1',
        status: IntegrationJobItemStatus.FAILED
      } as any);

      jobRepo.updateItemStatus.mockResolvedValueOnce({
        id: 'item-failed-1',
        status: IntegrationJobItemStatus.QUEUED,
        retryCount: 1
      } as any);

      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new AllowAllChecker(), auditWriter, mockDb);
      const result = await service.investigateAndRetry('finance-user', 'item-failed-1', 'RETRY', 'Temporary network failure during batch generation');

      expect(result.status).toBe(IntegrationJobItemStatus.QUEUED);
      expect(result.retryCount).toBe(1);
      expect(auditWriter.events).toHaveLength(1);
    });

    it('rejects a mapping change if permission is denied', async () => {
      const service = new TallyIntegrationService(mappingRepo, jobRepo, reconRepo, exportAdapter, new DenyChecker(), auditWriter, mockDb);
      await expect(service.createMappingConfiguration('unauthorized-user', {
        sourceType: 'PURCHASE_ORDER', fieldMapping: {}
      })).rejects.toThrow(/Forbidden: Insufficient permissions/);
    });
  });
});
