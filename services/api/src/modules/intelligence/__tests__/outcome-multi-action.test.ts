import { randomUUID } from 'crypto';
import { OutcomeEvaluatorService } from '../services/outcome-evaluator.service';
import { Prisma } from '@prisma/client';

describe('Outcome Reconciliation Multi-Action Coverage', () => {
  const service = new OutcomeEvaluatorService();

  class MockOutcomeStore {
    tasks = new Map<string, any>();
    purchaseOrders = new Map<string, any>();
    salesOrders = new Map<string, any>();
    productionPlans = new Map<string, any>();
    outcomes = new Map<string, any>();

    asPrisma(): any {
      const store = this;
      const db: any = {
        businessTask: {
          findUnique: async (args: any) => store.tasks.get(args.where.id),
        },
        purchaseOrder: {
          findUnique: async (args: any) => store.purchaseOrders.get(args.where.id),
        },
        salesOrder: {
          findUnique: async (args: any) => store.salesOrders.get(args.where.id),
        },
        productionPlan: {
          findUnique: async (args: any) => store.productionPlans.get(args.where.id),
        },
        recommendationOutcome: {
          create: async (args: any) => {
            const id = `outcome-${randomUUID()}`;
            const row = { id, ...args.data, createdAt: new Date() };
            store.outcomes.set(id, row);
            return row;
          },
        },
      };
      return db;
    }
  }

  let store: MockOutcomeStore;
  let db: any;

  beforeEach(() => {
    store = new MockOutcomeStore();
    db = store.asPrisma();
  });

  describe('PurchaseOrder Direct Reconciliation', () => {
    it('reconciles PurchaseOrder with SUCCESS status (APE <= 15%)', async () => {
      const poId = `po-${randomUUID()}`;
      store.purchaseOrders.set(poId, {
        id: poId,
        poNumber: 'PO-2026-001',
        totalAmount: 105000,
        currency: 'INR',
      });

      const taskId = `task-po-1`;
      store.tasks.set(taskId, {
        id: taskId,
        recommendationId: 'rec-1',
        actionResourceType: 'PurchaseOrder',
        actionResourceId: poId,
        recommendation: {
          impactScenario: {
            baseCase: { value: 100000, unit: 'INR', metricKey: 'cost.purchase_order_value' },
          },
        },
      });

      const { outcome, evaluation } = await service.reconcileTaskOutcome(taskId, 'user-fin', db);

      expect(outcome.attributionMethod).toBe('DIRECT_TRANSACTION_RECONCILIATION');
      expect(outcome.expectedValue).toEqual(new Prisma.Decimal(100000));
      expect(outcome.realizedValue).toEqual(new Prisma.Decimal(105000));
      expect(evaluation.variance).toEqual(new Prisma.Decimal(5000));
      // APE = 5000 / 100000 = 0.05 (5%) <= 15% -> SUCCESS
      expect(evaluation.absolutePercentageError).toEqual(new Prisma.Decimal('0.050000'));
      expect(evaluation.status).toBe('SUCCESS');
      expect(outcome.metricKey).toBe('cost.purchase_order_value');
    });
  });

  describe('SalesOrder Direct Reconciliation', () => {
    it('reconciles SalesOrder with PARTIAL status (15% < APE <= 35%)', async () => {
      const soId = `so-${randomUUID()}`;
      store.salesOrders.set(soId, {
        id: soId,
        orderNumber: 'SO-2026-100',
        subtotal: 750000,
        currency: 'INR',
      });

      const taskId = `task-so-1`;
      store.tasks.set(taskId, {
        id: taskId,
        recommendationId: 'rec-so',
        actionResourceType: 'SalesOrder',
        actionResourceId: soId,
        recommendation: {
          impactScenario: {
            baseCase: { value: 1000000, unit: 'INR', metricKey: 'sales.order_value' },
          },
        },
      });

      const { outcome, evaluation } = await service.reconcileTaskOutcome(taskId, 'user-sales', db);

      expect(outcome.attributionMethod).toBe('DIRECT_TRANSACTION_RECONCILIATION');
      expect(outcome.expectedValue).toEqual(new Prisma.Decimal(1000000));
      expect(outcome.realizedValue).toEqual(new Prisma.Decimal(750000));
      expect(evaluation.variance).toEqual(new Prisma.Decimal(-250000));
      // APE = 250000 / 1000000 = 0.25 (25%) -> PARTIAL
      expect(evaluation.absolutePercentageError).toEqual(new Prisma.Decimal('0.250000'));
      expect(evaluation.status).toBe('PARTIAL');
      expect(outcome.metricKey).toBe('sales.order_value');
    });
  });

  describe('ProductionPlan Direct Reconciliation', () => {
    it('reconciles ProductionPlan completedQuantity with SUCCESS status', async () => {
      const ppId = `pp-${randomUUID()}`;
      store.productionPlans.set(ppId, {
        id: ppId,
        planNumber: 'PP-2026-500',
        quantity: 1200,
        completedQuantity: 1150,
      });

      const taskId = `task-pp-1`;
      store.tasks.set(taskId, {
        id: taskId,
        recommendationId: 'rec-pp',
        actionResourceType: 'ProductionPlan',
        actionResourceId: ppId,
        recommendation: {
          impactScenario: {
            baseCase: { value: 1200, unit: 'QUANTITY', metricKey: 'production.completed_units' },
          },
        },
      });

      const { outcome, evaluation } = await service.reconcileTaskOutcome(taskId, 'user-prod', db);

      expect(outcome.attributionMethod).toBe('DIRECT_TRANSACTION_RECONCILIATION');
      expect(outcome.expectedValue).toEqual(new Prisma.Decimal(1200));
      expect(outcome.realizedValue).toEqual(new Prisma.Decimal(1150));
      expect(evaluation.variance).toEqual(new Prisma.Decimal(-50));
      // APE = 50 / 1200 = 0.041667 (4.17%) <= 15% -> SUCCESS
      expect(evaluation.status).toBe('SUCCESS');
      expect(outcome.metricKey).toBe('production.completed_units');
      expect(outcome.unit).toBe('QUANTITY');
    });

    it('reconciles ProductionPlan with FAILED status when variance exceeds partial threshold (> 35%)', async () => {
      const ppId = `pp-${randomUUID()}`;
      store.productionPlans.set(ppId, {
        id: ppId,
        planNumber: 'PP-2026-501',
        quantity: 1000,
        completedQuantity: 400, // 60% deficit
      });

      const taskId = `task-pp-2`;
      store.tasks.set(taskId, {
        id: taskId,
        recommendationId: 'rec-pp-2',
        actionResourceType: 'ProductionPlan',
        actionResourceId: ppId,
        recommendation: {
          impactScenario: {
            baseCase: { value: 1000, unit: 'QUANTITY', metricKey: 'production.completed_units' },
          },
        },
      });

      const { evaluation } = await service.reconcileTaskOutcome(taskId, 'user-prod', db);
      expect(evaluation.status).toBe('FAILED');
      expect(evaluation.absolutePercentageError).toEqual(new Prisma.Decimal('0.600000'));
    });
  });

  describe('Validation & Guards', () => {
    it('throws ValidationError if task has no linked actionResourceType', async () => {
      const taskId = 'task-unlinked';
      store.tasks.set(taskId, {
        id: taskId,
        recommendationId: 'rec-unlinked',
      });

      await expect(service.reconcileTaskOutcome(taskId, 'user-guard', db)).rejects.toThrow(
        'Task must have a linked ERP action before outcome reconciliation.',
      );
    });
  });
});
