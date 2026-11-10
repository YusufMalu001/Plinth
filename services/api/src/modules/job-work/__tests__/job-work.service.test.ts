import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { JobWorkService } from '../services/job-work.service';
import { JobWorkRepository } from '../repositories/job-work.repository';
import { StockLedgerRepository } from '../../inventory/repositories/stock-ledger.repository';
import { AllowAllPermissionChecker, ConsoleAuditWriter } from '@synergy/types';
import { JobWorkOrderStatus, JobWorkCustodyEntryType } from '@prisma/client';
import { NotFoundError } from '../../../common/errors/AppError';
import { prisma as defaultPrisma } from '../../../database';

jest.mock('../../../database', () => ({
  prisma: {
    vendor: { findUnique: jest.fn() },
    purchaseOrder: { findUnique: jest.fn() },
    warehouseLocation: { findUnique: jest.fn() },
    goodsReceiptNote: { create: jest.fn(), count: jest.fn() },
    debitNote: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    jobWorkOrder: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    jobWorkOrderLine: { update: jest.fn() },
    jobWorkMaterialIssue: { create: jest.fn(), findMany: jest.fn() },
    jobWorkCustodyLedger: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    jobWorkReceiptReturn: { create: jest.fn(), findMany: jest.fn() },
    jobWorkReconciliation: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: typeof defaultPrisma) => Promise<unknown>) => cb(defaultPrisma))
  }
}));

describe('JobWorkService Comprehensive Domain Tests', () => {
  let service: JobWorkService;
  let repository: JobWorkRepository;
  let stockLedgerRepo: StockLedgerRepository;
  let auditWriter: ConsoleAuditWriter;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new JobWorkRepository();
    stockLedgerRepo = new StockLedgerRepository();
    auditWriter = new ConsoleAuditWriter();
    jest.spyOn(auditWriter, 'record').mockImplementation(async () => {});
    jest.spyOn(stockLedgerRepo, 'postEntry').mockImplementation(async () => ({} as never));

    service = new JobWorkService(
      repository,
      new AllowAllPermissionChecker(),
      auditWriter,
      stockLedgerRepo
    );
  });

  describe('createOrder', () => {
    it('creates a Job Work order with raw material deposit deduction in custody ledger', async () => {
      (defaultPrisma.vendor.findUnique as jest.Mock).mockResolvedValue({ id: 'v-1', name: 'Vendor 1', status: 'ACTIVE' } as never);
      jest.spyOn(repository, 'countOrders').mockResolvedValue(0);
      jest.spyOn(repository, 'countLedgerEntries').mockResolvedValue(0);
      jest.spyOn(repository, 'getLatestVendorCustodyEntry').mockResolvedValue({
        runningBalance: 8
      } as never);

      (defaultPrisma.jobWorkOrder.create as jest.Mock).mockResolvedValue({
        id: 'jwo-1',
        orderNumber: 'JWO-2026-0001',
        vendorId: 'v-1',
        rawMaterialInputQty: 4,
        status: JobWorkOrderStatus.DRAFT,
        lines: [
          { id: 'line-1', materialId: 'm-1', requiredQuantity: 4, allocatedQuantity: 4 }
        ]
      } as never);

      const order = await service.createOrder(
        {
          vendorId: 'v-1',
          productId: 'p-1',
          targetQuantity: 100,
          rawMaterialInputQty: 4,
          expectedScrapRate: 0,
          lines: [
            { materialId: 'm-1', uomId: 'uom-1', requiredQuantity: 4, allocatedQuantity: 4 }
          ]
        },
        'user-1'
      );

      expect(order).toBeDefined();
      expect(order.id).toBe('jwo-1');
      expect(defaultPrisma.jobWorkCustodyLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendorId: 'v-1',
            entryType: JobWorkCustodyEntryType.PO_DEPOSIT_DEDUCTION,
            quantity: 4,
            runningBalance: 4
          })
        })
      );
    });

    it('throws NotFoundError if vendor does not exist', async () => {
      (defaultPrisma.vendor.findUnique as jest.Mock).mockResolvedValue(null as never);

      await expect(
        service.createOrder(
          {
            vendorId: 'v-999',
            targetQuantity: 10,
            rawMaterialInputQty: 10,
            expectedScrapRate: 0,
            lines: [{ materialId: 'm-1', uomId: 'uom-1', requiredQuantity: 10, allocatedQuantity: 0 }]
          },
          'user-1'
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('issueMaterial (Delivery Challan & Vendor-held balance)', () => {
    it('issues 8 tons of raw material, posts stock ledger OUT and vendor custody IN', async () => {
      (defaultPrisma.vendor.findUnique as jest.Mock).mockResolvedValue({ id: 'v-1', name: 'Vendor 1' } as never);
      (defaultPrisma.warehouseLocation.findUnique as jest.Mock).mockResolvedValue({ id: 'loc-1', name: 'Main Plant' } as never);
      jest.spyOn(repository, 'countChallans').mockResolvedValue(0);
      jest.spyOn(repository, 'countLedgerEntries').mockResolvedValue(0);
      jest.spyOn(repository, 'getLatestVendorCustodyEntry').mockResolvedValue({
        runningBalance: 0
      } as never);

      (defaultPrisma.jobWorkMaterialIssue.create as jest.Mock).mockResolvedValue({
        id: 'challan-1',
        challanNumber: 'JWC-2026-0001',
        vendorId: 'v-1',
        quantity: 8
      } as never);

      const challan = await service.issueMaterial(
        {
          vendorId: 'v-1',
          dispatchLocationId: 'loc-1',
          materialId: 'm-1',
          uomId: 'uom-1',
          quantity: 8,
          vehicleNumber: 'MH-12-AB-1234'
        },
        'user-1'
      );

      expect(challan.challanNumber).toBe('JWC-2026-0001');
      expect(stockLedgerRepo.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          materialId: 'm-1',
          quantity: 8,
          direction: 'OUT'
        }),
        expect.anything()
      );
      expect(defaultPrisma.jobWorkCustodyLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendorId: 'v-1',
            entryType: JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE,
            quantity: 8,
            runningBalance: 8
          })
        })
      );
    });
  });

  describe('receiveReturn (Normal GRN + Shortage Debit Note flow)', () => {
    it('handles return receipt, creates GRN and generates Debit Note when short', async () => {
      (defaultPrisma.vendor.findUnique as jest.Mock).mockResolvedValue({ id: 'v-1', name: 'Vendor 1' } as never);
      (defaultPrisma.warehouseLocation.findUnique as jest.Mock).mockResolvedValue({ id: 'loc-1', name: 'Receiving Dock' } as never);
      jest.spyOn(repository, 'countReturns').mockResolvedValue(0);
      jest.spyOn(repository, 'countLedgerEntries').mockResolvedValue(0);
      jest.spyOn(repository, 'getLatestVendorCustodyEntry').mockResolvedValue({
        runningBalance: 8
      } as never);

      (defaultPrisma.goodsReceiptNote.count as jest.Mock).mockResolvedValue(0 as never);
      (defaultPrisma.goodsReceiptNote.create as jest.Mock).mockResolvedValue({
        id: 'grn-1',
        grnNumber: 'GRN-JW-2026-0001',
        lines: [{ id: 'grn-line-1' }]
      } as never);

      (defaultPrisma.debitNote.count as jest.Mock).mockResolvedValue(0 as never);
      (defaultPrisma.debitNote.create as jest.Mock).mockResolvedValue({
        id: 'dn-1',
        debitNoteNumber: 'DN-JW-2026-0001',
        vendorId: 'v-1'
      } as never);

      (defaultPrisma.jobWorkReceiptReturn.create as jest.Mock).mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'JWR-2026-0001',
        expectedQuantity: 100,
        receivedQuantity: 80,
        acceptedQuantity: 80,
        shortQuantity: 20
      } as never);

      const result = await service.receiveReturn(
        {
          vendorId: 'v-1',
          locationId: 'loc-1',
          productId: 'p-1',
          uomId: 'uom-1',
          expectedQuantity: 100,
          receivedQuantity: 80,
          acceptedQuantity: 80,
          scrapQuantity: 0,
          disposition: 'FINISHED_GOODS',
          consumedRawMaterial: 4,
          generateDebitNoteForShortage: true
        },
        'user-1'
      );

      expect(result.receiptReturn.returnNumber).toBe('JWR-2026-0001');
      expect(result.grn).toBeDefined();
      expect(result.debitNote).toBeDefined();
      expect(result.debitNote?.debitNoteNumber).toBe('DN-JW-2026-0001');
      expect(defaultPrisma.debitNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendorId: 'v-1'
          })
        })
      );
    });
  });

  describe('reconcileOrder & closeOrder', () => {
    it('reconciles job work order and closes lifecycle', async () => {
      jest.spyOn(repository, 'findOrderById').mockResolvedValue({
        id: 'jwo-1',
        orderNumber: 'JWO-2026-0001',
        vendorId: 'v-1',
        status: JobWorkOrderStatus.FULLY_RETURNED,
        challans: [{ quantity: 8 }],
        returns: [{ acceptedQuantity: 80, consumedRawMaterial: 4, scrapQuantity: 0, shortQuantity: 0, excessQuantity: 0 }]
      } as never);

      jest.spyOn(repository, 'countReconciliations').mockResolvedValue(0);

      (defaultPrisma.jobWorkReconciliation.create as jest.Mock).mockResolvedValue({
        id: 'recon-1',
        reconciliationNumber: 'JREC-2026-0001',
        status: 'RECONCILED'
      } as never);

      const reconciliation = await service.reconcileOrder(
        {
          jobWorkOrderId: 'jwo-1',
          autoGenerateDebitNote: true
        },
        'user-1'
      );

      expect(reconciliation.reconciliationNumber).toBe('JREC-2026-0001');

      jest.spyOn(repository, 'updateOrder').mockResolvedValue({
        id: 'jwo-1',
        status: JobWorkOrderStatus.CLOSED
      } as never);

      const closed = await service.closeOrder('jwo-1', 'user-1', 'Completed all checks');
      expect(closed.status).toBe(JobWorkOrderStatus.CLOSED);
    });
  });
});
