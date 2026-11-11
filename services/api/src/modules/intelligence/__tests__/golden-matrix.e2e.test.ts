import { randomUUID } from 'crypto';
import { IntelligenceCaseService } from '../services/intelligence-case.service';
import { ImpactScenarioService } from '../services/impact-scenario.service';
import { IntelligenceOrchestratorService } from '../services/intelligence-orchestrator.service';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';
import { IntelligenceService } from '../services/intelligence.service';
import { OutcomeEvaluatorService } from '../services/outcome-evaluator.service';
import { MockHermesProvider } from '../integrations/mock-hermes.provider';
import { config } from '../../../config';
import { IntelligenceModule } from '@prisma/client';

class MatrixTestStore {
  intelligenceCases = new Map<string, any>();
  caseObservations = new Map<string, any>();
  impactScenarios = new Map<string, any>();
  snapshots = new Map<string, any>();
  objectivePolicies = new Map<string, any>();
  runs = new Map<string, any>();
  recommendations = new Map<string, any>();
  recommendationDecisions = new Map<string, any>();
  businessTasks = new Map<string, any>();
  businessTaskActivities = new Map<string, any>();
  purchaseOrders = new Map<string, any>();
  salesOrders = new Map<string, any>();
  productionPlans = new Map<string, any>();
  recommendationOutcomes = new Map<string, any>();
  users = new Map<string, any>();

  asPrisma(): any {
    const store = this;
    const db: any = {
      $transaction: async (work: any) => {
        if (typeof work === 'function') return work(db);
        return Promise.all(work);
      },

      intelligenceCase: {
        upsert: async (args: any) => {
          let row = store.intelligenceCases.get(args.where.dedupeKey);
          if (!row) {
            row = {
              id: `case-${randomUUID()}`,
              ...args.create,
              createdAt: new Date(),
              updatedAt: new Date(),
              lastDetectedAt: new Date(),
              status: 'OPEN',
            };
            store.intelligenceCases.set(args.where.dedupeKey, row);
            store.intelligenceCases.set(row.id, row);
          } else {
            Object.assign(row, args.update, { updatedAt: new Date() });
          }
          return row;
        },
        findUnique: async (args: any) => store.intelligenceCases.get(args.where.dedupeKey ?? args.where.id) ?? null,
      },

      impactScenario: {
        create: async (args: any) => {
          const id = `scenario-${randomUUID()}`;
          const scenario = { id, ...args.data, createdAt: new Date() };
          store.impactScenarios.set(id, scenario);
          store.impactScenarios.set(scenario.idempotencyKey, scenario);
          return scenario;
        },
        findUnique: async (args: any) => store.impactScenarios.get(args.where.id ?? args.where.idempotencyKey) ?? null,
        findFirst: async (args: any) => {
          const values = Array.from(store.impactScenarios.values()).filter((s) => !args.where?.caseId || s.caseId === args.where.caseId);
          return values[values.length - 1] ?? null;
        },
      },

      businessSnapshot: {
        findUnique: async (args: any) => store.snapshots.get(args.where.id) ?? null,
        findFirst: async (args: any) => {
          const values = Array.from(store.snapshots.values()).filter((s) => !args.where?.module || s.module === args.where.module);
          return values[values.length - 1] ?? null;
        },
      },

      businessObjectivePolicy: {
        findFirst: async (args: any) => {
          const values = Array.from(store.objectivePolicies.values()).filter((p) => !args.where?.module || p.module === args.where.module);
          return values[0] ?? null;
        },
      },

      intelligenceRun: {
        create: async (args: any) => {
          const id = args.data?.id ?? `run-${randomUUID()}`;
          const run = { id, ...args.data, createdAt: new Date() };
          store.runs.set(id, run);
          return run;
        },
        findFirst: async (args: any) => store.runs.get(args.where.id) ?? null,
        findMany: async () => [],
        update: async (args: any) => {
          const run = store.runs.get(args.where.id);
          if (run) Object.assign(run, args.data);
          return run;
        },
      },

      providerAttempt: {
        updateMany: async () => ({ count: 0 }),
      },

      recommendation: {
        create: async (args: any) => {
          const id = `rec-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date(), updatedAt: new Date(), status: 'OPEN' };
          store.recommendations.set(id, row);
          return row;
        },
        findUnique: async (args: any) => {
          const row = store.recommendations.get(args.where.id);
          if (!row) return null;
          const res: any = { ...row };
          if (args.include?.snapshot) res.snapshot = store.snapshots.get(row.snapshotId);
          if (args.include?.impactScenario) res.impactScenario = store.impactScenarios.get(row.scenarioId);
          return res;
        },
        findFirst: async (args: any) => {
          const list = Array.from(store.recommendations.values()).filter((r) => {
            if (args.where?.opportunityRef && r.opportunityRef !== args.where.opportunityRef) return false;
            return true;
          });
          return list[0] ?? null;
        },
        update: async (args: any) => {
          const row = store.recommendations.get(args.where.id);
          if (row) Object.assign(row, args.data, { updatedAt: new Date() });
          return row;
        },
        updateMany: async (args: any) => {
          let count = 0;
          for (const row of store.recommendations.values()) {
            if (args.where?.id && row.id !== args.where.id) continue;
            Object.assign(row, args.data, { updatedAt: new Date() });
            count += 1;
          }
          return { count };
        },
      },

      recommendationDecision: {
        create: async (args: any) => {
          const id = `dec-${randomUUID()}`;
          const row = { id, ...args.data, decidedAt: new Date() };
          store.recommendationDecisions.set(id, row);
          return row;
        },
      },

      businessTask: {
        create: async (args: any) => {
          const id = `task-${randomUUID()}`;
          const row = { id, ...args.data, status: args.data?.status ?? 'OPEN', createdAt: new Date(), updatedAt: new Date() };
          store.businessTasks.set(id, row);
          return row;
        },
        findUnique: async (args: any) => {
          const row = store.businessTasks.get(args.where.id);
          if (!row) return null;
          const res: any = { ...row };
          if (args.include?.recommendation) {
            res.recommendation = store.recommendations.get(row.recommendationId);
            if (res.recommendation && args.include.recommendation.include?.impactScenario) {
              res.recommendation.impactScenario = store.impactScenarios.get(res.recommendation.scenarioId);
            }
          }
          return res;
        },
        update: async (args: any) => {
          const row = store.businessTasks.get(args.where.id);
          if (row) Object.assign(row, args.data, { updatedAt: new Date() });
          return row;
        },
      },

      businessTaskActivity: {
        create: async (args: any) => {
          const id = `act-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.businessTaskActivities.set(id, row);
          return row;
        },
      },

      purchaseOrder: {
        findUnique: async (args: any) => store.purchaseOrders.get(args.where.id) ?? null,
      },

      salesOrder: {
        findUnique: async (args: any) => store.salesOrders.get(args.where.id) ?? null,
      },

      productionPlan: {
        findUnique: async (args: any) => store.productionPlans.get(args.where.id) ?? null,
      },

      recommendationOutcome: {
        create: async (args: any) => {
          const id = `outcome-${randomUUID()}`;
          const row = { id, ...args.data, observedAt: new Date() };
          store.recommendationOutcomes.set(id, row);
          return row;
        },
      },

      user: {
        findUnique: async (args: any) => {
          const u = store.users.get(args.where.id);
          if (!u) return null;
          return { ...u, userRoles: [] };
        },
      },
    };
    return db;
  }
}

interface MatrixScenarioConfig {
  code: string;
  name: string;
  module: IntelligenceModule;
  detectorKey: string;
  opportunityRef: string;
  actionCode: string;
  scenarioType: any;
  actionResourceType: 'PurchaseOrder' | 'SalesOrder' | 'ProductionPlan';
  actualValue: number;
}

const MATRIX_CASES: MatrixScenarioConfig[] = [
  {
    code: 'A',
    name: 'MATERIAL PRICE INCREASE',
    module: 'PROCUREMENT',
    detectorKey: 'MATERIAL_PRICE_INCREASE',
    opportunityRef: 'procurement-price-hike:copper-wire',
    actionCode: 'procurement.bulk_purchase_evaluation',
    scenarioType: 'BUY_MORE',
    actionResourceType: 'PurchaseOrder',
    actualValue: 4800,
  },
  {
    code: 'B',
    name: 'LOW INVENTORY',
    module: 'INVENTORY',
    detectorKey: 'LOW_INVENTORY_COVER',
    opportunityRef: 'inventory-low-cover:cardboard-box',
    actionCode: 'inventory.replenishment_review',
    scenarioType: 'BUY_MORE',
    actionResourceType: 'PurchaseOrder',
    actualValue: 5100,
  },
  {
    code: 'C',
    name: 'VENDOR DETERIORATION',
    module: 'PROCUREMENT',
    detectorKey: 'VENDOR_DETERIORATION',
    opportunityRef: 'procurement-vendor-risk:acme-chem',
    actionCode: 'procurement.vendor_follow_up',
    scenarioType: 'DO_NOTHING',
    actionResourceType: 'PurchaseOrder',
    actualValue: 5000,
  },
  {
    code: 'D',
    name: 'MARGIN COMPRESSION',
    module: 'SALES',
    detectorKey: 'MARGIN_COMPRESSION',
    opportunityRef: 'sales-margin-compression:widget-plus',
    actionCode: 'sales.margin_review',
    scenarioType: 'PRICE_CHANGE',
    actionResourceType: 'SalesOrder',
    actualValue: 5200,
  },
  {
    code: 'E',
    name: 'PRODUCTION DEMAND GAP',
    module: 'PRODUCTION',
    detectorKey: 'UNPLANNED_PRODUCTION_DEMAND',
    opportunityRef: 'production-upcoming-demand:stamping-line',
    actionCode: 'production.capacity_review',
    scenarioType: 'PRODUCTION_INCREASE',
    actionResourceType: 'ProductionPlan',
    actualValue: 5000,
  },
  {
    code: 'F',
    name: 'DELAYED FULFILLMENT',
    module: 'FULFILLMENT',
    detectorKey: 'DELAYED_FULFILLMENT',
    opportunityRef: 'fulfillment-late:dispatch-77',
    actionCode: 'fulfillment.priority_review',
    scenarioType: 'DO_NOTHING',
    actionResourceType: 'SalesOrder',
    actualValue: 4900,
  },
  {
    code: 'G',
    name: 'REPLENISHMENT',
    module: 'INVENTORY',
    detectorKey: 'REPLENISHMENT_RISK',
    opportunityRef: 'inventory-replenishment:resin-beads',
    actionCode: 'inventory.replenishment_review',
    scenarioType: 'BUY_MORE',
    actionResourceType: 'PurchaseOrder',
    actualValue: 5050,
  },
];

describe('Golden Test Matrix (A through G)', () => {
  let originalCasesEnabled: boolean;

  beforeEach(() => {
    originalCasesEnabled = config.intelligence.casesEnabled;
    (config.intelligence as any).casesEnabled = true;
  });

  afterEach(() => {
    (config.intelligence as any).casesEnabled = originalCasesEnabled;
  });

  const adminUser = {
    id: 'user-admin-matrix',
    email: 'admin@plinth.test',
    name: 'Executive Admin',
    role: 'admin',
    isActive: true,
    department: 'OPERATIONS',
    assignedDepartmentRef: { code: 'EXEC', name: 'Executive' },
  };

  for (const item of MATRIX_CASES) {
    it(`executes full golden lifecycle for [${item.code}] ${item.name}`, async () => {
      const store = new MatrixTestStore();
      const db = store.asPrisma();
      store.users.set(adminUser.id, adminUser);

      const now = new Date().toISOString();
      const metricKey = `${item.module.toLowerCase()}.matrix_kpi`;

      const snapshotData = {
        module: item.module,
        metricVersion: 'matrix-v1',
        periodStart: now,
        periodEnd: now,
        generatedAt: now,
        sourceLatestAt: now,
        reportingCurrency: 'INR',
        metrics: [
          {
            key: metricKey,
            value: 5000,
            unit: item.actionResourceType === 'ProductionPlan' ? 'QUANTITY' : 'INR',
            currency: item.actionResourceType === 'ProductionPlan' ? null : 'INR',
            provenance: 'CALCULATED',
            freshnessStatus: 'FRESH',
            dataQualityScore: 1,
            sourceRefs: [{ resource: item.actionResourceType, filter: 'matrix-certified' }],
          },
        ],
        opportunities: [
          {
            id: item.opportunityRef,
            category: item.detectorKey,
            actionCode: item.actionCode,
            title: `Matrix Review: ${item.name}`,
            situation: `Automated test fixture for ${item.name}`,
            metricKeys: [metricKey],
            expectedImpact: {
              metricKey,
              unit: item.actionResourceType === 'ProductionPlan' ? 'QUANTITY' : 'INR',
              currency: item.actionResourceType === 'ProductionPlan' ? undefined : 'INR',
              horizonDays: 30,
              low: 4500,
              base: 5000,
              high: 5500,
              sourceMetricKeys: [metricKey],
            },
          },
        ],
        notices: [],
      };

      const snapshot = {
        id: `snap-${item.code.toLowerCase()}`,
        module: item.module,
        metricVersion: 'matrix-v1',
        periodStart: new Date(Date.now() - 30 * 86_400_000),
        periodEnd: new Date(),
        freshnessScore: 1,
        costCoverageScore: 1,
        data: snapshotData,
      };
      store.snapshots.set(snapshot.id, snapshot);

      const policy = {
        id: `policy-${item.code.toLowerCase()}`,
        module: item.module,
        version: 'matrix-pol-v1',
        status: 'ACTIVE',
        weights: {},
        guardrails: {},
      };
      store.objectivePolicies.set(policy.id, policy);

      // Step 1: Detect Case
      const caseService = new IntelligenceCaseService(db);
      const caseScan = await caseService.detect(snapshot as any);
      expect(caseScan.some((c) => c.detectorKey === item.detectorKey && c.createdOrUpdated >= 1)).toBe(true);

      const detectedCase = Array.from(store.intelligenceCases.values()).find((c) => c.detectorKey === item.detectorKey);
      expect(detectedCase).toBeDefined();

      // Step 2: Authoritative Scenario Creation
      const scenarioService = new ImpactScenarioService(db);
      const createdScenario = await scenarioService.create({
        caseId: detectedCase.id,
        scenarioType: item.scenarioType,
        actorId: adminUser.id,
        idempotencyKey: `scen-${item.code}-${randomUUID()}`,
        correlationId: `corr-${item.code}`,
      });
      expect(createdScenario).toBeDefined();
      expect(createdScenario.baseCase).toBeDefined();

      // Step 3: Hermes Recommendation Orchestration
      const mockHermes = new MockHermesProvider();
      const validator = new RecommendationValidatorService();
      const mockMetricsService: any = { capture: jest.fn().mockResolvedValue(snapshot) };
      const mockControls: any = { effective: async () => ({ enabled: true, providerEnabled: true }) };
      const mockPolicies: any = { getActive: async () => policy };

      const orchestrator = new IntelligenceOrchestratorService(
        db,
        mockMetricsService,
        mockPolicies,
        mockHermes,
        validator,
        undefined,
        mockControls,
        caseService,
      );

      const run = {
        id: `run-${item.code.toLowerCase()}`,
        module: item.module,
        trigger: 'EVENT',
        modelProvider: 'DETERMINISTIC_MOCK',
        modelId: 'plinth/mock-hermes-v1',
        createdAt: new Date(),
        startedAt: new Date(),
      };
      store.runs.set(run.id, run);

      const processResult = await orchestrator.process({
        id: `job-${item.code.toLowerCase()}`,
        module: item.module,
        trigger: 'EVENT',
        attempts: 0,
        correlationId: `corr-proc-${item.code}`,
        payload: {},
      } as any);

      expect(processResult.recommendations).toBe(1);
      const recommendation = Array.from(store.recommendations.values()).find((r) => r.opportunityRef === item.opportunityRef);
      expect(recommendation).toBeDefined();
      expect(recommendation.caseId).toBe(detectedCase.id);
      expect(recommendation.scenarioId).toBe(createdScenario.id);

      // Step 4: Decision Center Accept Recommendation -> Creates BusinessTask
      const mockAudit: any = { record: jest.fn().mockResolvedValue(true) };
      const mockNotifications: any = { send: jest.fn(), createAndDispatch: jest.fn() };
      const intelligenceService = new IntelligenceService(
        db,
        orchestrator,
        mockPolicies,
        mockNotifications,
        mockAudit,
        mockControls,
      );

      const createdTask = await intelligenceService.acceptRecommendation(
        adminUser.id,
        recommendation.id,
        { assigneeId: adminUser.id, dueAt: new Date(Date.now() + 86_400_000).toISOString(), managerNotes: `Approved for ${item.name}` },
        `req-accept-${item.code}`,
      );

      expect(createdTask.status).toBe('OPEN');
      expect(recommendation.status).toBe('ACCEPTED');

      // Step 5: Link Real ERP Action
      const expectedValue = Number((createdScenario.baseCase as any).value ?? 5000);
      const realizedValue = Number((expectedValue * 1.02).toFixed(2));
      const actionResourceId = `erp-${item.code}-${randomUUID()}`;
      if (item.actionResourceType === 'PurchaseOrder') {
        store.purchaseOrders.set(actionResourceId, { id: actionResourceId, poNumber: `PO-${item.code}`, totalAmount: realizedValue, currency: 'INR' });
      } else if (item.actionResourceType === 'SalesOrder') {
        store.salesOrders.set(actionResourceId, { id: actionResourceId, orderNumber: `SO-${item.code}`, subtotal: realizedValue, currency: 'INR' });
      } else if (item.actionResourceType === 'ProductionPlan') {
        store.productionPlans.set(actionResourceId, { id: actionResourceId, planNumber: `PP-${item.code}`, quantity: realizedValue, completedQuantity: realizedValue });
      }

      await db.businessTask.update({
        where: { id: createdTask.id },
        data: { actionResourceType: item.actionResourceType, actionResourceId },
      });

      // Step 6: Outcome Reconciliation
      const outcomeService = new OutcomeEvaluatorService();
      const { outcome, evaluation } = await outcomeService.reconcileTaskOutcome(createdTask.id, adminUser.id, db);

      expect(outcome.attributionMethod).toBe('DIRECT_TRANSACTION_RECONCILIATION');
      expect(evaluation.status).toBe('SUCCESS');
      expect(Number(outcome.realizedValue)).toBe(realizedValue);
      expect(evaluation.absolutePercentageError).toBeDefined();
    });
  }
});
