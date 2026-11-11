import { randomUUID } from 'crypto';
import { IntelligenceCaseService } from '../services/intelligence-case.service';
import { ImpactScenarioService } from '../services/impact-scenario.service';
import { IntelligenceOrchestratorService } from '../services/intelligence-orchestrator.service';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';
import { IntelligenceService } from '../services/intelligence.service';
import { OutcomeEvaluatorService } from '../services/outcome-evaluator.service';
import { MockHermesProvider } from '../integrations/mock-hermes.provider';
import { CertifiedSnapshotData } from '../services/certified-metrics.service';
import { config } from '../../../config';

/**
 * In-memory relational test harness for the complete Hermes Golden Lifecycle.
 * Validates the entire chain without external network dependencies or database pollution.
 */
class InMemoryGoldenStore {
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
  recommendationOutcomes = new Map<string, any>();
  auditLogs: any[] = [];
  users = new Map<string, any>();
  domainEventOutbox = new Map<string, any>();

  asPrisma(): any {
    const store = this;
    const db: any = {
      $transaction: async (work: any) => {
        if (typeof work === 'function') {
          return work(db);
        }
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
          if (args.create?.observations?.create) {
            const obs = {
              id: `obs-${randomUUID()}`,
              caseId: row.id,
              ...args.create.observations.create,
              observedAt: new Date(),
            };
            store.caseObservations.set(obs.id, obs);
          }
          return row;
        },
        findUnique: async (args: any) => {
          const row = store.intelligenceCases.get(args.where.id ?? args.where.dedupeKey);
          if (!row) return null;
          return {
            ...row,
            snapshot: args.include?.snapshot ? store.snapshots.get(row.snapshotId) : undefined,
          };
        },
        findFirst: async (args: any) => {
          const rows = Array.from(store.intelligenceCases.values());
          return rows.find((r) => !args.where?.id || r.id === args.where.id) ?? null;
        },
        findMany: async () => Array.from(store.intelligenceCases.values()),
        count: async () => store.intelligenceCases.size,
      },

      impactScenario: {
        create: async (args: any) => {
          const id = `scenario-${randomUUID()}`;
          const scenario = {
            id,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.impactScenarios.set(id, scenario);
          if (args.data.idempotencyKey) {
            store.impactScenarios.set(args.data.idempotencyKey, scenario);
          }
          return scenario;
        },
        findUnique: async (args: any) => {
          return store.impactScenarios.get(args.where.id ?? args.where.idempotencyKey) ?? null;
        },
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
        update: async (args: any) => {
          const run = store.runs.get(args.where.id);
          if (run) Object.assign(run, args.data);
          return run;
        },
      },

      recommendation: {
        create: async (args: any) => {
          const id = `rec-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date(), updatedAt: new Date(), status: 'OPEN' };
          store.recommendations.set(id, row);
          store.recommendations.set(row.dedupeKey, row);
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
            if (args.where?.status?.in && !args.where.status.in.includes(r.status)) return false;
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
          const row = store.recommendations.get(args.where.id);
          if (row && (!args.where.status?.in || args.where.status.in.includes(row.status))) {
            Object.assign(row, args.data, { updatedAt: new Date() });
            return { count: 1 };
          }
          return { count: 0 };
        },
        findMany: async () => Array.from(store.recommendations.values()),
        count: async () => store.recommendations.size,
      },

      recommendationDecision: {
        create: async (args: any) => {
          const id = `decision-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.recommendationDecisions.set(id, row);
          return row;
        },
      },

      businessTask: {
        create: async (args: any) => {
          const id = `task-${randomUUID()}`;
          const row = { id, status: args.data?.status ?? 'OPEN', ...args.data, createdAt: new Date(), updatedAt: new Date() };
          store.businessTasks.set(id, row);
          if (args.data.recommendationId) store.businessTasks.set(`rec:${args.data.recommendationId}`, row);
          return row;
        },
        findUnique: async (args: any) => {
          const row = store.businessTasks.get(args.where.id ?? `rec:${args.where.recommendationId}`);
          if (!row) return null;
          const res: any = { ...row };
          if (args.include?.recommendation) {
            const rec = store.recommendations.get(row.recommendationId);
            if (rec) {
              res.recommendation = {
                ...rec,
                impactScenario: args.include.recommendation.include?.impactScenario ? store.impactScenarios.get(rec.scenarioId) : undefined,
              };
            }
          }
          if (args.include?.owner) {
            res.owner = store.users.get(row.ownerId);
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
        create: async (args: any) => {
          const id = args.data?.id ?? `po-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.purchaseOrders.set(id, row);
          return row;
        },
        findUnique: async (args: any) => {
          return store.purchaseOrders.get(args.where.id) ?? null;
        },
      },

      recommendationOutcome: {
        create: async (args: any) => {
          const id = `outcome-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.recommendationOutcomes.set(id, row);
          return row;
        },
        findFirst: async (args: any) => {
          const list = Array.from(store.recommendationOutcomes.values()).filter((o) => {
            if (args.where?.taskId && o.taskId !== args.where.taskId) return false;
            if (args.where?.recommendationId && o.recommendationId !== args.where.recommendationId) return false;
            return true;
          });
          return list[0] ?? null;
        },
      },

      user: {
        findUnique: async (args: any) => {
          const user = store.users.get(args.where.id);
          if (!user) return null;
          return {
            ...user,
            userRoles: user.userRoles ?? [],
          };
        },
      },

      userRole: {
        findMany: async (args: any) => {
          const user = store.users.get(args.where.userId);
          if (!user) return [];
          return [{
            role: {
              name: user.role,
              permissions: [{ action: 'manage', resource: 'all' }],
            },
          }];
        },
      },

      auditLog: {
        create: async (args: any) => {
          store.auditLogs.push(args.data);
          return args.data;
        },
      },

      domainEventOutbox: {
        create: async (args: any) => {
          const id = args.data.id ?? `event-${randomUUID()}`;
          const event = { id, ...args.data, createdAt: new Date() };
          store.domainEventOutbox.set(id, event);
          return event;
        },
        upsert: async (args: any) => {
          const id = args.where?.id ?? `event-${randomUUID()}`;
          const event = { id, ...args.create, createdAt: new Date() };
          store.domainEventOutbox.set(id, event);
          return event;
        },
      },
    };
    return db;
  }
}

describe('Hermes AI ERP — Golden Lifecycle End-to-End', () => {
  const periodStart = '2026-09-01T00:00:00.000Z';
  const periodEnd = '2026-10-01T00:00:00.000Z';
  const dataTimestamp = '2026-10-01T06:00:00.000Z';

  let originalCasesEnabled: boolean;
  let originalScenariosEnabled: boolean;

  beforeAll(() => {
    originalCasesEnabled = config.intelligence.casesEnabled;
    originalScenariosEnabled = config.intelligence.scenariosEnabled;
    config.intelligence.casesEnabled = true;
    config.intelligence.scenariosEnabled = true;
  });

  afterAll(() => {
    config.intelligence.casesEnabled = originalCasesEnabled;
    config.intelligence.scenariosEnabled = originalScenariosEnabled;
  });

  it('executes full golden flow: ERP price hike → certified snapshot → detector → scenario → hermes rec → human accept → PO execution → outcome reconciliation', async () => {
    const store = new InMemoryGoldenStore();
    const db = store.asPrisma();

    // 0. Seed authenticated users (Admin / Procurement Manager)
    const adminUser = {
      id: 'usr-procurement-mgr',
      name: 'Priya Sharma',
      email: 'priya.sharma@plinth.internal',
      role: 'admin',
      isActive: true,
      department: 'PROCUREMENT',
      assignedDepartmentRef: { code: 'PROC', name: 'Procurement' },
    };
    store.users.set(adminUser.id, adminUser);

    // Seed objective policy
    const policy = {
      id: 'policy-procurement-v1',
      module: 'PROCUREMENT',
      policyVersion: '1.0',
      status: 'ACTIVE',
      name: 'Procurement Cost Optimization Policy',
    };
    store.objectivePolicies.set(policy.id, policy);

    // 1. Snapshot Evidence: 12% price hike on MAT-GOLDEN-001 from ₹100 to ₹112 (500 units affected)
    const snapshotData: CertifiedSnapshotData = {
      module: 'PROCUREMENT',
      metricVersion: 'procurement-gold-v1',
      periodStart,
      periodEnd,
      generatedAt: '2026-10-01T06:00:00.000Z',
      sourceLatestAt: dataTimestamp,
      reportingCurrency: 'INR',
      notices: [],
      metrics: [
        {
          key: 'procurement.material_price_delta',
          value: 12,
          unit: 'INR',
          currency: 'INR',
          provenance: 'CALCULATED',
          freshnessStatus: 'FRESH',
          dataQualityScore: 1,
          sourceRefs: [{ resource: 'MaterialPriceHistory', filter: 'MAT-GOLDEN-001 approved purchase rate' }],
        },
        {
          key: 'procurement.material_quantity_affected',
          value: 500,
          unit: 'COUNT',
          provenance: 'CALCULATED',
          freshnessStatus: 'FRESH',
          dataQualityScore: 1,
          sourceRefs: [{ resource: 'PurchaseOrderLine', filter: 'quarterly forecast demand' }],
        },
      ],
      opportunities: [
        {
          id: 'procurement-price-increase:MAT-GOLDEN-001',
          category: 'MATERIAL_PRICE_INCREASE',
          actionCode: 'procurement.bulk_purchase_evaluation',
          title: 'Advance raw material buy before supplier price increase',
          situation: 'Supplier announced 12% price increase from ₹100.00 to ₹112.00 on MAT-GOLDEN-001 effective next cycle.',
          metricKeys: ['procurement.material_price_delta', 'procurement.material_quantity_affected'],
          targetResource: 'Material',
          targetResourceId: 'MAT-GOLDEN-001',
          previousUnitPrice: 100,
          currentUnitPrice: 112,
          affectedQuantity: 500,
          estimatedCostImpact: 6000,
          expectedImpact: {
            metricKey: 'procurement.bulk_buy_net_savings',
            unit: 'INR',
            currency: 'INR',
            horizonDays: 90,
            low: 3000,
            base: 3780.82,
            high: 4500,
            sourceMetricKeys: ['procurement.material_price_delta', 'procurement.material_quantity_affected'],
          },
        } as any,
      ],
    };

    const snapshot = {
      id: 'snapshot-proc-golden-1',
      module: 'PROCUREMENT',
      metricVersion: 'procurement-gold-v1',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      capturedAt: new Date(),
      freshnessScore: 1,
      costCoverageScore: 1,
      metrics: snapshotData.metrics,
      data: snapshotData,
    };
    store.snapshots.set(snapshot.id, snapshot);

    // 2. DETECTOR EXECUTION: IntelligenceCaseService
    const caseService = new IntelligenceCaseService(db);
    const detectionResults = await caseService.detect(snapshot as any);

    expect(detectionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'MATERIAL_PRICE_INCREASE', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));

    const dedupeKey = `MATERIAL_PRICE_INCREASE:Material:MAT-GOLDEN-001:2026-10:procurement-gold-v1`;
    const detectedCase = store.intelligenceCases.get(dedupeKey);
    expect(detectedCase).toBeDefined();
    expect(detectedCase.severity).toBe('WARNING');
    expect(detectedCase.evidence).toMatchObject({
      detectorKey: 'MATERIAL_PRICE_INCREASE',
      previousUnitPrice: 100,
      currentUnitPrice: 112,
      absoluteDelta: 12,
      percentageDelta: 12,
      affectedQuantity: 500,
      estimatedCostImpact: 6000,
    });

    // 3. IMPACT SCENARIOS: ImpactScenarioService (DO_NOTHING vs BUY_MORE)
    const scenarioService = new ImpactScenarioService(db);

    const doNothingScenario = await scenarioService.create({
      caseId: detectedCase.id,
      actorId: adminUser.id,
      correlationId: 'corr-do-nothing-1',
      idempotencyKey: 'scenario-do-nothing-golden',
      scenarioType: 'DO_NOTHING',
    });
    expect(doNothingScenario.baseline).toMatchObject({
      status: 'CALCULATED',
      metricKey: 'procurement.material_cost_increase_unmitigated',
      value: 6000,
    });

    const buyMoreScenario = await scenarioService.create({
      caseId: detectedCase.id,
      actorId: adminUser.id,
      correlationId: 'corr-buy-more-1',
      idempotencyKey: 'scenario-buy-more-golden',
      scenarioType: 'BUY_MORE',
      assumptions: {
        forwardQuantity: 500,
        holdingCostPercent: 18,
        horizonDays: 90,
      },
    });
    expect(buyMoreScenario.formulaVersion).toBe('deterministic-decimal-scenario-v1');
    expect(buyMoreScenario.baseCase).toMatchObject({
      metricKey: 'procurement.bulk_buy_net_savings',
      unit: 'INR',
      value: 3780.82,
    });
    expect(buyMoreScenario.lowCase.value).toBe(Number((3780.82 * 0.85).toFixed(2)));
    expect(buyMoreScenario.highCase.value).toBe(Number((3780.82 * 1.15).toFixed(2)));

    // 4. ORCHESTRATOR & HERMES SPECIALIST: IntelligenceOrchestratorService
    const mockHermes = new MockHermesProvider();
    const validator = new RecommendationValidatorService();
    const mockPolicies: any = {
      getActive: jest.fn().mockResolvedValue(policy),
      activePolicyForModule: jest.fn().mockResolvedValue(policy),
    };
    const mockControls: any = {
      effective: jest.fn().mockResolvedValue({
        enabled: true,
        providerEnabled: true,
        shadowMode: false,
        notificationsEnabled: false,
        pausedProfiles: [],
      }),
    };
    const mockMetricsService: any = {
      capture: jest.fn().mockResolvedValue(snapshot),
    };

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
      id: 'run-proc-golden-1',
      module: 'PROCUREMENT',
      trigger: 'EVENT',
      modelProvider: 'DETERMINISTIC_MOCK',
      modelId: 'plinth/mock-hermes-v1',
      createdAt: new Date(),
      startedAt: new Date(),
    };
    store.runs.set(run.id, run);

    const processResult = await orchestrator.process({
      id: 'job-proc-golden-1',
      module: 'PROCUREMENT',
      trigger: 'EVENT',
      attempts: 0,
      correlationId: 'corr-golden-1',
      payload: {},
    } as any);

    expect(processResult.recommendations).toBe(1);
    expect(processResult.rejected).toBe(false);

    // Verify Recommendation is linked to both IntelligenceCase and ImpactScenario
    const createdRec = Array.from(store.recommendations.values()).find((r) => r.opportunityRef === snapshotData.opportunities[0].id);
    expect(createdRec).toBeDefined();
    expect(createdRec.caseId).toBe(detectedCase.id);
    expect(createdRec.scenarioId).toBe(buyMoreScenario.id);
    expect(createdRec.status).toBe('OPEN');
    expect(createdRec.proposedActionCode).toBe('procurement.bulk_purchase_evaluation');

    // 5. HUMAN DECISION CENTER ACTION: IntelligenceService.acceptRecommendation
    const mockAudit: any = {
      record: jest.fn().mockResolvedValue(true),
    };
    const mockNotifications: any = {
      send: jest.fn().mockResolvedValue(true),
      createAndDispatch: jest.fn().mockResolvedValue(true),
    };

    const intelligenceService = new IntelligenceService(
      db,
      orchestrator,
      mockPolicies,
      mockNotifications,
      mockAudit,
      mockControls,
    );

    const taskDueDate = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const createdTask = await intelligenceService.acceptRecommendation(
      adminUser.id,
      createdRec.id,
      {
        assigneeId: adminUser.id,
        dueAt: taskDueDate,
        managerNotes: 'Approved forward buy of 500 units MAT-GOLDEN-001 before price increase takes effect.',
      },
      'req-accept-golden-1',
    );

    expect(createdTask).toBeDefined();
    expect(createdTask.status).toBe('OPEN');
    expect(createdTask.ownerId).toBe(adminUser.id);
    expect(createdRec.status).toBe('ACCEPTED');

    // Verify Decision recorded
    const decision = Array.from(store.recommendationDecisions.values()).find((d) => d.recommendationId === createdRec.id);
    expect(decision).toBeDefined();
    expect(decision.decision).toBe('ACCEPTED');
    expect(decision.actorId).toBe(adminUser.id);

    // 6. ERP ACTION EXECUTION & LINKING: PO created and linked to BusinessTask
    const purchaseOrder = {
      id: 'PO-2026-GOLDEN-001',
      orderNumber: 'PO-2026-GOLDEN-001',
      status: 'CONFIRMED',
      vendorId: 'vendor-golden-steel',
      currency: 'INR',
      totalAmount: 3800.00, // Actual realized net savings benefit achieved via forward contract lock-in
      lines: [
        {
          id: 'poline-1',
          itemId: 'MAT-GOLDEN-001',
          quantity: 500,
          unitPrice: 100, // Locked in at previous unit price before 112 hike
        },
      ],
    };
    store.purchaseOrders.set(purchaseOrder.id, purchaseOrder);

    // Link ERP Action to BusinessTask
    const linkedTask = await intelligenceService.linkTaskAction(
      adminUser.id,
      createdTask.id,
      {
        actionResourceType: 'PurchaseOrder',
        actionResourceId: purchaseOrder.id,
      },
      'req-link-action-golden-1',
    );

    expect(linkedTask.actionResourceType).toBe('PurchaseOrder');
    expect(linkedTask.actionResourceId).toBe(purchaseOrder.id);

    // Verify BusinessTaskActivity logged ACTION_LINKED
    const activity = Array.from(store.businessTaskActivities.values()).find((a) => a.taskId === createdTask.id && a.type === 'ACTION_LINKED');
    expect(activity).toBeDefined();
    expect(activity.actorId).toBe(adminUser.id);

    // 7. OUTCOME RECONCILIATION: OutcomeEvaluatorService.reconcileTaskOutcome
    const outcomeEvaluator = new OutcomeEvaluatorService();
    const { outcome, evaluation } = await outcomeEvaluator.reconcileTaskOutcome(
      createdTask.id,
      adminUser.id,
      db,
    );

    // Assert outcome evaluation calculations
    expect(outcome).toBeDefined();
    expect(outcome.attributionMethod).toBe('DIRECT_TRANSACTION_RECONCILIATION');
    expect(outcome.metricKey).toBe('procurement.bulk_buy_net_savings');
    expect(outcome.taskId).toBe(createdTask.id);
    expect(outcome.recommendationId).toBe(createdRec.id);

    // Decimal arithmetic checks:
    // Expected: 3780.82 (from scenario baseCase)
    // Actual: 3800.00 (from PO benefit)
    // Variance: 3800 - 3780.82 = 19.18
    // APE: 19.18 / 3780.82 ≈ 0.005072 (< 0.15 threshold → SUCCESS)
    expect(evaluation.status).toBe('SUCCESS');
    expect(evaluation.attributionVerified).toBe(true);
    expect(evaluation.policyVersion).toBe('default-v1');
    expect(Number(outcome.variance?.toString())).toBeCloseTo(19.18, 2);
    expect(Number(outcome.absolutePercentageError?.toString())).toBeLessThan(0.01);
  });
});
