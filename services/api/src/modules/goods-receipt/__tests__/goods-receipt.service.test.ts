import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { DiscrepancyRepository } from '../repositories/discrepancy.repository';
import { LabelService } from '../services/label.service';
import { ExpectedReceiptService } from '../../purchases/services/expected-receipt.service';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { InvalidStateTransitionError, NotFoundError, ConflictError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';

jest.mock('../../../database', () => {
  const fakeTx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined as never),
    goodsReceiptNote: { updateMany: jest.fn() },
    stockLedgerEntry: { upsert: jest.fn(), create: jest.fn() },
    stockBalance: { upsert: jest.fn(), updateMany: jest.fn() },
    domainEventOutbox: { upsert: jest.fn().mockResolvedValue({} as never) }
  };
  return {
    prisma: {
      purchaseOrder: { findUnique: jest.fn(), update: jest.fn() },
      vendor: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      warehouseLocation: { findFirst: jest.fn(), create: jest.fn() },
      factory: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
      __fakeTx: fakeTx
    }
  };
});

function getFakeTx() {
  return (prisma as unknown as {
    __fakeTx: {
      goodsReceiptNote: { updateMany: jest.Mock };
      stockLedgerEntry: { upsert: jest.Mock; create: jest.Mock };
      stockBalance: { upsert: jest.Mock; updateMany: jest.Mock };
      domainEventOutbox: { upsert: jest.Mock };
      $executeRaw: jest.Mock;
    };
  }).__fakeTx;
}

class MockAuditWriter implements AuditWriter {
  events: unknown[] = [];
  async record(event: unknown): Promise<void> {
    this.events.push(event);
  }
}

class AllowAllChecker implements PermissionChecker {
  async can(): Promise<boolean> {
    return true;
  }
}

function makeRepository(): jest.Mocked<GoodsReceiptRepository> {
  return {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    countByNumberPrefix: jest.fn<(prefix: string) => Promise<number>>().mockResolvedValue(0),
    existsByGrnNumber: jest.fn<(grnNumber: string) => Promise<boolean>>().mockResolvedValue(false),
    createFromPo: jest.fn(),
    createUnreferenced: jest.fn(),
    updateStatus: jest.fn(),
    updateStatusConditional: jest.fn(),
    createStockLedgerEntry: jest.fn(),
    updateLines: jest.fn(),
    list: jest.fn(),
    getLineById: jest.fn(),
    updateLineStatus: jest.fn(),
    updateLineQuantities: jest.fn(),
    createMeasurement: jest.fn(),
    listOcrJobsByGrnId: jest.fn().mockResolvedValue([] as never)
  } as unknown as jest.Mocked<GoodsReceiptRepository>;
}

function makeDiscrepancyRepository(): jest.Mocked<DiscrepancyRepository> {
  return {
    findById: jest.fn(),
    listByGrnId: jest.fn(),
    countUnresolvedByGrnId: jest.fn<(grnId: string) => Promise<number>>().mockResolvedValue(0),
    create: jest.fn(),
    resolve: jest.fn(),
    updateStatus: jest.fn()
  } as unknown as jest.Mocked<DiscrepancyRepository>;
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    poLineId: 'po-line-1',
    productId: 'product-1',
    materialId: null,
    uomId: 'uom-1',
    label: { id: 'label-1' },
    expectedQuantity: 10,
    receivedQuantity: 10,
    acceptedQuantity: 10,
    rejectedQuantity: 0,
    damagedQuantity: 0,
    shortQuantity: 0,
    excessQuantity: 0,
    ...overrides
  };
}

describe('GoodsReceiptService', () => {
  let repository: jest.Mocked<GoodsReceiptRepository>;
  let discrepancyRepository: jest.Mocked<DiscrepancyRepository>;
  let labelService: LabelService;
  let expectedReceiptService: jest.Mocked<ExpectedReceiptService>;
  let auditWriter: MockAuditWriter;
  let service: GoodsReceiptService;

  beforeEach(() => {
    repository = makeRepository();
    discrepancyRepository = makeDiscrepancyRepository();
    auditWriter = new MockAuditWriter();
    labelService = { generateForLine: jest.fn(), reprint: jest.fn() } as unknown as LabelService;
    expectedReceiptService = {
      syncPoLineReceiptStatus: jest.fn(),
      applyReceiptStatusChange: jest.fn(),
      updateReceipt: jest.fn(),
      listReceipts: jest.fn()
    } as unknown as jest.Mocked<ExpectedReceiptService>;
    service = new GoodsReceiptService(
      repository,
      discrepancyRepository,
      labelService,
      new AllowAllChecker(),
      auditWriter,
      expectedReceiptService
    );
    jest.clearAllMocks();
    discrepancyRepository.countUnresolvedByGrnId.mockResolvedValue(0 as never);
    getFakeTx().goodsReceiptNote.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({} as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValue({ count: 1 } as never);
    // Default: actor is assigned to 'loc-1', matching every fixture's GRN location unless a
    // test overrides this with a mockResolvedValueOnce for a mismatch/missing-assignment case.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ assignedLocationId: 'loc-1' } as never);
  });

  describe('read scope and capabilities', () => {
    it('does not apply legacy warehouse-location scope to the GRN register', async () => {
      repository.list.mockResolvedValue({ items: [], total: 0 } as never);

      await service.list({ skip: 0, take: 25, status: 'ARRIVED' }, 'actor-1');

      expect(repository.list).toHaveBeenCalledWith({
        skip: 0,
        take: 25,
        status: 'ARRIVED',
        locationId: undefined
      });
    });

    it('allows opening a GRN regardless of its legacy location field', async () => {
      const grn = { id: 'grn-2', locationId: 'loc-2', lines: [] };
      repository.findById.mockResolvedValue(grn as never);

      await expect(service.getById('grn-2', 'actor-1')).resolves.toMatchObject(grn);
    });

    it('returns server-derived action capabilities instead of relying on UI role names', async () => {
      const result = await service.capabilities('actor-1');

      expect(result).toMatchObject({
        receive: true,
        verify: true,
        signOff: true,
        finalize: true,
        allLocations: true,
        locationId: null
      });
    });
  });

  describe('finalize', () => {
    it('rejects with 422 when a line quantity equation is inconsistent', async () => {
      repository.findById.mockResolvedValueOnce({
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: null,
        lines: [makeLine({ acceptedQuantity: 5 })]
      } as never);

      await expect(service.finalize('grn-1', 'actor-1', undefined)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('rejects with 422 when a line has no label assigned', async () => {
      repository.findById.mockResolvedValueOnce({
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: null,
        lines: [makeLine({ label: null })]
      } as never);

      await expect(service.finalize('grn-1', 'actor-1', undefined)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('allows posting accepted stock after an Accounts discrepancy claim is raised', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: null,
        lines: [makeLine()]
      };
      repository.findById
        .mockResolvedValueOnce(grn as never)
        .mockResolvedValueOnce({ ...grn, status: 'FINALIZED' } as never);
      discrepancyRepository.countUnresolvedByGrnId.mockResolvedValueOnce(1);

      await expect(service.finalize('grn-1', 'actor-1', undefined)).resolves.toMatchObject({ status: 'FINALIZED' });
      expect(getFakeTx().goodsReceiptNote.updateMany).toHaveBeenCalled();
    });

    it('is idempotent - re-finalizing an already FINALIZED GRN returns the existing record without re-checking gates', async () => {
      const finalized = { id: 'grn-1', status: 'FINALIZED', locationId: null, lines: [] };
      repository.findById.mockResolvedValueOnce(finalized as never);

      const result = await service.finalize('grn-1', 'actor-1', undefined);

      expect(result).toBe(finalized);
      expect(getFakeTx().goodsReceiptNote.updateMany).not.toHaveBeenCalled();
    });

    it('finalizes successfully once all gates pass: posts a stock ledger entry and syncs the PO line', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: 'loc-1',
        lines: [makeLine()]
      };
      repository.findById.mockResolvedValueOnce(grn as never);
      repository.findById.mockResolvedValueOnce({ ...grn, status: 'FINALIZED' } as never);

      const result = await service.finalize('grn-1', 'actor-1', undefined);

      expect(getFakeTx().goodsReceiptNote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'grn-1', status: { in: ['SIGNED_OFF'] } } })
      );
      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(expectedReceiptService.syncPoLineReceiptStatus).toHaveBeenCalledWith(expect.anything(), 'po-line-1');
      expect((result as { status: string }).status).toBe('FINALIZED');
    });

    it('does not post a stock ledger entry for a line with zero accepted quantity', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: 'loc-1',
        lines: [makeLine({ acceptedQuantity: 0, rejectedQuantity: 10, receivedQuantity: 10 })]
      };
      repository.findById.mockResolvedValueOnce(grn as never);
      repository.findById.mockResolvedValueOnce({ ...grn, status: 'FINALIZED' } as never);

      await service.finalize('grn-1', 'actor-1', undefined);

      expect(getFakeTx().stockLedgerEntry.create).not.toHaveBeenCalled();
    });

    it('never calls syncPoLineReceiptStatus for an unreferenced-shipment GRN', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: true,
        locationId: 'loc-1',
        lines: [makeLine({ poLineId: null })]
      };
      repository.findById.mockResolvedValueOnce(grn as never);
      repository.findById.mockResolvedValueOnce({ ...grn, status: 'FINALIZED' } as never);

      await service.finalize('grn-1', 'actor-1', undefined);

      expect(expectedReceiptService.syncPoLineReceiptStatus).not.toHaveBeenCalled();
    });

    it('throws when the concurrency guard finds the GRN was already moved off SIGNED_OFF', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: 'loc-1',
        lines: [makeLine()]
      };
      repository.findById.mockResolvedValueOnce(grn as never);
      getFakeTx().goodsReceiptNote.updateMany.mockResolvedValueOnce({ count: 0 } as never);

      await expect(service.finalize('grn-1', 'actor-1', undefined)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('does not block finalization based on a legacy GRN location', async () => {
      const grn = {
        id: 'grn-1',
        status: 'SIGNED_OFF',
        isUnreferenced: false,
        locationId: 'loc-1',
        lines: [makeLine()]
      };
      repository.findById.mockResolvedValueOnce(grn as never);
      repository.findById.mockResolvedValueOnce({ ...grn, status: 'FINALIZED' } as never);

      await expect(service.finalize('grn-1', 'actor-1', undefined)).resolves.toMatchObject({ status: 'FINALIZED' });
    });
  });

  describe('createFromPo', () => {
    it('returns the existing GRN on an idempotency-key replay without re-validating the PO', async () => {
      const existing = { id: 'grn-1', idempotencyKey: 'idem-1' };
      repository.findByIdempotencyKey.mockResolvedValueOnce(existing as never);

      const result = await service.createFromPo(
        { poId: 'po-1', locationId: 'loc-1', lines: [{ poLineId: 'po-line-1' }] },
        'actor-1',
        'idem-1'
      );

      expect(result).toBe(existing);
      expect(prisma.purchaseOrder.findUnique).not.toHaveBeenCalled();
      expect(repository.createFromPo).not.toHaveBeenCalled();
    });

    it('rejects when the PO is not SENT or PARTIALLY_RECEIVED', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'po-1',
        status: 'DRAFT',
        vendorId: 'vendor-1',
        lines: [{ id: 'po-line-1', productId: 'p-1', uomId: 'uom-1', quantity: 10 }]
      } as never);

      await expect(
        service.createFromPo({ poId: 'po-1', locationId: 'loc-1', lines: [{ poLineId: 'po-line-1' }] }, 'actor-1')
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('rejects when a referenced PO line does not belong to the PO', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'po-1',
        status: 'SENT',
        vendorId: 'vendor-1',
        lines: [{ id: 'po-line-1', productId: 'p-1', uomId: 'uom-1', quantity: 10 }]
      } as never);

      await expect(
        service.createFromPo({ poId: 'po-1', locationId: 'loc-1', lines: [{ poLineId: 'not-a-real-line' }] }, 'actor-1')
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects when a GRN has already been created for the PO', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'po-1',
        poNumber: 'PO-2026-001',
        status: 'SENT',
        vendorId: 'vendor-1',
        lines: [{ id: 'po-line-1', productId: 'p-1', uomId: 'uom-1', quantity: 10 }],
        goodsReceiptNotes: [{ id: 'grn-1', grnNumber: 'GRN-2026-001', status: 'ARRIVED' }]
      } as never);

      await expect(
        service.createFromPo({ poId: 'po-1', locationId: 'loc-1', lines: [{ poLineId: 'po-line-1' }] }, 'actor-1')
      ).rejects.toBeInstanceOf(ConflictError);
    });

  });

  describe('recordMeasurement - over-receipt and damaged/short line classification', () => {
    it('raises an EXCESS discrepancy when received quantity exceeds expected', async () => {
      const line = makeLine({ acceptedQuantity: 0, rejectedQuantity: 0, damagedQuantity: 0, receivedQuantity: 0, discrepancies: [] });
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);
      repository.getLineById.mockResolvedValueOnce({ ...line, grnId: 'grn-1', discrepancies: [] } as never);
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);

      await service.recordMeasurement(
        'grn-1',
        'line-1',
        { type: 'PIECE', value: 12, unitLabel: 'pcs', acceptedQuantity: 12, rejectedQuantity: 0, damagedQuantity: 0 },
        'actor-1'
      );

      expect(discrepancyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ grnLineId: 'line-1', type: 'EXCESS' })
      );
    });

    it('raises both SHORTAGE and DAMAGE discrepancies on a short, partially damaged line', async () => {
      const line = makeLine({ acceptedQuantity: 0, rejectedQuantity: 0, damagedQuantity: 0, receivedQuantity: 0, discrepancies: [] });
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);
      repository.getLineById.mockResolvedValueOnce({ ...line, grnId: 'grn-1', discrepancies: [] } as never);
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);

      await service.recordMeasurement(
        'grn-1',
        'line-1',
        { type: 'PIECE', value: 6, unitLabel: 'pcs', acceptedQuantity: 4, rejectedQuantity: 0, damagedQuantity: 2 },
        'actor-1'
      );

      const createdTypes = discrepancyRepository.create.mock.calls.map((call) => (call[0] as { type: string }).type);
      expect(createdTypes).toEqual(expect.arrayContaining(['SHORTAGE', 'DAMAGE']));
    });

    it('records the unit label verbatim with no coercion (V-013 stays unresolved)', async () => {
      const line = makeLine({ acceptedQuantity: 0, rejectedQuantity: 0, damagedQuantity: 0, receivedQuantity: 0, discrepancies: [] });
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);
      repository.getLineById.mockResolvedValueOnce({ ...line, grnId: 'grn-1', discrepancies: [] } as never);
      repository.findById.mockResolvedValueOnce({ id: 'grn-1', status: 'ARRIVED', locationId: null, lines: [line] } as never);

      await service.recordMeasurement(
        'grn-1',
        'line-1',
        { type: 'WEIGHT', value: 10, unitLabel: 'Kilograms (approx, unverified scale)' },
        'actor-1'
      );

      expect(repository.createMeasurement).toHaveBeenCalledWith(
        expect.objectContaining({ unitLabel: 'Kilograms (approx, unverified scale)' })
      );
    });
  });

  describe('completePhysicalVerification & notifyAccountantForDebitNote', () => {
    it('validates line quantity balance and updates GRN lines during physical verification', async () => {
      const line = makeLine({ id: 'line-1', expectedQuantity: 20, receivedQuantity: 20, discrepancies: [] });
      repository.findById.mockResolvedValue({ id: 'grn-1', status: 'ARRIVED', grnNumber: 'GRN-2026-001', locationId: 'loc-1', lines: [line] } as never);
      repository.getLineById.mockResolvedValue({ ...line, grnId: 'grn-1', discrepancies: [] } as never);

      const result = await service.completePhysicalVerification(
        'grn-1',
        {
          lines: [
            {
              lineId: 'line-1',
              receivedQuantity: 20,
              acceptedQuantity: 15,
              rejectedQuantity: 3,
              damagedQuantity: 2,
              notes: '3 units failed spec, 2 dented during transit'
            }
          ],
          overallNotes: 'Physical inspection completed by Store Manager'
        },
        'actor-1'
      );

      expect(repository.updateLineQuantities).toHaveBeenCalledWith(
        'line-1',
        expect.objectContaining({
          receivedQuantity: 20,
          acceptedQuantity: 15,
          rejectedQuantity: 3,
          damagedQuantity: 2,
          shortQuantity: 0
        })
      );
      expect(result).toBeDefined();
    });

    it('rejects physical verification if Received != Accepted + Rejected + Damaged', async () => {
      const line = makeLine({ id: 'line-1', expectedQuantity: 20, receivedQuantity: 20, discrepancies: [] });
      repository.findById.mockResolvedValue({ id: 'grn-1', status: 'ARRIVED', grnNumber: 'GRN-2026-001', locationId: 'loc-1', lines: [line] } as never);
      repository.getLineById.mockResolvedValue({ ...line, grnId: 'grn-1', discrepancies: [] } as never);

      await expect(
        service.completePhysicalVerification(
          'grn-1',
          {
            lines: [
              {
                lineId: 'line-1',
                receivedQuantity: 20,
                acceptedQuantity: 10,
                rejectedQuantity: 2,
                damagedQuantity: 0 // Sum is 12 != 20
              }
            ]
          },
          'actor-1'
        )
      ).rejects.toThrow(/Line equation violated/);
    });

    it('dispatches notification to Accountant when notifyAccountantForDebitNote is called', async () => {
      const line = makeLine({ id: 'line-1', expectedQuantity: 20, receivedQuantity: 15, shortQuantity: 5, discrepancies: [] });
      repository.findById.mockResolvedValue({ id: 'grn-1', status: 'PHYSICALLY_VERIFIED', grnNumber: 'GRN-2026-001', locationId: 'loc-1', lines: [line] } as never);

      const result = await service.notifyAccountantForDebitNote(
        'grn-1',
        'actor-store-mgr',
        {
          reason: 'Delivered 15 of 20, need debit note for 5 missing units',
          reasonCategory: 'SHORTAGE'
        }
      );

      expect(result.success).toBe(true);
      expect(result.grnNumber).toBe('GRN-2026-001');
      expect(auditWriter.events.length).toBeGreaterThan(0);
    });
  });
});
