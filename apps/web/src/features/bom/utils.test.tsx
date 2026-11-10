import { expect, test } from 'vitest';
import { getBomComponentProducts, getBomLineItemDisplay } from './utils';

test('shows the parent item and the variant label separately for a saved BOM line', () => {
  const materials = [
    { id: 'parent', name: 'GLIDER FRAME' },
    { id: 'variant', name: 'GLIDER FRAME - RAW LHS', isVariant: true, parentMaterialId: 'parent' },
  ];
  const line = { materialId: 'variant', note: 'Selected variant: GLIDER FRAME - RAW LHS' };

  expect(getBomLineItemDisplay(line, materials)).toEqual({ name: 'GLIDER FRAME', variant: 'RAW LHS' });
});

test('shows a saved virtual variant label when the BOM line references its parent material', () => {
  const materials = [{ id: 'parent', name: 'GLIDER FRAME - 6 PIPES - RAW' }];
  const line = { materialId: 'parent', note: 'Selected variant: LHS' };

  expect(getBomLineItemDisplay(line, materials)).toEqual({
    name: 'GLIDER FRAME - 6 PIPES - RAW',
    variant: 'LHS',
  });
});

test('counts distinct product components and uses saved or catalog names', () => {
  const lines = [
    { materialId: 'material-1' },
    { componentProductId: 'product-1', componentProduct: { id: 'product-1', name: 'Pipe Frame' } },
    { componentProductId: 'product-1' },
    { componentProductId: 'product-2' },
  ];

  expect(getBomComponentProducts(lines, [{ id: 'product-2', name: 'Trolley Box' }])).toEqual([
    { id: 'product-1', name: 'Pipe Frame' },
    { id: 'product-2', name: 'Trolley Box' },
  ]);
});
