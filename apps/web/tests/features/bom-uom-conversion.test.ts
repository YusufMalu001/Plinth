import { describe, it, expect } from 'vitest';
import {
  getItemUomRelations,
  convertItemQuantityBetweenUoms,
  getNextIncrementedBomName,
} from '../../src/features/bom/utils';

describe('BOM UOM Conversion Utils', () => {
  const mockItem = {
    id: 'mat-pipe-01',
    name: '19mm Steel Pipe',
    uomId: 'uom-feet',
    uom: { id: 'uom-feet', name: 'Feet', symbol: 'FT' },
    specs: {
      hasMultipleUoms: true,
      availableUomIds: ['uom-feet', 'uom-kg', 'uom-meter'],
      uomRelations: [
        {
          id: 'uom-feet_uom-kg',
          fromUomId: 'uom-feet',
          toUomId: 'uom-kg',
          fromQuantity: 1,
          toQuantity: 0.041,
          factor: 0.041,
        },
        {
          id: 'uom-feet_uom-meter',
          fromUomId: 'uom-feet',
          toUomId: 'uom-meter',
          fromQuantity: 1,
          toQuantity: 0.3048,
          factor: 0.3048,
        },
      ],
    },
  };

  it('retrieves UOM relations from item specs or metadata', () => {
    const relations = getItemUomRelations(mockItem);
    expect(relations).toHaveLength(2);
    expect(relations[0].fromUomId).toBe('uom-feet');
    expect(relations[0].toUomId).toBe('uom-kg');
  });

  it('converts quantity directly from base UOM to secondary UOM (Feet -> Kg)', () => {
    // 100 Feet * 0.041 = 4.1 Kg
    const converted = convertItemQuantityBetweenUoms(mockItem, 100, 'uom-feet', 'uom-kg');
    expect(converted).toBe(4.1);
  });

  it('converts quantity inversely from secondary UOM back to base UOM (Kg -> Feet)', () => {
    // 4.1 Kg / 0.041 = 100 Feet
    const converted = convertItemQuantityBetweenUoms(mockItem, 4.1, 'uom-kg', 'uom-feet');
    expect(converted).toBe(100);
  });

  it('converts quantity between two secondary UOMs via Base UOM (Kg -> Meter)', () => {
    // 0.041 Kg = 1 Feet = 0.3048 Meter
    const converted = convertItemQuantityBetweenUoms(mockItem, 0.041, 'uom-kg', 'uom-meter');
    expect(converted).toBe(0.3048);
  });

  it('preserves quantity when converting to the same UOM', () => {
    const converted = convertItemQuantityBetweenUoms(mockItem, 50, 'uom-feet', 'uom-feet');
    expect(converted).toBe(50);
  });

  it('returns null for unconvertible UOMs or invalid numbers', () => {
    expect(convertItemQuantityBetweenUoms(mockItem, 50, 'uom-feet', 'uom-unknown')).toBeNull();
    expect(convertItemQuantityBetweenUoms(mockItem, 'abc', 'uom-feet', 'uom-kg')).toBeNull();
  });
});

describe('getNextIncrementedBomName', () => {
  it('increments base name with 2 when collision exists', () => {
    const existing = new Set(['fardeen-test']);
    expect(getNextIncrementedBomName('FARDEEN-TEST', existing)).toBe('FARDEEN-TEST 2');
  });

  it('increments trailing number from 2 to 3', () => {
    const existing = new Set(['fardeen-test', 'fardeen-test 2']);
    expect(getNextIncrementedBomName('FARDEEN-TEST 2', existing)).toBe('FARDEEN-TEST 3');
  });

  it('skips taken numbers until an open number is found', () => {
    const existing = new Set(['fardeen-test', 'fardeen-test 2', 'fardeen-test 3']);
    expect(getNextIncrementedBomName('FARDEEN-TEST', existing)).toBe('FARDEEN-TEST 4');
  });

  it('handles hyphenated names correctly', () => {
    const existing = new Set(['cs9 - raw']);
    expect(getNextIncrementedBomName('CS9 - RAW', existing)).toBe('CS9 - RAW 2');
  });

  it('serializes numbers sequentially: 2 -> 3 -> 4 -> 5 without skipping to even numbers', () => {
    const set1 = new Set(['fardeen test', 'fardeen test 2']);
    expect(getNextIncrementedBomName('FARDEEN TEST 2', set1)).toBe('FARDEEN TEST 3');

    const set2 = new Set(['fardeen test', 'fardeen test 2', 'fardeen test 3']);
    expect(getNextIncrementedBomName('FARDEEN TEST 3', set2)).toBe('FARDEEN TEST 4');

    const set3 = new Set(['fardeen test', 'fardeen test 2', 'fardeen test 3', 'fardeen test 4']);
    expect(getNextIncrementedBomName('FARDEEN TEST 4', set3)).toBe('FARDEEN TEST 5');
  });
});
