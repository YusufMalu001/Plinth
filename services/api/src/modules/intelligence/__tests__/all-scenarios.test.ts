import { ImpactScenarioService } from '../services/impact-scenario.service';

describe('Hermes Impact Scenarios — 6/6 Deterministic Scenarios', () => {
  const caseEvidence = {
    detectorKey: 'MATERIAL_PRICE_INCREASE',
    previousUnitPrice: 100,
    currentUnitPrice: 112,
    absoluteDelta: 12,
    percentageDelta: 12,
    affectedQuantity: 500,
    estimatedCostImpact: 6000,
    capacityDeficitUnits: 350,
  };

  const mockDb = (evidence = caseEvidence) => {
    const scenarios = new Map<string, any>();
    return {
      scenarios,
      intelligenceCase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'case-test-1',
          snapshotId: 'snap-1',
          evidence,
          snapshot: { costCoverageScore: 1 },
        }),
      },
      impactScenario: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: any) => {
          const row = { id: `scenario-${scenarios.size + 1}`, ...args.data };
          scenarios.set(row.id, row);
          return row;
        }),
      },
    } as any;
  };

  it('Scenario 1: DO_NOTHING - calculates real unmitigated operational baseline', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-1',
      idempotencyKey: 'idemp-do-nothing',
      scenarioType: 'DO_NOTHING',
    });

    expect(scenario.scenarioType).toBe('DO_NOTHING');
    expect(scenario.baseline).toMatchObject({
      status: 'CALCULATED',
      value: 6000,
    });
    expect(scenario.baseCase.value).toBe(6000);
    expect(scenario.lowCase.value).toBe(5400);
    expect(scenario.highCase.value).toBe(6900);
    expect(scenario.formulaVersion).toBe('deterministic-decimal-scenario-v1');
  });

  it('Scenario 2: BUY_MORE - calculates forward quantity savings net of inventory holding charges', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-2',
      idempotencyKey: 'idemp-buy-more',
      scenarioType: 'BUY_MORE',
      assumptions: {
        forwardQuantity: 500,
        holdingCostPercent: 18,
        horizonDays: 90,
      },
    });

    expect(scenario.scenarioType).toBe('BUY_MORE');
    expect(scenario.baseline.value).toBe(0);
    expect(scenario.baseCase.value).toBe(3780.82);
    expect(scenario.lowCase.value).toBe(Number((3780.82 * 0.85).toFixed(2)));
    expect(scenario.highCase.value).toBe(Number((3780.82 * 1.15).toFixed(2)));
  });

  it('Scenario 3: BUY_LATER - calculates deferred carrying cost savings discounted for price volatility', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-3',
      idempotencyKey: 'idemp-buy-later',
      scenarioType: 'BUY_LATER',
      assumptions: {
        forwardQuantity: 500,
        holdingCostPercent: 18,
        deferralDays: 30,
        volatilityRiskPercent: 5,
      },
    });

    expect(scenario.scenarioType).toBe('BUY_LATER');
    expect(scenario.baseline.value).toBe(0);
    expect(scenario.baseCase.value).toBeGreaterThan(0);
    expect(scenario.lowCase.value).toBe(Number((scenario.baseCase.value * 0.8).toFixed(2)));
    expect(scenario.highCase.value).toBe(Number((scenario.baseCase.value * 1.2).toFixed(2)));
  });

  it('Scenario 4: PRICE_CHANGE - calculates margin recovery under price elasticity volume retention', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-4',
      idempotencyKey: 'idemp-price-change',
      scenarioType: 'PRICE_CHANGE',
      assumptions: {
        passThroughRate: 1.0,
        elasticityVolumeReduction: 0.05,
      },
    });

    expect(scenario.scenarioType).toBe('PRICE_CHANGE');
    expect(scenario.baseline.value).toBe(0);
    // 500 * (1 - 0.05) = 475 units * 12 = 5700
    expect(scenario.baseCase.value).toBe(5700);
    expect(scenario.lowCase.value).toBe(Number((5700 * 0.8).toFixed(2)));
    expect(scenario.highCase.value).toBe(Number((5700 * 1.2).toFixed(2)));
  });

  it('Scenario 5: PRODUCTION_INCREASE - calculates expansion profit from overtime/shift addition', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-5',
      idempotencyKey: 'idemp-prod-increase',
      scenarioType: 'PRODUCTION_INCREASE',
      assumptions: {
        additionalUnits: 350,
        unitSellingPrice: 850,
        overtimeCostPerUnit: 480,
      },
    });

    expect(scenario.scenarioType).toBe('PRODUCTION_INCREASE');
    expect(scenario.baseline.value).toBe(0);
    // 350 * (850 - 480) = 350 * 370 = 129500
    expect(scenario.baseCase.value).toBe(129500);
    expect(scenario.lowCase.value).toBe(Number((129500 * 0.85).toFixed(2)));
    expect(scenario.highCase.value).toBe(Number((129500 * 1.15).toFixed(2)));
  });

  it('Scenario 6: PRODUCTION_DECREASE - calculates cash preservation from avoided material and holding cost', async () => {
    const db = mockDb();
    const service = new ImpactScenarioService(db);
    const scenario = await service.create({
      caseId: 'case-test-1',
      actorId: 'usr-1',
      correlationId: 'corr-6',
      idempotencyKey: 'idemp-prod-decrease',
      scenarioType: 'PRODUCTION_DECREASE',
      assumptions: {
        curtailedUnits: 250,
        variableCostPerUnit: 320,
      },
    });

    expect(scenario.scenarioType).toBe('PRODUCTION_DECREASE');
    expect(scenario.baseline.value).toBe(0);
    // 250 * 320 = 80000 + holding cost avoided
    expect(scenario.baseCase.value).toBeGreaterThan(80000);
    expect(scenario.lowCase.value).toBe(Number((scenario.baseCase.value * 0.9).toFixed(2)));
    expect(scenario.highCase.value).toBe(Number((scenario.baseCase.value * 1.15).toFixed(2)));
  });
});
