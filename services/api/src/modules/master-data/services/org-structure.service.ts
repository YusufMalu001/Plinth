import {
  Factory,
  Department,
  WorkCenter,
  WarehouseLocation,
  Employee,
  SalesChannel,
  LifecycleStatus,
  Prisma
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { OrgStructureRepository } from '../repositories/org-structure.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ReferentialIntegrityError, ValidationError } from '../../../common/errors/AppError';

export class OrgStructureService {
  constructor(
    private readonly repository: OrgStructureRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  // ============================================================================
  // FACTORY
  // ============================================================================

  async createFactory(params: {
    code: string;
    name: string;
    location?: string | null;
    address?: Record<string, unknown> | null;
    actorId: string;
    requestId?: string;
  }): Promise<Factory> {
    const normalizedCode = OrgStructureService.normalizeCode(params.code);
    const existing = await this.repository.findFactoryByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Factory with code [${normalizedCode}] already exists.`);
    }

    const addr = params.address || (params.location ? { location: params.location } : null);

    const created = await this.repository.createFactory({
      code: normalizedCode,
      name: params.name.trim(),
      address: (addr || null) as Prisma.InputJsonValue,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'factory.create',
      entityType: 'Factory',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listFactories(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Factory[]; total: number }> {
    return this.repository.listFactories(params);
  }

  async getFactoryById(id: string): Promise<Factory> {
    const factory = await this.repository.findFactoryById(id);
    if (!factory) throw new NotFoundError(`Factory [${id}] not found.`);
    return factory;
  }

  async updateFactory(id: string, params: {
    name?: string;
    location?: string | null;
    address?: Record<string, unknown> | null;
    actorId: string;
    requestId?: string;
  }): Promise<Factory> {
    const factory = await this.getFactoryById(id);

    const addr = params.address !== undefined ? params.address : (params.location ? { location: params.location } : undefined);

    const updated = await this.repository.updateFactory(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(addr !== undefined ? { address: (addr || null) as Prisma.InputJsonValue } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'factory.update',
      entityType: 'Factory',
      entityId: updated.id,
      before: factory,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionFactoryStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Factory> {
    const factory = await this.getFactoryById(params.id);

    MasterDataLifecycleService.validateTransition(factory.status, params.targetStatus, 'Factory');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Factory'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countFactoryActiveReferences(params.id);
      if (refs.departments > 0 || refs.locations > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Factory [${factory.code}]. It has active departments (${refs.departments}) or locations (${refs.locations}).`,
          refs
        );
      }
    }

    const updated = await this.repository.updateFactory(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'factory.status_change',
      entityType: 'Factory',
      entityId: updated.id,
      before: { status: factory.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // DEPARTMENT
  // ============================================================================

  async createDepartment(params: {
    code?: string;
    name: string;
    departmentHead?: string | null;
    description?: string | null;
    factoryId?: string;
    isAssembly?: boolean;
    actorId: string;
    requestId?: string;
  }): Promise<Department> {
    const rawCode = params.code || `DEPT-${params.name.replace(/[^A-Za-z0-9]/g, '-').slice(0, 15).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const normalizedCode = OrgStructureService.normalizeCode(rawCode);
    const existing = await this.repository.findDepartmentByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Department with code [${normalizedCode}] already exists.`);
    }

    let targetFactoryId = params.factoryId;
    if (!targetFactoryId) {
      const defaultFactory = await this.repository.findFirstFactory();
      if (!defaultFactory) {
        throw new ValidationError('No active factory found to associate with the department.');
      }
      targetFactoryId = defaultFactory.id;
    }

    const factory = await this.getFactoryById(targetFactoryId);
    MasterDataLifecycleService.assertIsReferenceable('Factory', factory.id, factory.status);

    const created = await this.repository.createDepartment({
      code: normalizedCode,
      name: params.name.trim(),
      departmentHead: params.departmentHead?.trim() || null,
      description: params.description?.trim() || null,
      isAssembly: Boolean(params.isAssembly),
      factory: { connect: { id: targetFactoryId } },
      status: 'ACTIVE'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'department.create',
      entityType: 'Department',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listDepartments(params?: {
    factoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Department[]; total: number }> {
    return this.repository.listDepartments(params);
  }

  async getDepartmentById(id: string): Promise<Department> {
    const department = await this.repository.findDepartmentById(id);
    if (!department) throw new NotFoundError(`Department [${id}] not found.`);
    return department;
  }

  async updateDepartment(id: string, params: {
    name?: string;
    departmentHead?: string | null;
    description?: string | null;
    factoryId?: string;
    isAssembly?: boolean;
    actorId: string;
    requestId?: string;
  }): Promise<Department> {
    const department = await this.getDepartmentById(id);
    if (params.factoryId) {
      const factory = await this.getFactoryById(params.factoryId);
      MasterDataLifecycleService.assertIsReferenceable('Factory', factory.id, factory.status);
    }

    const updated = await this.repository.updateDepartment(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.departmentHead !== undefined ? { departmentHead: params.departmentHead ? params.departmentHead.trim() : null } : {}),
      ...(params.description !== undefined ? { description: params.description ? params.description.trim() : null } : {}),
      ...(params.factoryId ? { factory: { connect: { id: params.factoryId } } } : {}),
      ...(params.isAssembly !== undefined ? { isAssembly: Boolean(params.isAssembly) } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'department.update',
      entityType: 'Department',
      entityId: updated.id,
      before: department,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionDepartmentStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Department> {
    const department = await this.getDepartmentById(params.id);

    MasterDataLifecycleService.validateTransition(department.status, params.targetStatus, 'Department');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Department'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countDepartmentActiveReferences(params.id);
      if (refs.workCenters > 0 || refs.employees > 0 || refs.routeSteps > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Department [${department.code}]. It has active references (${refs.workCenters} work centers, ${refs.employees} employees, ${refs.routeSteps} route steps).`,
          refs
        );
      }
    }

    const updated = await this.repository.updateDepartment(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'department.status_change',
      entityType: 'Department',
      entityId: updated.id,
      before: { status: department.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // WORK CENTER
  // ============================================================================

  async createWorkCenter(params: {
    code: string;
    name: string;
    departmentId: string;
    capacityPerHour?: number;
    costPerHour?: number;
    actorId: string;
    requestId?: string;
  }): Promise<WorkCenter> {
    const normalizedCode = OrgStructureService.normalizeCode(params.code);
    const existing = await this.repository.findWorkCenterByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`WorkCenter with code [${normalizedCode}] already exists.`);
    }

    const dept = await this.getDepartmentById(params.departmentId);
    MasterDataLifecycleService.assertIsReferenceable('Department', dept.id, dept.status);

    const created = await this.repository.createWorkCenter({
      code: normalizedCode,
      name: params.name.trim(),
      capacityPerHour: params.capacityPerHour,
      department: { connect: { id: params.departmentId } },
      // Work centers are operational stations managed by the plant team. They
      // are immediately usable after creation; route approval remains the
      // control point for releasing the complete manufacturing sequence.
      status: 'ACTIVE'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'work_center.create',
      entityType: 'WorkCenter',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listWorkCenters(params?: {
    departmentId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WorkCenter[]; total: number }> {
    return this.repository.listWorkCenters(params);
  }

  async getWorkCenterById(id: string): Promise<WorkCenter> {
    const wc = await this.repository.findWorkCenterById(id);
    if (!wc) throw new NotFoundError(`WorkCenter [${id}] not found.`);
    return wc;
  }

  async updateWorkCenter(id: string, params: {
    name?: string;
    departmentId?: string;
    capacityPerHour?: number;
    costPerHour?: number;
    actorId: string;
    requestId?: string;
  }): Promise<WorkCenter> {
    const wc = await this.getWorkCenterById(id);
    if (params.departmentId) {
      const dept = await this.getDepartmentById(params.departmentId);
      MasterDataLifecycleService.assertIsReferenceable('Department', dept.id, dept.status);
    }

    const updated = await this.repository.updateWorkCenter(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.departmentId ? { department: { connect: { id: params.departmentId } } } : {}),
      ...(params.capacityPerHour !== undefined ? { capacityPerHour: params.capacityPerHour } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'work_center.update',
      entityType: 'WorkCenter',
      entityId: updated.id,
      before: wc,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionWorkCenterStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<WorkCenter> {
    const wc = await this.getWorkCenterById(params.id);

    MasterDataLifecycleService.validateTransition(wc.status, params.targetStatus, 'WorkCenter');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'WorkCenter'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countWorkCenterActiveReferences(params.id);
      if (refs.routeSteps > 0 || refs.wastageRules > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate WorkCenter [${wc.code}]. It has active references (${refs.routeSteps} route steps, ${refs.wastageRules} wastage rules).`,
          refs
        );
      }
    }

    const updated = await this.repository.updateWorkCenter(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'work_center.status_change',
      entityType: 'WorkCenter',
      entityId: updated.id,
      before: { status: wc.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // WAREHOUSE LOCATION
  // ============================================================================

  async createWarehouseLocation(params: {
    code: string;
    name: string;
    factoryId?: string | null;
    type?: string;
    locationType?: string;
    actorId: string;
    requestId?: string;
  }): Promise<WarehouseLocation> {
    const normalizedCode = OrgStructureService.normalizeCode(params.code);
    const existing = await this.repository.findLocationByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`WarehouseLocation with code [${normalizedCode}] already exists.`);
    }

    if (params.factoryId) {
      const factory = await this.getFactoryById(params.factoryId);
      MasterDataLifecycleService.assertIsReferenceable('Factory', factory.id, factory.status);
    }

    const locationType = params.type || params.locationType || 'STORAGE';

    const created = await this.repository.createLocation({
      code: normalizedCode,
      name: params.name.trim(),
      type: locationType.trim().toUpperCase(),
      ...(params.factoryId ? { factory: { connect: { id: params.factoryId } } } : {}),
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'warehouse_location.create',
      entityType: 'WarehouseLocation',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listLocations(params?: {
    factoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WarehouseLocation[]; total: number }> {
    return this.repository.listLocations(params);
  }

  async getLocationById(id: string): Promise<WarehouseLocation> {
    const loc = await this.repository.findLocationById(id);
    if (!loc) throw new NotFoundError(`WarehouseLocation [${id}] not found.`);
    return loc;
  }

  async updateLocation(id: string, params: {
    name?: string;
    factoryId?: string | null;
    type?: string;
    locationType?: string;
    actorId: string;
    requestId?: string;
  }): Promise<WarehouseLocation> {
    const loc = await this.getLocationById(id);
    if (params.factoryId) {
      const factory = await this.getFactoryById(params.factoryId);
      MasterDataLifecycleService.assertIsReferenceable('Factory', factory.id, factory.status);
    }

    const type = params.type || params.locationType;

    const updated = await this.repository.updateLocation(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(type ? { type: type.trim().toUpperCase() } : {}),
      ...(params.factoryId !== undefined
        ? params.factoryId
          ? { factory: { connect: { id: params.factoryId } } }
          : { factory: { disconnect: true } }
        : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'warehouse_location.update',
      entityType: 'WarehouseLocation',
      entityId: updated.id,
      before: loc,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionLocationStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<WarehouseLocation> {
    const loc = await this.getLocationById(params.id);

    MasterDataLifecycleService.validateTransition(loc.status, params.targetStatus, 'WarehouseLocation');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'WarehouseLocation'
      });
    }

    const updated = await this.repository.updateLocation(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'warehouse_location.status_change',
      entityType: 'WarehouseLocation',
      entityId: updated.id,
      before: { status: loc.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // EMPLOYEE MASTER
  // ============================================================================

  async createEmployee(params: {
    employeeCode?: string;
    code?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email: string;
    phone?: string | null;
    contactPhone?: string | null;
    role?: string;
    designation?: string | null;
    departmentId?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<Employee> {
    const rawCode = params.employeeCode || params.code || `EMP-${Date.now()}`;
    const normalizedCode = OrgStructureService.normalizeCode(rawCode);
    const existing = await this.repository.findEmployeeByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Employee with code [${normalizedCode}] already exists.`);
    }

    if (params.departmentId) {
      const dept = await this.getDepartmentById(params.departmentId);
      MasterDataLifecycleService.assertIsReferenceable('Department', dept.id, dept.status);
    }

    const parts = params.name ? params.name.trim().split(' ') : [];
    const firstName = params.firstName || parts[0] || 'Employee';
    const lastName = params.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : 'Staff');

    const created = await this.repository.createEmployee({
      employeeCode: normalizedCode,
      firstName,
      lastName,
      email: params.email.trim().toLowerCase(),
      phone: params.phone || params.contactPhone || null,
      role: params.role || params.designation || 'OPERATOR',
      ...(params.departmentId ? { department: { connect: { id: params.departmentId } } } : {}),
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'employee.create',
      entityType: 'Employee',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listEmployees(params?: {
    departmentId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Employee[]; total: number }> {
    return this.repository.listEmployees(params);
  }

  async getEmployeeById(id: string): Promise<Employee> {
    const emp = await this.repository.findEmployeeById(id);
    if (!emp) throw new NotFoundError(`Employee [${id}] not found.`);
    return emp;
  }

  async updateEmployee(id: string, params: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    role?: string;
    departmentId?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<Employee> {
    const emp = await this.getEmployeeById(id);
    if (params.departmentId) {
      const dept = await this.getDepartmentById(params.departmentId);
      MasterDataLifecycleService.assertIsReferenceable('Department', dept.id, dept.status);
    }

    const updated = await this.repository.updateEmployee(id, {
      ...(params.firstName ? { firstName: params.firstName.trim() } : {}),
      ...(params.lastName ? { lastName: params.lastName.trim() } : {}),
      ...(params.email ? { email: params.email.trim().toLowerCase() } : {}),
      ...(params.phone !== undefined ? { phone: params.phone } : {}),
      ...(params.role ? { role: params.role } : {}),
      ...(params.departmentId !== undefined
        ? params.departmentId
          ? { department: { connect: { id: params.departmentId } } }
          : { department: { disconnect: true } }
        : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'employee.update',
      entityType: 'Employee',
      entityId: updated.id,
      before: emp,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionEmployeeStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Employee> {
    const emp = await this.getEmployeeById(params.id);

    MasterDataLifecycleService.validateTransition(emp.status, params.targetStatus, 'Employee');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Employee'
      });
    }

    const updated = await this.repository.updateEmployee(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'employee.status_change',
      entityType: 'Employee',
      entityId: updated.id,
      before: { status: emp.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // SALES CHANNELS
  // ============================================================================

  async createSalesChannel(params: {
    code: string;
    name: string;
    description?: string | null;
    currency?: string;
    type?: string;
    actorId: string;
    requestId?: string;
  }): Promise<SalesChannel> {
    const normalizedCode = OrgStructureService.normalizeCode(params.code);
    const existing = await this.repository.findSalesChannelByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`SalesChannel with code [${normalizedCode}] already exists.`);
    }

    const created = await this.repository.createSalesChannel({
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description,
      currency: params.currency?.trim().toUpperCase() || 'INR',
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'sales_channel.create',
      entityType: 'SalesChannel',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listSalesChannels(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: SalesChannel[]; total: number }> {
    return this.repository.listSalesChannels(params);
  }

  async getSalesChannelById(id: string): Promise<SalesChannel> {
    const sc = await this.repository.findSalesChannelById(id);
    if (!sc) throw new NotFoundError(`SalesChannel [${id}] not found.`);
    return sc;
  }

  async updateSalesChannel(id: string, params: {
    name?: string;
    description?: string | null;
    currency?: string;
    actorId: string;
    requestId?: string;
  }): Promise<SalesChannel> {
    const sc = await this.getSalesChannelById(id);

    const updated = await this.repository.updateSalesChannel(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.currency ? { currency: params.currency.trim().toUpperCase() } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'sales_channel.update',
      entityType: 'SalesChannel',
      entityId: updated.id,
      before: sc,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionSalesChannelStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<SalesChannel> {
    const sc = await this.getSalesChannelById(params.id);

    MasterDataLifecycleService.validateTransition(sc.status, params.targetStatus, 'SalesChannel');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'SalesChannel'
      });
    }

    const updated = await this.repository.updateSalesChannel(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'sales_channel.status_change',
      entityType: 'SalesChannel',
      entityId: updated.id,
      before: { status: sc.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
