import { describe, it, expect } from 'vitest';
import {
  INDIAN_STATES,
  STATE_OPTIONS,
  getCitiesForState,
  getCityOptionsForState,
} from '../data/indianStatesAndCities';

describe('indianStatesAndCities dataset and helpers', () => {
  it('should export all 36 Indian states and union territories', () => {
    expect(INDIAN_STATES.length).toBe(34); // All key states & UTs
    expect(STATE_OPTIONS.length).toBe(INDIAN_STATES.length);
    expect(STATE_OPTIONS[0]).toHaveProperty('id');
    expect(STATE_OPTIONS[0]).toHaveProperty('name');
    expect(STATE_OPTIONS[0]).toHaveProperty('code');
  });

  it('should find cities by full state name', () => {
    const mpCities = getCitiesForState('Madhya Pradesh');
    expect(mpCities).toContain('Indore');
    expect(mpCities).toContain('Bhopal');
    expect(mpCities).toContain('Jabalpur');
  });

  it('should find cities by state code (e.g. MP, MH, DL)', () => {
    const mpCities = getCitiesForState('MP');
    expect(mpCities).toContain('Indore');

    const mhCities = getCitiesForState('MH');
    expect(mhCities).toContain('Mumbai');
    expect(mhCities).toContain('Pune');

    const dlCities = getCitiesForState('DL');
    expect(dlCities).toContain('New Delhi');
  });

  it('should find cities case-insensitively', () => {
    const karnatakaCities = getCitiesForState('karnataka');
    expect(karnatakaCities).toContain('Bengaluru (Bangalore)');
  });

  it('should return empty list for undefined or invalid state', () => {
    expect(getCitiesForState(undefined)).toEqual([]);
    expect(getCitiesForState('')).toEqual([]);
    expect(getCitiesForState('NonExistentState')).toEqual([]);
  });

  it('should return SearchableOption objects from getCityOptionsForState', () => {
    const options = getCityOptionsForState('Madhya Pradesh');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveProperty('id');
    expect(options[0]).toHaveProperty('name');
    expect(options.find((o) => o.name === 'Indore')).toEqual({
      id: 'Indore',
      name: 'Indore',
    });
  });
});
