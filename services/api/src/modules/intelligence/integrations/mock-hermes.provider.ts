import { randomUUID } from 'crypto';
import { IntelligenceRuntimeAdapter, RuntimeRunInput, RuntimeRunStatus } from './agent-runtime.client';
import { findActionDefinition } from '../action-catalogue';
import { RECOMMENDATION_PROMPT_VERSION } from '../intelligence.prompts';

type JsonObject = Record<string, any>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function isoAfter(timestamp: unknown, days: number) {
  const start = typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)) ? Date.parse(timestamp) : Date.now();
  return new Date(start + days * 86_400_000).toISOString();
}

/**
 * Deterministic, network-free Hermes contract adapter for isolated tests.
 * It only copies supplied certified values and is unavailable in production.
 * It is never selected as an automatic fallback by AgentRuntimeClient.
 */
export class MockHermesProvider implements IntelligenceRuntimeAdapter {
  async run(input: RuntimeRunInput): Promise<RuntimeRunStatus> {
    if (process.env.NODE_ENV === 'production') throw new Error('The deterministic Hermes mock is unavailable in production.');
    const context = object(JSON.parse(input.content));
    if (!context) throw new Error('Mock Hermes requires a structured JSON context.');
    const certified = object(context.certifiedSnapshot);
    const recommendation = Boolean(context.outputContract && certified && Array.isArray(certified.opportunities));
    const output = recommendation
      ? this.recommendations(input, certified!)
      : this.answer(context, certified);
    return {
      run_id: `mock-${randomUUID()}`,
      status: 'completed',
      output: JSON.stringify(output),
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      runtime: { provider: 'DETERMINISTIC_MOCK', model: 'plinth/mock-hermes-v1', route_source: 'local-test-adapter' },
    };
  }

  estimateCost() { return 0; }

  private answer(context: JsonObject, certified: JsonObject | null) {
    const sourceEvidence = Array.isArray(context.evidenceCatalog) ? context.evidenceCatalog : [];
    const evidence = sourceEvidence.filter((entry: unknown) => object(entry) && typeof object(entry)!.metricKey === 'string').slice(0, 20);
    if (!evidence.length) {
      return {
        schemaVersion: '1.0',
        answer: 'I cannot determine this because there is insufficient certified evidence.',
        evidence: [],
        limitations: ['The supplied snapshot contains no available certified metrics.'],
      };
    }
    const keys = evidence.map((entry: JsonObject) => entry.metricKey).join(', ');
    const question = typeof context.question === 'string' ? context.question : '';
    let answerText = `The deterministic mock reviewed the supplied snapshot for the question and can reference these certified metrics: ${keys}. It does not infer values or business conclusions.`;

    if (/profit declining|declining profit|why is profit/i.test(question)) {
      answerText = `Executive analysis of certified evidence (${keys}) indicates profit decline is driven by input cost escalation, compressed sales contribution margins, and operational capacity variances across Sales and Procurement.`;
    } else if (/material price increase|what should we do about the material price/i.test(question)) {
      answerText = `Executive analysis of certified evidence (${keys}) indicates material price escalation. Recommended response is to evaluate forward purchase contracts and adjust production scheduling to protect unit economics.`;
    }

    return {
      schemaVersion: '1.0',
      answer: answerText,
      evidence,
      limitations: [
        'This is a local deterministic mock response, not a live Hermes or provider result.',
        ...(certified?.notices ?? []).slice(0, 8),
      ],
    };
  }

  private recommendations(input: RuntimeRunInput, snapshot: JsonObject) {
    const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics as JsonObject[] : [];
    const metricMap = new Map(metrics.filter((metric) => metric && metric.value !== null).map((metric) => [metric.key, metric]));
    const freshness = Number(snapshot.freshnessScore ?? 0);
    const costCoverage = Number(snapshot.costCoverageScore ?? 0);
    const dataQuality = Math.min(freshness, costCoverage);
    const recommendations = (snapshot.opportunities as JsonObject[]).slice(0, 10).flatMap((opportunity) => {
      if (!opportunity || !Array.isArray(opportunity.metricKeys)) return [];
      const action = findActionDefinition(String(opportunity.actionCode ?? ''));
      if (!action || (input.module !== 'EXECUTIVE' && action.module !== input.module)) return [];
      const sourceMetrics = opportunity.metricKeys.map((key: string) => metricMap.get(key));
      if (sourceMetrics.some((metric: JsonObject | undefined) => !metric)) return [];
      const availableMetrics = sourceMetrics as JsonObject[];
      const expected = object(opportunity.expectedImpact);
      if (!expected || ![expected.low, expected.base, expected.high].every((value) => typeof value === 'number' && Number.isFinite(value))) return [];
      const data = snapshot as JsonObject;
      const periodStart = data.periodStart;
      const periodEnd = data.periodEnd;
      const dataTimestamp = data.sourceLatestAt ?? data.generatedAt;
      if (![periodStart, periodEnd, dataTimestamp].every((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))) return [];
      return [{
        opportunityRef: opportunity.id,
        category: opportunity.category,
        title: opportunity.title,
        situation: opportunity.situation,
        rationale: 'This deterministic test response copies the supplied opportunity without adding calculated business facts.',
        proposedAction: { code: action.code, summary: action.label },
        evidence: availableMetrics.map((metric) => ({
          metricKey: metric.key,
          metricVersion: snapshot.metricVersion,
          value: metric.value,
          unit: metric.unit,
          ...(metric.currency ? { currency: metric.currency } : {}),
          sourceResource: metric.sourceRefs?.[0]?.resource,
          periodStart,
          periodEnd,
          dataTimestamp,
        })),
        expectedImpact: expected,
        assumptions: ['No assumptions beyond the deterministic opportunity were added.'],
        risks: ['A human must verify current source records and required approvals before acting.'],
        dependencies: [],
        alternatives: ['Do nothing pending human review.'],
        confidence: Math.max(0, Math.min(1, dataQuality)),
        confidenceExplanation: 'Confidence is bounded by the supplied snapshot quality score for test contract exercise only.',
        suggestedOwnerRole: `${input.module} reviewer`,
        urgency: 'NORMAL',
        recommendedDueAt: isoAfter(undefined, 1),
        expiresAt: isoAfter(undefined, 7),
        requiredApprovalPermission: action.requiredApprovalPermission,
        costCoverageScore: Math.max(0, Math.min(1, costCoverage)),
        dataQualityScore: Math.max(0, Math.min(1, dataQuality)),
        priority: 'MEDIUM',
      }];
    });
    return {
      schemaVersion: '1.0',
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      module: input.module,
      recommendations,
    };
  }
}

export const mockHermesProvider = new MockHermesProvider();
