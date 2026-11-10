import { BusinessSnapshot, IntelligenceModule } from '@prisma/client';
import { config } from '../../../config';
import { ValidationError } from '../../../common/errors/AppError';
import { findActionDefinition } from '../action-catalogue';
import { RECOMMENDATION_PROMPT_VERSION } from '../intelligence.prompts';
import {
  RuntimeQuestionResponse,
  RuntimeRecommendationEnvelope,
  runtimeQuestionResponseSchema,
  runtimeRecommendationEnvelopeSchema,
} from '../intelligence.contracts';
import { CertifiedSnapshotData, DeterministicOpportunity } from './certified-metrics.service';

function parseJsonObject(output: string) {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new ValidationError('The runtime output was not valid JSON.');
  }
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000001);
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export class RecommendationValidatorService {
  validate(output: string, snapshot: BusinessSnapshot, expectedModule: IntelligenceModule): RuntimeRecommendationEnvelope {
    const parsed = runtimeRecommendationEnvelopeSchema.safeParse(parseJsonObject(output));
    if (!parsed.success) {
      throw new ValidationError('The runtime output did not match the recommendation contract.', parsed.error.flatten());
    }
    const envelope = parsed.data;
    if (envelope.module !== expectedModule) throw new ValidationError('The runtime returned recommendations for an unauthorized module.');
    if (envelope.promptVersion !== RECOMMENDATION_PROMPT_VERSION) throw new ValidationError('The runtime returned an unexpected prompt version.');

    const data = snapshot.data as unknown as CertifiedSnapshotData;
    if (!data || !Array.isArray(data.metrics) || !Array.isArray(data.opportunities)) {
      throw new ValidationError('The certified snapshot is not compatible with the active recommendation contract.');
    }
    const metricMap = new Map(data.metrics.map((metric) => [metric.key, metric]));
    const opportunityMap = new Map(data.opportunities.map((opportunity) => [opportunity.id, opportunity]));
    const costCoverage = Number(snapshot.costCoverageScore);
    const freshness = Number(snapshot.freshnessScore);
    const dataQuality = Math.min(freshness, costCoverage);

    for (const recommendation of envelope.recommendations) {
      const opportunity = opportunityMap.get(recommendation.opportunityRef);
      if (!opportunity) throw new ValidationError(`Recommendation references unknown opportunity '${recommendation.opportunityRef}'.`);
      this.validateAction(expectedModule, recommendation.proposedAction.code, recommendation.requiredApprovalPermission, opportunity);
      this.validateExpectedImpact(recommendation.expectedImpact, opportunity);

      const referencedKeys = new Set(recommendation.evidence.map((evidence) => evidence.metricKey));
      for (const requiredKey of opportunity.metricKeys) {
        if (!referencedKeys.has(requiredKey)) throw new ValidationError(`Recommendation evidence is missing required metric '${requiredKey}'.`);
      }
      for (const evidence of recommendation.evidence) {
        const sourceMetric = metricMap.get(evidence.metricKey);
        if (!sourceMetric || sourceMetric.value === null) throw new ValidationError(`Recommendation references unknown or unavailable metric '${evidence.metricKey}'.`);
        if (evidence.metricVersion !== snapshot.metricVersion) throw new ValidationError(`Metric version mismatch for '${evidence.metricKey}'.`);
        if (!sameNumber(evidence.value, sourceMetric.value)) throw new ValidationError(`Unsupported numeric evidence for '${evidence.metricKey}'.`);
        if (evidence.unit !== sourceMetric.unit || (evidence.currency ?? null) !== (sourceMetric.currency ?? null)) throw new ValidationError(`Metric unit mismatch for '${evidence.metricKey}'.`);
        if (!sourceMetric.sourceRefs.some((source) => source.resource === evidence.sourceResource)) {
          throw new ValidationError(`Evidence source '${evidence.sourceResource}' is not certified for '${evidence.metricKey}'.`);
        }
        if (evidence.periodStart !== data.periodStart || evidence.periodEnd !== data.periodEnd || evidence.dataTimestamp !== (data.sourceLatestAt ?? data.generatedAt)) {
          throw new ValidationError(`Evidence timestamps do not match the immutable snapshot for '${evidence.metricKey}'.`);
        }
      }
      if (!sameNumber(recommendation.costCoverageScore, costCoverage) || !sameNumber(recommendation.dataQualityScore, dataQuality)) {
        throw new ValidationError('Recommendation quality scores do not match the certified snapshot.');
      }
      if (recommendation.costCoverageScore < config.intelligence.minimumCostCoverage && this.isFinancial(opportunity)) {
        throw new ValidationError('Financial recommendation rejected because cost coverage is below policy.');
      }
      if (recommendation.dataQualityScore < config.intelligence.minimumDataQuality) {
        throw new ValidationError('Recommendation rejected because data quality is below policy.');
      }
      if (recommendation.confidence > recommendation.dataQualityScore) {
        throw new ValidationError('Recommendation confidence cannot exceed certified data quality.');
      }
      const dueAt = new Date(recommendation.recommendedDueAt);
      const expiresAt = new Date(recommendation.expiresAt);
      if (dueAt <= new Date() || expiresAt <= dueAt || expiresAt.getTime() > Date.now() + 90 * 86_400_000) {
        throw new ValidationError('Recommendation due date or expiry is outside the permitted window.');
      }
    }
    return envelope;
  }

  validateQuestion(output: string, snapshot: BusinessSnapshot): RuntimeQuestionResponse {
    const value = parseJsonObject(output);
    const data = snapshot.data as unknown as CertifiedSnapshotData;
    const metricMap = new Map(data.metrics.map((metric) => [metric.key, metric]));
    const normalizeEvidence = (entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const reference = { ...(entry as Record<string, unknown>) };
      const metric = typeof reference.metricKey === 'string' ? metricMap.get(reference.metricKey) : undefined;
      if (!metric) return reference;
      // Keep the model's metric key and numeric value for strict validation,
      // but take all source metadata from the immutable snapshot. Free models
      // may omit or mislabel units, currency, dates, and source annotations.
      return {
        metricKey: reference.metricKey,
        ...(reference.value !== undefined ? { value: reference.value } : {}),
        metricVersion: snapshot.metricVersion,
        unit: metric.unit,
        sourceResource: metric.sourceRefs[0]?.resource,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        dataTimestamp: data.sourceLatestAt ?? data.generatedAt,
        ...(metric.currency ? { currency: metric.currency } : {}),
      };
    };
    const candidate = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
    const normalized = candidate
      ? {
        ...candidate,
        schemaVersion: '1.0',
        ...(typeof candidate.limitations === 'string'
          ? { limitations: [candidate.limitations] }
          : candidate.limitations === undefined ? { limitations: [] } : {}),
        ...(Array.isArray(candidate.evidence)
          ? { evidence: candidate.evidence.map(normalizeEvidence) }
          : typeof candidate.evidence === 'object' && candidate.evidence !== null
            ? { evidence: [normalizeEvidence(candidate.evidence)] }
            : {}),
      }
      : value;
    const parsed = runtimeQuestionResponseSchema.safeParse(normalized);
    if (!parsed.success) {
      const diagnostics = parsed.error.issues.slice(0, 8)
        .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
        .join('; ');
      throw new ValidationError(`The runtime answer did not match the business-question contract. ${diagnostics}`);
    }
    if (parsed.data.evidence.length === 0 && (
      !parsed.data.limitations.length ||
      !/insufficient evidence|insufficient certified evidence|cannot determine/i.test(parsed.data.answer)
    )) {
      throw new ValidationError('An answer without certified evidence must explicitly report insufficient evidence and state a limitation.');
    }
    const evidenceTimestamp = data.sourceLatestAt ?? data.generatedAt;
    for (const evidence of parsed.data.evidence) {
      const sourceMetric = metricMap.get(evidence.metricKey);
      if (!sourceMetric || sourceMetric.value === null) throw new ValidationError(`Answer references unknown or unavailable metric '${evidence.metricKey}'.`);
      if (evidence.metricVersion !== snapshot.metricVersion || !sameNumber(evidence.value, sourceMetric.value)) {
        throw new ValidationError(`Answer contains unsupported evidence for '${evidence.metricKey}'.`);
      }
      if (evidence.unit !== sourceMetric.unit || (evidence.currency ?? null) !== (sourceMetric.currency ?? null)) {
        throw new ValidationError(`Answer evidence unit mismatch for '${evidence.metricKey}'.`);
      }
      if (!sourceMetric.sourceRefs.some((source) => source.resource === evidence.sourceResource)) {
        throw new ValidationError(`Answer evidence source is not certified for '${evidence.metricKey}'.`);
      }
      if (evidence.periodStart !== data.periodStart || evidence.periodEnd !== data.periodEnd || evidence.dataTimestamp !== evidenceTimestamp) {
        throw new ValidationError(`Answer evidence timestamps do not match '${evidence.metricKey}'.`);
      }
    }
    if (parsed.data.dailyBriefing) {
      const citedMetricKeys = new Set(parsed.data.evidence.map((item) => item.metricKey));
      const references = [
        ...parsed.data.dailyBriefing.keyUpdates.flatMap((item) => item.evidenceMetricKeys),
        ...parsed.data.dailyBriefing.risks.flatMap((item) => item.evidenceMetricKeys),
        ...parsed.data.dailyBriefing.recommendedFocus.flatMap((item) => item.evidenceMetricKeys),
      ];
      if (references.some((key) => !citedMetricKeys.has(key))) {
        throw new ValidationError('The daily briefing references a metric that is missing from its certified evidence.');
      }
      if (parsed.data.dailyBriefing.overallStatus !== 'INSUFFICIENT_EVIDENCE' && parsed.data.evidence.length === 0) {
        throw new ValidationError('A daily briefing without certified metrics must use INSUFFICIENT_EVIDENCE status.');
      }
    }
    return parsed.data;
  }

  private validateAction(module: IntelligenceModule, actionCode: string, approval: string, opportunity: DeterministicOpportunity) {
    const action = findActionDefinition(actionCode);
    if (!action || (module !== 'EXECUTIVE' && action.module !== module)) throw new ValidationError(`Action '${actionCode}' is outside the profile catalogue.`);
    if (opportunity.actionCode !== actionCode) throw new ValidationError(`Action '${actionCode}' does not match its deterministic opportunity.`);
    if (action.requiredApprovalPermission !== approval) throw new ValidationError(`Action '${actionCode}' has an invalid approval requirement.`);
  }

  private validateExpectedImpact(actual: RuntimeRecommendationEnvelope['recommendations'][number]['expectedImpact'], opportunity: DeterministicOpportunity) {
    const expected = opportunity.expectedImpact;
    if (
      actual.metricKey !== expected.metricKey || actual.unit !== expected.unit || actual.currency !== expected.currency ||
      actual.horizonDays !== expected.horizonDays || !sameNumber(actual.low, expected.low) ||
      !sameNumber(actual.base, expected.base) || !sameNumber(actual.high, expected.high) ||
      !sameStringSet(actual.sourceMetricKeys, expected.sourceMetricKeys)
    ) {
      throw new ValidationError(`Expected impact for '${opportunity.id}' is not supported by the deterministic calculation.`);
    }
  }

  private isFinancial(opportunity: DeterministicOpportunity) {
    return Boolean(opportunity.expectedImpact.currency || opportunity.expectedImpact.unit === 'INR');
  }
}

export const recommendationValidatorService = new RecommendationValidatorService();
