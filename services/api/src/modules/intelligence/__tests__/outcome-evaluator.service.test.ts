import { OutcomeEvaluatorService } from '../services/outcome-evaluator.service';

describe('OutcomeEvaluatorService', () => {
  const service = new OutcomeEvaluatorService();

  it('calculates Decimal variance and percentage error but keeps user estimates UNKNOWN', () => {
    const result = service.evaluate({ expectedValue: '100.00', actualValue: '97.50', attributionMethod: 'MANAGER_ESTIMATE' });
    expect(result.variance?.toString()).toBe('-2.5');
    expect(result.absolutePercentageError?.toString()).toBe('0.025');
    expect(result.status).toBe('UNKNOWN');
    expect(result.quality).toBe('UNKNOWN');
    expect(result.attributionVerified).toBe(false);
  });

  it('does not divide by zero or classify absent values', () => {
    const result = service.evaluate({ expectedValue: 0, actualValue: 2, attributionMethod: 'MANAGER_ESTIMATE' });
    expect(result.variance?.toString()).toBe('2');
    expect(result.absolutePercentageError).toBeNull();
    expect(result.status).toBe('UNKNOWN');
  });

  it('classifies only direct source reconciliation with an explicit versioned policy', () => {
    const result = service.evaluate({
      expectedValue: '100', actualValue: '97.50', attributionMethod: 'DIRECT_TRANSACTION_RECONCILIATION',
      sourceRefs: [{ resource: 'SalesShipment', id: 'fixture-shipment' }],
      policy: { version: 'synthetic-policy-v1', successMaxAbsolutePercentageError: '0.01', partialMaxAbsolutePercentageError: '0.05' },
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.policyVersion).toBe('synthetic-policy-v1');
    expect(result.attributionVerified).toBe(true);
  });

  it('rejects invalid classification thresholds', () => {
    expect(() => service.evaluate({
      expectedValue: 100, actualValue: 99, attributionMethod: 'DIRECT_TRANSACTION_RECONCILIATION', sourceRefs: [{}],
      policy: { version: 'bad', successMaxAbsolutePercentageError: '0.1', partialMaxAbsolutePercentageError: '0.05' },
    })).toThrow('Outcome classification policy thresholds are invalid.');
  });
});
