import { describe, expect, it } from 'vitest';
import { canViewPath, getFirstAccessibleRoute } from '../access-control';

describe('Assembly workspace navigation and RBAC', () => {
  it('allows access to assembly workspace when holding any AssemblyBatch permission', () => {
    expect(canViewPath('/production/assembly', 'department_incharge', ['view:assemblybatch'])).toBe(true);
    expect(canViewPath('/production/assembly', 'department_incharge', ['execute:assemblybatch'])).toBe(true);
    expect(canViewPath('/production/assembly', 'department_head', ['plan:assemblybatch'])).toBe(true);
    expect(canViewPath('/production/assembly', 'shop_floor_operator', ['execute:assemblybatch'])).toBe(true);
    expect(canViewPath('/production/assembly', 'admin', [])).toBe(true);
  });

  it('denies access to assembly workspace when holding only standard department execution permissions', () => {
    expect(canViewPath('/production/assembly', 'department_incharge', ['view:departmentexecution'])).toBe(false);
    expect(canViewPath('/production/assembly', 'department_head', ['view:departmentexecution'])).toBe(false);
    expect(canViewPath('/production/assembly', 'shop_floor_operator', ['view:departmentexecution'])).toBe(false);
  });

  it('routes assembly users to /production/assembly as first accessible route', () => {
    const assemblyRoute = getFirstAccessibleRoute('department_incharge', ['view:assemblybatch'], true);
    expect(assemblyRoute).toBe('/production/assembly');
  });

  it('routes standard shop floor department heads to /production/execution', () => {
    const executionRoute = getFirstAccessibleRoute('department_incharge', ['view:departmentexecution'], false);
    expect(executionRoute).toBe('/production/execution');
  });
});
