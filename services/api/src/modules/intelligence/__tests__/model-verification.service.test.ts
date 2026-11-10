import { config } from '../../../config';
import { ModelVerificationService } from '../services/model-verification.service';

const model = 'qwen/qwen3.8-27b:free';
const attempt = { id: 'attempt-1', startedAt: new Date() };

describe('OpenRouter model verification', () => {
  const originalKey = config.openRouterApiKey;
  const originalFetch = global.fetch;
  const telemetry = { start: jest.fn().mockResolvedValue(attempt), finishTimed: jest.fn().mockResolvedValue({}), reconcileOpenRouterGeneration: jest.fn().mockResolvedValue(undefined) };
  const service = new ModelVerificationService({} as never, telemetry as never);

  beforeEach(() => {
    (config as { openRouterApiKey: string }).openRouterApiKey = 'test-only-key';
    telemetry.start.mockClear();
    telemetry.finishTimed.mockClear();
  });
  afterAll(() => { (config as { openRouterApiKey: string }).openRouterApiKey = originalKey; global.fetch = originalFetch; });

  it.each([
    [401, 'AUTHENTICATION', 'UNAVAILABLE'], [404, 'MODEL_UNAVAILABLE', 'UNAVAILABLE'],
    [429, 'RATE_LIMIT', 'NOT_VERIFIED'], [503, 'PROVIDER_ERROR', 'NOT_VERIFIED'],
  ])('records HTTP %i as %s without claiming availability', async (status, category, expected) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'sensitive provider message' }), { status }));
    const result = await service.check(model, 'request-1');
    expect(result.status).toBe(expected);
    expect(result.results[0]).toMatchObject({ operation: 'AUTH', reason: category, httpStatus: status });
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ httpStatus: status, errorCategory: category }));
    expect(JSON.stringify(telemetry.finishTimed.mock.calls)).not.toContain('sensitive provider message');
  });

  it('records timeout without a fabricated HTTP status', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const result = await service.check(model, 'request-2');
    expect(result.status).toBe('NOT_VERIFIED');
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ status: 'UNAVAILABLE' }));
    expect(telemetry.finishTimed.mock.calls[0][2].httpStatus).toBeUndefined();
  });

  it('records an invalid successful catalog response as unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(new Response('{"data":{}}', { status: 200 }))
      .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    const result = await service.check(model, 'request-3');
    expect(result.results[1].reason).toBe('MODEL_NOT_IN_CATALOG');
    expect(result.results).toHaveLength(6);
  });

  it('verifies catalog, endpoint, basic generation, JSON, and tool call independently', async () => {
    const replies = [
      { data: {} }, { data: [{ id: model }] }, { data: { endpoints: [{}] } },
      { id: 'gen-basic', model, choices: [{ message: { content: 'ready' } }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0 } },
      { id: 'gen-json', model, choices: [{ message: { content: '{"ready":true,"warehouse_id":"WH-TEST"}' } }] },
      { id: 'gen-tool', model, choices: [{ message: { tool_calls: [{ function: { name: 'report_test_warehouse', arguments: '{"warehouse_id":"WH-TEST"}' } }] } }] },
    ];
    global.fetch = jest.fn().mockImplementation(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    const result = await service.check(model, 'request-4');
    expect(result.status).toBe('AVAILABLE');
    expect(result.results).toHaveLength(6);
    expect(telemetry.finishTimed).toHaveBeenCalledTimes(6);
    expect(telemetry.finishTimed).toHaveBeenCalledWith(attempt.id, attempt.startedAt, expect.objectContaining({ costUsd: 0, totalTokens: 4, resolvedModel: model }));
    expect(telemetry.reconcileOpenRouterGeneration).toHaveBeenCalledWith(attempt.id, 'gen-basic');
  });

  it('rejects a silently substituted response model', async () => {
    const replies = [
      { data: {} }, { data: [{ id: model }] }, { data: { endpoints: [{}] } },
      { model: 'another/model:free', choices: [{ message: { content: 'ready' } }] },
      { model: 'another/model:free', choices: [{ message: { content: '{"ready":true,"warehouse_id":"WH-TEST"}' } }] },
      { model: 'another/model:free', choices: [{ message: { tool_calls: [{ function: { name: 'report_test_warehouse', arguments: '{"warehouse_id":"WH-TEST"}' } }] } }] },
    ];
    global.fetch = jest.fn().mockImplementation(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    const result = await service.check(model, 'request-mismatch');
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.results.slice(3).every((item) => item.reason === 'MODEL_MISMATCH')).toBe(true);
  });

  it('does not accept a tool call with invalid synthetic arguments', async () => {
    const replies = [
      { data: {} }, { data: [{ id: model }] }, { data: { endpoints: [{}] } },
      { model, choices: [{ message: { content: 'ready' } }] },
      { model, choices: [{ message: { content: '{"ready":true,"warehouse_id":"WH-TEST"}' } }] },
      { model, choices: [{ message: { tool_calls: [{ function: { name: 'report_test_warehouse', arguments: '{"warehouse_id":"WH-REAL"}' } }] } }] },
    ];
    global.fetch = jest.fn().mockImplementation(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    const result = await service.check(model, 'request-invalid-tool');
    expect(result.results[5]).toMatchObject({ status: 'UNAVAILABLE', reason: 'TOOL_CALL_UNSUPPORTED_OR_INVALID' });
  });
});
