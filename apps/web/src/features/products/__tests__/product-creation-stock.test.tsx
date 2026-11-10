import { describe, it, expect, beforeEach } from 'vitest';
import { getResolvedWarehouseStocks } from '../utils';
import type { DetailedProduct } from '../types';

describe('Product stock reflection & draft saving', () => {
  const sampleProduct: DetailedProduct = {
    id: 'prod-123',
    sku: 'PROD-CS12-SS',
    name: 'Cloth Drying Stand CS-12',
    description: 'Heavy duty stainless steel stand',
    categoryId: 'cat-1',
    productFamilyId: 'fam-1',
    uomId: 'uom-pcs',
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      initialQuantity: 75,
      costPrice: 1200,
      sellingPrice: 1800,
      minStockLevel: 10,
      reorderPoint: 25,
      targetMaxStock: 200,
    },
    uom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs' },
  };

  describe('getResolvedWarehouseStocks', () => {
    it('should reflect initialQuantity as opening stock when live balances are empty', () => {
      const stocks = getResolvedWarehouseStocks(sampleProduct, []);
      expect(stocks).toHaveLength(1);
      expect(stocks[0].onHand).toBe(75);
      expect(stocks[0].available).toBe(75);
      expect(stocks[0].reserved).toBe(0);
      expect(stocks[0].locationCode).toBe('MAIN-STORE');
      expect(stocks[0].unitCost).toBe(1200);
      expect(stocks[0].status).toBe('OPTIMAL');
    });

    it('should reflect initialQuantity when live balances is undefined', () => {
      const stocks = getResolvedWarehouseStocks(sampleProduct, undefined);
      expect(stocks).toHaveLength(1);
      expect(stocks[0].onHand).toBe(75);
      expect(stocks[0].available).toBe(75);
    });

    it('should prioritize live balances when they exist in database', () => {
      const liveBalances = [
        {
          locationId: 'loc-wh-north',
          location: { id: 'loc-wh-north', code: 'NORTH-BAY', name: 'North Warehouse Bay 1' },
          onHandQuantity: 50,
          reservedQuantity: 5,
          available: 45,
        },
        {
          locationId: 'loc-wh-south',
          location: { id: 'loc-wh-south', code: 'SOUTH-BAY', name: 'South Warehouse Bay 2' },
          onHandQuantity: 30,
          reservedQuantity: 0,
          available: 30,
        },
      ];

      const stocks = getResolvedWarehouseStocks(sampleProduct, liveBalances);
      expect(stocks).toHaveLength(2);
      expect(stocks[0].locationCode).toBe('NORTH-BAY');
      expect(stocks[0].onHand).toBe(50);
      expect(stocks[0].reserved).toBe(5);
      expect(stocks[0].available).toBe(45);
      expect(stocks[1].locationCode).toBe('SOUTH-BAY');
      expect(stocks[1].onHand).toBe(30);
    });

    it('should return empty array if no live balances and initialQuantity is 0', () => {
      const zeroStockProduct: DetailedProduct = {
        ...sampleProduct,
        metadata: {
          ...sampleProduct.metadata,
          initialQuantity: 0,
        },
      };

      const stocks = getResolvedWarehouseStocks(zeroStockProduct, []);
      expect(stocks).toHaveLength(0);
    });
  });

  describe('Product Creation Draft Persistence', () => {
    const DRAFT_KEY = 'synergy_product_creation_draft_v1';

    beforeEach(() => {
      localStorage.clear();
    });

    it('should save and restore partially filled product details draft', () => {
      const draftState = {
        form: {
          name: 'Half-Filled Foldable Rack',
          partNo: 'FR-001',
          sku: 'SKU-RACK-01',
          parentCategoryId: 'cat-storage',
          productFamilyId: 'fam-racks',
          description: 'Draft rack description',
          steelGrade: 'SS304',
          pipeDiameter: '19mm',
          rodThickness: '1mm',
          loadCapacity: '25kg',
          dimensionsUnfolded: '100x50x120',
          foldedProfile: '100x50x10',
          netWeight: '3.5',
          grossWeight: '4.0',
          surfaceFinish: 'Polished',
          dryingRails: '6',
          hsnCode: '73239390',
          taxability: 'Taxable',
          gstRate: '18',
          productType: 'Goods',
          asin: 'B08XYZ1234',
          ean13: '8901234567890',
          uomId: 'uom-pcs',
          initialQuantity: '50',
          minStockLevel: '10',
          reorderPoint: '20',
          targetMaxStock: '100',
          leadTimeDays: '3',
        },
        bomLines: [
          { id: 'b1', materialId: 'mat-pipe-1', quantity: '4', uomId: 'uom-pcs', note: 'Main frame' }
        ],
        customFields: [{ name: 'Color', value: 'Silver' }],
        technicalFields: [{ name: 'Tensile Strength', value: '520 MPa' }],
        pricingMasterId: 'pm-1',
        pricingFields: [],
        mrp: '2999',
        costPrice: '1400',
        globalDiscount: '10',
        additionalDiscount: '5',
        tierPricing: [],
        routeSteps: [
          { id: 'r1', stepName: 'Cutting', departmentId: 'dept-cut', durationMinutes: '15' }
        ],
        selectedRouteId: '',
        selectedBomVersionId: '',
        savedAt: new Date().toISOString(),
      };

      // Save draft
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftState));

      // Retrieve and verify
      const retrieved = localStorage.getItem(DRAFT_KEY);
      expect(retrieved).not.toBeNull();

      const parsed = JSON.parse(retrieved!);
      expect(parsed.form.name).toBe('Half-Filled Foldable Rack');
      expect(parsed.form.sku).toBe('SKU-RACK-01');
      expect(parsed.form.initialQuantity).toBe('50');
      expect(parsed.bomLines).toHaveLength(1);
      expect(parsed.routeSteps).toHaveLength(1);
      expect(parsed.mrp).toBe('2999');
      expect(parsed.customFields[0].value).toBe('Silver');
    });

    it('should clear draft on discard or reset', () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: { name: 'To be discarded' } }));
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

      localStorage.removeItem(DRAFT_KEY);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
  });
});
