import { IntelligenceService } from '../services/intelligence.service';
import { productPricingAnalysisSchema } from '../intelligence.contracts';

describe('product pricing analysis financial safety', () => {
  test('derives an estimate from approved BOM and inventory balances and does not persist a recommendation', async () => {
    const db = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Test', sku: 'T-1', metadata: { sellingPrice: 30 } }) },
      bomVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'bom-1', version: 2, lines: [{ id: 'line-1', materialId: 'material-1', componentProductId: null, quantity: '2.000000' }] }) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([
        { itemType: 'MATERIAL', itemId: 'material-1', quantity: '3.0000', averageCost: '10.0000', updatedAt: new Date('2026-09-30T00:00:00.000Z') },
        { itemType: 'MATERIAL', itemId: 'material-1', quantity: '1.0000', averageCost: '14.0000', updatedAt: new Date('2026-10-01T00:00:00.000Z') },
      ]) },
    };
    const service = new IntelligenceService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    const result = await service.createProductPricingRecommendation('actor', { productId: 'product-1', targetMarginPercent: 45 }, 'request');

    expect(result).toMatchObject({
      status: 'ESTIMATE_AVAILABLE',
      values: {
        bomMaterialCost: { value: 22, provenance: 'ESTIMATED' },
        sellingPrice: { value: 30, provenance: 'ASSUMPTION' },
        targetPrice: { value: 40, targetMarginPercent: 45 },
      },
    });
    expect(JSON.stringify(result)).toContain('not certified profit');
    expect((db as any).recommendation).toBeUndefined();
    expect((db as any).businessSnapshot).toBeUndefined();
  });

  test('pricing request schema rejects browser-supplied cost and margin values', () => {
    expect(productPricingAnalysisSchema.safeParse({ productId: 'f1b0b98d-1e41-4f40-9b95-6dcbd6c496a3', targetMarginPercent: 45 }).success).toBe(true);
    expect(productPricingAnalysisSchema.safeParse({ productId: 'f1b0b98d-1e41-4f40-9b95-6dcbd6c496a3', targetMarginPercent: 45, bomMaterialCost: 1, grossMarginPercentage: 99 }).success).toBe(false);
  });

  test('returns an unavailable estimate when any approved BOM component lacks current valuation', async () => {
    const db = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Test', sku: 'T-1', metadata: { sellingPrice: 30 } }) },
      bomVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'bom-1', version: 2, lines: [{ id: 'line-1', materialId: 'material-1', componentProductId: null, quantity: '2.000000' }] }) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new IntelligenceService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await expect(service.createProductPricingRecommendation('actor', { productId: 'product-1', targetMarginPercent: 45 }, 'request'))
      .resolves.toMatchObject({ status: 'UNAVAILABLE' });
  });
});
