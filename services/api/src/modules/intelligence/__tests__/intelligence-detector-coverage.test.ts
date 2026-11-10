import { IntelligenceCaseService } from '../services/intelligence-case.service';

describe('detector coverage on certified snapshots', () => {
  const snapshot = (module: string) => ({
    id: `snapshot-${module.toLowerCase()}`,
    module,
    metricVersion: 'synthetic-v1',
    data: { module, metricVersion: 'synthetic-v1', periodStart: '2026-09-01', periodEnd: '2026-10-01', metrics: [], opportunities: [], notices: [] },
  }) as any;

  it('reports unsupported material, vendor, and replenishment detectors as insufficient evidence', async () => {
    const db: any = { intelligenceCase: { upsert: jest.fn() } };
    const service = new IntelligenceCaseService(db);

    const procurement = await service.detect(snapshot('PROCUREMENT'));
    const inventory = await service.detect(snapshot('INVENTORY'));
    const otherModules = await Promise.all(['SALES', 'PRODUCTION', 'FULFILLMENT'].map((module) => service.detect(snapshot(module))));
    const keys = [...procurement, ...inventory, ...otherModules.flat()].map((result) => result.detectorKey);

    expect(keys).toEqual(expect.arrayContaining([
      'LOW_INVENTORY_COVER', 'SLOW_MOVING_INVENTORY', 'MARGIN_COMPRESSION',
      'UNPLANNED_PRODUCTION_DEMAND', 'DELAYED_FULFILLMENT', 'MATERIAL_PRICE_INCREASE',
      'VENDOR_DETERIORATION', 'REPLENISHMENT_RISK',
    ]));
    expect(procurement.filter((result) => ['MATERIAL_PRICE_INCREASE', 'VENDOR_DETERIORATION'].includes(result.detectorKey)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ status: 'INSUFFICIENT_EVIDENCE', createdOrUpdated: 0 }),
        expect.objectContaining({ status: 'INSUFFICIENT_EVIDENCE', createdOrUpdated: 0 }),
      ]));
    expect(inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'REPLENISHMENT_RISK', status: 'INSUFFICIENT_EVIDENCE', createdOrUpdated: 0 }),
    ]));
    expect(db.intelligenceCase.upsert).not.toHaveBeenCalled();
  });

  it('does not turn a matching opportunity with missing values into a numeric case', async () => {
    const db: any = { intelligenceCase: { upsert: jest.fn() } };
    const service = new IntelligenceCaseService(db);
    const input = snapshot('PROCUREMENT');
    input.data.opportunities = [{
      id: 'procurement-price-increase:unknown', category: 'MATERIAL_PRICE_INCREASE',
      metricKeys: [], title: 'Unverified price change', situation: 'Source values missing',
    } as any];
    const result = await service.detect(input);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectorKey: 'MATERIAL_PRICE_INCREASE', status: 'INSUFFICIENT_EVIDENCE', createdOrUpdated: 0 }),
    ]));
    expect(db.intelligenceCase.upsert).not.toHaveBeenCalled();
  });
});
