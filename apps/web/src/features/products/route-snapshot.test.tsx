import { expect, test } from 'vitest';
import { getRouteSnapshot, isRouteReadyToSave } from './route-snapshot';

const steps = [
  { stepName: 'Cutting', departmentId: 'department-1', durationMinutes: '30' },
  { stepName: 'Packing', departmentId: 'department-2', durationMinutes: '10' },
];
const baseline = { id: 'route-1', snapshot: getRouteSnapshot('Standard Route', steps) };

test('an unchanged selected route cannot be saved again', () => {
  expect(isRouteReadyToSave('Standard Route', steps, 'route-1', baseline)).toBe(false);
  expect(isRouteReadyToSave(' Standard Route ', [{ ...steps[0], durationMinutes: '30.0' }, steps[1]], 'route-1', baseline)).toBe(false);
});

test('a changed route name or schedule can be saved as another route', () => {
  expect(isRouteReadyToSave('Alternate Route', steps, 'route-1', baseline)).toBe(true);
  expect(isRouteReadyToSave('Standard Route', [{ ...steps[0], durationMinutes: '35' }, steps[1]], 'route-1', baseline)).toBe(true);
  expect(isRouteReadyToSave('Standard Route', [...steps].reverse(), 'route-1', baseline)).toBe(true);
});

test('a new route requires a name and complete steps', () => {
  expect(isRouteReadyToSave('New Route', steps, '', null)).toBe(true);
  expect(isRouteReadyToSave('', steps, '', null)).toBe(false);
  expect(isRouteReadyToSave('New Route', [{ ...steps[0], departmentId: '' }], '', null)).toBe(false);
  expect(isRouteReadyToSave('New Route', steps, 'route-1', null)).toBe(false);
});
