import { config } from '../../../config';
import { AgentRuntimeClient } from '../integrations/agent-runtime.client';

describe('Hermes runtime attempt observability', () => {
  const originalFetch = global.fetch;
  const originalKey = config.intelligence.runtimeKeys.inventory;
  const originalFreeOnly = config.intelligence.freeOnly;
  const originalAllowFree = config.intelligence.allowFreeProviderDataUse;
  const db = { intelligenceRun: { aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 0 } }), count: jest.fn().mockResolvedValue(0) } };
  const controls = { effective: jest.fn().mockResolvedValue({ enabled: true, providerEnabled: true, pausedProfiles: [] }) };
  const attempt = { id: 'attempt-1', startedAt: new Date() };
  const telemetry = { start: jest.fn().mockResolvedValue(attempt), finishTimed: jest.fn().mockResolvedValue({}), reconcileOpenRouterGeneration: jest.fn() };
  const client = new AgentRuntimeClient(db as never, controls as never, telemetry as never);
  const input = { module: 'INVENTORY' as const, instructions: 'test', content: 'test', idempotencyKey: 'test', runId: 'run-1', requestId: 'req-1', correlationId: 'req-1' };

  beforeEach(() => {
    config.intelligence.runtimeKeys.inventory = 'test-runtime-key';
    config.intelligence.freeOnly = false;
    config.intelligence.allowFreeProviderDataUse = true;
    jest.clearAllMocks();
    telemetry.start.mockResolvedValue(attempt);
    telemetry.finishTimed.mockResolvedValue({});
    db.intelligenceRun.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    db.intelligenceRun.count.mockResolvedValue(0);
  });
  afterAll(() => {
    config.intelligence.runtimeKeys.inventory = originalKey;
    config.intelligence.freeOnly = originalFreeOnly;
    config.intelligence.allowFreeProviderDataUse = originalAllowFree;
    global.fetch = originalFetch;
  });

  it('excludes the current run from a one-run concurrency limit', async () => {
    const previousLimit = config.intelligence.maxConcurrentRuns;
    config.intelligence.maxConcurrentRuns = 1;
    try {
      await client.assertBudgetAvailable('run-1');
      expect(db.intelligenceRun.count).toHaveBeenCalledWith({ where: expect.objectContaining({
        status: 'RUNNING', id: { not: 'run-1' },
      }) });
    } finally {
      config.intelligence.maxConcurrentRuns = previousLimit;
    }
  });

  it('records a completed Hermes response without inventing OpenRouter IDs', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'hermes-1', status: 'queued' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'hermes-1', status: 'completed', output: '{}', runtime: { model: 'qwen/qwen3.8-27b:free', provider: 'openrouter' }, usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 } }), { status: 200 }));
    const result = await client.run(input);
    expect(result.run_id).toBe('hermes-1');
    expect(telemetry.start).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', requestId: 'req-1', operation: 'ADVISOR_RUN' }));
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ status: 'SUCCEEDED', totalTokens: 10, generationId: undefined, httpStatus: undefined }));
  });

  it('preserves runtime HTTP failure status without storing response text', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'sensitive details' }), { status: 401 }));
    await expect(client.run(input)).rejects.toThrow('HTTP 401');
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ status: 'FAILED', httpStatus: 401, errorCategory: 'RUNTIME_HTTP_401' }));
    expect(JSON.stringify(telemetry.finishTimed.mock.calls)).not.toContain('sensitive details');
  });

  it('records timeout with no fabricated HTTP status', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(client.run(input)).rejects.toThrow(/time/i);
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ status: 'FAILED', errorCategory: 'TIMEOUT', httpStatus: undefined }));
  });

  it('surfaces telemetry persistence failure instead of reporting success', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'hermes-1', status: 'queued' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'hermes-1', status: 'completed', output: '{}' }), { status: 200 }));
    telemetry.finishTimed.mockRejectedValue(new Error('database unavailable'));
    await expect(client.run(input)).rejects.toThrow('Provider attempt persistence failed');
  });
});
