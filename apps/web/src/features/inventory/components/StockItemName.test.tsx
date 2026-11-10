import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockItemName, isStockVariant } from './StockItemName';

describe('stock variant identity', () => {
 it('recognizes material and product metadata without guessing from names', () => {
  expect(isStockVariant({ specs: { parentMaterialId: 'parent' } })).toBe(true);
  expect(isStockVariant({ metadata: { isVariant: true } })).toBe(true);
  expect(isStockVariant({})).toBe(false);
 });
 it('preserves the selected variant on historical transactions', () => {
  render(<StockItemName name="SS CHAIN" context="[Dept: Assembly] [Variant: SS CHAIN 3mm65 abhav] Used" />);
  expect(screen.getByText('SS CHAIN 3mm65 abhav')).toBeTruthy();
  expect(screen.getByText('Variant')).toBeTruthy();
 });
 it('does not label ordinary stock as a variant', () => {
  const { container } = render(<StockItemName name="Plain stock" item={{}} />);
  expect(container.textContent).toBe('Plain stock');
 });
});
