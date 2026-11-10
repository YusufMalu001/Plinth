import { PrismaClient } from '@prisma/client';
import { config } from '../../../config';
import { prisma } from '../../../database';
import { hashProbeInput, errorCategory, providerTelemetryService, ProviderTelemetryService } from './provider-telemetry.service';

export const modelCandidates = [...new Set([config.intelligence.moduleModel, config.intelligence.executiveModel, config.intelligence.fallbackModel].filter(Boolean))] as [string, ...string[]];
export type ModelCandidate = typeof modelCandidates[number];

const probeText = 'Reply with the single word ready.';
const probeSchema = { type: 'object', properties: { ready: { type: 'boolean' }, warehouse_id: { type: 'string', enum: ['WH-TEST'] } }, required: ['ready', 'warehouse_id'], additionalProperties: false };
const toolSchema = { type: 'object', properties: { warehouse_id: { type: 'string', enum: ['WH-TEST'] } }, required: ['warehouse_id'], additionalProperties: false };
const responseCategory = (status: number) => status === 401 || status === 403 ? 'AUTHENTICATION' : status === 402 ? 'PROVIDER_BUDGET_EXCEEDED' : status === 404 ? 'MODEL_UNAVAILABLE' : status === 429 ? 'RATE_LIMIT' : status >= 500 ? 'PROVIDER_ERROR' : `HTTP_${status}`;

export class ModelVerificationService {
  constructor(private readonly db: PrismaClient = prisma, private readonly telemetry: ProviderTelemetryService = providerTelemetryService) {}

  async check(model: ModelCandidate, requestId: string) {
    const results: Array<{ operation: string; status: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_VERIFIED'; reason?: string; httpStatus?: number }> = [];
    const run = async (operation: string, path: string, body?: object) => {
      const attempt = await this.telemetry.start({
        requestId, correlationId: requestId, operation, requestedModel: model,
        profileKey: 'phase0-model-candidate',
        inputHash: body ? hashProbeInput(JSON.stringify(body)) : undefined,
      });
      try {
        if (!config.openRouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured');
        const response = await fetch(`https://openrouter.ai/api/v1/${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${config.openRouterApiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'X-OpenRouter-Metadata': 'enabled' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(Math.min(config.openRouterTimeoutMs, 30000)),
        });
        const data = await response.json().catch(() => null) as Record<string, any> | null;
        const inputTokens = data?.usage?.prompt_tokens ?? null;
        const outputTokens = data?.usage?.completion_tokens ?? null;
        const totalTokens = data?.usage?.total_tokens ?? null;
        const costUsd = typeof data?.usage?.cost === 'number' ? data.usage.cost : null;
        let valid = response.ok && data !== null;
        if (operation === 'AUTH') valid = valid && typeof data?.data === 'object' && data.data !== null && !Array.isArray(data.data);
        if (operation === 'CATALOG') valid = valid && Array.isArray(data?.data) && data.data.some((item: { id?: string }) => item.id === model);
        if (operation === 'ENDPOINT') valid = valid && Array.isArray(data?.data?.endpoints) && data.data.endpoints.length > 0;
        if (operation === 'GENERATION') valid = valid && typeof data?.choices?.[0]?.message?.content === 'string';
        if (operation === 'STRUCTURED') {
          try {
            const output = JSON.parse(data?.choices?.[0]?.message?.content ?? '');
            valid = valid && output?.ready === true && output?.warehouse_id === 'WH-TEST' && Object.keys(output).length === 2;
          } catch { valid = false; }
        }
        if (operation === 'TOOL') {
          try {
            const call = data?.choices?.[0]?.message?.tool_calls?.[0];
            const args = JSON.parse(call?.function?.arguments ?? '');
            valid = valid && call?.function?.name === 'report_test_warehouse' && args?.warehouse_id === 'WH-TEST' && Object.keys(args).length === 1;
          } catch { valid = false; }
        }
        const modelMismatch = body && response.ok && typeof data?.model === 'string' && data.model !== model;
        const modelNotReported = body && response.ok && typeof data?.model !== 'string';
        if (modelMismatch || modelNotReported) valid = false;
        const status = valid ? 'AVAILABLE' : 'UNAVAILABLE';
        const reason = valid ? undefined : !response.ok ? responseCategory(response.status)
          : modelMismatch ? 'MODEL_MISMATCH'
          : modelNotReported ? 'MODEL_NOT_REPORTED'
          : operation === 'CATALOG' && Array.isArray(data?.data) ? 'MODEL_NOT_IN_CATALOG'
          : operation === 'ENDPOINT' && Array.isArray(data?.data?.endpoints) ? 'NO_ENDPOINTS'
          : operation === 'STRUCTURED' ? 'STRUCTURED_OUTPUT_UNSUPPORTED_OR_INVALID'
          : operation === 'TOOL' ? 'TOOL_CALL_UNSUPPORTED_OR_INVALID'
          : 'INVALID_RESPONSE';
        await this.telemetry.finishTimed(attempt.id, attempt.startedAt, {
          status, httpStatus: response.status, provider: typeof data?.openrouter_metadata?.provider_name === 'string' ? data.openrouter_metadata.provider_name : null, resolvedModel: typeof data?.model === 'string' ? data.model : null,
          generationId: typeof data?.id === 'string' && body ? data.id : null,
          providerRequestId: response.headers.get('x-request-id'),
          inputTokens, outputTokens, totalTokens, costUsd,
          errorCategory: reason,
        });
        if (typeof data?.id === 'string' && data.id.startsWith('gen-')) {
          await this.telemetry.reconcileOpenRouterGeneration(attempt.id, data.id).catch(() => undefined);
        }
        return { operation, status, reason, httpStatus: response.status } as const;
      } catch (error) {
        const reason = config.openRouterApiKey ? errorCategory(error) : 'AUTHENTICATION_NOT_CONFIGURED';
        await this.telemetry.finishTimed(attempt.id, attempt.startedAt, { status: 'UNAVAILABLE', errorCategory: reason });
        return { operation, status: 'UNAVAILABLE' as const, reason };
      }
    };

    results.push(await run('AUTH', 'key'));
    results.push(await run('CATALOG', 'models'));
    const [author, slug] = model.split('/');
    results.push(await run('ENDPOINT', `models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`));
    const base = { model, temperature: 0, max_tokens: 64, stream: false, provider: { sort: 'price', require_parameters: true, ...(config.intelligence.allowFreeProviderDataUse && model.endsWith(':free') ? {} : { data_collection: 'deny' }) }, messages: [{ role: 'user', content: probeText }] };
    results.push(await run('GENERATION', 'chat/completions', base));
    results.push(await run('STRUCTURED', 'chat/completions', {
      ...base, messages: [{ role: 'user', content: 'Synthetic test only. Return exactly {"ready":true,"warehouse_id":"WH-TEST"}.' }],
      response_format: { type: 'json_schema', json_schema: { name: 'readiness', strict: true, schema: probeSchema } },
    }));
    results.push(await run('TOOL', 'chat/completions', {
      ...base, messages: [{ role: 'user', content: 'Synthetic test only. Call report_test_warehouse with warehouse_id WH-TEST.' }],
      tools: [{ type: 'function', function: { name: 'report_test_warehouse', description: 'Report the synthetic warehouse identifier only.', parameters: toolSchema } }],
      tool_choice: { type: 'function', function: { name: 'report_test_warehouse' } },
    }));
    const basicsAvailable = results.slice(0, 3).every((item) => item.status === 'AVAILABLE');
    const generationAvailable = results.slice(3).some((item) => item.status === 'AVAILABLE');
    const hardFailure = results.some((item) => item.status === 'UNAVAILABLE' && !['RATE_LIMIT', 'TIMEOUT', 'PROVIDER_ERROR'].includes(item.reason ?? ''));
    return { model, status: hardFailure ? 'UNAVAILABLE' : basicsAvailable && generationAvailable ? 'AVAILABLE' : 'NOT_VERIFIED', results };
  }

  async latest() {
    const checks = await this.db.providerAttempt.findMany({
      where: { operation: { in: ['AUTH', 'CATALOG', 'ENDPOINT', 'GENERATION', 'STRUCTURED', 'TOOL'] }, requestedModel: { in: [...modelCandidates] } },
      orderBy: { startedAt: 'desc' }, take: 100,
      select: { requestedModel: true, requestId: true, operation: true, status: true, errorCategory: true, completedAt: true, httpStatus: true },
    });
    return modelCandidates.map((model) => {
      const forModel = checks.filter((item) => item.requestedModel === model && item.completedAt && Date.now() - item.completedAt.getTime() < 24 * 3600_000);
      const steps = ['AUTH', 'CATALOG', 'ENDPOINT', 'GENERATION', 'STRUCTURED', 'TOOL'].map((operation) => forModel.find((item) => item.operation === operation));
      const transient = (step: typeof steps[number]) => ['RATE_LIMIT', 'TIMEOUT', 'PROVIDER_ERROR'].includes(step?.errorCategory ?? '');
      const capability = (operation: string) => {
        const attempts = forModel.filter((item) => item.operation === operation);
        if (attempts.some((item) => item.status === 'AVAILABLE')) return 'AVAILABLE';
        const latest = attempts[0];
        return latest?.status === 'UNAVAILABLE' && !transient(latest) ? 'UNAVAILABLE' : 'NOT_VERIFIED';
      };
      const basics = steps.slice(0, 3);
      const generationStatus = ['GENERATION', 'STRUCTURED', 'TOOL'].map(capability);
      const status = basics.some((step) => step?.status === 'UNAVAILABLE' && !transient(step)) ? 'UNAVAILABLE'
        : basics.every((step) => step?.status === 'AVAILABLE') && generationStatus.includes('AVAILABLE') ? 'AVAILABLE'
        : generationStatus.every((item) => item === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'NOT_VERIFIED';
      return { model, status, capabilities: {
        structured: capability('STRUCTURED'),
        toolCalling: capability('TOOL'),
      }, steps };
    });
  }
}

export const modelVerificationService = new ModelVerificationService();
