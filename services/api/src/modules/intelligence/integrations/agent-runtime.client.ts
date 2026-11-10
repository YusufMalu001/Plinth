import { IntelligenceModule, PrismaClient } from '@prisma/client';
import { config } from '../../../config';
import { prisma as defaultPrisma } from '../../../database';
import { ExternalServiceError, RateLimitedError } from '../../../common/errors/AppError';
import { profileForModule } from '../intelligence.profiles';
import { intelligenceControlsService, IntelligenceControlsService } from '../services/intelligence-controls.service';
import { errorCategory, providerTelemetryService, ProviderTelemetryService } from '../services/provider-telemetry.service';

interface RuntimeCreateResponse {
  run_id: string;
  status: string;
}

export interface RuntimeRunStatus {
  run_id: string;
  status: 'started' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'stopping';
  requestedModel?: string;
  profileKey?: string;
  output?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
  runtime?: {
    provider?: string;
    model?: string;
    route_source?: string;
  };
  openrouter_generation_id?: string;
  provider_request_id?: string;
  provider_http_status?: number;
}

export interface RuntimeRunInput {
  module: IntelligenceModule;
  instructions: string;
  content: string;
  idempotencyKey: string;
  sessionId?: string;
  runId?: string;
  requestId?: string;
  correlationId?: string;
  retryNumber?: number;
}

/** Adapter contract shared by the live runtime and isolated deterministic tests. */
export interface IntelligenceRuntimeAdapter {
  run(input: RuntimeRunInput): Promise<RuntimeRunStatus>;
  estimateCost(usage?: RuntimeRunStatus['usage']): number;
}

export class RuntimeCallError extends ExternalServiceError {
  constructor(message: string, public readonly httpStatus?: number, public readonly providerMessage?: string) { super(message); }
}

export function runtimeHttpStatus(result: Pick<RuntimeRunStatus, 'provider_http_status' | 'error'>) {
  if (Number.isInteger(result.provider_http_status)) return result.provider_http_status;
  const match = result.error?.match(/(?:HTTP|Error code:)\s*(\d{3})\b/i);
  return match ? Number(match[1]) : undefined;
}

const providerErrorSummary = (error?: string) => error?.trim().slice(0, 1600) || undefined;

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

function firstOfMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class AgentRuntimeClient implements IntelligenceRuntimeAdapter {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly controls: IntelligenceControlsService = intelligenceControlsService,
    private readonly telemetry: ProviderTelemetryService = providerTelemetryService,
  ) {}

  async assertBudgetAvailable(currentRunId?: string) {
    const aggregate = await this.db.intelligenceRun.aggregate({
      where: { createdAt: { gte: firstOfMonth() }, costUsd: { not: null } },
      _sum: { costUsd: true },
    });
    const spent = Number(aggregate._sum.costUsd ?? 0);
    if (spent >= config.intelligence.monthlyBudgetUsd) {
      throw new RateLimitedError('The monthly intelligence provider budget has been exhausted.', {
        spentUsd: spent,
        budgetUsd: config.intelligence.monthlyBudgetUsd,
      });
    }
    const active = await this.db.intelligenceRun.count({
      where: {
        status: 'RUNNING',
        startedAt: { gte: new Date(Date.now() - config.intelligence.runtimeTimeoutMs) },
        ...(currentRunId ? { id: { not: currentRunId } } : {}),
      },
    });
    if (active >= config.intelligence.maxConcurrentRuns) {
      throw new RateLimitedError('The intelligence runtime concurrency limit has been reached.');
    }
  }

  async run(input: RuntimeRunInput) {
    const profile = profileForModule(input.module);
    const model = input.module === 'EXECUTIVE' ? config.intelligence.executiveModel : config.intelligence.moduleModel;
    if (config.intelligence.freeOnly && (!model.endsWith(':free') || (config.intelligence.fallbackModel && !config.intelligence.fallbackModel.endsWith(':free')))) {
      throw new RateLimitedError('The AI route is restricted to free models.');
    }
    if (config.intelligence.freeOnly && !config.intelligence.allowFreeProviderDataUse) {
      throw new ExternalServiceError('Free model processing of business data has not been enabled.');
    }
    const fallbackPaid = Boolean(config.intelligence.fallbackModel && !config.intelligence.fallbackModel.endsWith(':free'));
    const paidRoute = !model.endsWith(':free') || fallbackPaid;
    const inputPrice = Math.max(config.intelligence.inputCostPerMillionUsd, config.intelligence.fallbackInputCostPerMillionUsd);
    const outputPrice = Math.max(config.intelligence.outputCostPerMillionUsd, config.intelligence.fallbackOutputCostPerMillionUsd);
    if (paidRoute && (inputPrice <= 0 || outputPrice <= 0 || (fallbackPaid && (config.intelligence.fallbackInputCostPerMillionUsd <= 0 || config.intelligence.fallbackOutputCostPerMillionUsd <= 0)))) {
      throw new RateLimitedError('AI provider prices must be configured before using a paid model.');
    }
    const requestCount = config.intelligence.maxToolCalls + 1;
    const estimatedInputTokens = Math.ceil((input.instructions.length + input.content.length) / 2) * requestCount;
    const estimatedOutputTokens = config.intelligence.maxOutputTokens * requestCount;
    const reserveCostUsd = paidRoute ? 1.5 * (
      estimatedInputTokens * inputPrice +
      estimatedOutputTokens * outputPrice
    ) / 1_000_000 : 0;
    const attempt = await this.telemetry.start({
      runId: input.runId, requestId: input.requestId, correlationId: input.correlationId,
      profileKey: profile?.key, operation: 'ADVISOR_RUN', requestedModel: model,
      retryNumber: input.retryNumber,
      reserveCostUsd,
    });
    let result: Awaited<ReturnType<AgentRuntimeClient['execute']>>;
    try {
      result = await this.execute(input);
    } catch (error) {
      await this.telemetry.finishTimed(attempt.id, attempt.startedAt, {
        status: 'FAILED',
        costUsd: null,
        httpStatus: error instanceof RuntimeCallError ? error.httpStatus : undefined,
        errorCategory: error instanceof RuntimeCallError && error.httpStatus
          ? `RUNTIME_HTTP_${error.httpStatus}` : errorCategory(error),
      }).catch(() => { throw new ExternalServiceError('Provider attempt persistence failed after a runtime error.'); });
      throw error;
    }
    const providerHttpStatus = runtimeHttpStatus(result);
    const failed = result.status !== 'completed';
    await this.telemetry.finishTimed(attempt.id, attempt.startedAt, {
        status: failed ? 'FAILED' : 'SUCCEEDED',
        resolvedModel: result.runtime?.model,
        provider: result.runtime?.provider,
        generationId: result.openrouter_generation_id,
        providerRequestId: result.provider_request_id,
        httpStatus: providerHttpStatus,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalTokens: result.usage?.total_tokens,
        costUsd: failed ? null : Math.max(reserveCostUsd, this.estimateCost(result.usage)),
        errorCategory: failed
          ? errorCategory(new RuntimeCallError(providerErrorSummary(result.error) ?? 'Advisor runtime failed.', providerHttpStatus))
          : null,
    }).catch(() => { throw new ExternalServiceError('Provider attempt persistence failed after a runtime response.'); });
    if (result.openrouter_generation_id) {
      await this.telemetry.reconcileOpenRouterGeneration(attempt.id, result.openrouter_generation_id).catch(() => undefined);
    }
    return { ...result, provider_http_status: providerHttpStatus };
  }

  private async execute(input: {
    module: IntelligenceModule; instructions: string; content: string; idempotencyKey: string; sessionId?: string; runId?: string;
  }) {
    const controls = await this.controls.effective();
    if (!controls.enabled) throw new ExternalServiceError('The intelligence runtime is disabled.');
    if (!controls.providerEnabled) throw new ExternalServiceError('The intelligence model provider kill switch is active.');
    await this.assertBudgetAvailable(input.runId);
    const profile = profileForModule(input.module);
    if (!profile) throw new ExternalServiceError(`No runtime profile is configured for module '${input.module}'.`);
    if (controls.pausedProfiles.includes(profile.key)) throw new ExternalServiceError(`The runtime profile '${profile.key}' is paused.`);
    if (!profile.runtimeKey) throw new ExternalServiceError(`The runtime credential for profile '${profile.key}' is not configured.`);
    const model = input.module === 'EXECUTIVE' ? config.intelligence.executiveModel : config.intelligence.moduleModel;
    const baseUrl = profile.runtimeUrl || config.intelligence.runtimeUrl;
    const path = profile.runtimeUrl ? '/v1/runs' : `/p/${encodeURIComponent(profile.key)}/v1/runs`;
    const created = await this.request<RuntimeCreateResponse>(baseUrl, path, profile.runtimeKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        input: input.content,
        instructions: input.instructions,
        session_id: input.sessionId,
        model,
        provider: config.intelligence.provider,
      }),
    });
    if (!created.run_id) throw new ExternalServiceError('The intelligence runtime returned no run identifier.');
    const deadline = Date.now() + config.intelligence.runtimeTimeoutMs;
    while (Date.now() < deadline) {
      const status = await this.request<RuntimeRunStatus>(baseUrl, `${path}/${encodeURIComponent(created.run_id)}`, profile.runtimeKey, { method: 'GET' });
      if (terminalStatuses.has(status.status)) return { ...status, requestedModel: model, profileKey: profile.key };
      await new Promise((resolve) => setTimeout(resolve, config.intelligence.runtimePollMs));
    }
    await this.request(baseUrl, `${path}/${encodeURIComponent(created.run_id)}/stop`, profile.runtimeKey, { method: 'POST' }).catch(() => undefined);
    throw new ExternalServiceError('The intelligence runtime exceeded its configured time limit.');
  }

  estimateCost(usage?: RuntimeRunStatus['usage']) {
    if (!usage) return 0;
    const fullInputTokens = Math.max(0, Number(usage.input_tokens ?? 0) - Number(usage.cache_read_tokens ?? 0));
    const cachedInputTokens = Math.max(0, Number(usage.cache_read_tokens ?? 0));
    const outputTokens = Math.max(0, Number(usage.output_tokens ?? 0));
    return (
      (fullInputTokens * Math.max(config.intelligence.inputCostPerMillionUsd, config.intelligence.fallbackInputCostPerMillionUsd)) +
      (cachedInputTokens * Math.max(config.intelligence.inputCostPerMillionUsd, config.intelligence.fallbackInputCostPerMillionUsd) * 0.25) +
      (outputTokens * Math.max(config.intelligence.outputCostPerMillionUsd, config.intelligence.fallbackOutputCostPerMillionUsd))
    ) / 1_000_000;
  }

  async health(module: IntelligenceModule = 'EXECUTIVE') {
    const profile = profileForModule(module);
    if (!profile?.runtimeKey) return { status: 'not_configured' as const };
    const baseUrl = profile.runtimeUrl || config.intelligence.runtimeUrl;
    const path = profile.runtimeUrl ? '/health/detailed' : `/p/${encodeURIComponent(profile.key)}/health/detailed`;
    return this.request<Record<string, unknown>>(baseUrl, path, profile.runtimeKey, { method: 'GET' });
  }

  private async request<T = unknown>(baseUrl: string, path: string, apiKey: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(config.intelligence.runtimeTimeoutMs, 30_000));
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(init.headers ?? {}) },
      });
      const body = await response.json().catch(() => null) as T | { error?: string; message?: string } | null;
      if (!response.ok) {
        const detail = body && typeof body === 'object'
          ? ('message' in body && typeof body.message === 'string' ? body.message
            : 'error' in body && typeof body.error === 'string' ? body.error : undefined)
          : undefined;
        const message = response.status === 429
          ? 'The intelligence runtime is busy.'
          : `The intelligence runtime returned HTTP ${response.status}.${detail ? ` ${detail}` : ''}`;
        throw new RuntimeCallError(message, response.status, providerErrorSummary(detail));
      }
      if (body === null) throw new ExternalServiceError('The intelligence runtime returned an invalid response.');
      return body as T;
    } catch (error) {
      if (error instanceof ExternalServiceError || error instanceof RateLimitedError) throw error;
      const message = error && typeof error === 'object' && 'name' in error && (error.name === 'AbortError' || error.name === 'TimeoutError')
        ? 'The intelligence runtime did not respond before the request timeout.'
        : 'The intelligence runtime is unavailable.';
      throw new ExternalServiceError(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const agentRuntimeClient = new AgentRuntimeClient();
