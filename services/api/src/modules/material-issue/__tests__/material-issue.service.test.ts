import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MaterialIssueService } from '../services/material-issue.service';
import { MaterialIssueRepository } from '../repositories/material-issue.repository';
import { BomVersionRepository } from '../../bom/repositories';
import { BomCalculatorService } from '../../bom/services';
import { UomService } from '../../master-data/services/uom.service';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
import { Prisma } from '@prisma/client';

jest.mock('../../../database', () => {
  const fakeTx = {
    materialIssue: { updateMany: jest.fn() },
    materialIssueLine: { update: jest.fn() },
    stockLedgerEntry: { create: jest.fn() },
    stockBalance: { upsert: jest.fn(), updateMany: jest.fn() }
  };
  return {
    prisma: {
      productionPlan: { findUnique: jest.fn() },
      stockBalance: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
      __fakeTx: fakeTx
    }
  };
});

function getFakeTx() {
  return (prisma as unknown as {
    __fakeTx: {
      materialIssue: { updateMany: jest.Mock };
      materialIssueLine: { update: jest.Mock };
      stockLedgerEntry: { create: jest.Mock };
      stockBalance: { upsert: jest.Mock; updateMany: jest.Mock };
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
  async hasRoleFlag(): Promise<boolean> {
    return true;
  }
}

class DenyChecker implements PermissionChecker {
  async can(): Promise<boolean> {
    return false;
  }
}

function makeRepository(): jest.Mocked<MaterialIssueRepository> {
  return {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    countByNumberPrefix: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    existsByIssueNumber: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    findActiveByProductionPlanId: jest.fn(),
    create: jest.fn(),
    updateStatusConditional: jest.fn(),
    updateLineQuantities: jest.fn(),
    list: jest.fn()
  } as unknown as jest.Mocked<MaterialIssueRepository>;
}

const APPROVED_BOM_VERSION = {
  id: 'bom-v1',
  status: 'APPROVED',
  effectiveDate: new Date('2026-01-01'),
  product: { uomId: 'uom-pcs' },
  lines: [
    { id: 'line-1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg' },
    { id: 'line-2', materialId: 'mat-2', componentProductId: null, uomId: 'uom-ea' }
  ]
};

const REQUIREMENTS = [
  { bomLineId: 'line-1', requiredQuantity: 10, uomId: 'uom-kg', departmentId: null, conversionFactorUsed: 1 },
  { bomLineId: 'line-2', requiredQuantity: 5, uomId: 'uom-ea', departmentId: null, conversionFactorUsed: 1 }
];

function makeBomVersionRepository(): jest.Mocked<BomVersionRepository> {
  return {
    findLiveApprovedVersion: jest.fn<() => Promise<typeof APPROVED_BOM_VERSION>>().mockResolvedValue(APPROVED_BOM_VERSION as never)
  } as unknown as jest.Mocked<BomVersionRepository>;
}

function makeCalculator(): jest.Mocked<BomCalculatorService> {
  return {
    computeRequirements: jest.fn<() => Promise<typeof REQUIREMENTS>>().mockResolvedValue(REQUIREMENTS as never)
  } as unknown as jest.Mocked<BomCalculatorService>;
}

function makeUomService(): jest.Mocked<UomService> {
  return {
    resolveConversionFactor: jest.fn<() => Promise<Prisma.Decimal>>().mockResolvedValue(new Prisma.Decimal(1))
  } as unknown as jest.Mocked<UomService>;
}

describe('MaterialIssueService', () => {
  let repository: jest.Mocked<MaterialIssueRepository>;
  let bomVersionRepository: jest.Mocked<BomVersionRepository>;
  let calculator: jest.Mocked<BomCalculatorService>;
  let uomService: jest.Mocked<UomService>;
  let auditWriter: MockAuditWriter;

  beforeEach(() => {
    repository = makeRepository();
    bomVersionRepository = makeBomVersionRepository();
    calculator = makeCalculator();
    uomService = makeUomService();
    auditWriter = new MockAuditWriter();
    jest.clearAllMocks();
    (prisma.productionPlan.findUnique as jest.Mock).mockResolvedValue({
      id: 'plan-1',
      productId: 'prod-1',
      quantity: new Prisma.Decimal(100),
      status: 'RELEASED',
      product: { uomId: 'uom-pcs' }
    } as never);
    (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue({ onHandQuantity: 100, reservedQuantity: 0 } as never);
    repository.findActiveByProductionPlanId.mockResolvedValue(null as never);
    repository.create.mockResolvedValue({ id: 'mi-1', issueNumber: 'MI-000001', lines: [] } as never);
    getFakeTx().materialIssue.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.updateMany.mockResolvedValue({ count: 1 } as never);
    getFakeTx().stockBalance.upsert.mockResolvedValue({} as never);
    getFakeTx().stockLedgerEntry.create.mockResolvedValue({ id: 'ledger-1' } as never);
  });

  function makeService(permissionChecker: PermissionChecker = new AllowAllChecker()) {
    return new MaterialIssueService(repository, bomVersionRepository, calculator, uomService, permissionChecker, auditWriter);
  }

  describe('request (BOM-to-issue derivation)', () => {
    it('rejects when the actor lacks the request permission', async () => {
      const service = makeService(new DenyChecker());
      await expect(service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects a plan that is not RELEASED/IN_PROGRESS', async () => {
      (prisma.productionPlan.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'plan-1',
        productId: 'prod-1',
        quantity: new Prisma.Decimal(100),
        status: 'DRAFT',
        product: { uomId: 'uom-pcs' }
      } as never);
      const service = makeService();
      await expect(service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('rejects a duplicate request while an active issue already exists for the plan', async () => {
      repository.findActiveByProductionPlanId.mockResolvedValueOnce({ id: 'mi-existing', issueNumber: 'MI-000000' } as never);
      const service = makeService();
      await expect(service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects when no approved BOM exists for the product', async () => {
      bomVersionRepository.findLiveApprovedVersion.mockResolvedValueOnce(null as never);
      const service = makeService();
      await expect(service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('derives exactly the BOM-computed lines, never an invented quantity', async () => {
      const service = makeService();
      await service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1');

      expect(calculator.computeRequirements).toHaveBeenCalledWith(APPROVED_BOM_VERSION, 100, 'uom-pcs', expect.any(Date), expect.any(Function));
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bomVersionId: 'bom-v1',
          lines: [
            { bomLineId: 'line-1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', requiredQuantity: 10 },
            { bomLineId: 'line-2', materialId: 'mat-2', componentProductId: null, uomId: 'uom-ea', requiredQuantity: 5 }
          ]
        })
      );
    });

    it('replays an existing issue on idempotency-key match without deriving a new one', async () => {
      const existing = { id: 'mi-existing' };
      repository.findByIdempotencyKey.mockResolvedValueOnce(existing as never);
      const service = makeService();

      const result = await service.request({ productionPlanId: 'plan-1', locationId: 'loc-1' }, 'actor-1', 'idem-1');

      expect(result).toBe(existing);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('verify (availability / shortage)', () => {
    it('moves to VERIFIED when every line has sufficient available stock', async () => {
      repository.findById.mockResolvedValue({
        id: 'mi-1',
        status: 'REQUESTED',
        locationId: 'loc-1',
        lines: [{ id: 'l1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', requiredQuantity: 10 }]
      } as never);
      (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue({ onHandQuantity: 50, reservedQuantity: 0 } as never);
      const service = makeService();

      await service.verify('mi-1', 'actor-1');

      expect(repository.updateStatusConditional).toHaveBeenCalledWith(
        'mi-1',
        ['REQUESTED', 'SHORTAGE'],
        'VERIFIED',
        expect.objectContaining({ verifiedByActorId: 'actor-1' })
      );
    });

    it('moves to SHORTAGE and records the shortfall when available stock is insufficient', async () => {
      repository.findById.mockResolvedValue({
        id: 'mi-1',
        status: 'REQUESTED',
        locationId: 'loc-1',
        lines: [{ id: 'l1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', requiredQuantity: 10 }]
      } as never);
      (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue({ onHandQuantity: 4, reservedQuantity: 0 } as never);
      const service = makeService();

      await service.verify('mi-1', 'actor-1');

      expect(repository.updateLineQuantities).toHaveBeenCalledWith('l1', { shortageQuantity: 6 });
      expect(repository.updateStatusConditional).toHaveBeenCalledWith('mi-1', ['REQUESTED', 'SHORTAGE'], 'SHORTAGE', expect.anything());
    });

    it('treats a missing balance row as zero available stock (full shortage)', async () => {
      repository.findById.mockResolvedValue({
        id: 'mi-1',
        status: 'REQUESTED',
        locationId: 'loc-1',
        lines: [{ id: 'l1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', requiredQuantity: 10 }]
      } as never);
      (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue(null as never);
      const service = makeService();

      await service.verify('mi-1', 'actor-1');

      expect(repository.updateLineQuantities).toHaveBeenCalledWith('l1', { shortageQuantity: 10 });
    });
  });

  describe('prepare / hand-over / acknowledge', () => {
    it('rejects preparing a non-VERIFIED issue (no invented partial issue)', async () => {
      repository.findById.mockResolvedValue({ id: 'mi-1', status: 'SHORTAGE', locationId: 'loc-1', lines: [] } as never);
      const service = makeService();
      await expect(service.prepare('mi-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('generates a system-controlled challan number on hand-over', async () => {
      repository.findById.mockResolvedValue({ id: 'mi-1', status: 'PREPARED', locationId: 'loc-1', issueNumber: 'MI-000001', lines: [] } as never);
      const service = makeService();

      await service.handOver('mi-1', 'actor-1');

      expect(repository.updateStatusConditional).toHaveBeenCalledWith(
        'mi-1',
        ['PREPARED'],
        'HANDED_OVER',
        expect.objectContaining({ challanNumber: 'CHL-MI-000001' })
      );
    });

    it('rejects acknowledging an issue that is not HANDED_OVER (no duplicate acknowledgement)', async () => {
      repository.findById.mockResolvedValue({ id: 'mi-1', status: 'ACKNOWLEDGED', locationId: 'loc-1', lines: [] } as never);
      const service = makeService();
      await expect(service.acknowledge('mi-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });

    it('posts exactly one ledger entry per issued line and flips ACKNOWLEDGED -> POSTED atomically', async () => {
      repository.findById.mockResolvedValueOnce({
        id: 'mi-1',
        status: 'HANDED_OVER',
        locationId: 'loc-1',
        issueNumber: 'MI-000001',
        challanNumber: 'CHL-MI-000001',
        productionPlanId: 'plan-1',
        lines: [
          { id: 'l1', materialId: 'mat-1', componentProductId: null, uomId: 'uom-kg', issuedQuantity: 10 },
          { id: 'l2', materialId: 'mat-2', componentProductId: null, uomId: 'uom-ea', issuedQuantity: 0 }
        ]
      } as never);
      repository.findById.mockResolvedValueOnce({ id: 'mi-1', status: 'POSTED' } as never);
      const service = makeService();

      await service.acknowledge('mi-1', 'actor-1');

      expect(getFakeTx().stockLedgerEntry.create).toHaveBeenCalledTimes(1);
      expect(getFakeTx().materialIssue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mi-1', status: { in: ['ACKNOWLEDGED'] } } })
      );
      expect(auditWriter.events).toHaveLength(1);
    });

    it('throws instead of double-posting when the acknowledge concurrency guard loses the race', async () => {
      repository.findById.mockResolvedValue({ id: 'mi-1', status: 'HANDED_OVER', locationId: 'loc-1', lines: [] } as never);
      getFakeTx().materialIssue.updateMany.mockResolvedValueOnce({ count: 0 } as never);
      const service = makeService();

      await expect(service.acknowledge('mi-1', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });

  describe('cancel', () => {
    it('allows cancelling from REQUESTED/VERIFIED/SHORTAGE only', async () => {
      repository.findById.mockResolvedValue({ id: 'mi-1', status: 'HANDED_OVER', locationId: 'loc-1', lines: [] } as never);
      const service = makeService();
      await expect(service.cancel('mi-1', 'no longer needed', 'actor-1')).rejects.toBeInstanceOf(InvalidStateTransitionError);
    });
  });
});
