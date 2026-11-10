import { describe, expect, it } from 'vitest';
import { canViewPath } from '../access-control';

describe('intelligence audit navigation', () => {
  it('keeps ordinary intelligence access without exposing detailed audit history', () => {
    const permissions = ['view:moduleintelligence'];
    expect(canViewPath('/decision-center', 'sales_executive', permissions)).toBe(true);
    expect(canViewPath('/decision-center/audit', 'sales_executive', permissions)).toBe(false);
    expect(canViewPath('/intelligence', 'sales_executive', permissions)).toBe(true);
    expect(canViewPath('/intelligence/audit', 'sales_executive', permissions)).toBe(false);
  });

  it('allows the audit capability and administrators', () => {
    expect(canViewPath('/decision-center/audit', 'sales_executive', ['view:intelligenceaudit'])).toBe(true);
    expect(canViewPath('/decision-center/audit', 'admin', [])).toBe(true);
    expect(canViewPath('/intelligence/audit', 'sales_executive', ['view:intelligenceaudit'])).toBe(true);
    expect(canViewPath('/intelligence/audit', 'admin', [])).toBe(true);
  });
});

describe('granular section and module access control', () => {
  const deptInchargePermissions = [
    'view:departmentexecution',
    'receive:departmentexecution',
    'assign:departmentexecution',
    'start:departmentexecution',
    'update:departmentexecution',
    'complete:departmentexecution',
    'reject:departmentexecution',
    'handover_propose:departmentexecution',
    'handover_accept:departmentexecution',
    'view:wiptracking',
    'trace:wiptracking',
    'reconcile:wiptracking',
    'manage_exception:wiptracking',
    'read:masterdata',
    'view:product',
    'view:material',
    'view:unitofmeasure',
    'view:department',
    'view:warehouselocation',
    'view:employeemaster',
    'report:lossevent',
    'read:lossevent',
    'review:lossevent',
    'acknowledge:replacementchallan',
    'read:inventory'
  ];

  it('allows department incharge to access only authorized sections of manufacturing', () => {
    // Authorized section
    expect(canViewPath('/production/execution', 'department_incharge', deptInchargePermissions)).toBe(true);
    expect(canViewPath('/production/wip', 'department_incharge', deptInchargePermissions)).toBe(true);

    // Unauthorized sections of same module
    expect(canViewPath('/production/assembly', 'department_incharge', deptInchargePermissions)).toBe(false);
    expect(canViewPath('/production/assembly/new', 'department_incharge', deptInchargePermissions)).toBe(false);
    expect(canViewPath('/production/bom', 'department_incharge', deptInchargePermissions)).toBe(false);
    expect(canViewPath('/production/planning', 'department_incharge', deptInchargePermissions)).toBe(false);
    expect(canViewPath('/inventory/routing', 'department_incharge', deptInchargePermissions)).toBe(false);
  });

  it('allows access to assembly batches only when view:assemblybatch permission is held', () => {
    expect(canViewPath('/production/assembly', 'employee', ['view:assemblybatch'])).toBe(true);
    expect(canViewPath('/production/assembly', 'employee', ['view:departmentexecution'])).toBe(false);
  });
});
