import { describe, expect, it } from 'vitest';
import { calculateTierPrice, effectiveTierPrice } from '../utils/tierPricing';

describe('pricing master tier rates', () => {
  it('applies each discount to that tier price, independently of the item MRP', () => {
    expect(calculateTierPrice(100, 25)).toBe(75);
    expect(calculateTierPrice(341.83, 15)).toBe(290.56);
    expect(effectiveTierPrice({ masterPrice: 100, discountPercentage: 25, calculatedPrice: 750 })).toBe(75);
  });

  it('keeps a custom rate and supports older tiers without a master price', () => {
    expect(effectiveTierPrice({ masterPrice: 100, discountPercentage: 25, isCustomPrice: true, customPrice: 60 })).toBe(60);
    expect(effectiveTierPrice({ calculatedPrice: 80 })).toBe(80);
  });
});
