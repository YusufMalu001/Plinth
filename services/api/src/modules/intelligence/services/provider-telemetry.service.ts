import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { RateLimitedError } from '../../../common/errors/AppError';

export const hashProbeInput = (value: string) => createHash('sha256').update(value).digest('hex');

type FinishAttemptInput = {
  status: string; httpStatus?: number | null; resolvedModel?: string | null; provider?: string | null;
  generationId?: string | null; providerRequestId?: string | null;
  inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null;
  costUsd?: number | null;
  errorCategory?: string | null;
};

export function errorCategory(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'TIMEOUT';
  if (error instanceof Error && /persistence failed/i.test(error.message)) return 'PERSISTENCE_ERROR';
  const status = error && typeof error === 'object' && 'httpStatus' in error ? Number(error.httpStatus) : 0;
  const message = error instanceof Error ? error.message : '';
  if (/MCP.*(?:403|forbidden)|(?:403|forbidden).*MCP/i.test(message)) return 'MCP_PERMISSION_DENIED';
  if (status === 401 || status === 403) return 'AUTHENTICATION';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 402) return 'PROVIDER_BUDGET_EXCEEDED';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'PROVIDER_ERROR';
  if (/runtime is unavailable|ENOTFOUND|ECONNREFUSED/i.test(message)) return 'RUNTIME_UNAVAILABLE';
  if (/finish_reason.*length|output.*truncat/i.test(message)) return 'OUTPUT_TRUNCATED';
  if (/timeout|abort|time limit/i.test(message)) return 'TIMEOUT';
  if (/invalid|malformed|JSON/i.test(message)) return 'INVALID_RESPONSE';
  return 'RUNTIME_ERROR';
}

export class ProviderTelemetryService {
  constructor(private readonly db: PrismaClient = prisma) {}

  start(input: {
    runId?: string; requestId?: string; correlationId?: string; profileKey?: string;
    operation: string; requestedModel?: string; retryNumber?: number; inputHash?: string;
    reserveCostUsd?: number;
  }) {
    if (input.reserveCostUsd && input.reserveCostUsd > 0) {
      return this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(709114231)`;
        const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const aggregate = await tx.providerAttempt.aggregate({
          where: { operation: { in: ['ADVISOR_RUN', 'HERMES_RUN'] }, startedAt: { gte: monthStart }, costUsd: { not: null } },
          _sum: { costUsd: true },
        });
        const accounted = Number(aggregate._sum.costUsd ?? 0);
        if (accounted + input.reserveCostUsd! > config.intelligence.monthlyBudgetUsd) {
          throw new RateLimitedError('The monthly AI provider budget cannot cover another run.', {
            accountedUsd: accounted, reservedUsd: input.reserveCostUsd,
            budgetUsd: config.intelligence.monthlyBudgetUsd,
          });
        }
        const { reserveCostUsd: reserved, ...data } = input;
        return tx.providerAttempt.create({ data: {
          ...data, status: 'STARTED', retryNumber: input.retryNumber ?? 0,
          costUsd: new Prisma.Decimal(reserved!.toFixed(8)),
        } });
      });
    }
    const { reserveCostUsd: _unused, ...data } = input;
    return this.db.providerAttempt.create({ data: {
      ...data, status: 'STARTED', retryNumber: input.retryNumber ?? 0,
    } });
  }

  async finishTimed(id: string, startedAt: Date, input: FinishAttemptInput) {
    return this.db.providerAttempt.update({
      where: { id },
      data: { ...input, completedAt: new Date(), latencyMs: Date.now() - startedAt.getTime() },
    });
  }

  async reconcileOpenRouterGeneration(id: string, generationId: string) {
    if (!config.openRouterApiKey || !generationId.startsWith('gen-')) return;
    for (const delayMs of [0, 500, 1500]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`, {
        headers: { Authorization: `Bearer ${config.openRouterApiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
      const data = body?.data;
      if (!data || data.id !== generationId) continue;
      await this.db.providerAttempt.update({ where: { id }, data: {
        generationId,
        providerRequestId: typeof data.request_id === 'string' ? data.request_id : undefined,
        resolvedModel: typeof data.model === 'string' ? data.model : undefined,
        provider: typeof data.provider_name === 'string' ? data.provider_name : undefined,
        inputTokens: typeof data.tokens_prompt === 'number' ? data.tokens_prompt : undefined,
        outputTokens: typeof data.tokens_completion === 'number' ? data.tokens_completion : undefined,
        totalTokens: typeof data.tokens_prompt === 'number' && typeof data.tokens_completion === 'number' ? data.tokens_prompt + data.tokens_completion : undefined,
        costUsd: typeof data.total_cost === 'number' ? data.total_cost : undefined,
        latencyMs: typeof data.latency === 'number' ? data.latency : undefined,
      } });
      return;
    }
  }
}

export const providerTelemetryService = new ProviderTelemetryService();
