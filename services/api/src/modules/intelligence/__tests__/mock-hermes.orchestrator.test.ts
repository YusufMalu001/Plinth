import { IntelligenceOrchestratorService } from '../services/intelligence-orchestrator.service';
import { MockHermesProvider } from '../integrations/mock-hermes.provider';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';

describe('deterministic mock question path', () => {
  it('captures a snapshot, invokes the mock, validates its evidence, and persists the run result', async () => {
    const metric = {
      key: 'inventory.slow_moving_product_count', value: 2, unit: 'COUNT',
      provenance: 'CALCULATED', freshnessStatus: 'FRESH', dataQualityScore: 1,
      sourceRefs: [{ resource: 'InventoryLedgerEntry', filter: 'synthetic fixture' }],
    };
    const snapshot: any = {
      id: '00000000-0000-4000-8000-000000000001', module: 'INVENTORY', metricVersion: 'mock-test-v1',
      periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(), freshnessScore: 1, costCoverageScore: 1,
      data: {
        module: 'INVENTORY', metricVersion: 'mock-test-v1', periodStart: new Date(Date.now() - 86_400_000).toISOString(),
        periodEnd: new Date().toISOString(), generatedAt: new Date().toISOString(), sourceLatestAt: new Date().toISOString(),
        reportingCurrency: 'INR', metrics: [metric], opportunities: [], notices: [],
      },
    };
    const run = { id: 'run-test-1', createdAt: new Date(), startedAt: new Date() };
    const txUpdate = jest.fn().mockResolvedValue({});
    const db: any = {
      intelligenceRun: { findFirst: jest.fn().mockResolvedValue(run), update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work({ intelligenceRun: { update: txUpdate } })),
    };
    const metrics: any = { capture: jest.fn().mockResolvedValue(snapshot) };
    const runtime = new MockHermesProvider();
    const runtimeSpy = jest.spyOn(runtime, 'run');
    const orchestrator = new IntelligenceOrchestratorService(
      db, metrics, undefined, runtime, new RecommendationValidatorService(), undefined,
      { effective: jest.fn().mockResolvedValue({ providerEnabled: true }) } as any,
    );

    const result = await orchestrator.process({
      id: 'job-test-1', module: 'INVENTORY', trigger: 'QUESTION', attempts: 0,
      correlationId: 'corr-test-1', payload: { question: 'Which synthetic stock needs review?' },
    } as any);

    expect(result).toEqual({ runId: run.id, recommendations: 0, rejected: false });
    expect(metrics.capture).toHaveBeenCalledWith('INVENTORY', 30, undefined);
    const runtimeContext = JSON.parse(runtimeSpy.mock.calls[0][0].content);
    expect(runtimeContext.snapshotId).toBe(snapshot.id);
    expect(runtimeContext.certifiedSnapshot).toEqual(snapshot.data);
    const persisted = txUpdate.mock.calls[0][0].data;
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.structuredOutput.evidence[0].metricKey).toBe(metric.key);
    expect(persisted.modelProvider).toBe('DETERMINISTIC_MOCK');
    expect(persisted.modelId).toBe('synergy/mock-hermes-v1');
    expect(persisted.toolAudit.map((entry: { stage: string }) => entry.stage)).toEqual([
      'API_QUEUED', 'WORKER_STARTED', 'SNAPSHOT_CAPTURED', 'ADVISOR_RETURNED', 'VALIDATED', 'PERSISTED',
    ]);
  });

  it('does not invoke the runtime when provider execution is disabled', async () => {
    const run = { id: 'run-disabled', createdAt: new Date(), startedAt: null };
    const db: any = {
      intelligenceRun: { findFirst: jest.fn().mockResolvedValue(run), update: jest.fn().mockResolvedValue({}) },
    };
    const metrics: any = { capture: jest.fn() };
    const runtime = { run: jest.fn(), estimateCost: jest.fn() } as any;
    const orchestrator = new IntelligenceOrchestratorService(
      db, metrics, undefined, runtime, new RecommendationValidatorService(), undefined,
      { effective: jest.fn().mockResolvedValue({ providerEnabled: false }) } as any,
    );

    const result = await orchestrator.process({
      id: 'job-disabled', module: 'SALES', trigger: 'QUESTION', attempts: 0,
      correlationId: 'corr-disabled', payload: { question: 'Synthetic test question' },
    } as any);

    expect(result).toMatchObject({ runId: run.id, disabled: true });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(metrics.capture).not.toHaveBeenCalled();
    expect(db.intelligenceRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', errorCode: 'PROVIDER_DISABLED' }),
    }));
  });
});
