import { IntelligenceCaseService } from '../services/intelligence-case.service';

describe('Hermes Intelligence Detectors — 9/9 Deterministic Algorithms', () => {
  const mockDb = () => {
    const cases = new Map<string, any>();
    return {
      cases,
      intelligenceCase: {
        upsert: jest.fn(async (args: any) => {
          cases.set(args.where.dedupeKey, { ...args.create, id: `case-${cases.size + 1}` });
          return cases.get(args.where.dedupeKey);
        }),
      },
    } as any;
  };

  const periodStart = '2026-09-01T00:00:00.000Z';
  const periodEnd = '2026-10-01T00:00:00.000Z';

  function snapshot(module: any, opportunities: any[], metrics: any[] = []) {
    return {
      id: `snap-${module.toLowerCase()}-1`,
      module,
      metricVersion: 'test-v1',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      data: {
        module,
        metricVersion: 'test-v1',
        periodStart,
        periodEnd,
        generatedAt: periodEnd,
        sourceLatestAt: periodEnd,
        reportingCurrency: 'INR',
        notices: [],
        metrics,
        opportunities,
      },
    } as any;
  }

  // 1. MATERIAL_PRICE_INCREASE
  it('Detector 1: MATERIAL_PRICE_INCREASE - positive computes exact Decimal metrics and persists case', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('PROCUREMENT', [{
      id: 'procurement-price-increase:MAT-1',
      category: 'MATERIAL_PRICE_INCREASE',
      metricKeys: ['mat.price'],
      previousUnitPrice: 100,
      currentUnitPrice: 112,
      affectedQuantity: 500,
      estimatedCostImpact: 6000,
      title: 'Material price increase on MAT-1',
      situation: 'Price increased by 12%',
      targetResource: 'Material',
      targetResourceId: 'MAT-1',
    }], [{ key: 'mat.price', value: 12, unit: 'INR', provenance: 'CALCULATED', freshnessStatus: 'FRESH', dataQualityScore: 1, sourceRefs: [{ resource: 'Material' }] }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'MATERIAL_PRICE_INCREASE', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    expect(db.intelligenceCase.upsert).toHaveBeenCalledTimes(1);
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      previousUnitPrice: 100,
      currentUnitPrice: 112,
      absoluteDelta: 12,
      percentageDelta: 12,
      affectedQuantity: 500,
      estimatedCostImpact: 6000,
    });
  });

  // 2. LOW_INVENTORY_COVER
  it('Detector 2: LOW_INVENTORY_COVER - calculates days of cover and stockout gap risk', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('INVENTORY', [{
      id: 'inventory-cover:SKU-A',
      category: 'LOW_INVENTORY_COVER',
      metricKeys: [],
      currentStock: 120,
      burnRateDaily: 20,
      leadTimeDays: 14,
      unitCost: 150,
      title: 'Low inventory cover on SKU-A',
      situation: 'Cover is below replenishment lead time',
      targetResource: 'Product',
      targetResourceId: 'SKU-A',
    }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'LOW_INVENTORY_COVER', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      currentStock: 120,
      burnRateDaily: 20,
      daysOfCover: 6,
      leadTimeDays: 14,
      stockoutGapDays: 8,
      stockoutRiskValue: 24000,
    });
  });

  // 3. SLOW_MOVING_INVENTORY
  it('Detector 3: SLOW_MOVING_INVENTORY - calculates age, turnover rate, and accumulated holding costs', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('INVENTORY', [{
      id: 'inventory-slow-moving:SKU-B',
      category: 'SLOW_MOVING_INVENTORY',
      metricKeys: [],
      inventoryAgeDays: 110,
      quantity: 350,
      unitCost: 200,
      holdingCostPercent: 18,
      turnoverRate: 0.4,
      title: 'Slow moving inventory on SKU-B',
      situation: 'Stock age exceeds 90 days threshold',
      targetResource: 'Product',
      targetResourceId: 'SKU-B',
    }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'SLOW_MOVING_INVENTORY', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      inventoryAgeDays: 110,
      quantity: 350,
      unitCost: 200,
      carryingValue: 70000,
      turnoverRate: 0.4,
    });
    expect(saved.evidence.holdingCostAccumulated).toBeGreaterThan(0);
  });

  // 4. DEAD_STOCK
  it('Detector 4: DEAD_STOCK - positive calculates zero-movement days and write-off exposure; negative returns INSUFFICIENT_EVIDENCE', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    
    // Positive
    const snapPositive = snapshot('INVENTORY', [{
      id: 'inventory-dead-stock:SKU-C',
      category: 'DEAD_STOCK',
      metricKeys: [],
      zeroMovementDays: 195,
      deadStockQuantity: 200,
      unitCost: 300,
      scrapRecoveryRate: 0.15,
      title: 'Dead stock detected on SKU-C',
      situation: 'Zero movement recorded over 180 days',
      targetResource: 'Product',
      targetResourceId: 'SKU-C',
    }]);
    const posResults = await service.detect(snapPositive);
    expect(posResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'DEAD_STOCK', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      zeroMovementDays: 195,
      deadStockQuantity: 200,
      deadStockValue: 60000,
      recoverableScrapValue: 9000,
      writeOffExposure: 51000,
    });

    // Negative (no opportunities on empty snapshot)
    const snapNegative = snapshot('INVENTORY', []);
    const negResults = await service.detect(snapNegative);
    expect(negResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'DEAD_STOCK', createdOrUpdated: 0, status: 'INSUFFICIENT_EVIDENCE' }),
    ]));
  });

  // 5. VENDOR_DETERIORATION
  it('Detector 5: VENDOR_DETERIORATION - retains sourced delivery and rejection values', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    
    // Positive
    const snapPositive = snapshot('PROCUREMENT', [{
      id: 'procurement-vendor-deterioration:VEND-1',
      category: 'VENDOR_DETERIORATION',
      metricKeys: [],
      onTimeDeliveryRate: 74.5,
      targetOtdRate: 95.0,
      leadTimeVarianceDays: 6.2,
      qualityRejectionRate: 4.8,
      affectedPurchaseValue: 125000,
      title: 'Vendor deterioration on VEND-1',
      situation: 'OTIF delivery dropped below 80%',
      targetResource: 'Vendor',
      targetResourceId: 'VEND-1',
    }]);
    const posResults = await service.detect(snapPositive);
    expect(posResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'VENDOR_DETERIORATION', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      onTimeDeliveryRate: 74.5,
      leadTimeVarianceDays: 6.2,
      qualityRejectionRate: 4.8,
      affectedPurchaseValue: 125000,
    });

    // Negative
    const snapNegative = snapshot('PROCUREMENT', []);
    const negResults = await service.detect(snapNegative);
    expect(negResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'VENDOR_DETERIORATION', createdOrUpdated: 0, status: 'INSUFFICIENT_EVIDENCE' }),
    ]));
  });

  // 6. MARGIN_COMPRESSION
  it('Detector 6: MARGIN_COMPRESSION - calculates sourced margin erosion without invented leakage splits', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('SALES', [{
      id: 'sales-margin-review:PROD-X',
      category: 'MARGIN_COMPRESSION',
      metricKeys: [],
      historicalGrossMarginPercent: 36.0,
      realizedGrossMarginPercent: 26.5,
      salesVolume: 80000,
      title: 'Margin compression on PROD-X',
      situation: 'Gross margin compressed by 9.5% due to unrecovered freight',
      targetResource: 'Product',
      targetResourceId: 'PROD-X',
    }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'MARGIN_COMPRESSION', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      historicalGrossMarginPercent: 36.0,
      realizedGrossMarginPercent: 26.5,
      marginDeltaPercent: -9.5,
      salesVolume: 80000,
      totalMarginAtRisk: 7600,
    });
    expect(saved.evidence.freightLeakageAmount).toBeUndefined();
    expect(saved.evidence.discountLeakageAmount).toBeUndefined();
  });

  // 7. UNPLANNED_PRODUCTION_DEMAND
  it('Detector 7: UNPLANNED_PRODUCTION_DEMAND - calculates deficit without inventing a delay', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('PRODUCTION', [{
      id: 'production-upcoming-demand:LINE-1',
      category: 'UNPLANNED_DEMAND',
      metricKeys: [],
      plannedCapacityUnits: 1000,
      confirmedDemandUnits: 1350,
      bottleneckWorkstation: 'CNC_MILL_03',
      title: 'Unplanned demand spike on LINE-1',
      situation: 'Confirmed demand exceeds line capacity by 35%',
      targetResource: 'ProductionLine',
      targetResourceId: 'LINE-1',
    }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'UNPLANNED_PRODUCTION_DEMAND', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      plannedCapacityUnits: 1000,
      confirmedDemandUnits: 1350,
      capacityDeficitUnits: 350,
      utilizationPercent: 135.0,
      bottleneckWorkstation: 'CNC_MILL_03',
    });
    expect(saved.evidence.scheduleDelayHours).toBeUndefined();
  });

  // 8. DELAYED_FULFILLMENT
  it('Detector 8: DELAYED_FULFILLMENT - calculates delayed shipments, client impact, and SLA exposure', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    const snap = snapshot('FULFILLMENT', [{
      id: 'fulfillment-late:ZONE-NORTH',
      category: 'DELAYED_FULFILLMENT',
      metricKeys: [],
      delayedShipmentCount: 18,
      averageDelayDays: 3.4,
      customerImpactCount: 14,
      slaBreachExposure: 22500,
      carrierBacklog: 'LOGISTICS_TRANSIT_DELAY',
      title: 'Delayed fulfillments in North Zone',
      situation: '18 shipments past promised dispatch SLA',
      targetResource: 'Warehouse',
      targetResourceId: 'ZONE-NORTH',
    }]);

    const results = await service.detect(snap);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'DELAYED_FULFILLMENT', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      delayedShipmentCount: 18,
      averageDelayDays: 3.4,
      customerImpactCount: 14,
      slaBreachExposure: 22500,
      carrierBacklog: 'LOGISTICS_TRANSIT_DELAY',
    });
  });

  // 9. REPLENISHMENT_RISK
  it('Detector 9: REPLENISHMENT_RISK - calculates reorder deficit without invented probability', async () => {
    const db = mockDb();
    const service = new IntelligenceCaseService(db);
    
    // Positive
    const snapPositive = snapshot('INVENTORY', [{
      id: 'inventory-replenishment:POLICY-9',
      category: 'REPLENISHMENT_RISK',
      metricKeys: [],
      reorderPoint: 300,
      availableStock: 140,
      safetyStock: 100,
      title: 'Replenishment risk under Policy 9',
      situation: 'Stock has fallen below certified reorder point',
      targetResource: 'ReplenishmentPolicy',
      targetResourceId: 'POLICY-9',
    }]);
    const posResults = await service.detect(snapPositive);
    expect(posResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'REPLENISHMENT_RISK', createdOrUpdated: 1, status: 'EVALUATED' }),
    ]));
    const saved = db.cases.values().next().value;
    expect(saved.evidence).toMatchObject({
      reorderPoint: 300,
      availableStock: 140,
      safetyStock: 100,
      reorderDeficit: 160,
      replenishmentUrgency: 'HIGH',
    });
    expect(saved.evidence.stockoutProbability).toBeUndefined();

    // Negative
    const snapNegative = snapshot('INVENTORY', []);
    const negResults = await service.detect(snapNegative);
    expect(negResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'REPLENISHMENT_RISK', createdOrUpdated: 0, status: 'INSUFFICIENT_EVIDENCE' }),
    ]));
  });
});
