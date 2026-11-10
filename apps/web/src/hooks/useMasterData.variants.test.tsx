import { describe, expect, it } from 'vitest';
import {
  expandMaterialsWithVariants,
  expandProductsWithVariants,
  type Material,
  type Product,
} from './useMasterData';

describe('expanded BOM item variants', () => {
  it('shows only the variants configured on a material parent', () => {
    const parent = {
      id: 'parent', name: 'GLIDER FRAME', code: 'FRAME', status: 'ACTIVE',
      specs: { measurementVariants: [
        { id: 'lhs-current', name: 'LHS' },
        { id: 'rhs-current', name: 'RHS' },
      ] },
    } as Material;
    const materials = [
      { id: 'lhs-old', name: 'GLIDER FRAME LHS', code: 'OLD-LHS', status: 'ACTIVE', specs: { isVariant: true, parentMaterialId: 'parent' } },
      parent,
      { id: 'rhs-current', name: 'GLIDER FRAME RHS', code: 'RHS', status: 'ACTIVE', specs: { isVariant: true, parentMaterialId: 'parent' } },
      { id: 'lhs-current', name: 'GLIDER FRAME LHS', code: 'LHS', status: 'ACTIVE', specs: { isVariant: true, parentMaterialId: 'parent' } },
    ] as Material[];

    const expanded = expandMaterialsWithVariants(materials);
    expect(expanded.map((item) => item.id)).toEqual(['parent', 'lhs-current', 'rhs-current']);
  });

  it('does not add separate product variant records alongside the parent variants', () => {
    const products = [
      { id: 'old-lhs', name: 'GLIDER LHS', sku: 'OLD', status: 'ACTIVE', metadata: { isVariant: true, parentProductId: 'parent' } },
      { id: 'parent', name: 'GLIDER', sku: 'GLIDER', status: 'ACTIVE', metadata: { measurementVariants: [
        { id: 'lhs', name: 'LHS' },
        { id: 'rhs', name: 'RHS' },
      ] } },
    ] as Product[];

    const expanded = expandProductsWithVariants(products);
    expect(expanded.map((item) => item.id)).toEqual(['parent', 'lhs', 'rhs']);
  });
});
