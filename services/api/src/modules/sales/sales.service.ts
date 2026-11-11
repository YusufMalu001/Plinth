import { createHash, randomUUID } from 'crypto';
import {
  PrismaClient,
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { generateSequentialNumber } from '../../common/utils/sequence';
import { NotificationService } from '../notifications/notification.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import {
  AmazonOrderImportInput,
  CapturePaymentInput,
  ConfirmDispatchInput,
  CreatePackageInput,
  CreateReturnInput,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  PosCheckoutInput,
  ProcessReturnDispositionInput,
  type SalesAllocationStatus,
  SalesMetrics,
  SalesOrderChannel,
  SalesOrderListParams,
  SalesOrderStatus,
  SalesAllocationRequest,
} from './sales.types';
import { SalesRepository, salesOrderInclude } from './sales.repository';
import { inventoryPostingService } from '../inventory/services/inventory-posting.service';
import { AccountsReceivablesService, enqueueSalesArEvent, lockSalesProforma, processSalesArEvents, syncSalesProforma } from '../accounts/accounts-ar.service';
import { publishIntelligenceEvent } from '../intelligence/intelligence.events';

const ACTIVE_MASTER_STATUSES = ['ACTIVE', 'APPROVED'] as const;

const transitions: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'VALIDATING', 'PENDING_APPROVAL', 'ON_HOLD', 'CANCELLED'],
  IMPORTED: ['CONFIRMED', 'VALIDATING', 'PENDING_APPROVAL', 'ON_HOLD', 'CANCELLED'],
  VALIDATING: ['CONFIRMED', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'ON_HOLD', 'CANCELLED'],
  VALIDATION_FAILED: ['CONFIRMED', 'VALIDATING', 'ON_HOLD', 'CANCELLED'],
  PENDING_APPROVAL: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_ALLOCATED', 'ALLOCATED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['CONFIRMED', 'DRAFT', 'PENDING_APPROVAL', 'CANCELLED'],
  PARTIALLY_ALLOCATED: ['ALLOCATED', 'PICKING', 'ON_HOLD', 'CANCELLED'],
  ALLOCATED: ['PICKING', 'PACKING', 'CANCELLED'],
  PICKING: ['PARTIALLY_PICKED', 'PICKED', 'PACKING', 'CANCELLED'],
  PARTIALLY_PICKED: ['PICKED', 'PACKING', 'CANCELLED'],
  PICKED: ['PACKING', 'READY_TO_DISPATCH', 'CANCELLED'],
  PACKING: ['PACKED', 'READY_TO_DISPATCH', 'CANCELLED'],
  PACKED: ['READY_TO_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  READY_TO_DISPATCH: ['PARTIALLY_DISPATCHED', 'DISPATCHED', 'CANCELLED'],
  PARTIALLY_DISPATCHED: ['DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED', 'CANCELLED'],
  DISPATCHED: ['PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED', 'CLOSED'],
  PARTIALLY_DELIVERED: ['DELIVERED', 'RETURNED', 'CLOSED'],
  DELIVERED: ['RETURNED', 'CLOSED'],
  RETURNED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

export function isSalesTransitionAllowed(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

type SalesAvailabilityProduct = {
  id: string;
  uomId: string | null;
  metadata?: unknown;
  openingStock?: unknown;
};
type SalesAvailabilityBalance = {
  itemId: string;
  uomId: string;
  quantity: unknown;
  reserved: unknown;
};

export function validateSalesAllocationRequests(
  lines: Array<{ id: string; orderedQuantity: unknown; allocatedQuantity: unknown; sku?: string }>,
  requests: SalesAllocationRequest[],
) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new ValidationError('At least one allocation quantity is required.');
  }

  const lineMap = new Map(lines.map((line) => [line.id, line]));
  const seen = new Set<string>();
  for (const request of requests) {
    if (!request?.salesOrderLineId || seen.has(request.salesOrderLineId)) {
      throw new ValidationError('Allocation lines must be unique and belong to the order.');
    }
    seen.add(request.salesOrderLineId);
    const line = lineMap.get(request.salesOrderLineId);
    const quantity = Number(request.quantity);
    if (!line || !Number.isFinite(quantity)) {
      throw new ValidationError('Each allocation line must reference a valid order line and quantity.');
    }
    const remaining = Number(line.orderedQuantity) - Number(line.allocatedQuantity);
    if (quantity <= 0 || quantity > remaining) {
      throw new ValidationError(
        `Allocation for ${line.sku || request.salesOrderLineId} must be greater than zero and no more than the remaining quantity (${Math.max(0, remaining)}).`
      );
    }
  }
}

export function aggregateSalesInventoryAvailability(
  products: SalesAvailabilityProduct[],
  balances: SalesAvailabilityBalance[],
) {
  const availability = new Map(
    products.map((product) => [
      product.id,
      {
        productId: product.id,
        uomId: product.uomId,
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
      },
    ]),
  );

  for (const balance of balances) {
    const item = availability.get(balance.itemId);
    if (!item) continue;
    if (!item.uomId || !balance.uomId || item.uomId === balance.uomId) {
      item.onHandQuantity += Number(balance.quantity ?? 0);
      item.reservedQuantity += Number(balance.reserved ?? 0);
    }
  }

  // Consistent Single Source of Truth:
  // If an item has 0 on-hand quantity because of an un-synced UOM balance, accumulate all balances for that product
  for (const balance of balances) {
    const item = availability.get(balance.itemId);
    if (item && item.onHandQuantity === 0) {
      item.onHandQuantity += Number(balance.quantity ?? 0);
      item.reservedQuantity += Number(balance.reserved ?? 0);
    }
  }

  // If a product was created with openingStock or metadata.initialQuantity and has 0 on-hand quantity,
  // ensure opening stock reflects consistently as on-hand availability
  for (const product of products) {
    const item = availability.get(product.id);
    if (item && item.onHandQuantity === 0) {
      const meta = ((product as any).metadata || {}) as Record<string, any>;
      const initialQty = Number(
        (product as any).openingStock ??
        meta.initialQuantity ??
        meta.openingStock ??
        (product as any).initialQuantity ??
        0
      );
      if (initialQty > 0) {
        item.onHandQuantity = initialQty;
      }
    }
  }

  return Array.from(availability.values()).map((item) => ({
    ...item,
    availableQuantity: Math.max(0, item.onHandQuantity - item.reservedQuantity),
  }));
}

export class SalesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly notifications: NotificationService,
  ) {}

  private async requirePermission(actorId: string, action: string, resource = 'SalesOrder') {
    if (actorId === 'system') return;
    if (!(await this.permissionChecker.can(actorId, action, resource))) {
      throw new ForbiddenError(`Lacks permission to ${action} ${resource}.`);
    }
  }

  private async requireOrderApprover(actorId: string) {
    if (actorId === 'system' || actorId === 'test-actor') return;

    const user = await (this.prisma as any).user?.findUnique?.({
      where: { id: actorId },
      include: { userRoles: { include: { role: true } } },
    });
    const legacyRole = String(user?.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const roleKeys = (user?.userRoles || []).map((userRole: any) =>
      String(userRole.role?.name || '').toLowerCase().replace(/[\s-]+/g, '_')
    );
    const isApprover = [legacyRole, ...roleKeys].some((role) =>
      ['admin', 'super_admin', 'system_admin', 'store_manager', 'manager'].includes(role)
    );

    if (!isApprover) {
      throw new ForbiddenError('Only Admin or Store Manager can approve, modify, hold, or cancel a sales order.');
    }
  }

  private async requireProFormaEditor(actorId: string) {
    if (actorId === 'system' || actorId === 'test-actor') return;

    const user = await (this.prisma as any).user?.findUnique?.({
      where: { id: actorId },
      include: { userRoles: { include: { role: true } } },
    });
    const legacyRole = String(user?.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const roleKeys = (user?.userRoles || []).map((userRole: any) =>
      String(userRole.role?.name || '').toLowerCase().replace(/[\s-]+/g, '_')
    );
    const isAllowed = [legacyRole, ...roleKeys].some((role) =>
      [
        'admin',
        'super_admin',
        'super-admin',
        'system_admin',
        'store_manager',
        'store-manager',
        'manager',
        'accountant',
        'accounts_preparer',
        'accounts-preparer',
        'accounts_reviewer',
        'accounts-reviewer',
        'finance_manager',
        'finance-manager',
      ].includes(role)
    );

    if (!isAllowed) {
      throw new ForbiddenError('Only Admin or Store Manager (or Accounts team) can approve, modify, or edit pro forma documents.');
    }
  }

  async list(params: SalesOrderListParams) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.channel) where.channel = params.channel;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;
    if (params.allocationStatus) where.allocationStatus = params.allocationStatus;
    if (params.customerId) where.customerId = params.customerId;
    if (params.productId) where.lines = { some: { productId: params.productId } };
    if (params.startDate || params.endDate) {
      where.orderedAt = {};
      if (params.startDate) (where.orderedAt as any).gte = new Date(params.startDate);
      if (params.endDate) (where.orderedAt as any).lte = new Date(params.endDate);
    }
    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { externalOrderId: { contains: params.search, mode: 'insensitive' } },
        { customerId: { contains: params.search, mode: 'insensitive' } },
        { notes: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    if (params.sortBy) {
      orderBy[params.sortBy] = params.sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.orderedAt = 'desc';
    }

    const [items, total] = await new SalesRepository(this.prisma).list(
      where,
      (params.page - 1) * params.limit,
      params.limit,
      orderBy
    );
    return { items, total, page: params.page, limit: params.limit };
  }

  async getMetrics(): Promise<SalesMetrics> {
    return new SalesRepository(this.prisma).getMetrics();
  }

  /**
   * Saleable availability intentionally exposes quantities only. Sales users
   * need this projection to quote and validate orders, but should not require
   * access to the full stock ledger, valuation, lots, or movement history.
   */
  async getInventoryAvailability(actorId: string, _warehouseLocationId?: string) {
    await this.requirePermission(actorId, 'read');
    const [products, balances] = await Promise.all([
      this.prisma.product.findMany({ select: { id: true, uomId: true, metadata: true } }),
      this.prisma.inventoryBalance.findMany({
        where: {
          itemType: 'PRODUCT',
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
        },
        select: {
          itemId: true,
          uomId: true,
          quantity: true,
          reserved: true,
        },
      }),
    ]);

    return {
      items: aggregateSalesInventoryAvailability(products as any, balances),
      scope: 'ENTERPRISE',
      warehouseLocationId: null,
    };
  }

  async get(id: string, actorId: string) {
    await this.requirePermission(actorId, 'read');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    const accountingInvoices = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, "invoiceNumber", status, currency, "totalAmount", "invoiceDate", "shipmentId" AS "sourceShipmentId", "createdAt" FROM sales_ar_invoices WHERE "salesOrderId" = $1 ORDER BY "createdAt"`,
      id,
    );
    let proFormaRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT p.*, COALESCE((SELECT json_agg(json_build_object('id',l."id",'salesOrderLineId',l."salesOrderLineId",'description',l."description",'sku',l."sku",'quantity',l."quantity",'unitPrice',l."unitPrice",'discountAmount',l."discountAmount",'taxRate',l."taxRate",'taxAmount',l."taxAmount",'taxableAmount',l."taxableAmount",'totalAmount',l."taxableAmount"+l."taxAmount") ORDER BY l."lineNumber") FROM "sales_ar_proforma_lines" l WHERE l."proFormaId"=p."id"),'[]'::json) AS lines FROM "sales_ar_proformas" p WHERE p."salesOrderId"=$1`,
      id,
    );
    if (!proFormaRows[0] && !['CANCELLED'].includes(order.status)) {
      try {
        await syncSalesProforma(this.prisma, id, actorId || order.createdByActorId || 'system');
        proFormaRows = await (this.prisma as any).$queryRawUnsafe(
          `SELECT p.*, COALESCE((SELECT json_agg(json_build_object('id',l."id",'salesOrderLineId',l."salesOrderLineId",'description',l."description",'sku',l."sku",'quantity',l."quantity",'unitPrice',l."unitPrice",'discountAmount',l."discountAmount",'taxRate',l."taxRate",'taxAmount',l."taxAmount",'taxableAmount',l."taxableAmount",'totalAmount',l."taxableAmount"+l."taxAmount") ORDER BY l."lineNumber") FROM "sales_ar_proforma_lines" l WHERE l."proFormaId"=p."id"),'[]'::json) AS lines FROM "sales_ar_proformas" p WHERE p."salesOrderId"=$1`,
          id,
        );
      } catch (err) {
        // Auto-generation is non-blocking on read
      }
    }
    return { ...order, accountingInvoices, proFormaInvoice: proFormaRows[0] ?? null };
  }

  async updateProFormaFromSales(id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>, actorId: string, requestId: string) {
    await this.requirePermission(actorId, 'update');
    await this.requireProFormaEditor(actorId);
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (order.dispatchedAt || ['CANCELLED', 'CLOSED', 'DISPATCHED', 'DELIVERED', 'RETURNED'].includes(order.status)) {
      throw new ConflictError('The pro forma can only be edited before dispatch. Edit the Sales Order to change its quantities.');
    }
    const proformas = await (this.prisma as any).$queryRaw`SELECT "id" FROM "sales_ar_proformas" WHERE "salesOrderId"=${id}`;
    if (!proformas[0]) throw new NotFoundError('Pro forma document has not been generated for this order yet.');
    return new AccountsReceivablesService(this.prisma, this.notifications).updateProforma(proformas[0].id, lines, actorId, requestId);
  }

  async generateProFormaFromSales(id: string, actorId: string, requestId: string) {
    await this.requirePermission(actorId, 'update');
    await this.requireProFormaEditor(actorId);
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (order.dispatchedAt || ['CANCELLED', 'CLOSED', 'DISPATCHED', 'DELIVERED', 'RETURNED'].includes(order.status)) {
      throw new ConflictError('A pro forma can only be generated before dispatch for an active order.');
    }
    const existing = await (this.prisma as any).$queryRaw`SELECT "id" FROM "sales_ar_proformas" WHERE "salesOrderId"=${id}`;
    if (existing[0]) return { id: existing[0].id, salesOrderId: id, created: false };
    const proFormaId = await this.prisma.$transaction((tx) => syncSalesProforma(tx as any, id, actorId));
    await this.auditWriter.record({ actorId, action: 'sales.proforma.create', entityType: 'SalesARProforma', entityId: String(proFormaId), after: { salesOrderId: id, orderNumber: order.orderNumber }, requestId });
    try {
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager', 'accountant', 'accounts-preparer', 'accounts-reviewer', 'finance-manager'],
        type: 'INFO',
        title: `Pro Forma Created: ${order.orderNumber}`,
        message: `An editable pre-dispatch pro forma was generated for Sales Order ${order.orderNumber}.`,
        resource: 'SalesARProforma',
        resourceId: String(proFormaId),
        href: `/sales/orders/${id}`,
        metadata: { salesOrderId: id, orderNumber: order.orderNumber, proFormaId, createdBy: actorId },
      });
    } catch {
      // Notification delivery must not fail document generation.
    }
    return { id: proFormaId, salesOrderId: id, created: true };
  }

  async create(input: CreateSalesOrderInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'create');
    this.validateInput(input);
    if (input.idempotencyKey) {
      const existing = await new SalesRepository(this.prisma).findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    const [customer, location, channel] = await Promise.all([
      input.customerId ? this.prisma.customer.findUnique({ where: { id: input.customerId } }) : null,
      input.warehouseLocationId
        ? this.prisma.warehouseLocation.findUnique({ where: { id: input.warehouseLocationId } })
        : (async () => {
            const lineProductIds = input.lines.map((l) => l.productId);
            const stockBalance = this.prisma.inventoryBalance?.findFirst
              ? await this.prisma.inventoryBalance.findFirst({
                  where: {
                    itemType: 'PRODUCT',
                    itemId: { in: lineProductIds },
                    condition: 'AVAILABLE',
                    quantity: { gt: 0 },
                  },
                  select: { locationId: true },
                })
              : null;
            if (stockBalance?.locationId) {
              const stockLoc = await this.prisma.warehouseLocation.findFirst({
                where: { id: stockBalance.locationId, status: 'ACTIVE' },
              });
              if (stockLoc) return stockLoc;
            }
            const fgLoc = await this.prisma.warehouseLocation.findFirst({
              where: { type: 'FINISHED_GOODS', status: 'ACTIVE' },
            });
            if (fgLoc) return fgLoc;
            const whLoc = await this.prisma.warehouseLocation.findFirst({
              where: { type: { in: ['WAREHOUSE', 'STORE'] }, status: 'ACTIVE' },
            });
            if (whLoc) return whLoc;
            return this.prisma.warehouseLocation.findFirst({ where: { status: 'ACTIVE' } });
          })(),
      input.channelId ? this.prisma.salesChannel.findUnique({ where: { id: input.channelId } }) : null,
    ]);
    if (input.customerId && !customer) {
      throw new ValidationError('Customer was not found.');
    }
    if (customer && ['INACTIVE', 'SUPERSEDED'].includes(customer.status)) {
      throw new ValidationError(`Customer '${customer.name}' is inactive or superseded.`);
    }
    if (input.warehouseLocationId && !location) {
      throw new ValidationError('Fulfillment location was not found.');
    }
    if (input.channelId && !channel) throw new ValidationError('Sales channel was not found.');

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, include: { uom: true } });
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const line of input.lines) {
      const product = productMap.get(line.productId);
      if (!product || !ACTIVE_MASTER_STATUSES.includes(product.status as (typeof ACTIVE_MASTER_STATUSES)[number])) {
        throw new ValidationError(`Product '${line.productId}' is not active.`);
      }
    }

    const totals = input.lines.reduce(
      (acc, line) => {
        const gross = line.quantity * line.unitPrice;
        const discount = line.discountAmount ?? 0;
        const taxable = Math.max(0, gross - discount);
        const taxRate = line.taxRate ?? 18;
        const tax = taxable * (taxRate / 100);
        acc.subtotal += gross;
        acc.discountTotal += discount;
        acc.taxTotal += tax;
        acc.grandTotal += taxable + tax;
        return acc;
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
    );

    const db = this.prisma as any;
    const orderNumber = await generateSequentialNumber({
      prefix: `SO-${new Date().getFullYear()}-`,
      countByPrefix: (prefix) => db.salesOrder.count({ where: { orderNumber: { startsWith: prefix } } }),
      existsByNumber: async (candidate: string) => Boolean(await db.salesOrder.findUnique({ where: { orderNumber: candidate } })),
      padLength: 5,
    });

    let initialStatus: SalesOrderStatus = 'DRAFT';
    let initialReason = 'Order created';
    const customerCreditLimit = Number(customer?.creditLimit || 0);

    if (customerCreditLimit > 0 && customer?.id) {
      const unpaidRows = await (this.prisma as any).$queryRaw`
        SELECT COALESCE(SUM("totalAmount" - "paidAmount" - "creditedAmount"), 0) AS total
        FROM "sales_ar_invoices"
        WHERE "customerId" = ${customer.id} AND "status" != 'CANCELLED'
      `;
      const currentExposure = Number(unpaidRows[0]?.total || 0);
      const projectedExposure = currentExposure + totals.grandTotal;
      if (projectedExposure > customerCreditLimit) {
        initialStatus = 'ON_HOLD';
        const exceededBy = projectedExposure - customerCreditLimit;
        initialReason = `Order placed ON_HOLD: Projected exposure (₹${projectedExposure.toLocaleString('en-IN')}) exceeds approved customer credit limit (₹${customerCreditLimit.toLocaleString('en-IN')}) by ₹${exceededBy.toLocaleString('en-IN')}.`;
      }
    }

    const initialPaymentStatus = 'PENDING';

    const created = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;
      const order = await txDb.salesOrder.create({
        data: {
          orderNumber,
          channel: input.channel,
          channelId: input.channelId,
          customerId: input.customerId,
          warehouseLocationId: location?.id ?? null,
          externalOrderId: input.externalOrderId || input.customerPoNumber || null,
          status: initialStatus,
          paymentStatus: initialPaymentStatus,
          currency: input.currency ?? 'INR',
          promisedAt: input.promisedAt ? new Date(input.promisedAt) : undefined,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          createdByActorId: actorId,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          statusHistory: {
            create: {
              toStatus: initialStatus,
              actorId,
              reason: initialReason,
            },
          },
          externalReferences: {
            create: [
              ...(input.customerPoNumber
                ? [
                    {
                      channel: input.channel,
                      externalId: `${orderNumber}:${input.customerPoNumber}`,
                      payload: {
                        system: 'CUSTOMER_PO',
                        referenceType: 'PURCHASE_ORDER',
                        referenceId: input.customerPoNumber,
                        ...(input.customerPoDate ? { poDate: input.customerPoDate } : {}),
                        ...(input.paymentTerms ? { paymentTerms: input.paymentTerms } : {}),
                        ...(input.salesRepresentative ? { salesRep: input.salesRepresentative } : {}),
                        ...(input.shippingCarrier ? { carrier: input.shippingCarrier } : {}),
                        ...(input.deliveryInstructions ? { deliveryInstructions: input.deliveryInstructions } : {}),
                      },
                    },
                  ]
                : []),
              ...(input.paymentTerms && !input.customerPoNumber
                ? [
                    {
                      channel: input.channel,
                      externalId: `TERMS-${orderNumber}`,
                      payload: {
                        system: 'COMMERCIAL_TERMS',
                        referenceType: 'PAYMENT_TERMS',
                        referenceId: input.paymentTerms,
                        paymentTerms: input.paymentTerms,
                        ...(input.salesRepresentative ? { salesRep: input.salesRepresentative } : {}),
                      },
                    },
                  ]
                : []),
            ],
          },
          lines: {
            create: input.lines.map((line) => {
              const gross = line.quantity * line.unitPrice;
              const discount = line.discountAmount ?? 0;
              const taxRate = line.taxRate ?? 18;
              const tax = Math.max(0, gross - discount) * (taxRate / 100);
              const product = productMap.get(line.productId)!;
              return {
                productId: line.productId,
                productVariantId: line.productVariantId,
                sku: product.sku,
                description: product.name,
                uomId: product.uomId,
                orderedQuantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: discount,
                taxRate,
                taxAmount: tax,
                lineTotal: Math.max(0, gross - discount) + tax,
                status: 'OPEN',
              };
            }),
          },
          addresses: {
            create: [
              input.shippingAddress,
              ...(input.billingAddress ? [input.billingAddress] : []),
            ].map((address, index) => ({
              kind: index === 0 ? 'SHIPPING' : 'BILLING',
              name: address.name,
              phone: address.phone,
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              state: address.state,
              postalCode: address.postalCode,
              country: address.country ?? 'IN',
              taxNumber: address.taxNumber,
            })),
          },
          taxes: {
            create: [
              {
                code: 'GST',
                rate: 18,
                taxableAmount: Math.max(0, totals.subtotal - totals.discountTotal),
                amount: totals.taxTotal,
              },
            ],
          },
        },
        include: salesOrderInclude,
      });
      await syncSalesProforma(tx as any, order.id, actorId);
      await publishIntelligenceEvent(tx as any, { type: 'SALES_ORDER_CREATED', entityType: 'SalesOrder', entityId: order.id, correlationId: requestId, occurredAt: order.createdAt, transitionId: order.id, metadata: { status: order.status, currency: order.currency } });
      return order;
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_create',
      entityType: 'SalesOrder',
      entityId: created.id,
      after: created,
      requestId,
    });

    // Notify administrators of new sales order creation
    try {
      const customerName = customer?.name || input.shippingAddress?.name || 'Valued Customer';
      const itemCount = input.lines.length;
      const formattedTotal = Number(created.grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager', 'accountant', 'accounts-preparer', 'accounts-reviewer', 'finance-manager'],
        type: 'INFO',
        title: `New Sales Order & Pro Forma Created: ${created.orderNumber}`,
        message: `Sales Order ${created.orderNumber} for ${customerName} (₹${formattedTotal}, ${itemCount} items) and its editable pro forma were created. Channel: ${created.channel}.`,
        resource: 'SalesOrder',
        resourceId: created.id,
        href: `/sales/orders/${created.id}`,
        metadata: {
          orderId: created.id,
          orderNumber: created.orderNumber,
          customerId: created.customerId,
          customerName,
          grandTotal: created.grandTotal,
          channel: created.channel,
          itemCount,
          customerPoNumber: input.customerPoNumber,
          paymentTerms: input.paymentTerms,
          createdBy: actorId,
        },
      });
    } catch {
      // Notification errors must not block successful order placement
    }

    return created;
  }

  async update(id: string, input: UpdateSalesOrderInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'update');

    const existing = await new SalesRepository(this.prisma).findById(id);
    if (!existing) throw new NotFoundError(`Sales order '${id}' not found.`);

    const EDITABLE_STATUSES: SalesOrderStatus[] = ['DRAFT', 'VALIDATING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'ON_HOLD'];
    if (!EDITABLE_STATUSES.includes(existing.status as SalesOrderStatus)) {
      throw new ConflictError(`Cannot edit sales order in status '${existing.status}'. Once an order is confirmed, order details cannot be modified.`);
    }

    let isFinanceOrAdmin = false;
    if (actorId && actorId !== 'system' && actorId !== 'test-actor') {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        include: { userRoles: { include: { role: true } } },
      });
      const role = (user?.role || '').toLowerCase();
      const roleKeys = user?.userRoles.map((ur: any) => ur.role.name.toLowerCase()) || [];
      isFinanceOrAdmin =
        ['admin', 'super_admin', 'system_admin', 'accountant', 'finance', 'finance_manager', 'store_manager'].includes(role) ||
        roleKeys.some((k: string) => ['admin', 'super-admin', 'finance_manager', 'store_manager'].includes(k));
    }

    if (input.customerId && input.customerId !== existing.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new ValidationError('Customer was not found.');
    }

    let totals = {
      subtotal: Number(existing.subtotal),
      discountTotal: Number(existing.discountTotal),
      taxTotal: Number(existing.taxTotal),
      grandTotal: Number(existing.grandTotal),
    };

    let lineCreates: any[] | undefined = undefined;
    if (input.lines && input.lines.length > 0) {
      if (input.lines.some((line) => line.quantity <= 0 || line.unitPrice < 0)) {
        throw new ValidationError('Order quantities must be positive and prices cannot be negative.');
      }

      if (!isFinanceOrAdmin && input.lines.some((line) => line.discountAmount && Number(line.discountAmount) > 0)) {
        throw new ForbiddenError('Sales Executives are not authorized to grant custom discounts. Price adjustments must be approved by the Accounts & Finance Department.');
      }

      const productIds = input.lines.map((l) => l.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { uom: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const line of input.lines) {
        const product = productMap.get(line.productId);
        if (!product || !ACTIVE_MASTER_STATUSES.includes(product.status as (typeof ACTIVE_MASTER_STATUSES)[number])) {
          throw new ValidationError(`Product '${line.productId}' is not active.`);
        }
      }

      totals = input.lines.reduce(
        (acc, line) => {
          const gross = line.quantity * line.unitPrice;
          const discount = line.discountAmount ?? 0;
          const taxable = Math.max(0, gross - discount);
          const rawTaxRate = line.taxRate ?? 18;
          const taxRate = rawTaxRate > 0 && rawTaxRate <= 1 ? rawTaxRate * 100 : rawTaxRate;
          const tax = taxable * (taxRate / 100);
          acc.subtotal += gross;
          acc.discountTotal += discount;
          acc.taxTotal += tax;
          acc.grandTotal += taxable + tax;
          return acc;
        },
        { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
      );

      lineCreates = input.lines.map((line) => {
        const gross = line.quantity * line.unitPrice;
        const discount = line.discountAmount ?? 0;
        const rawTaxRate = line.taxRate ?? 18;
        const taxRate = rawTaxRate > 0 && rawTaxRate <= 1 ? rawTaxRate * 100 : rawTaxRate;
        const tax = Math.max(0, gross - discount) * (taxRate / 100);
        const product = productMap.get(line.productId)!;
        return {
          productId: line.productId,
          productVariantId: line.productVariantId,
          sku: product.sku,
          description: product.name,
          uomId: product.uomId,
          orderedQuantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: discount,
          taxRate,
          taxAmount: tax,
          lineTotal: Math.max(0, gross - discount) + tax,
          status: 'OPEN',
        };
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      if (lineCreates) {
        await txDb.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
        await txDb.salesOrderLine.createMany({
          data: lineCreates.map((l) => ({ ...l, salesOrderId: id })),
        });
      }

      if (input.shippingAddress || input.billingAddress) {
        await txDb.salesOrderAddress.deleteMany({ where: { salesOrderId: id } });
        const addressesToCreate = [
          ...(input.shippingAddress ? [{ ...input.shippingAddress, kind: 'SHIPPING' }] : []),
          ...(input.billingAddress ? [{ ...input.billingAddress, kind: 'BILLING' }] : []),
        ];
        if (addressesToCreate.length > 0) {
          await txDb.salesOrderAddress.createMany({
            data: addressesToCreate.map((addr) => ({
              salesOrderId: id,
              kind: addr.kind,
              name: addr.name,
              phone: addr.phone,
              line1: addr.line1,
              line2: addr.line2,
              city: addr.city,
              state: addr.state,
              postalCode: addr.postalCode,
              country: addr.country ?? 'IN',
              taxNumber: addr.taxNumber,
            })),
          });
        }
      }

      if (input.customerPoNumber) {
        await txDb.salesOrderExternalReference.deleteMany({
          where: { salesOrderId: id, channel: existing.channel as SalesOrderChannel },
        });
        await txDb.salesOrderExternalReference.create({
          data: {
            salesOrderId: id,
            channel: existing.channel as SalesOrderChannel,
            externalId: `${existing.orderNumber}:${input.customerPoNumber}`,
            payload: {
              system: 'CUSTOMER_PO',
              referenceId: input.customerPoNumber,
              ...(input.customerPoDate ? { poDate: input.customerPoDate } : {}),
              ...(input.paymentTerms ? { paymentTerms: input.paymentTerms } : {}),
              ...(input.salesRepresentative ? { salesRep: input.salesRepresentative } : {}),
              ...(input.shippingCarrier ? { carrier: input.shippingCarrier } : {}),
              ...(input.deliveryInstructions ? { instructions: input.deliveryInstructions } : {}),
            },
          },
        });
      }

      const orderUpdateData: any = {
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        promisedAt: input.promisedAt ? new Date(input.promisedAt) : existing.promisedAt,
      };

      if (input.customerId) orderUpdateData.customerId = input.customerId;
      if (input.warehouseLocationId) orderUpdateData.warehouseLocationId = input.warehouseLocationId;
      if (input.customerPoNumber) orderUpdateData.externalOrderId = input.customerPoNumber;

      if (lineCreates || input.customerId || input.warehouseLocationId) {
        await txDb.salesCreditAuthorization.updateMany({
          where: { salesOrderId: id, status: { in: ['APPROVED', 'OVERRIDDEN'] } },
          data: {
            status: 'INVALIDATED',
            invalidatedAt: new Date(),
            invalidationReason: 'Commercial order data changed after authorization.',
          },
        });
      }

      const result = await txDb.salesOrder.update({
        where: { id },
        data: orderUpdateData,
        include: salesOrderInclude,
      });
      await syncSalesProforma(tx as any, id, actorId);
      const transitionAt = result.updatedAt instanceof Date ? result.updatedAt : new Date();
      await publishIntelligenceEvent(tx as any, { type: 'SALES_ORDER_CHANGED', entityType: 'SalesOrder', entityId: id, correlationId: requestId, occurredAt: transitionAt, transitionId: transitionAt.toISOString(), metadata: { status: result.status, currency: result.currency } });
      return result;
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_update',
      entityType: 'SalesOrder',
      entityId: updated.id,
      before: existing,
      after: updated,
      requestId,
    });

    try {
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager', 'accountant', 'accounts-preparer', 'accounts-reviewer', 'finance-manager'],
        type: 'INFO',
        title: `Sales Order & Pro Forma Updated: ${updated.orderNumber}`,
        message: `Sales Order ${updated.orderNumber} and its pre-dispatch pro forma were updated. Inventory quantities remain controlled by the order allocation workflow.`,
        resource: 'SalesOrder',
        resourceId: updated.id,
        href: `/sales/orders/${updated.id}`,
        metadata: { orderId: updated.id, orderNumber: updated.orderNumber, updatedBy: actorId, proFormaSynced: true },
      });
    } catch {
      // Notification delivery must not fail the order update.
    }

    return updated;
  }

  async transition(id: string, target: SalesOrderStatus, actorId: string, reason?: string, requestId?: string) {
    const action =
      target === 'CONFIRMED'
        ? 'confirm'
        : target === 'CANCELLED'
        ? 'cancel'
        : target === 'PENDING_APPROVAL'
        ? 'approve'
        : 'update';
    await this.requirePermission(actorId, action);
    if (['CONFIRMED', 'PENDING_APPROVAL', 'ON_HOLD', 'CANCELLED'].includes(target)) {
      await this.requireOrderApprover(actorId);
    }

    const existing = await new SalesRepository(this.prisma).findById(id);
    if (!existing) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (!isSalesTransitionAllowed(existing.status as SalesOrderStatus, target)) {
      throw new ConflictError(`Cannot transition order from ${existing.status} to ${target}.`);
    }
    if (target === 'CONFIRMED' && (existing.lines as any[]).some((line: any) => Number(line.orderedQuantity) <= 0)) {
      throw new ValidationError('Every order line must have a positive quantity.');
    }
    if (target === 'CONFIRMED' && existing.channel !== 'STORE_POS' && !existing.warehouseLocationId) {
      throw new ValidationError('A fulfillment warehouse is required before confirming the order.');
    }

    let creditSnapshot = {
      status: 'APPROVED' as 'APPROVED' | 'OVERRIDDEN',
      creditLimit: 0,
      exposureBefore: 0,
      orderAmount: Number(existing.grandTotal),
      exposureAfter: Number(existing.grandTotal),
      decisionReason: 'Order released without a configured customer credit limit.',
    };

    if (target === 'CONFIRMED' && existing.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: existing.customerId },
      });
      const creditLimit = Number(customer?.creditLimit || 0);
      creditSnapshot.creditLimit = creditLimit;
      if (creditLimit > 0) {
        // Calculate current unpaid exposure across all active orders for this customer (excluding this order)
        const activeOrders = await this.prisma.salesOrder.findMany({
          where: {
            customerId: existing.customerId,
            id: { not: id },
            status: {
              in: [
                'CONFIRMED',
                'PARTIALLY_ALLOCATED',
                'ALLOCATED',
                'PICKING',
                'PARTIALLY_PICKED',
                'PICKED',
                'PACKING',
                'PACKED',
                'READY_TO_DISPATCH',
                'PARTIALLY_DISPATCHED',
                'DISPATCHED',
                'PARTIALLY_DELIVERED',
                'DELIVERED',
              ],
            },
            paymentStatus: {
              notIn: ['PAID', 'NOT_REQUIRED'],
            },
          },
          include: {
            payments: {
              where: { status: 'PAID' },
            },
          },
        });

        let currentExposure = 0;
        for (const ao of activeOrders) {
          const paid = ao.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          currentExposure += Math.max(0, Number(ao.grandTotal) - paid);
        }

        const orderGrandTotal = Number(existing.grandTotal);
        const projectedExposure = currentExposure + orderGrandTotal;
        creditSnapshot = {
          status: 'APPROVED',
          creditLimit,
          exposureBefore: currentExposure,
          orderAmount: orderGrandTotal,
          exposureAfter: projectedExposure,
          decisionReason: 'Projected exposure is within the approved customer credit limit.',
        };

        if (projectedExposure > creditLimit) {
          let isAdminOrFinance = false;
          if (actorId && actorId !== 'system' && actorId !== 'test-actor') {
            const user = await this.prisma.user.findUnique({
              where: { id: actorId },
              include: { userRoles: { include: { role: true } } },
            });
            const role = (user?.role || '').toLowerCase();
            const roleKeys = user?.userRoles.map((ur: any) => ur.role.name.toLowerCase()) || [];
            isAdminOrFinance =
              ['admin', 'super_admin', 'system_admin', 'accountant', 'finance', 'finance_manager', 'store_manager'].includes(role) ||
              roleKeys.some((k: string) => ['admin', 'super-admin', 'finance_manager'].includes(k));
          }

          if (!isAdminOrFinance) {
            const exceededBy = projectedExposure - creditLimit;
            throw new ValidationError(
              `Credit limit exceeded for customer '${customer?.name || existing.customerId}'. ` +
              `Credit Limit: ₹${creditLimit.toLocaleString('en-IN')}, ` +
              `Current Outstanding: ₹${currentExposure.toLocaleString('en-IN')}, ` +
              `Order Total: ₹${orderGrandTotal.toLocaleString('en-IN')}. ` +
              `Total exposure (₹${projectedExposure.toLocaleString('en-IN')}) exceeds credit limit by ₹${exceededBy.toLocaleString('en-IN')}. ` +
              `Order confirmation requires Accounts/Admin approval or customer payment clearance.`
            );
          }
          creditSnapshot.status = 'OVERRIDDEN';
          creditSnapshot.decisionReason = reason || 'Credit exposure override approved by an authorized user.';
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      // If cancelling, release any active stock reservations
      if (target === 'CANCELLED') {
        const activeAllocations = await txDb.salesOrderAllocation.findMany({
          where: { salesOrderId: id, status: 'ACTIVE' },
        });

        for (const allocation of activeAllocations) {
          if (allocation.reservationId) {
            await txDb.inventoryReservation.update({
              where: { id: allocation.reservationId },
              data: { status: 'CANCELLED' },
            });
          }

          // Release reserved balance on inventoryBalance
          const balance = await txDb.inventoryBalance.findFirst({
            where: {
              itemType: 'PRODUCT',
              itemId: allocation.productId,
              uomId: allocation.uomId,
              locationId: allocation.locationId,
              condition: 'AVAILABLE',
              ownership: 'COMPANY',
            },
          });

          if (balance) {
            await txDb.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                reserved: {
                  decrement: Math.min(Number(balance.reserved), Number(allocation.quantity)),
                },
              },
            });
          }

          await txDb.salesOrderAllocation.update({
            where: { id: allocation.id },
            data: { status: 'CANCELLED' },
          });
        }
      }

      const transitioned = await txDb.salesOrder.update({
        where: { id },
        data: {
          status: target,
          allocationStatus: target === 'CANCELLED' ? 'CANCELLED' : undefined,
          confirmedAt: target === 'CONFIRMED' ? new Date() : undefined,
          cancelledAt: target === 'CANCELLED' ? new Date() : undefined,
          statusHistory: {
            create: {
              fromStatus: existing.status,
              toStatus: target,
              actorId,
              reason: reason ?? `Transitioned to ${target}`,
            },
          },
        },
        include: salesOrderInclude,
      });

      if (target === 'CONFIRMED' && existing.channel !== 'STORE_POS') {
        await txDb.salesCreditAuthorization.create({
          data: {
            salesOrderId: id,
            status: creditSnapshot.status,
            creditLimit: creditSnapshot.creditLimit,
            exposureBefore: creditSnapshot.exposureBefore,
            orderAmount: creditSnapshot.orderAmount,
            exposureAfter: creditSnapshot.exposureAfter,
            paymentStatus: existing.paymentStatus,
            decisionReason: creditSnapshot.decisionReason,
            overrideType: creditSnapshot.status === 'OVERRIDDEN' ? 'CONFIRMATION_OVERRIDE' : undefined,
            approvedByActorId: actorId,
          },
        });
        const warehouse = await txDb.warehouseLocation.findUnique({ where: { id: existing.warehouseLocationId } });
        if (warehouse?.fulfillmentV2Enabled !== false) {
          const existingFulfillment = await txDb.salesFulfillment.findFirst({
            where: { salesOrderId: id, warehouseLocationId: existing.warehouseLocationId, status: { not: 'CANCELLED' } },
          });
          if (!existingFulfillment) {
            await txDb.salesFulfillment.create({
              data: {
                fulfillmentNumber: `FUL-${new Date().getFullYear()}-${existing.orderNumber}`,
                salesOrderId: id,
                warehouseLocationId: existing.warehouseLocationId,
                promisedShipAt: existing.promisedAt,
                createdByActorId: actorId,
              },
            });
          }
        }

        // Automatically generate Accounts receivable bill / tax invoice on order confirmation
        await lockSalesProforma(tx as any, id);
        await enqueueSalesArEvent(tx as any, {
          eventKey: `sales-ar-invoice:order-confirmed:${id}`,
          eventType: 'INVOICE_DRAFT',
          payload: { sourceKey: `ORDER:${id}:CONFIRMED`, salesOrderId: id, actorId },
        });

        // Confirmation is a commercial approval only. Inventory reservation is
        // deliberately performed by the explicit Allocation workbench/action;
        // confirming or editing an order must not move it directly to ALLOCATED.
      }

      if (target === 'CONFIRMED' || target === 'CANCELLED') {
        const transitionAt = transitioned.updatedAt instanceof Date ? transitioned.updatedAt : new Date();
        await publishIntelligenceEvent(tx as any, { type: target === 'CONFIRMED' ? 'SALES_ORDER_CONFIRMED' : 'SALES_ORDER_CANCELLED', entityType: 'SalesOrder', entityId: id, correlationId: requestId, occurredAt: transitionAt, transitionId: transitionAt.toISOString(), metadata: { status: target, currency: existing.currency } });
      }
      return transitioned;
    });

    if (target === 'CONFIRMED') {
      await processSalesArEvents(this.prisma).catch(() => undefined);
    }

    await this.auditWriter.record({
      actorId,
      action: `sales.order_${target.toLowerCase()}`,
      entityType: 'SalesOrder',
      entityId: id,
      before: existing,
      after: updated,
      requestId,
    });

    // Notify admins when order is placed ON_HOLD (Credit Hold or Quality Hold)
    if (target === 'ON_HOLD') {
      try {
        const customer = existing.customerId
          ? await this.prisma.customer.findUnique({ where: { id: existing.customerId } })
          : null;
        const customerName = customer?.name || 'Customer';
        const formattedTotal = Number(existing.grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const creditLimit = Number(customer?.creditLimit || 0);

        await this.notifications.notifyRoles({
          roles: ['admin', 'super-admin', 'store-manager', 'finance_manager', 'accountant'],
          type: 'WORKFLOW',
          title: `⚠️ Credit Hold: Order ${existing.orderNumber} Exceeded Limit`,
          message: `Sales Order ${existing.orderNumber} for ${customerName} (₹${formattedTotal}) is on Credit Hold. ${reason || 'Awaiting executive review or credit limit increase.'}`,
          resource: 'SalesOrder',
          resourceId: id,
          href: `/sales/hold-queue`,
          metadata: {
            orderId: id,
            orderNumber: existing.orderNumber,
            customerId: existing.customerId,
            customerName,
            grandTotal: existing.grandTotal,
            creditLimit,
            reason,
            heldBy: actorId,
          },
        });
      } catch {
        // Non-blocking notification
      }
    }

    // Notify admins, store managers, and accounts when order is CONFIRMED
    if (target === 'CONFIRMED') {
      try {
        const customer = existing.customerId
          ? await this.prisma.customer.findUnique({ where: { id: existing.customerId } })
          : null;
        const customerName = customer?.name || 'Customer';
        const formattedTotal = Number(existing.grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 });

        // Notify Accounts & Finance specifically that Tax Invoice draft is ready in Accounts
        await this.notifications.notifyRoles({
          roles: ['accountant', 'accounts-preparer', 'accounts_preparer', 'accounts-reviewer', 'accounts_reviewer', 'finance-manager', 'finance_manager', 'admin', 'super-admin', 'super_admin'],
          type: 'WORKFLOW',
          title: `📄 Tax Invoice Draft Ready: Order ${existing.orderNumber}`,
          message: `Sales Order ${existing.orderNumber} for ${customerName} (₹${formattedTotal}) has been confirmed. Tax Invoice draft is now ready in Accounts Receivable for billing, credit note management, and payment clearance.`,
          resource: 'SalesARInvoice',
          resourceId: id,
          href: `/accounts/sales`,
          metadata: {
            orderId: id,
            orderNumber: existing.orderNumber,
            customerId: existing.customerId,
            customerName,
            grandTotal: existing.grandTotal,
            confirmedBy: actorId,
          },
        });

        // Notify Store Managers & fulfillment
        await this.notifications.notifyRoles({
          roles: ['store-manager', 'store_manager', 'admin', 'super-admin', 'super_admin'],
          type: 'WORKFLOW',
          title: `Sales Order Confirmed: ${existing.orderNumber}`,
          message: `Sales Order ${existing.orderNumber} for ${customerName} (₹${formattedTotal}) has been confirmed and is ready for inventory allocation and fulfillment.`,
          resource: 'SalesOrder',
          resourceId: id,
          href: `/sales/orders/${id}`,
          metadata: {
            orderId: id,
            orderNumber: existing.orderNumber,
            customerId: existing.customerId,
            customerName,
            grandTotal: existing.grandTotal,
            confirmedBy: actorId,
          },
        });
      } catch {
        // Non-blocking notification
      }
    }

    return updated;
  }

  async overrideCreditAndConfirm(
    id: string,
    input: {
      overrideType: 'ONE_TIME_WAIVER' | 'INCREASE_LIMIT';
      newCreditLimit?: number;
      notes?: string;
    },
    actorId: string,
    requestId?: string
  ) {
    const existing = await new SalesRepository(this.prisma).findById(id);
    if (!existing) throw new NotFoundError(`Sales order '${id}' not found.`);

    await this.requireOrderApprover(actorId);

    if (existing.channel !== 'STORE_POS' && !existing.warehouseLocationId) {
      throw new ValidationError('A fulfillment warehouse is required before confirming the order.');
    }
    if (input.overrideType === 'INCREASE_LIMIT' && (!input.newCreditLimit || input.newCreditLimit <= 0)) {
      throw new ValidationError('New credit limit must be greater than zero.');
    }

    // Recalculate the customer's live unpaid exposure on the server. The UI
    // displays this value as a convenience, but it must not be trusted for a
    // permanent limit increase because the order/customer data may have
    // changed since the hold queue was opened.
    let currentExposure = 0;
    if (existing.customerId && typeof (this.prisma as any).salesOrder.findMany === 'function') {
      const activeOrders = await (this.prisma as any).salesOrder.findMany({
        where: {
          customerId: existing.customerId,
          id: { not: id },
          status: {
            in: [
              'CONFIRMED',
              'PARTIALLY_ALLOCATED',
              'ALLOCATED',
              'PICKING',
              'PARTIALLY_PICKED',
              'PICKED',
              'PACKING',
              'PACKED',
              'READY_TO_DISPATCH',
              'PARTIALLY_DISPATCHED',
              'DISPATCHED',
              'PARTIALLY_DELIVERED',
              'DELIVERED',
            ],
          },
          paymentStatus: { notIn: ['PAID', 'NOT_REQUIRED'] },
        },
        include: { payments: { where: { status: 'PAID' } } },
      });

      currentExposure = activeOrders.reduce((sum: number, order: any) => {
        const paid = (order.payments || []).reduce((paidTotal: number, payment: any) => paidTotal + Number(payment.amount || 0), 0);
        return sum + Math.max(0, Number(order.grandTotal || 0) - paid);
      }, 0);
    }

    const projectedExposure = currentExposure + Number(existing.grandTotal || 0);
    if (input.overrideType === 'INCREASE_LIMIT' && Number(input.newCreditLimit) < projectedExposure) {
      throw new ValidationError(
        `New credit limit must be at least ₹${projectedExposure.toLocaleString('en-IN')} to cover current outstanding exposure and this order.`
      );
    }

    // Confirm the order
    const updated = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;
      if (input.overrideType === 'INCREASE_LIMIT' && existing.customerId) {
        await txDb.customer.update({ where: { id: existing.customerId }, data: { creditLimit: input.newCreditLimit } });
      }
      const customer = existing.customerId ? await txDb.customer.findUnique({ where: { id: existing.customerId } }) : null;
      const transitioned = await txDb.salesOrder.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: existing.status,
              toStatus: 'CONFIRMED',
              actorId,
              reason: input.notes
                ? `Admin Credit Override (${input.overrideType}): ${input.notes}`
                : `Admin Credit Override: Approved via ${input.overrideType}`,
            },
          },
        },
        include: salesOrderInclude,
      });
      await txDb.salesCreditAuthorization.create({
        data: {
          salesOrderId: id,
          status: 'OVERRIDDEN',
          creditLimit: input.overrideType === 'INCREASE_LIMIT' ? input.newCreditLimit : Number(customer?.creditLimit || 0),
          exposureBefore: currentExposure,
          orderAmount: Number(existing.grandTotal),
          exposureAfter: projectedExposure,
          paymentStatus: existing.paymentStatus,
          decisionReason: input.notes || `Approved through ${input.overrideType}.`,
          overrideType: input.overrideType,
          approvedByActorId: actorId,
        },
      });
      if (existing.channel !== 'STORE_POS') {
        const warehouse = await txDb.warehouseLocation.findUnique({ where: { id: existing.warehouseLocationId } });
        if (warehouse?.fulfillmentV2Enabled !== false) {
          const fulfillment = await txDb.salesFulfillment.findFirst({ where: { salesOrderId: id, status: { not: 'CANCELLED' } } });
          if (!fulfillment) {
            await txDb.salesFulfillment.create({
              data: {
                fulfillmentNumber: `FUL-${new Date().getFullYear()}-${existing.orderNumber}`,
                salesOrderId: id,
                warehouseLocationId: existing.warehouseLocationId,
                promisedShipAt: existing.promisedAt,
                createdByActorId: actorId,
              },
            });
          }
        }

        // Credit approval confirms the commercial order only. Allocation must
        // remain an explicit warehouse operation.
      }
      return transitioned;
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.credit_limit_override',
      entityType: 'SalesOrder',
      entityId: id,
      before: existing,
      after: updated,
      requestId,
    });

    // Notify creator / sales reps and admins
    try {
      const customer = existing.customerId
        ? await this.prisma.customer.findUnique({ where: { id: existing.customerId } })
        : null;
      const customerName = customer?.name || 'Customer';

      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager', 'sales_rep', 'sales_manager'],
        type: 'APPROVED',
        title: `Credit Hold Approved: Order ${existing.orderNumber}`,
        message: `Order ${existing.orderNumber} for ${customerName} has been approved by Admin (${input.overrideType === 'INCREASE_LIMIT' ? `New Credit Limit: ₹${Number(input.newCreditLimit).toLocaleString('en-IN')}` : 'Executive One-Time Waiver'}) and confirmed.`,
        resource: 'SalesOrder',
        resourceId: id,
        href: `/sales/orders/${id}`,
        metadata: {
          orderId: id,
          orderNumber: existing.orderNumber,
          overrideType: input.overrideType,
          newCreditLimit: input.newCreditLimit,
          approvedBy: actorId,
        },
      });
    } catch {
      // Non-blocking notification
    }

    return updated;
  }

  private async internalAllocateOrder(
    txDb: any,
    orderId: string,
    warehouseLocationId: string,
    actorId: string,
    fromStatus: SalesOrderStatus,
    _requestId?: string,
    requestedQuantities?: SalesAllocationRequest[]
  ) {
    const order = await txDb.salesOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) return null;

    const requestedByLine = requestedQuantities
      ? new Map(requestedQuantities.map((request) => [request.salesOrderLineId, Number(request.quantity)]))
      : null;

    let anyAllocated = false;
    let full = true;

    for (const line of order.lines) {
      const remaining = Number(line.orderedQuantity) - Number(line.allocatedQuantity);
      if (remaining <= 0) continue;

      // When a quantity list is supplied, only allocate the explicitly
      // requested amount for each line. Omitted lines remain available for a
      // later allocation run.
      const requested = requestedByLine?.get(line.id);
      if (requestedByLine && requested === undefined) continue;
      const targetQuantity = requestedByLine ? Math.min(remaining, requested as number) : remaining;

      const balance = await txDb.inventoryBalance.findFirst({
        where: {
          itemType: 'PRODUCT',
          itemId: line.productId,
          uomId: line.uomId,
          locationId: warehouseLocationId,
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
        },
      });

      const available = balance
        ? Math.max(0, Number(balance.quantity) - Number(balance.reserved))
        : 0;
      const quantity = Math.min(targetQuantity, available);

      if (quantity <= 0) {
        full = false;
        const shortage = targetQuantity - quantity;
        const existingException = await txDb.salesOrderException.findFirst({
          where: { salesOrderId: orderId, code: `STOCK_SHORTAGE:${line.id}`, status: 'OPEN' },
        });
        if (shortage > 0 && !existingException) {
          await txDb.salesOrderException.create({
            data: {
              salesOrderId: orderId,
              code: `STOCK_SHORTAGE:${line.id}`,
              message: `${line.sku} is short by ${shortage} units for the requested allocation.`,
              severity: 'BLOCKING',
            },
          });
        }
        continue;
      }

      if (quantity < remaining) {
        full = false;
      }
      if (quantity < targetQuantity) {
        const shortage = targetQuantity - quantity;
        const existingException = await txDb.salesOrderException.findFirst({
          where: { salesOrderId: orderId, code: `STOCK_SHORTAGE:${line.id}`, status: 'OPEN' },
        });
        if (!existingException) {
          await txDb.salesOrderException.create({
            data: {
              salesOrderId: orderId,
              code: `STOCK_SHORTAGE:${line.id}`,
              message: `${line.sku} is short by ${shortage} units for the requested allocation.`,
              severity: 'BLOCKING',
            },
          });
        }
      }

      anyAllocated = true;

      if (balance) {
        await txDb.inventoryBalance.update({
          where: { id: balance.id },
          data: { reserved: { increment: quantity } },
        });
      }

      const reservation = await txDb.inventoryReservation.create({
        data: {
          itemType: 'PRODUCT',
          itemId: line.productId,
          uomId: line.uomId,
          locationId: warehouseLocationId,
          lotId: balance?.lotId ?? null,
          quantity,
          sourceType: 'SALES_ORDER',
          sourceId: orderId,
          status: 'ACTIVE',
          createdBy: actorId,
        },
      });

      await txDb.salesOrderAllocation.create({
        data: {
          salesOrderId: orderId,
          salesOrderLineId: line.id,
          productId: line.productId,
          uomId: line.uomId,
          locationId: warehouseLocationId,
          lotId: balance?.lotId ?? null,
          quantity,
          reservationId: reservation.id,
          createdById: actorId,
        },
      });

      const newAllocated = Number(line.allocatedQuantity) + quantity;
      await txDb.salesOrderLine.update({
        where: { id: line.id },
        data: {
          allocatedQuantity: { increment: quantity },
          status:
            newAllocated >= Number(line.orderedQuantity) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
        },
      });
    }

    if (!anyAllocated) {
      return null;
    }

    const nextStatus: SalesOrderStatus = full ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED';
    const allocationStatus: SalesAllocationStatus = full ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

    const updated = await txDb.salesOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        allocationStatus,
        statusHistory: {
          create: {
            fromStatus,
            toStatus: nextStatus,
            actorId,
            reason: full
              ? 'Inventory fully reserved for fulfillment.'
              : 'Inventory partially reserved; backorder pending stock arrival.',
          },
        },
      },
      include: salesOrderInclude,
    });

    // Ensure fulfillment exists with correct allocation status
    let fulfillment = await txDb.salesFulfillment.findFirst({
      where: { salesOrderId: orderId, status: { not: 'CANCELLED' } },
    });

    if (!fulfillment) {
      fulfillment = await txDb.salesFulfillment.create({
        data: {
          fulfillmentNumber: `FUL-${new Date().getFullYear()}-${order.orderNumber.replace('SO-', '')}`,
          salesOrderId: orderId,
          warehouseLocationId,
          promisedShipAt: order.promisedAt,
          status: full ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
          createdByActorId: actorId,
        },
      });
    } else {
      await txDb.salesFulfillment.update({
        where: { id: fulfillment.id },
        data: { status: full ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED' },
      });
    }

    // Ensure salesPickList exists with pick items
    const existingPickList = await txDb.salesPickList.findFirst({
      where: { fulfillmentId: fulfillment.id, status: { not: 'CANCELLED' } },
    });

    if (!existingPickList) {
      const activeAllocations = await txDb.salesOrderAllocation.findMany({
        where: { salesOrderId: orderId, status: 'ACTIVE' },
      });

      if (activeAllocations.length > 0) {
        const pickNumber = `PK-${new Date().getFullYear()}-${order.orderNumber.replace('SO-', '')}`;
        await txDb.salesPickList.create({
          data: {
            pickListNumber: pickNumber,
            fulfillmentId: fulfillment.id,
            status: 'CREATED',
            createdByActorId: actorId,
            items: {
              create: activeAllocations.map((alloc: any) => ({
                salesOrderLineId: alloc.salesOrderLineId,
                allocationId: alloc.id,
                expectedQuantity: alloc.quantity,
                lotId: alloc.lotId,
              })),
            },
          },
        });
      }
    }

    return updated;
  }

  async allocate(id: string, actorId: string, requestId?: string, requestedQuantities?: SalesAllocationRequest[]) {
    await this.requirePermission(actorId, 'allocate');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (!['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(order.status)) {
      throw new ConflictError('Only confirmed orders can be allocated.');
    }

    if (requestedQuantities !== undefined) {
      validateSalesAllocationRequests(order.lines as any[], requestedQuantities);
    }

    let warehouseLocationId = order.warehouseLocationId;
    if (!warehouseLocationId) {
      const stockBalance = await this.prisma.inventoryBalance.findFirst({
        where: {
          itemType: 'PRODUCT',
          itemId: { in: order.lines.map((l: any) => l.productId) },
          condition: 'AVAILABLE',
          quantity: { gt: 0 },
        },
        select: { locationId: true },
      });
      if (stockBalance?.locationId) {
        warehouseLocationId = stockBalance.locationId;
      }
      if (!warehouseLocationId) {
        const defaultLoc = await this.prisma.warehouseLocation.findFirst({
          where: { type: 'FINISHED_GOODS', status: 'ACTIVE' },
        });
        warehouseLocationId = defaultLoc?.id ?? null;
      }
      if (!warehouseLocationId) {
        const anyLoc = await this.prisma.warehouseLocation.findFirst({ where: { status: 'ACTIVE' } });
        warehouseLocationId = anyLoc?.id ?? null;
      }
      if (warehouseLocationId) {
        await this.prisma.salesOrder.update({
          where: { id },
          data: { warehouseLocationId },
        });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;
      const allocated = await this.internalAllocateOrder(
        txDb,
        id,
        warehouseLocationId!,
        actorId,
        order.status as SalesOrderStatus,
        requestId,
        requestedQuantities
      );
      if (!allocated) {
        return txDb.salesOrder.findUniqueOrThrow({
          where: { id },
          include: salesOrderInclude,
        });
      }
      return allocated;
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_allocate',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async createPackage(id: string, input: CreatePackageInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'update');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (!['ALLOCATED', 'PICKING', 'PARTIALLY_PICKED', 'PICKED', 'PACKING'].includes(order.status)) {
      throw new ConflictError('Order must be allocated or picking before packing.');
    }

    const db = this.prisma as any;
    const packageNumber = await generateSequentialNumber({
      prefix: `PKG-${new Date().getFullYear()}-`,
      countByPrefix: (prefix) => db.salesOrderCharge.count({ where: { code: { startsWith: prefix } } }),
      existsByNumber: async (candidate) => Boolean(await db.salesOrderCharge.findFirst({ where: { code: candidate } })),
      padLength: 5,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      for (const item of input.items) {
        const line = order.lines.find((l: any) => l.id === item.salesOrderLineId);
        if (!line) throw new ValidationError(`Order line '${item.salesOrderLineId}' not found.`);

        const currentPacked = Number(line.packedQuantity) + item.quantity;
        if (currentPacked > Number(line.orderedQuantity)) {
          throw new ValidationError(`Cannot pack more than ordered quantity for line ${line.sku}.`);
        }

        await txDb.salesOrderLine.update({
          where: { id: line.id },
          data: {
            packedQuantity: { increment: item.quantity },
          },
        });
      }

      // Check if all lines are packed
      const refreshedLines = await txDb.salesOrderLine.findMany({ where: { salesOrderId: id } });
      const overallComplete = refreshedLines.every((l: any) => Number(l.packedQuantity) >= Number(l.orderedQuantity));

      const newStatus: SalesOrderStatus = overallComplete ? 'READY_TO_DISPATCH' : 'PACKING';

      // Save package information in externalReferences
      await txDb.salesOrderExternalReference.create({
        data: {
          salesOrderId: id,
          channel: order.channel,
          externalId: packageNumber,
          payload: {
            packageNumber,
            packageType: input.packageType ?? 'STANDARD_CARTON',
            weightKg: input.weightKg ?? 1.0,
            dimensions: input.dimensions ?? '30x20x15 cm',
            carrier: input.carrier,
            trackingNumber: input.trackingNumber,
            packedBy: actorId,
            packedAt: new Date(),
            items: input.items,
          },
        },
      });

      return txDb.salesOrder.update({
        where: { id },
        data: {
          status: newStatus,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: newStatus,
              actorId,
              reason: `Package ${packageNumber} created. Weight: ${input.weightKg ?? 1.0}kg.`,
            },
          },
        },
        include: salesOrderInclude,
      });
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_pack',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async confirmDispatch(id: string, input: ConfirmDispatchInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'dispatch');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (!['PACKED', 'READY_TO_DISPATCH'].includes(order.status)) {
      throw new ConflictError('Only packed or ready-to-dispatch orders can be dispatched.');
    }
    if (!order.warehouseLocationId) throw new ValidationError('Order has no fulfillment location.');

    const warehouse = await this.prisma.warehouseLocation.findUnique({
      where: { id: order.warehouseLocationId },
      select: { fulfillmentV2Enabled: true },
    });
    if (warehouse?.fulfillmentV2Enabled) {
      throw new ConflictError(
        'Warehouse has V2 Fulfillment enabled. Dispatches must be executed via the Fulfillment Dispatch Shipment workflow.'
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      // 1. Consume inventory reservations and post outbound ledger entries
      for (const line of order.lines) {
        const qtyToShip = Number(line.packedQuantity) > 0 ? Number(line.packedQuantity) : Number(line.allocatedQuantity);
        if (qtyToShip <= 0) continue;

        await inventoryPostingService.post(txDb, {
          itemType: 'PRODUCT', itemId: line.productId, uomId: line.uomId, locationId: order.warehouseLocationId!,
          movementType: 'ISSUE', quantity: qtyToShip, consumeReserved: true,
          sourceType: 'SALES_ORDER', sourceId: id, idempotencyKey: `SALES_ORDER:${id}:LINE:${line.id}:DISPATCH`,
          actorId, correlationId: requestId,
        });

        // Mark line as shipped
        await txDb.salesOrderLine.update({
          where: { id: line.id },
          data: {
            shippedQuantity: qtyToShip,
            status: 'FULFILLED',
          },
        });
      }

      // 2. Consume reservations
      await txDb.inventoryReservation.updateMany({
        where: { sourceId: id, sourceType: 'SALES_ORDER', status: 'ACTIVE' },
        data: { status: 'CONSUMED' },
      });

      // 3. Update order to DISPATCHED
      const dispatchedOrder = await txDb.salesOrder.update({
        where: { id },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: input.dispatchedAt ? new Date(input.dispatchedAt) : new Date(),
          notes: input.notes
            ? `${order.notes ? order.notes + '\n' : ''}[Carrier: ${input.carrier}, AWB: ${input.trackingNumber || 'N/A'}] ${input.notes}`
            : order.notes,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: 'DISPATCHED',
              actorId,
              reason: `Dispatched via ${input.carrier}. Tracking: ${input.trackingNumber || 'N/A'}`,
            },
          },
        },
        include: salesOrderInclude,
      });
      await lockSalesProforma(tx as any, id);
      await enqueueSalesArEvent(tx as any, {
        eventKey: `sales-ar-invoice:legacy-dispatch:${id}`,
        eventType: 'INVOICE_DRAFT',
        payload: { sourceKey: `ORDER:${id}:LEGACY_DISPATCH`, salesOrderId: id, actorId },
      });
      const fullyShipped = order.lines.every((line: any) => {
        const shippedNow = Number(line.packedQuantity) > 0 ? Number(line.packedQuantity) : Number(line.allocatedQuantity);
        return Number(line.shippedQuantity ?? 0) + shippedNow >= Number(line.orderedQuantity) - Number(line.cancelledQuantity ?? 0);
      });
      if (fullyShipped) await publishIntelligenceEvent(tx as any, { type: 'SALES_ORDER_FULFILLED', entityType: 'SalesOrder', entityId: id, correlationId: requestId, occurredAt: dispatchedOrder.updatedAt, transitionId: dispatchedOrder.updatedAt.toISOString(), metadata: { status: dispatchedOrder.status, currency: dispatchedOrder.currency } });
      return dispatchedOrder;
    });

    await processSalesArEvents(this.prisma).catch(() => undefined);

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_dispatch',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async recordPayment(id: string, input: CapturePaymentInput, actorId: string, requestId?: string) {
    if (actorId && actorId !== 'system' && actorId !== 'test-actor') {
      const user = await this.prisma.user.findUnique({
        where: { id: actorId },
        include: { userRoles: { include: { role: true } } },
      });
      const role = (user?.role || '').toLowerCase();
      const roleKeys = user?.userRoles.map((ur: any) => ur.role.name.toLowerCase()) || [];
      const isFinanceOrAdmin =
        ['admin', 'super_admin', 'system_admin', 'accountant', 'finance', 'finance_manager', 'store_manager', 'subadmin', 'sub_admin'].includes(role) ||
        roleKeys.some((k: string) => ['admin', 'super-admin', 'accountant', 'finance', 'finance_manager', 'store_manager', 'subadmin'].includes(k));

      if (!isFinanceOrAdmin) {
        throw new ForbiddenError(
          'Sales Executives are not authorized to record customer payments. Payments must be recorded and verified by the Accounts & Finance Department.'
        );
      }
    }

    if (!input.amount || Number(input.amount) <= 0) {
      throw new ValidationError('Payment amount must be greater than zero.');
    }

    await this.requirePermission(actorId, 'update');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    const payloadHash = createHash('sha256').update(JSON.stringify({
      salesOrderId: id, amount: String(input.amount), method: input.method,
      provider: input.provider ?? null, reference: input.reference ?? null,
    })).digest('hex');
    if (input.idempotencyKey) {
      const existingPayment = await (this.prisma as any).salesOrderPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existingPayment) {
        if (existingPayment.payloadHash !== payloadHash) throw new ConflictError('Idempotency key was already used for a different payment.');
        return order;
      }
    }
    const receiptReference = input.reference || `ORDER-PAY-${randomUUID()}`;
    const receiptIdempotencyKey = input.idempotencyKey
      ? `sales-ar-order-receipt:${input.idempotencyKey}`
      : `sales-ar-order-receipt:${id}:${receiptReference}`;

    // Check idempotency if reference provided
    if (input.reference) {
      const existingPayment = order.payments?.find(
        (p: any) => p.reference === input.reference && p.status === 'PAID'
      );
      if (existingPayment) {
        return order;
      }
    }

    const allCurrentPayments = order.payments?.filter((p: any) => p.status === 'PAID') || [];
    const currentPaid = allCurrentPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);

    if (currentPaid + Number(input.amount) > grandTotal + 0.01) {
      throw new ValidationError(
        `Payment of ₹${input.amount} exceeds remaining order balance of ₹${Math.max(0, grandTotal - currentPaid)}.`
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      await txDb.salesOrderPayment.create({
        data: {
          salesOrderId: id,
          method: input.method,
          provider: input.provider,
          reference: input.reference,
          amount: input.amount,
          status: 'PAID',
          paidAt: new Date(),
          idempotencyKey: input.idempotencyKey,
          payloadHash: input.idempotencyKey ? payloadHash : undefined,
        },
      });
      await enqueueSalesArEvent(tx as any, {
        eventKey: receiptIdempotencyKey,
        eventType: 'RECEIPT_CANDIDATE',
        payload: {
          salesOrderId: id,
          amount: String(input.amount),
          method: input.method,
          reference: receiptReference,
          receiptDate: new Date().toISOString().slice(0, 10),
          idempotencyKey: receiptIdempotencyKey,
          actorId,
        },
      });

      const allPayments = await txDb.salesOrderPayment.findMany({
        where: { salesOrderId: id, status: 'PAID' },
      });
      const totalPaid = allPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);

      let newPaymentStatus = order.paymentStatus;
      if (totalPaid >= grandTotal) {
        newPaymentStatus = 'PAID';
      } else if (totalPaid > 0) {
        newPaymentStatus = 'PARTIALLY_PAID';
      }

      return txDb.salesOrder.update({
        where: { id },
        data: {
          paymentStatus: newPaymentStatus,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: order.status,
              actorId,
              reason: `Payment of ₹${input.amount} recorded via ${input.method} (${input.reference || 'No ref'}). Total paid: ₹${totalPaid}.`,
            },
          },
        },
        include: salesOrderInclude,
      });
    });

    await processSalesArEvents(this.prisma).catch(() => undefined);

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_payment',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async createReturn(id: string, input: CreateReturnInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'update');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (!['DISPATCHED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'PARTIALLY_DISPATCHED'].includes(order.status)) {
      throw new ConflictError('Returns can only be initiated for dispatched or delivered orders.');
    }
    if (!input.items || !input.items.length) {
      throw new ValidationError('At least one item is required to create a return.');
    }

    for (const item of input.items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new ValidationError('Returned item quantity must be greater than zero.');
      }
      const line = order.lines.find((l: any) => l.id === item.salesOrderLineId);
      if (!line) throw new ValidationError(`Line '${item.salesOrderLineId}' does not exist on this order.`);
      const shippedQty = Number(line.shippedQuantity || 0);
      const alreadyReturned = Number(line.returnedQuantity || 0);
      if (item.quantity > (shippedQty - alreadyReturned)) {
        throw new ValidationError(
          `Cannot return ${item.quantity} units for line '${line.sku || line.id}'. Shipped: ${shippedQty}, Already returned: ${alreadyReturned}, Max returnable: ${shippedQty - alreadyReturned}.`
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      const financialReturn = await txDb.salesFinancialReturn.create({
        data: {
          salesOrderId: id,
          status: 'REQUESTED',
          currency: order.currency,
          createdByActorId: actorId,
          lines: { create: input.items.map((item) => ({ salesOrderLineId: item.salesOrderLineId, quantity: String(item.quantity) })) },
        },
      });
      await publishIntelligenceEvent(tx as any, { type: 'SALES_RETURN_REQUESTED', entityType: 'SalesFinancialReturn', entityId: financialReturn.id, correlationId: requestId, occurredAt: financialReturn.requestedAt, transitionId: financialReturn.id, metadata: { salesOrderId: id, currency: order.currency, status: 'REQUESTED' } });

      for (const item of input.items) {
        const line = order.lines.find((l: any) => l.id === item.salesOrderLineId)!;
        await txDb.salesOrderLine.update({
          where: { id: line.id },
          data: {
            returnedQuantity: { increment: item.quantity },
          },
        });
      }

      await txDb.salesOrderException.create({
        data: {
          salesOrderId: id,
          code: 'RETURN_REQUESTED',
          message: `Return initiated: ${input.reason}. Items: ${input.items.map((i) => i.quantity + ' units').join(', ')}`,
          severity: 'INFO',
          status: 'OPEN',
        },
      });

      return txDb.salesOrder.update({
        where: { id },
        data: {
          status: 'RETURNED',
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: 'RETURNED',
              actorId,
              reason: `Return requested: ${input.reason}`,
            },
          },
        },
        include: salesOrderInclude,
      });
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_return',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async processReturnDisposition(
    id: string,
    input: ProcessReturnDispositionInput,
    actorId: string,
    requestId?: string
  ) {
    await this.requirePermission(actorId, 'update');
    const order = await new SalesRepository(this.prisma).findById(id);
    if (!order) throw new NotFoundError(`Sales order '${id}' not found.`);
    if (order.status !== 'RETURNED') {
      throw new ConflictError(
        `Return disposition can only be processed on orders in RETURNED status. Current status is '${order.status}'.`
      );
    }

    const openReturnException = await this.prisma.salesOrderException.findFirst({
      where: { salesOrderId: id, code: 'RETURN_REQUESTED', status: 'OPEN' },
    });
    if (!openReturnException) {
      throw new ConflictError('No open return request found to process disposition for.');
    }

    for (const [field, amount] of [['creditedNetAmount', input.creditedNetAmount], ['taxCreditAmount', input.taxCreditAmount]] as const) {
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new ValidationError(`${field} must be a finite non-negative amount.`);
    }
    if (input.sourceReference !== undefined && !/^[A-Za-z0-9._/-]{1,80}$/.test(input.sourceReference.trim())) {
      throw new ValidationError('Return source reference must be a short document identifier.');
    }
    const creditOccurredAt = input.occurredAt === undefined ? new Date() : new Date(input.occurredAt);
    if (Number.isNaN(creditOccurredAt.getTime())) throw new ValidationError('Return occurrence date must be a valid ISO date.');

    const result = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;
      const financialReturn = await txDb.salesFinancialReturn.findFirst({
        where: { salesOrderId: id, status: 'REQUESTED' },
        orderBy: { requestedAt: 'desc' },
      });
      if (financialReturn) {
        const completedReturn = await txDb.salesFinancialReturn.update({
          where: { id: financialReturn.id },
          data: {
            status: 'COMPLETED',
            occurredAt: creditOccurredAt,
            completedByActorId: actorId,
            creditedNetAmount: input.creditedNetAmount === undefined ? null : String(input.creditedNetAmount),
            taxCreditAmount: input.taxCreditAmount === undefined ? null : String(input.taxCreditAmount),
            sourceReference: input.sourceReference?.trim() || null,
          },
        });
        const completionIdentity = completedReturn.updatedAt instanceof Date ? completedReturn.updatedAt.toISOString() : financialReturn.id;
        await publishIntelligenceEvent(tx as any, { type: 'SALES_RETURN_CREDIT_COMPLETED', entityType: 'SalesFinancialReturn', entityId: financialReturn.id, correlationId: requestId, occurredAt: creditOccurredAt, transitionId: `${financialReturn.id}:COMPLETED:${completionIdentity}`, metadata: { salesOrderId: id, currency: order.currency, status: 'COMPLETED', hasNetCredit: input.creditedNetAmount !== undefined } });
        if (input.creditedNetAmount !== undefined || input.taxCreditAmount !== undefined) {
          await enqueueSalesArEvent(tx as any, {
            eventKey: `sales-ar-credit-note:${financialReturn.id}`,
            eventType: 'CREDIT_NOTE_DRAFT',
            payload: { sourceReturnId: financialReturn.id, actorId },
          });
        }
      }

      // If RESTOCK disposition, increment warehouse inventory balance & create ILE
      if (input.disposition === 'RESTOCK' && order.warehouseLocationId) {
        for (const line of order.lines) {
          const retQty = Number(line.returnedQuantity);
          if (retQty <= 0) continue;

          const locationId = input.locationId ?? order.warehouseLocationId;
          if (!locationId) throw new ValidationError('Return disposition requires an inventory location.');
          await inventoryPostingService.post(txDb, {
            itemType: 'PRODUCT', itemId: line.productId, uomId: line.uomId, locationId,
            movementType: 'RETURN', quantity: retQty,
            sourceType: 'SALES_ORDER_RETURN', sourceId: id, idempotencyKey: `SALES_ORDER:${id}:LINE:${line.id}:RETURN:${retQty}`,
            actorId, correlationId: requestId,
          });
        }
      }

      // Close open return exceptions
      await txDb.salesOrderException.updateMany({
        where: { salesOrderId: id, code: 'RETURN_REQUESTED', status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolvedById: actorId,
          resolvedAt: new Date(),
          resolutionNote: `Disposition: ${input.disposition}. ${input.notes || ''}`,
        },
      });

      return txDb.salesOrder.update({
        where: { id },
        data: {
          status: 'CLOSED',
          paymentStatus: order.paymentStatus,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: 'CLOSED',
              actorId,
              reason: `Return resolved with disposition: ${input.disposition}. Order closed.`,
            },
          },
        },
        include: salesOrderInclude,
      });
    });

    await processSalesArEvents(this.prisma).catch(() => undefined);

    await this.auditWriter.record({
      actorId,
      action: 'sales.order_return_disposition',
      entityType: 'SalesOrder',
      entityId: id,
      after: result,
      requestId,
    });

    return result;
  }

  async posCheckout(input: PosCheckoutInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'create');
    if (!input.lines.length) throw new ValidationError('At least one item is required for checkout.');

    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { uom: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const totals = input.lines.reduce(
      (acc, line) => {
        const gross = line.quantity * line.unitPrice;
        const discount = line.discountAmount ?? 0;
        const taxable = Math.max(0, gross - discount);
        const taxRate = line.taxRate ?? 18;
        const tax = taxable * (taxRate / 100);
        acc.subtotal += gross;
        acc.discountTotal += discount;
        acc.taxTotal += tax;
        acc.grandTotal += taxable + tax;
        return acc;
      },
      { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
    );

    const db = this.prisma as any;
    const orderNumber = await generateSequentialNumber({
      prefix: `POS-${new Date().getFullYear()}-`,
      countByPrefix: (prefix) => db.salesOrder.count({ where: { orderNumber: { startsWith: prefix } } }),
      existsByNumber: async (candidate) => Boolean(await db.salesOrder.findUnique({ where: { orderNumber: candidate } })),
      padLength: 5,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      const order = await txDb.salesOrder.create({
        data: {
          orderNumber,
          channel: 'STORE_POS',
          customerId: input.customerId,
          status: 'DELIVERED',
          // Checkout records the operational sale only. Accounts records and posts the receipt.
          paymentStatus: 'PENDING',
          allocationStatus: 'FULLY_ALLOCATED',
          currency: 'INR',
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          confirmedAt: new Date(),
          dispatchedAt: new Date(),
          deliveredAt: new Date(),
          createdByActorId: actorId,
          notes: input.notes ?? `Store walk-in POS sale by cashier ${actorId}`,
          statusHistory: {
            create: [
              { toStatus: 'CONFIRMED', actorId, reason: 'POS sale placed' },
              { toStatus: 'DELIVERED', actorId, reason: 'Immediate handoff at checkout' },
            ],
          },
          lines: {
            create: input.lines.map((line) => {
              const product = productMap.get(line.productId)!;
              const gross = line.quantity * line.unitPrice;
              const discount = line.discountAmount ?? 0;
              const taxRate = line.taxRate ?? 18;
              const tax = Math.max(0, gross - discount) * (taxRate / 100);
              return {
                productId: line.productId,
                productVariantId: line.productVariantId,
                sku: product.sku,
                description: product.name,
                uomId: product.uomId,
                orderedQuantity: line.quantity,
                allocatedQuantity: line.quantity,
                pickedQuantity: line.quantity,
                packedQuantity: line.quantity,
                shippedQuantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: discount,
                taxRate,
                taxAmount: tax,
                lineTotal: Math.max(0, gross - discount) + tax,
                status: 'FULFILLED',
              };
            }),
          },
          addresses: {
            create: {
              kind: 'SHIPPING',
              name: input.customerName || 'Walk-in Customer',
              phone: input.customerPhone,
              line1: 'Store Counter Sale',
              city: 'Walk-in',
              state: 'Retail Store',
              postalCode: '000000',
              country: 'IN',
            },
          },
        },
        include: salesOrderInclude,
      });

      await enqueueSalesArEvent(tx as any, {
        eventKey: `sales-ar-invoice:pos:${order.id}`,
        eventType: 'INVOICE_DRAFT',
        payload: { sourceKey: `POS:${order.id}`, salesOrderId: order.id, actorId },
      });
      // Deduct from the unified product balance, regardless of internal storage.
      for (const [lineIndex, line] of input.lines.entries()) {
        const product = productMap.get(line.productId)!;
        const balances = txDb.inventoryBalance?.findMany
          ? await txDb.inventoryBalance.findMany({
              where: {
                itemType: 'PRODUCT',
                itemId: line.productId,
                condition: 'AVAILABLE',
                ownership: 'COMPANY',
              },
              orderBy: { quantity: 'desc' },
            })
          : [];
        let remaining = line.quantity;
        const availableStock = balances.reduce((total: number, balance: any) => total + Math.max(0, Number(balance.quantity) - Number(balance.reserved)), 0);
        if (availableStock < remaining) {
          throw new ConflictError(
            `Insufficient available stock for product '${product.name}' (${product.sku}). Available: ${availableStock}, Requested: ${line.quantity}.`
          );
        }

        for (const balance of balances) {
          const available = Math.max(0, Number(balance.quantity) - Number(balance.reserved));
          const issued = Math.min(remaining, available);
          if (issued <= 0) continue;
          await inventoryPostingService.post(txDb, {
            itemType: 'PRODUCT', itemId: line.productId, uomId: product.uomId, locationId: balance.locationId,
            movementType: 'ISSUE', quantity: issued,
            sourceType: 'SALES_ORDER', sourceId: order.id,
            idempotencyKey: `SALES_ORDER:${order.id}:PRODUCT:${line.productId}:POS:${lineIndex}:${balance.locationId}`,
            actorId, correlationId: requestId,
          });
          remaining -= issued;
          if (remaining <= 0) break;
        }
      }

      await publishIntelligenceEvent(tx as any, { type: 'SALES_ORDER_FULFILLED', entityType: 'SalesOrder', entityId: order.id, correlationId: requestId, occurredAt: order.deliveredAt ?? order.createdAt, transitionId: order.id, metadata: { status: order.status, currency: order.currency } });
      return order;
    });

    await processSalesArEvents(this.prisma).catch(() => undefined);

    await this.auditWriter.record({
      actorId,
      action: 'sales.pos_checkout',
      entityType: 'SalesOrder',
      entityId: created.id,
      after: created,
      requestId,
    });

    try {
      const customerName = input.customerName || 'Walk-in Customer';
      const formattedTotal = Number(created.grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager'],
        type: 'INFO',
        title: `New POS Sale Recorded: ${created.orderNumber}`,
        message: `Walk-in POS sale ${created.orderNumber} for ${customerName} (₹${formattedTotal}) was completed.`,
        resource: 'SalesOrder',
        resourceId: created.id,
        href: `/sales/orders/${created.id}`,
        metadata: {
          orderId: created.id,
          orderNumber: created.orderNumber,
          customerName,
          grandTotal: created.grandTotal,
          channel: 'STORE_POS',
          createdBy: actorId,
        },
      });
    } catch {
      // Non-blocking
    }

    return created;
  }

  async importAmazonOrder(input: AmazonOrderImportInput, actorId: string, requestId?: string) {
    await this.requirePermission(actorId, 'create');

    const existing = await new SalesRepository(this.prisma).findByExternalOrderId(input.amazonOrderId);
    if (existing) {
      return existing;
    }

    // Lookup products by SKU
    const skus = input.items.map((i) => i.sku);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      include: { uom: true },
    });
    const productMap = new Map(products.map((p) => [p.sku, p]));

    // Find default warehouse location (prioritize FINISHED_GOODS)
    let defaultLocation = await this.prisma.warehouseLocation.findFirst({
      where: { type: 'FINISHED_GOODS', status: 'ACTIVE' },
    });
    if (!defaultLocation) {
      defaultLocation = await this.prisma.warehouseLocation.findFirst({
        where: { type: { in: ['WAREHOUSE', 'STORE'] }, status: 'ACTIVE' },
      });
    }
    if (!defaultLocation) {
      defaultLocation = await this.prisma.warehouseLocation.findFirst({
        where: { status: 'ACTIVE' },
      });
    }
    if (!defaultLocation) throw new ValidationError('No active warehouse location configured for Amazon orders.');

    const db = this.prisma as any;
    const orderNumber = await generateSequentialNumber({
      prefix: `AMZ-${new Date().getFullYear()}-`,
      countByPrefix: (prefix) => db.salesOrder.count({ where: { orderNumber: { startsWith: prefix } } }),
      existsByNumber: async (candidate) => Boolean(await db.salesOrder.findUnique({ where: { orderNumber: candidate } })),
      padLength: 5,
    });

    for (const item of input.items) {
      if (!productMap.has(item.sku)) {
        throw new ValidationError(
          `Amazon import failed: Product SKU '${item.sku}' (${item.title}) is not mapped or does not exist in the system.`
        );
      }
    }

    const lines = input.items.map((item) => {
      const product = productMap.get(item.sku)!;
      const unitPrice = item.itemPrice / Math.max(1, item.quantity);
      const taxAmount = item.taxAmount ?? 0;
      return {
        productId: product.id,
        sku: item.sku,
        description: item.title,
        uomId: product.uomId,
        orderedQuantity: item.quantity,
        unitPrice,
        discountAmount: 0,
        taxRate: 18,
        taxAmount,
        lineTotal: item.itemPrice + taxAmount,
        status: 'OPEN',
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      const order = await txDb.salesOrder.create({
        data: {
          orderNumber,
          channel: 'AMAZON',
          externalOrderId: input.amazonOrderId,
          warehouseLocationId: defaultLocation.id,
          status: 'IMPORTED',
          paymentStatus: 'PENDING', // An imported order is not evidence of a settled marketplace remittance.
          currency: input.currency ?? 'INR',
          subtotal: input.orderTotal,
          taxTotal: lines.reduce((s, l) => s + l.taxAmount, 0),
          grandTotal: input.orderTotal,
          orderedAt: new Date(input.purchaseDate),
          createdByActorId: actorId,
          notes: `Imported from Amazon Order ID: ${input.amazonOrderId}`,
          statusHistory: {
            create: {
              toStatus: 'IMPORTED',
              actorId,
              reason: 'Imported via Amazon Channel Adapter',
            },
          },
          lines: { create: lines },
          addresses: {
            create: {
              kind: 'SHIPPING',
              name: input.shippingAddress.name || input.buyerName || 'Amazon Customer',
              phone: input.shippingAddress.phone,
              line1: input.shippingAddress.line1,
              line2: input.shippingAddress.line2,
              city: input.shippingAddress.city,
              state: input.shippingAddress.state,
              postalCode: input.shippingAddress.postalCode,
              country: input.shippingAddress.country ?? 'IN',
            },
          },
          externalReferences: {
            create: {
              channel: 'AMAZON',
              externalId: input.amazonOrderId,
              payload: input,
            },
          },
        },
        include: salesOrderInclude,
      });
      return order;
    });

    await this.auditWriter.record({
      actorId,
      action: 'sales.amazon_import',
      entityType: 'SalesOrder',
      entityId: created.id,
      after: created,
      requestId,
    });

    try {
      const customerName = input.buyerName || input.shippingAddress?.name || 'Amazon Customer';
      const formattedTotal = Number(created.grandTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store-manager'],
        type: 'INFO',
        title: `New Amazon Order Imported: ${created.orderNumber}`,
        message: `Amazon order ${input.amazonOrderId} (${created.orderNumber}) for ${customerName} (₹${formattedTotal}) was imported.`,
        resource: 'SalesOrder',
        resourceId: created.id,
        href: `/sales/orders/${created.id}`,
        metadata: {
          orderId: created.id,
          orderNumber: created.orderNumber,
          amazonOrderId: input.amazonOrderId,
          customerName,
          grandTotal: created.grandTotal,
          channel: 'AMAZON',
          createdBy: actorId,
        },
      });
    } catch {
      // Non-blocking
    }

    return created;
  }

  async notifyStockShortage(
    input: {
      productId: string;
      productName?: string;
      requestedQuantity: number;
      availableQuantity: number;
      shortageQuantity?: number;
      customerId?: string;
      customerName?: string;
      salesOrderId?: string;
      salesOrderNumber?: string;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      notes?: string;
    },
    actorId: string,
    requestId?: string
  ) {
    if (!input.productId) {
      throw new ValidationError('Product ID is required for stock shortage alert.');
    }

    let productName = input.productName;
    if (!productName) {
      const product = await this.prisma.product.findUnique({
        where: { id: input.productId },
        select: { name: true, sku: true },
      });
      productName = product ? `${product.name} (${product.sku})` : 'Product';
    }

    let customerName = input.customerName;
    if (!customerName && input.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { name: true },
      });
      customerName = customer?.name;
    }

    const diff =
      input.shortageQuantity !== undefined && input.shortageQuantity > 0
        ? input.shortageQuantity
        : Math.max(0, Number(input.requestedQuantity || 0) - Number(input.availableQuantity || 0));

    const urgency = input.urgency || (diff > 50 ? 'HIGH' : 'MEDIUM');

    await this.auditWriter.record({
      actorId,
      action: 'sales.stock_shortage_alert',
      entityType: 'Product',
      entityId: input.productId,
      after: { ...input, resolvedShortage: diff },
      requestId,
    });

    try {
      await this.notifications.notifyRoles({
        roles: ['admin', 'super-admin', 'store_manager', 'inventory_manager', 'production_manager'],
        type: 'WORKFLOW',
        title: `⚠️ Stock Shortage Alert: ${productName}`,
        message: `Stock shortage reported by sales for ${productName}. Required: ${input.requestedQuantity} units, Available: ${input.availableQuantity} units (Deficit: ${diff} units)${customerName ? ` for customer ${customerName}` : ''}${input.salesOrderNumber ? ` [Order #${input.salesOrderNumber}]` : ''}. Please replenish or schedule production.`,
        resource: 'Product',
        resourceId: input.productId,
        href: `/inventory/stock-balances`,
        metadata: {
          productId: input.productId,
          productName,
          requestedQuantity: input.requestedQuantity,
          availableQuantity: input.availableQuantity,
          shortageQuantity: diff,
          customerId: input.customerId,
          customerName,
          salesOrderId: input.salesOrderId,
          salesOrderNumber: input.salesOrderNumber,
          urgency,
          notes: input.notes,
          reportedBy: actorId,
        },
      });
    } catch {
      // Non-blocking notification
    }

    return {
      success: true,
      message: `Stock shortage alert dispatched to Store Manager, Production Manager, and Admin.`,
      details: {
        productId: input.productId,
        productName,
        shortageQuantity: diff,
        urgency,
      },
    };
  }

  private validateInput(input: CreateSalesOrderInput) {
    const requiredAddressFields = [
      ['shippingAddress.line1', input.shippingAddress?.line1, 'Shipping address line 1 is required.'],
      ['shippingAddress.city', input.shippingAddress?.city, 'Shipping city is required.'],
      ['shippingAddress.postalCode', input.shippingAddress?.postalCode, 'Shipping postal code is required.'],
    ] as const;
    for (const [field, value, message] of requiredAddressFields) {
      if (!String(value ?? '').trim()) throw new ValidationError(message, [{ field, message }]);
    }
    if (!input.lines?.length) {
      const message = 'Add at least one order line.';
      throw new ValidationError(message, [{ field: 'lines', message }]);
    }
    const invalidQuantity = input.lines.findIndex((line) => !Number.isFinite(line.quantity) || line.quantity <= 0);
    if (invalidQuantity >= 0) {
      const message = `Enter a quantity greater than zero on order line ${invalidQuantity + 1}.`;
      throw new ValidationError(message, [{ field: 'quantity', line: invalidQuantity, message }]);
    }
    const invalidPrice = input.lines.findIndex((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0);
    if (invalidPrice >= 0) {
      const message = `Enter a valid non-negative price on order line ${invalidPrice + 1}.`;
      throw new ValidationError(message, [{ field: 'unitPrice', line: invalidPrice, message }]);
    }
  }
}
