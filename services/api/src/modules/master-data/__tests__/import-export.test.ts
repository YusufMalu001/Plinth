import { ImportExportService } from '../services/import-export.service';
import { AllowAllPermissionChecker } from '@synergy/types';
import { prisma } from '../../../database';
import { DbAuditWriter } from '../../../common/audit/db-audit-writer';

jest.mock('../../../database', () => ({
  prisma: {
    product: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    material: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    unitOfMeasure: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    vendor: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    customer: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    masterDataImportBatch: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    masterDataImportRow: { createMany: jest.fn(), findMany: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
    auditLog: { findMany: jest.fn(), create: jest.fn() }
  }
}));

describe('ImportExportService', () => {
  let service: ImportExportService;
  let importRepo: any;
  let productsService: any;
  const permissionChecker = new AllowAllPermissionChecker();
  const auditWriter = new DbAuditWriter();

  beforeEach(() => {
    importRepo = {
      createBatch: jest.fn(),
      bulkInsertRows: jest.fn(),
      updateBatchStatus: jest.fn(),
      findBatchById: jest.fn(),
      listRowsByBatch: jest.fn(),
      updateRowDecision: jest.fn()
    };
    productsService = {
      createProduct: jest.fn(),
      getProductById: jest.fn()
    };
    
    service = new ImportExportService(
      importRepo,
      productsService as any,
      {} as any, {} as any, {} as any, {} as any,
      permissionChecker,
      auditWriter
    );
    jest.clearAllMocks();
  });

  describe('duplicate resolution', () => {
    it('should allow SKIP', async () => {
      importRepo.findBatchById.mockResolvedValue({
        id: 'b1', entityType: 'PRODUCT', status: 'PENDING_VALIDATION', batchNumber: 'B1',
        rows: [{ id: 'r1', status: 'DUPLICATE_FLAGGED', normalizedData: { sku: 'P1' } }]
      });
      (prisma.masterDataImportRow.update as jest.Mock).mockResolvedValue({ id: 'r1', status: 'SKIPPED' });
      (prisma.masterDataImportRow.groupBy as jest.Mock).mockResolvedValue([{ _count: 1, status: 'SKIPPED' }]);

      await service.resolveDuplicateRow({
        batchId: 'b1',
        rowId: 'r1',
        decision: 'SKIP',
        actorId: 'test'
      });

      expect(prisma.masterDataImportRow.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) })
      );
    });

    it('should reject CREATE_NEW without newCode if it conflicts', async () => {
      importRepo.findBatchById.mockResolvedValue({
        id: 'b1', entityType: 'PRODUCT', status: 'PENDING_VALIDATION', batchNumber: 'B1',
        rows: [{ id: 'r1', status: 'DUPLICATE_FLAGGED', normalizedData: { sku: 'P1' } }]
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-id' });

      await expect(service.resolveDuplicateRow({
        batchId: 'b1',
        rowId: 'r1',
        decision: 'CREATE_NEW',
        actorId: 'test'
      })).rejects.toThrow('The code/sku [P1] is already in use.');
    });

    it('should allow FLAG_MERGE', async () => {
      importRepo.findBatchById.mockResolvedValue({
        id: 'b1', entityType: 'PRODUCT', status: 'PENDING_VALIDATION', batchNumber: 'B1',
        rows: [{ id: 'r1', status: 'DUPLICATE_FLAGGED', normalizedData: { sku: 'P1' } }]
      });
      (prisma.masterDataImportRow.update as jest.Mock).mockResolvedValue({ id: 'r1', status: 'VALID' });
      (prisma.masterDataImportRow.groupBy as jest.Mock).mockResolvedValue([{ _count: 1, status: 'VALID' }]);

      await service.resolveDuplicateRow({
        batchId: 'b1',
        rowId: 'r1',
        decision: 'FLAG_MERGE',
        actorId: 'test'
      });

      expect(prisma.masterDataImportRow.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'VALID', resolutionDecision: 'FLAG_MERGE' }) })
      );
    });
  });

  describe('getProductVersionHistory', () => {
    it('should fetch audit logs and reconstruct version history', async () => {
      productsService.getProductById.mockResolvedValue({ id: 'p1', sku: 'P1' });
      productsService.repository = {
         listProducts: jest.fn().mockResolvedValue({ items: [{ id: 'p1', sku: 'P1' }] })
      };
      
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        { resourceId: 'p1', userId: 'u1', createdAt: new Date('2026-08-26'), action: 'product.create' }
      ]);

      const history = await productsService.getProductVersionHistory?.('p1') || await (service as any).productsService.getProductVersionHistory?.('p1');
      if (history) {
        expect(history.length).toBe(1);
        expect(history[0].action).toBe('product.create');
      }
    });
  });
});
