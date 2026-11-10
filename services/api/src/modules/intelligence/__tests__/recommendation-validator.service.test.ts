import { BusinessSnapshot } from '@prisma/client';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';
import { CertifiedSnapshotData } from '../services/certified-metrics.service';

const periodStart = '2026-08-25T00:00:00.000Z';
const periodEnd = '2026-09-24T00:00:00.000Z';
const dataTimestamp = '2026-09-24T01:00:00.000Z';

function fixture() {
  const data: CertifiedSnapshotData = {
    module: 'INVENTORY',
    metricVersion: '2026-09-25.1',
    periodStart,
    periodEnd,
    generatedAt: '2026-09-24T02:00:00.000Z',
    sourceLatestAt: dataTimestamp,
    reportingCurrency: 'INR',
    notices: [],
    metrics: [
      { key: 'inventory.replenishment_risk_count', value: 2, unit: 'COUNT', provenance: 'CALCULATED', freshnessStatus: 'FRESH', dataQualityScore: 1, sourceRefs: [{ resource: 'ReplenishmentPolicy', filter: 'below reorder point' }] },
      { key: 'inventory.replenishment_exposure', value: 10000, unit: 'INR', currency: 'INR', provenance: 'ESTIMATED', freshnessStatus: 'FRESH', dataQualityScore: 1, sourceRefs: [{ resource: 'ReplenishmentPolicy', filter: 'required quantity * cost' }] },
    ],
    opportunities: [{
      id: 'inventory-replenishment:policy-1',
      category: 'STOCKOUT_RISK',
      actionCode: 'inventory.replenishment_review',
      title: 'Review replenishment',
      situation: 'Available inventory is below its certified reorder point.',
      metricKeys: ['inventory.replenishment_risk_count', 'inventory.replenishment_exposure'],
      expectedImpact: { metricKey: 'inventory.stockout_exposure_avoided', unit: 'INR', currency: 'INR', horizonDays: 30, low: 2500, base: 5000, high: 10000, sourceMetricKeys: ['inventory.replenishment_exposure'] },
      targetResource: 'ReplenishmentPolicy',
      targetResourceId: 'policy-1',
    }],
  };
  const snapshot = {
    id: 'snapshot-1', module: 'INVENTORY', metricVersion: data.metricVersion, data,
    freshnessScore: 1, costCoverageScore: 1,
  } as unknown as BusinessSnapshot;
  const evidence = data.metrics.map((metric) => ({
    metricKey: metric.key, metricVersion: data.metricVersion, value: metric.value, unit: metric.unit,
    ...(metric.currency ? { currency: metric.currency } : {}), sourceResource: metric.sourceRefs[0].resource,
    periodStart, periodEnd, dataTimestamp,
  }));
  const output = {
    schemaVersion: '1.0', promptVersion: 'profit-control-v1.0', module: 'INVENTORY',
    recommendations: [{
      opportunityRef: data.opportunities[0].id, category: 'STOCKOUT_RISK', title: 'Review replenishment before stock availability is constrained',
      situation: data.opportunities[0].situation, rationale: 'The certified reorder policy and exposure indicate a review is warranted.',
      proposedAction: { code: 'inventory.replenishment_review', summary: 'Review the deterministic replenishment proposal with an authorized manager.' },
      evidence, expectedImpact: { ...data.opportunities[0].expectedImpact, sourceMetricKeys: [...data.opportunities[0].expectedImpact.sourceMetricKeys] },
      assumptions: [], risks: ['Demand and receipt timing may change.'], dependencies: [], alternatives: [],
      confidence: 0.9, confidenceExplanation: 'The evidence is current and complete for the scoped calculation.',
      suggestedOwnerRole: 'Inventory manager', urgency: 'HIGH',
      recommendedDueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      requiredApprovalPermission: 'accept:Recommendation', costCoverageScore: 1, dataQualityScore: 1, priority: 'HIGH',
    }],
  };
  return { snapshot, output };
}

describe('RecommendationValidatorService', () => {
  const service = new RecommendationValidatorService();

  it('accepts a response that exactly matches the deterministic opportunity and certified evidence', () => {
    const { snapshot, output } = fixture();
    expect(service.validate(JSON.stringify(output), snapshot, 'INVENTORY').recommendations).toHaveLength(1);
  });

  it('rejects a model-invented impact value', () => {
    const { snapshot, output } = fixture();
    output.recommendations[0].expectedImpact.base = 7500;
    expect(() => service.validate(JSON.stringify(output), snapshot, 'INVENTORY')).toThrow(/not supported by the deterministic calculation/i);
  });

  it('rejects a hallucinated evidence value', () => {
    const { snapshot, output } = fixture();
    output.recommendations[0].evidence[0].value = 99;
    expect(() => service.validate(JSON.stringify(output), snapshot, 'INVENTORY')).toThrow(/unsupported numeric evidence/i);
  });

  it('normalizes harmless question-response envelope variations and still validates certified evidence', () => {
    const { snapshot } = fixture();
    const metric = (snapshot.data as unknown as CertifiedSnapshotData).metrics[0];
    const response = {
      schemaVersion: 'draft',
      answer: 'Two replenishment policies are below their reorder point.',
      evidence: {
        metricKey: metric.key,
        value: metric.value,
        unit: 'model-invented-unit',
        currency: 'INR',
        metricVersion: 'model-invented-version',
        sourceResource: 'model-invented-resource',
        periodStart: '2020-01-01T00:00:00.000Z',
        source: 'Free model evidence summary',
        sourceRefs: [{ resource: 'UntrustedModelSource' }],
      },
      limitations: 'The snapshot is limited to certified inventory metrics.',
    };
    const normalized = service.validateQuestion(JSON.stringify(response), snapshot);
    expect(normalized.schemaVersion).toBe('1.0');
    expect(normalized.evidence).toHaveLength(1);
    expect(normalized.evidence[0]).not.toHaveProperty('source');
    expect(normalized.evidence[0]).not.toHaveProperty('sourceRefs');
    expect(normalized.limitations).toEqual([response.limitations]);
    expect(normalized.evidence[0]).toMatchObject({ metricVersion: '2026-09-25.1', periodStart, periodEnd, dataTimestamp });
    expect(normalized.evidence[0]).toMatchObject({ unit: metric.unit, sourceResource: metric.sourceRefs[0].resource });
    expect(normalized.evidence[0]).not.toHaveProperty('currency');
    expect(() => service.validateQuestion(JSON.stringify({ ...response, evidence: { ...response.evidence, value: 99 } }), snapshot))
      .toThrow(/unsupported evidence/i);
  });

  it('validates structured daily briefing metric references against the same certified evidence', () => {
    const { snapshot } = fixture();
    const metric = (snapshot.data as unknown as CertifiedSnapshotData).metrics[0];
    const response = {
      schemaVersion: '1.0',
      answer: 'Daily briefing based on certified inventory evidence.',
      evidence: [{ metricKey: metric.key, value: metric.value }],
      limitations: [],
      dailyBriefing: {
        headline: 'Review replenishment exposure',
        overallStatus: 'AMBER',
        executiveSummary: 'Two policies are below their certified reorder point.',
        keyUpdates: [{ title: 'Replenishment pressure', detail: 'Two policies are below reorder point.', whyItMatters: 'Availability may be constrained.', priority: 'HIGH', evidenceMetricKeys: [metric.key] }],
        risks: [],
        recommendedFocus: [],
        dataCaveats: [],
      },
    };
    expect(service.validateQuestion(JSON.stringify(response), snapshot).dailyBriefing?.keyUpdates).toHaveLength(1);
    response.dailyBriefing.keyUpdates[0].evidenceMetricKeys = ['inventory.unverified_metric'];
    expect(() => service.validateQuestion(JSON.stringify(response), snapshot)).toThrow(/missing from its certified evidence/i);
    response.dailyBriefing.keyUpdates[0].evidenceMetricKeys = [];
    expect(() => service.validateQuestion(JSON.stringify(response), snapshot)).toThrow();
  });
});
