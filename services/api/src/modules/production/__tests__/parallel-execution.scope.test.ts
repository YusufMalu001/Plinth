jest.mock('../../../database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    productionPlan: { findUnique: jest.fn(), findMany: jest.fn() },
    material: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    unitOfMeasure: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('../../notifications/notification.service', () => ({ notificationService: { notifyDepartment: jest.fn(), notifyRoles: jest.fn() } }));

import { prisma } from '../../../database';
import { ParallelExecutionService, productionActorScope } from '../services/parallel-execution.service';

const db = prisma as jest.Mocked<typeof prisma>;
const role = (name: string) => ({ role: { name } });

describe('production actor scope', () => {
  beforeEach(() => jest.clearAllMocks());

  it('grants all-department scope only to approved manager roles', async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ role: 'manager', assignedDepartmentId: 'dept-a', employeeRefId: null, userRoles: [role('production_manager')] });
    expect((await productionActorScope('manager-a')).global).toBe(true);
    (db.user.findUnique as jest.Mock).mockResolvedValue({ role: 'manager', assignedDepartmentId: 'dept-a', employeeRefId: null, userRoles: [] });
    await expect(productionActorScope('generic-manager')).rejects.toThrow();
  });

  it('restricts an operator to assigned workstation tasks', async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ role: 'employee', assignedDepartmentId: 'dept-a', employeeRefId: 'employee-a', userRoles: [role('shop_floor_operator')] });
    const scope = await productionActorScope('operator-a');
    expect(scope).toMatchObject({ global: false, departmentId: 'dept-a', employeeId: 'employee-a', operator: true });
    (db.productionPlan.findMany as jest.Mock).mockResolvedValue([]);
    await new ParallelExecutionService().listSchedules('operator-a');
    const query = (db.productionPlan.findMany as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(query.where)).toContain('employee-a');
    expect(JSON.stringify(query.where)).toContain('dept-a');
  });

  it('rejects direct schedule detail access when no own task or Assembly intake is present', async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ role: 'employee', assignedDepartmentId: 'dept-a', employeeRefId: null, userRoles: [role('department_incharge')] });
    (db.productionPlan.findUnique as jest.Mock).mockResolvedValue({ id: 'plan-b', route: { assemblyDepartmentId: 'assembly-b' }, batches: [], taskMaterialAssignments: [] });
    await expect(new ParallelExecutionService().getSchedule('plan-b', 'incharge-a')).rejects.toThrow();
    const query = (db.productionPlan.findUnique as jest.Mock).mock.calls[0][0];
    expect(query.include.batches.where).toEqual({ departmentId: 'dept-a' });
    expect(query.include.taskMaterialAssignments.where).toEqual({ destinationDepartmentId: 'dept-a' });
  });
});
