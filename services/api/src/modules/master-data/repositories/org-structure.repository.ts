import {
  PrismaClient,
  Prisma,
  Factory,
  Department,
  WorkCenter,
  WarehouseLocation,
  Employee,
  SalesChannel,
  LifecycleStatus
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class OrgStructureRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // ==========================================
  // Factory Operations
  // ==========================================
  async findFactoryById(id: string): Promise<Factory | null> {
    return this.prisma.factory.findUnique({ where: { id }, include: { departments: true, locations: true } });
  }

  async findFactoryByCode(code: string): Promise<Factory | null> {
    return this.prisma.factory.findUnique({ where: { code } });
  }

  async findFirstFactory(): Promise<Factory | null> {
    return this.prisma.factory.findFirst({
      where: { status: { in: ['ACTIVE', 'APPROVED'] } },
      orderBy: { createdAt: 'asc' }
    });
  }

  async listFactories(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Factory[]; total: number }> {
    const where: Prisma.FactoryWhereInput = {};
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.factory.findMany({ where, skip: params?.skip, take: params?.take, orderBy: { code: 'asc' } }),
      this.prisma.factory.count({ where })
    ]);
    return { items, total };
  }

  async createFactory(data: Prisma.FactoryCreateInput): Promise<Factory> {
    return this.prisma.factory.create({ data });
  }

  async updateFactory(id: string, data: Prisma.FactoryUpdateInput): Promise<Factory> {
    return this.prisma.factory.update({ where: { id }, data });
  }

  async countFactoryActiveReferences(factoryId: string): Promise<{
    departments: number;
    locations: number;
  }> {
    const activeStatuses: LifecycleStatus[] = ['APPROVED', 'ACTIVE'];
    const [departments, locations] = await Promise.all([
      this.prisma.department.count({ where: { factoryId, status: { in: activeStatuses } } }),
      this.prisma.warehouseLocation.count({ where: { factoryId, status: { in: activeStatuses } } })
    ]);
    return { departments, locations };
  }

  // ==========================================
  // Department Operations
  // ==========================================
  async findDepartmentById(id: string): Promise<Department | null> {
    return this.prisma.department.findUnique({ where: { id }, include: { factory: true, workCenters: true } });
  }

  async findDepartmentByCode(code: string): Promise<Department | null> {
    return this.prisma.department.findUnique({ where: { code } });
  }

  async listDepartments(params?: {
    factoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Department[]; total: number }> {
    const where: Prisma.DepartmentWhereInput = {};
    if (params?.factoryId) where.factoryId = params.factoryId;
    if (params?.status === 'ACTIVE') {
      where.status = { in: ['ACTIVE', 'APPROVED'] };
    } else if (params?.status) {
      where.status = params.status;
    }
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { departmentHead: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [rawItems, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: {
          factory: true,
          employees: {
            select: { firstName: true, lastName: true, role: true, designation: true },
            take: 5
          },
          usersAssigned: {
            select: { name: true, role: true },
            take: 3
          }
        },
        orderBy: { code: 'asc' }
      }),
      this.prisma.department.count({ where })
    ]);

    const items = rawItems.map((item) => {
      let resolvedHead = item.departmentHead;
      if (!resolvedHead) {
        const headEmployee = item.employees.find((e) =>
          /head|incharge|in-charge|manager|lead|supervisor/i.test(`${e.role} ${e.designation}`)
        );
        if (headEmployee) {
          resolvedHead = `${headEmployee.firstName} ${headEmployee.lastName}`.trim();
        } else if (item.usersAssigned.length > 0) {
          resolvedHead = item.usersAssigned[0].name;
        } else if (item.employees.length > 0) {
          resolvedHead = `${item.employees[0].firstName} ${item.employees[0].lastName}`.trim();
        }
      }

      return {
        ...item,
        departmentHead: resolvedHead || null
      };
    });

    return { items, total };
  }

  async createDepartment(data: Prisma.DepartmentCreateInput): Promise<Department> {
    return this.prisma.department.create({ data });
  }

  async updateDepartment(id: string, data: Prisma.DepartmentUpdateInput): Promise<Department> {
    return this.prisma.department.update({ where: { id }, data });
  }

  async countDepartmentActiveReferences(departmentId: string): Promise<{
    workCenters: number;
    employees: number;
    routeSteps: number;
  }> {
    const activeStatuses: LifecycleStatus[] = ['APPROVED', 'ACTIVE'];
    const [workCenters, employees, routeSteps] = await Promise.all([
      this.prisma.workCenter.count({ where: { departmentId, status: { in: activeStatuses } } }),
      this.prisma.employee.count({ where: { departmentId, status: { in: activeStatuses } } }),
      this.prisma.routeStep.count({ where: { departmentId, status: { in: activeStatuses } } })
    ]);
    return { workCenters, employees, routeSteps };
  }

  // ==========================================
  // WorkCenter Operations
  // ==========================================
  async findWorkCenterById(id: string): Promise<WorkCenter | null> {
    return this.prisma.workCenter.findUnique({ where: { id }, include: { department: true } });
  }

  async findWorkCenterByCode(code: string): Promise<WorkCenter | null> {
    return this.prisma.workCenter.findUnique({ where: { code } });
  }

  async listWorkCenters(params?: {
    departmentId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WorkCenter[]; total: number }> {
    const where: Prisma.WorkCenterWhereInput = {};
    if (params?.departmentId) where.departmentId = params.departmentId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.workCenter.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { department: true },
        orderBy: { code: 'asc' }
      }),
      this.prisma.workCenter.count({ where })
    ]);
    return { items, total };
  }

  async createWorkCenter(data: Prisma.WorkCenterCreateInput): Promise<WorkCenter> {
    return this.prisma.workCenter.create({ data });
  }

  async updateWorkCenter(id: string, data: Prisma.WorkCenterUpdateInput): Promise<WorkCenter> {
    return this.prisma.workCenter.update({ where: { id }, data });
  }

  async countWorkCenterActiveReferences(workCenterId: string): Promise<{
    routeSteps: number;
    wastageRules: number;
  }> {
    const activeStatuses: LifecycleStatus[] = ['APPROVED', 'ACTIVE'];
    const [routeSteps, wastageRules] = await Promise.all([
      this.prisma.routeStep.count({ where: { workCenterId, status: { in: activeStatuses } } }),
      this.prisma.wastageRule.count({ where: { workCenterId, status: { in: activeStatuses } } })
    ]);
    return { routeSteps, wastageRules };
  }

  // ==========================================
  // WarehouseLocation Operations
  // ==========================================
  async findLocationById(id: string): Promise<WarehouseLocation | null> {
    return this.prisma.warehouseLocation.findUnique({ where: { id }, include: { factory: true } });
  }

  async findLocationByCode(code: string): Promise<WarehouseLocation | null> {
    return this.prisma.warehouseLocation.findUnique({ where: { code } });
  }

  async listLocations(params?: {
    factoryId?: string;
    type?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WarehouseLocation[]; total: number }> {
    const where: Prisma.WarehouseLocationWhereInput = {};
    if (params?.factoryId) where.factoryId = params.factoryId;
    if (params?.type) where.type = params.type;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.warehouseLocation.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { factory: true },
        orderBy: { code: 'asc' }
      }),
      this.prisma.warehouseLocation.count({ where })
    ]);
    return { items, total };
  }

  async createLocation(data: Prisma.WarehouseLocationCreateInput): Promise<WarehouseLocation> {
    return this.prisma.warehouseLocation.create({ data });
  }

  async updateLocation(id: string, data: Prisma.WarehouseLocationUpdateInput): Promise<WarehouseLocation> {
    return this.prisma.warehouseLocation.update({ where: { id }, data });
  }

  // ==========================================
  // Employee Operations
  // ==========================================
  async findEmployeeById(id: string): Promise<Employee | null> {
    return this.prisma.employee.findUnique({ where: { id }, include: { department: true } });
  }

  async findEmployeeByCode(employeeCode: string): Promise<Employee | null> {
    return this.prisma.employee.findUnique({ where: { employeeCode } });
  }

  async findEmployeeByEmail(email: string): Promise<Employee | null> {
    return this.prisma.employee.findUnique({ where: { email } });
  }

  async listEmployees(params?: {
    departmentId?: string;
    role?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Employee[]; total: number }> {
    const where: Prisma.EmployeeWhereInput = {};
    if (params?.departmentId) where.departmentId = params.departmentId;
    if (params?.role) where.role = params.role;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { employeeCode: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { department: true },
        orderBy: { employeeCode: 'asc' }
      }),
      this.prisma.employee.count({ where })
    ]);
    return { items, total };
  }

  async createEmployee(data: Prisma.EmployeeCreateInput): Promise<Employee> {
    return this.prisma.employee.create({ data });
  }

  async updateEmployee(id: string, data: Prisma.EmployeeUpdateInput): Promise<Employee> {
    return this.prisma.employee.update({ where: { id }, data });
  }

  // ==========================================
  // SalesChannel Operations
  // ==========================================
  async findSalesChannelById(id: string): Promise<SalesChannel | null> {
    return this.prisma.salesChannel.findUnique({ where: { id } });
  }

  async findSalesChannelByCode(code: string): Promise<SalesChannel | null> {
    return this.prisma.salesChannel.findUnique({ where: { code } });
  }

  async listSalesChannels(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: SalesChannel[]; total: number }> {
    const where: Prisma.SalesChannelWhereInput = {};
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.salesChannel.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { code: 'asc' }
      }),
      this.prisma.salesChannel.count({ where })
    ]);
    return { items, total };
  }

  async createSalesChannel(data: Prisma.SalesChannelCreateInput): Promise<SalesChannel> {
    return this.prisma.salesChannel.create({ data });
  }

  async updateSalesChannel(id: string, data: Prisma.SalesChannelUpdateInput): Promise<SalesChannel> {
    return this.prisma.salesChannel.update({ where: { id }, data });
  }
}
