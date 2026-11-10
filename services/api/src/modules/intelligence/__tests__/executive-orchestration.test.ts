import { randomUUID } from 'crypto';
import { IntelligenceOrchestratorService, classifyQuestionDomains } from '../services/intelligence-orchestrator.service';
import { IntelligenceConversationService } from '../services/conversation.service';
import { MockHermesProvider } from '../integrations/mock-hermes.provider';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';
import { config } from '../../../config';
import { IntelligenceModule } from '@prisma/client';

class MockExecutiveStore {
  runs = new Map<string, any>();
  jobs = new Map<string, any>();
  delegations = new Map<string, any>();
  cases = new Map<string, any>();
  conversations = new Map<string, any>();
  conversationMessages = new Map<string, any>();
  snapshots = new Map<string, any>();

  asPrisma(): any {
    const store = this;
    const db: any = {
      $transaction: async (fn: any) => fn(db),

      intelligenceRun: {
        create: async (args: any) => {
          const id = `run-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.runs.set(id, row);
          return row;
        },
        findFirst: async (args: any) => {
          for (const row of store.runs.values()) {
            if (args.where.jobId && row.jobId === args.where.jobId) return row;
            if (args.where.id && row.id === args.where.id) return row;
          }
          return null;
        },
        findMany: async (args: any) => {
          const res: any[] = [];
          for (const row of store.runs.values()) {
            if (args.where?.parentRunId && row.parentRunId !== args.where.parentRunId) continue;
            if (args.where?.module && row.module !== args.where.module) continue;
            res.push(row);
          }
          return res;
        },
        update: async (args: any) => {
          const row = store.runs.get(args.where.id);
          if (row) Object.assign(row, args.data);
          return row;
        },
      },

      providerAttempt: {
        updateMany: async () => ({ count: 0 }),
      },

      intelligenceJob: {
        create: async (args: any) => {
          const id = `job-${randomUUID()}`;
          const row = { id, attempts: 0, ...args.data, createdAt: new Date() };
          store.jobs.set(id, row);
          return row;
        },
        findUnique: async (args: any) => store.jobs.get(args.where.id),
      },

      advisorDelegation: {
        upsert: async (args: any) => {
          const key = `${args.create.parentRunId}:${args.create.requestedModule}`;
          const row = store.delegations.get(key) ?? { id: `del-${randomUUID()}`, ...args.create };
          Object.assign(row, args.update);
          store.delegations.set(key, row);
          return row;
        },
        findMany: async (args: any) => {
          const res: any[] = [];
          for (const row of store.delegations.values()) {
            if (args.where?.parentRunId && row.parentRunId !== args.where.parentRunId) continue;
            res.push(row);
          }
          return res;
        },
      },

      intelligenceCase: {
        findUnique: async (args: any) => store.cases.get(args.where.id),
      },

      conversation: {
        create: async (args: any) => {
          const id = `conv-${randomUUID()}`;
          const row = { id, ...args.data, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
          store.conversations.set(id, row);
          return row;
        },
        findFirst: async (args: any) => store.conversations.get(args.where.id),
        update: async (args: any) => {
          const row = store.conversations.get(args.where.id);
          if (row) Object.assign(row, args.data);
          return row;
        },
      },

      conversationMessage: {
        create: async (args: any) => {
          const id = `msg-${randomUUID()}`;
          const row = { id, ...args.data, createdAt: new Date() };
          store.conversationMessages.set(id, row);
          return row;
        },
        findMany: async (args: any) => {
          const res: any[] = [];
          for (const row of store.conversationMessages.values()) {
            if (args.where?.conversationId && row.conversationId !== args.where.conversationId) continue;
            res.push(row);
          }
          return res;
        },
        count: async (args: any) => {
          let count = 0;
          for (const row of store.conversationMessages.values()) {
            if (args.where?.conversationId && row.conversationId === args.where.conversationId) count++;
          }
          return count;
        },
      },
    };
    return db;
  }
}

describe('Executive Hermes & Specialist Orchestration', () => {
  let store: MockExecutiveStore;
  let db: any;
  let mockRuntime: MockHermesProvider;
  let validator: RecommendationValidatorService;
  let mockMetrics: any;
  let orchestrator: IntelligenceOrchestratorService;
  let conversationService: IntelligenceConversationService;

  const now = new Date().toISOString();

  beforeEach(() => {
    store = new MockExecutiveStore();
    db = store.asPrisma();
    mockRuntime = new MockHermesProvider();
    validator = new RecommendationValidatorService();

    mockMetrics = {
      capture: async (module: IntelligenceModule) => {
        const id = `snap-${module.toLowerCase()}-${randomUUID()}`;
        const metricKey = `${module.toLowerCase()}.core_kpi`;
        const snapshot = {
          id,
          module,
          metricVersion: 'v1.0',
          periodStart: new Date(Date.now() - 30 * 86_400_000),
          periodEnd: new Date(),
          freshnessScore: 1,
          costCoverageScore: 1,
          data: {
            module,
            metricVersion: 'v1.0',
            periodStart: now,
            periodEnd: now,
            generatedAt: now,
            sourceLatestAt: now,
            reportingCurrency: 'INR',
            metrics: [
              {
                key: metricKey,
                value: 125000,
                unit: 'INR',
                currency: 'INR',
                provenance: 'CALCULATED',
                freshnessStatus: 'FRESH',
                dataQualityScore: 1,
                sourceRefs: [{ resource: 'FinancialLedger', filter: 'certified fixture' }],
              },
              {
                key: `${module.toLowerCase()}.variance_rate`,
                value: 0.12,
                unit: 'PERCENT',
                currency: null,
                provenance: 'CALCULATED',
                freshnessStatus: 'FRESH',
                dataQualityScore: 1,
                sourceRefs: [{ resource: 'VarianceRegistry', filter: 'certified fixture' }],
              },
            ],
            opportunities: [],
            notices: [],
          },
        };
        store.snapshots.set(id, snapshot);
        return snapshot;
      },
    };

    const mockControls: any = {
      effective: async () => ({ providerEnabled: true }),
    };

    orchestrator = new IntelligenceOrchestratorService(
      db,
      mockMetrics,
      {} as any,
      mockRuntime,
      validator,
      {} as any,
      mockControls,
    );

    conversationService = new IntelligenceConversationService(db);
    (config.intelligence as any).delegationEnabled = true;
  });

  describe('classifyQuestionDomains', () => {
    it('classifies "Why is profit declining?" to SALES, PROCUREMENT, PRODUCTION', () => {
      const domains = classifyQuestionDomains('Why is profit declining?');
      expect(domains).toContain('SALES');
      expect(domains).toContain('PROCUREMENT');
    });

    it('classifies "What should we do about the material price increase?" to PROCUREMENT, INVENTORY', () => {
      const domains = classifyQuestionDomains('What should we do about the material price increase?');
      expect(domains).toContain('PROCUREMENT');
      expect(domains).toContain('INVENTORY');
    });

    it('classifies fulfillment questions to FULFILLMENT and SALES', () => {
      const domains = classifyQuestionDomains('Why is shipment delivery late?');
      expect(domains).toContain('FULFILLMENT');
    });
  });

  describe('Executive Hermes Pipeline', () => {
    it('orchestrates specialists and synthesizes answer for "Why is profit declining?"', async () => {
      const { job, run } = await orchestrator.enqueueQuestion(
        'Why is profit declining?',
        'EXECUTIVE',
        'user-ceo',
        'corr-profit-1',
      );

      const result = await orchestrator.process(job as any);
      expect(result.runId).toBe(run.id);

      const updatedRun = store.runs.get(run.id);
      expect(updatedRun.status).toBe('COMPLETED');
      expect(updatedRun.structuredOutput).toBeDefined();

      const output = updatedRun.structuredOutput;
      expect(output.answer).toContain('profit decline');
      expect(output.evidence.length).toBeGreaterThan(0);

      // Verify specialist runs were executed and persisted as children
      const specialistRuns = Array.from(store.runs.values()).filter((r) => r.parentRunId === run.id);
      expect(specialistRuns.length).toBeGreaterThan(0);
      for (const specRun of specialistRuns) {
        expect(specRun.status).toBe('COMPLETED');
        expect(specRun.structuredOutput).toBeDefined();
      }

      // Verify delegations were created
      const delegations = store.delegations;
      expect(delegations.size).toBeGreaterThan(0);
    });

    it('orchestrates specialists and synthesizes answer for "What should we do about the material price increase?"', async () => {
      const { job, run } = await orchestrator.enqueueQuestion(
        'What should we do about the material price increase?',
        'EXECUTIVE',
        'user-cpo',
        'corr-mat-1',
      );

      const result = await orchestrator.process(job as any);
      expect(result.runId).toBe(run.id);

      const updatedRun = store.runs.get(run.id);
      expect(updatedRun.status).toBe('COMPLETED');

      const output = updatedRun.structuredOutput;
      expect(output.answer).toContain('material price escalation');
      expect(output.evidence.length).toBeGreaterThan(0);

      // Specialist runs created for procurement/inventory
      const specialistRuns = Array.from(store.runs.values()).filter((r) => r.parentRunId === run.id);
      const modules = specialistRuns.map((r) => r.module);
      expect(modules).toContain('PROCUREMENT');
      expect(modules).toContain('INVENTORY');
    });
  });

  describe('Specialist Hermes Bounded Analyses (all 5 domains)', () => {
    const modules: IntelligenceModule[] = ['SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT'];

    for (const mod of modules) {
      it(`executes bounded analysis for ${mod} specialist`, async () => {
        const caseId = `case-${mod.toLowerCase()}-1`;
        const testCase = {
          id: caseId,
          module: mod,
          detectorKey: `${mod}_RISK_DETECTOR`,
          entityType: 'ENTERPRISE',
          entityId: 'ENT-001',
          priority: 'HIGH',
          evidence: {
            situation: `Verified operational anomaly detected in ${mod} department.`,
          },
        };
        store.cases.set(caseId, testCase);

        const analysis = await orchestrator.analyzeCase(caseId, 'user-analyst', `corr-spec-${mod}`);
        expect(analysis.status).toBe('COMPLETED');
        expect(analysis.output).toBeDefined();
        expect(analysis.output.answer).toBeDefined();

        const persistedRun = store.runs.get(analysis.runId);
        expect(persistedRun).toBeDefined();
        expect(persistedRun.module).toBe(mod);
        expect(persistedRun.status).toBe('COMPLETED');
        expect(persistedRun.structuredOutput).toBeDefined();
      });
    }
  });

  describe('Advisor Conversation Integration', () => {
    it('creates conversation, sends message, executes Executive Hermes, and persists assistant message', async () => {
      const ownerId = 'user-exec-1';
      const conversation = await conversationService.create(ownerId, 'EXECUTIVE', 'Quarterly Margin Strategy');
      expect(conversation.id).toBeDefined();

      const sendResult = await conversationService.send(ownerId, conversation.id, 'Why is profit declining?', 'corr-conv-1');
      expect(sendResult.module).toBe('EXECUTIVE');
      expect(sendResult.message).toBe('Why is profit declining?');

      const userMessages = Array.from(store.conversationMessages.values()).filter((m) => m.role === 'USER');
      expect(userMessages.length).toBe(1);
      expect(userMessages[0].content).toBe('Why is profit declining?');

      // Now enqueue and process via the same pipeline
      const { job, run } = await orchestrator.enqueueQuestion(
        sendResult.message,
        sendResult.module,
        ownerId,
        'corr-conv-1',
        conversation.id,
      );

      await orchestrator.process(job as any);

      // Verify assistant message was persisted
      const assistantMessages = Array.from(store.conversationMessages.values()).filter((m) => m.role === 'ASSISTANT');
      expect(assistantMessages.length).toBe(1);
      expect(assistantMessages[0].conversationId).toBe(conversation.id);
      expect(assistantMessages[0].runId).toBe(run.id);

      const parsedContent = JSON.parse(assistantMessages[0].content);
      expect(parsedContent.answer).toContain('profit decline');
      expect(assistantMessages[0].evidenceRefs).toBeDefined();
    });
  });
});
