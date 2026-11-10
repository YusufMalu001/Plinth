import { config } from '../../../config';
import { ProviderTelemetryService } from '../services/provider-telemetry.service';

describe('OpenRouter generation metadata reconciliation', () => {
  const originalKey = config.openRouterApiKey;
  const originalFetch = global.fetch;
  afterAll(() => { (config as { openRouterApiKey: string }).openRouterApiKey = originalKey; global.fetch = originalFetch; });

  it('records observed provider, versioned model, usage, latency, request ID, and zero cost', async () => {
    (config as { openRouterApiKey: string }).openRouterApiKey = 'test-only-key';
    const update = jest.fn().mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
      id: 'gen-synthetic', request_id: 'req-synthetic', model: 'qwen/qwen3.8-27b-20260814:free',
      provider_name: 'ModelRun', tokens_prompt: 10, tokens_completion: 4, total_cost: 0, latency: 123,
    } }), { status: 200 }));
    await new ProviderTelemetryService({ providerAttempt: { update } } as never)
      .reconcileOpenRouterGeneration('attempt-1', 'gen-synthetic');
    expect(update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: expect.objectContaining({
      generationId: 'gen-synthetic', providerRequestId: 'req-synthetic',
      resolvedModel: 'qwen/qwen3.8-27b-20260814:free', provider: 'ModelRun',
      inputTokens: 10, outputTokens: 4, totalTokens: 14, costUsd: 0, latencyMs: 123,
    }) });
  });
});
