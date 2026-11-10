import { MockHermesProvider } from '../integrations/mock-hermes.provider';
import { recommendationInput, questionInstructions, recommendationInstructions } from '../intelligence.prompts';
import { RecommendationValidatorService } from '../services/recommendation-validator.service';

const now = new Date().toISOString();
const sourceMetric = {
  key: 'inventory.slow_moving_product_count', value: 3, unit: 'COUNT',
  provenance: 'CALCULATED', freshnessStatus: 'FRESH', dataQualityScore: 1,
  sourceRefs: [{ resource: 'InventoryLedgerEntry', filter: 'synthetic fixture' }],
};
const opportunity = {
  id: 'inventory-slow-moving:synthetic', category: 'EXCESS_STOCK', actionCode: 'inventory.excess_stock_action',
  title: 'Review synthetic slow moving stock', situation: 'Three synthetic products show no recent issue movement.',
  metricKeys: [sourceMetric.key], expectedImpact: { metricKey: 'inventory.items_reviewed', unit: 'COUNT', horizonDays: 30, low: 1, base: 2, high: 3, sourceMetricKeys: [sourceMetric.key] },
};
const snapshot: any = {
  id: '00000000-0000-4000-8000-000000000001', module: 'INVENTORY', metricVersion: 'test-v1',
  periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(), freshnessScore: 1, costCoverageScore: 1,
  data: { module: 'INVENTORY', metricVersion: 'test-v1', periodStart: now, periodEnd: now, generatedAt: now, sourceLatestAt: now, reportingCurrency: 'INR', metrics: [sourceMetric], opportunities: [opportunity], notices: [] },
};

describe('MockHermesProvider', () => {
  const provider = new MockHermesProvider();

  it('returns a question response grounded only in supplied evidence and accepted by existing validation', async () => {
    const evidenceCatalog = [{
      metricKey: sourceMetric.key, metricVersion: snapshot.metricVersion, value: sourceMetric.value,
      unit: sourceMetric.unit, sourceResource: 'InventoryLedgerEntry', periodStart: now, periodEnd: now,
      dataTimestamp: now,
    }];
    const result = await provider.run({
      module: 'INVENTORY', instructions: questionInstructions('INVENTORY'),
      content: JSON.stringify({ question: 'What stock needs review?', snapshotId: snapshot.id, certifiedSnapshot: snapshot.data, evidenceCatalog }),
      idempotencyKey: 'mock-question-test',
    });
    expect(result.runtime?.provider).toBe('DETERMINISTIC_MOCK');
    expect(result.runtime?.model).toBe('synergy/mock-hermes-v1');
    expect(new RecommendationValidatorService().validateQuestion(result.output!, snapshot).evidence[0].metricKey).toBe(sourceMetric.key);
  });

  it('returns an explicit insufficient-evidence answer when the snapshot has no available metrics', async () => {
    const emptySnapshot = { ...snapshot, data: { ...snapshot.data, metrics: [] } };
    const result = await provider.run({
      module: 'INVENTORY', instructions: questionInstructions('INVENTORY'),
      content: JSON.stringify({ question: 'What is our stock?', snapshotId: snapshot.id, certifiedSnapshot: emptySnapshot.data, evidenceCatalog: [], unavailableMetrics: [{ key: 'inventory.quantity', reason: 'No eligible records' }] }),
      idempotencyKey: 'mock-question-empty-test',
    });
    expect(new RecommendationValidatorService().validateQuestion(result.output!, emptySnapshot).evidence).toEqual([]);
  });

  it('copies deterministic recommendation facts and passes the existing recommendation validator', async () => {
    const enrichedSnapshot = {
      ...snapshot.data, snapshotId: snapshot.id, freshnessScore: 1, costCoverageScore: 1,
      dataQualityScore: 1, objectivePolicy: { version: 'synthetic-policy', weights: {}, guardrails: {} },
    };
    const result = await provider.run({
      module: 'INVENTORY', instructions: recommendationInstructions('INVENTORY'),
      content: recommendationInput(enrichedSnapshot), idempotencyKey: 'mock-recommendation-test',
    });
    const validated = new RecommendationValidatorService().validate(result.output!, snapshot, 'INVENTORY');
    expect(validated.recommendations).toHaveLength(1);
    expect(validated.recommendations[0].expectedImpact).toEqual(opportunity.expectedImpact);
    expect(validated.recommendations[0].evidence[0].value).toBe(sourceMetric.value);
  });
});
