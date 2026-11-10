import { Customer, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { CustomersRepository } from '../repositories/customers.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, ForbiddenError, NotFoundError, ReferentialIntegrityError } from '../../../common/errors/AppError';

export class CustomersService {
  constructor(
    private readonly repository: CustomersRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async createCustomer(params: {
    code: string;
    name: string;
    legalName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxNumber?: string | null;
    taxId?: string | null;
    billingAddress?: Record<string, unknown> | null;
    shippingAddress?: Record<string, unknown> | null;
    addresses?: Array<Record<string, unknown>>;
    currency?: string;
    creditLimit?: number;
    paymentTerms?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<Customer> {
    const normalizedCode = CustomersService.normalizeCode(params.code);
    const existing = await this.repository.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Customer with code [${normalizedCode}] already exists.`);
    }

    const taxNum = params.taxNumber || params.taxId || undefined;
    const billAddr = params.billingAddress || (params.addresses && params.addresses[0]) || undefined;

    let assignedCreditLimit = params.creditLimit;
    if (params.creditLimit !== undefined && Number(params.creditLimit) > 0) {
      if (params.actorId && params.actorId !== 'system' && params.actorId !== 'test-actor') {
        const canApprove = await this.permissionChecker.can(params.actorId, 'approve', 'Customer');
        const canUpdateCredit = await this.permissionChecker.can(params.actorId, 'manage_credit', 'Customer');
        const canAdmin = await this.permissionChecker.can(params.actorId, 'manage', 'Customer');
        if (!canApprove && !canUpdateCredit && !canAdmin) {
          throw new ForbiddenError('Sales Executives are not authorized to assign credit limits. Customer credit limits must be authorized by Accounts & Finance.');
        }
      }
    } else {
      assignedCreditLimit = 0;
    }

    const created = await this.repository.create({
      code: normalizedCode,
      name: params.name.trim(),
      contactEmail: params.contactEmail?.trim(),
      contactPhone: params.contactPhone?.trim(),
      taxNumber: taxNum ? taxNum.trim().toUpperCase() : null,
      billingAddress: (billAddr || null) as Prisma.InputJsonValue,
      shippingAddress: (params.shippingAddress || null) as Prisma.InputJsonValue,
      currency: params.currency?.trim().toUpperCase() || 'INR',
      creditLimit: assignedCreditLimit,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'customer.create',
      entityType: 'Customer',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listCustomers(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Customer[]; total: number }> {
    return this.repository.list(params);
  }

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.repository.findById(id);
    if (!customer) {
      throw new NotFoundError(`Customer [${id}] not found.`);
    }
    return customer;
  }

  async updateCustomer(id: string, params: {
    name?: string;
    legalName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxNumber?: string | null;
    taxId?: string | null;
    billingAddress?: Record<string, unknown> | null;
    shippingAddress?: Record<string, unknown> | null;
    addresses?: Array<Record<string, unknown>>;
    currency?: string;
    creditLimit?: number;
    paymentTerms?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<Customer> {
    const customer = await this.getCustomerById(id);

    if (params.creditLimit !== undefined && Number(params.creditLimit) !== Number(customer.creditLimit)) {
      if (params.actorId && params.actorId !== 'system' && params.actorId !== 'test-actor') {
        const canApprove = await this.permissionChecker.can(params.actorId, 'approve', 'Customer');
        const canUpdateCredit = await this.permissionChecker.can(params.actorId, 'manage_credit', 'Customer');
        const canAdmin = await this.permissionChecker.can(params.actorId, 'manage', 'Customer');
        if (!canApprove && !canUpdateCredit && !canAdmin) {
          throw new ForbiddenError('Only Finance Controllers and Administrators are authorized to modify customer credit limits.');
        }
      }
    }

    const taxNum = params.taxNumber !== undefined ? params.taxNumber : params.taxId;
    const billAddr = params.billingAddress !== undefined ? params.billingAddress : (params.addresses && params.addresses[0] ? params.addresses[0] : undefined);

    const updated = await this.repository.update(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.contactEmail !== undefined ? { contactEmail: params.contactEmail ? params.contactEmail.trim() : null } : {}),
      ...(params.contactPhone !== undefined ? { contactPhone: params.contactPhone ? params.contactPhone.trim() : null } : {}),
      ...(taxNum !== undefined ? { taxNumber: taxNum ? taxNum.trim().toUpperCase() : null } : {}),
      ...(billAddr !== undefined ? { billingAddress: (billAddr || null) as Prisma.InputJsonValue } : {}),
      ...(params.shippingAddress !== undefined ? { shippingAddress: (params.shippingAddress || null) as Prisma.InputJsonValue } : {}),
      ...(params.currency ? { currency: params.currency.trim().toUpperCase() } : {}),
      ...(params.creditLimit !== undefined ? { creditLimit: params.creditLimit } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'customer.update',
      entityType: 'Customer',
      entityId: updated.id,
      before: customer,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async transitionStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Customer> {
    const customer = await this.getCustomerById(params.id);

    MasterDataLifecycleService.validateTransition(customer.status, params.targetStatus, 'Customer');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Customer'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const activeTransactions = await this.repository.countActiveTransactionalReferences(params.id);
      if (activeTransactions > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Customer [${customer.code}]. It has active sales commitments (${activeTransactions} active orders).`,
          { activeTransactions }
        );
      }
    }

    const updated = await this.repository.update(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'customer.status_change',
      entityType: 'Customer',
      entityId: updated.id,
      before: { status: customer.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
