import { aggregateSalesInventoryAvailability, isSalesTransitionAllowed, validateSalesAllocationRequests } from './sales.service';

describe('Sales inventory availability', () => {
  it('returns saleable quantity in the product base UOM', () => {
    expect(
      aggregateSalesInventoryAvailability(
        [{ id: 'product-1', uomId: 'uom-nos' }],
        [
          { itemId: 'product-1', uomId: 'uom-nos', quantity: 3055, reserved: 922 },
          { itemId: 'product-1', uomId: 'uom-kg', quantity: 50, reserved: 0 },
        ],
      ),
    ).toEqual([
      {
        productId: 'product-1',
        uomId: 'uom-nos',
        onHandQuantity: 3055,
        reservedQuantity: 922,
        availableQuantity: 2133,
      },
    ]);
  });
});

describe('Sales allocation quantities', () => {
  const lines = [
    { id: 'line-1', sku: 'SKU-1', orderedQuantity: 100, allocatedQuantity: 0 },
    { id: 'line-2', sku: 'SKU-2', orderedQuantity: 20, allocatedQuantity: 5 },
  ];

  it('accepts a valid partial allocation', () => {
    expect(() => validateSalesAllocationRequests(lines, [{ salesOrderLineId: 'line-1', quantity: 30 }])).not.toThrow();
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['greater than remaining', 101],
  ])('rejects %s allocation quantities', (_label, quantity) => {
    expect(() => validateSalesAllocationRequests(lines, [{ salesOrderLineId: 'line-1', quantity }])).toThrow(/greater than zero|remaining quantity/);
  });

  it('rejects unknown and duplicate lines', () => {
    expect(() => validateSalesAllocationRequests(lines, [{ salesOrderLineId: 'missing', quantity: 1 }])).toThrow(/valid order line/);
    expect(() => validateSalesAllocationRequests(lines, [
      { salesOrderLineId: 'line-1', quantity: 1 },
      { salesOrderLineId: 'line-1', quantity: 2 },
    ])).toThrow(/unique/);
  });
});

describe('SalesService - Lifecycle & Transitions', () => {
  it('allows the standard commercial flow', () => {
    expect(isSalesTransitionAllowed('DRAFT', 'VALIDATING')).toBe(true);
    expect(isSalesTransitionAllowed('DRAFT', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('VALIDATING', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('VALIDATION_FAILED', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('IMPORTED', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('CONFIRMED', 'ALLOCATED')).toBe(true);
    expect(isSalesTransitionAllowed('ALLOCATED', 'PACKING')).toBe(true);
    expect(isSalesTransitionAllowed('PACKING', 'PACKED')).toBe(true);
    expect(isSalesTransitionAllowed('PACKED', 'READY_TO_DISPATCH')).toBe(true);
    expect(isSalesTransitionAllowed('READY_TO_DISPATCH', 'DISPATCHED')).toBe(true);
    expect(isSalesTransitionAllowed('READY_TO_DISPATCH', 'PARTIALLY_DISPATCHED')).toBe(true);
    expect(isSalesTransitionAllowed('PARTIALLY_DISPATCHED', 'DISPATCHED')).toBe(true);
    expect(isSalesTransitionAllowed('DISPATCHED', 'DELIVERED')).toBe(true);
    expect(isSalesTransitionAllowed('DISPATCHED', 'PARTIALLY_DELIVERED')).toBe(true);
    expect(isSalesTransitionAllowed('PARTIALLY_DELIVERED', 'DELIVERED')).toBe(true);
    expect(isSalesTransitionAllowed('DELIVERED', 'CLOSED')).toBe(true);
  });

  it('allows exception and approval paths', () => {
    expect(isSalesTransitionAllowed('VALIDATING', 'PENDING_APPROVAL')).toBe(true);
    expect(isSalesTransitionAllowed('PENDING_APPROVAL', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('CONFIRMED', 'ON_HOLD')).toBe(true);
    expect(isSalesTransitionAllowed('ON_HOLD', 'CONFIRMED')).toBe(true);
    expect(isSalesTransitionAllowed('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(isSalesTransitionAllowed('ALLOCATED', 'CANCELLED')).toBe(true);
    expect(isSalesTransitionAllowed('DISPATCHED', 'RETURNED')).toBe(true);
    expect(isSalesTransitionAllowed('RETURNED', 'CLOSED')).toBe(true);
  });

  it('strictly rejects illegal transition jumps', () => {
    expect(isSalesTransitionAllowed('DRAFT', 'DISPATCHED')).toBe(false);
    expect(isSalesTransitionAllowed('CONFIRMED', 'DISPATCHED')).toBe(false);
    expect(isSalesTransitionAllowed('CLOSED', 'CONFIRMED')).toBe(false);
    expect(isSalesTransitionAllowed('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(isSalesTransitionAllowed('DRAFT', 'PACKED')).toBe(false);
  });
});

describe('SalesService - RBAC & Admin Notifications', () => {
  let mockPrisma: any;
  let mockPermissions: any;
  let mockAudit: any;
  let mockNotifications: any;
  let salesService: any;

  beforeEach(() => {
    mockPrisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Acme Traders', status: 'ACTIVE' }),
      },
      warehouseLocation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wh-1', name: 'Main Plant Warehouse', status: 'ACTIVE' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'wh-1', name: 'Main Plant Warehouse', status: 'ACTIVE' }),
      },
      salesChannel: {
        findUnique: jest.fn(),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'prod-1', sku: 'SKU-001', name: 'CS8 Stainless Chair', uomId: 'uom-ea', status: 'ACTIVE' },
        ]),
      },
      salesOrder: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'so-123',
          orderNumber: 'SO-2026-00001',
          ...data,
          grandTotal: 1180,
          createdAt: new Date(),
        })),
      },
      salesCreditAuthorization: {
        create: jest.fn().mockResolvedValue({ id: 'credit-auth-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      salesFulfillment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'fulfillment-1' }),
      },
      domainEventOutbox: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    };

    mockPermissions = {
      can: jest.fn().mockResolvedValue(true),
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      notifyRoles: jest.fn().mockResolvedValue([]),
    };

    const { SalesService } = require('./sales.service');
    salesService = new SalesService(mockPrisma, mockPermissions, mockAudit, mockNotifications);
  });

  it('verifies actor has create permission on SalesOrder before order creation', async () => {
    mockPermissions.can.mockResolvedValueOnce(false);

    await expect(
      salesService.create(
        {
          channel: 'B2B_DIRECT',
          customerId: 'cust-1',
          lines: [{ productId: 'prod-1', quantity: 2, unitPrice: 500 }],
          shippingAddress: { name: 'Acme Traders', line1: 'Ring Road', city: 'Indore', state: 'MP', postalCode: '452001' },
        },
        'user-sales-1'
      )
    ).rejects.toThrow(/Lacks permission to create SalesOrder/);

    expect(mockPermissions.can).toHaveBeenCalledWith('user-sales-1', 'create', 'SalesOrder');
  });

  it('dispatches rich notification to admin and super-admin when sales order is created', async () => {
    const result = await salesService.create(
      {
        channel: 'B2B_DIRECT',
        customerId: 'cust-1',
        customerPoNumber: 'PO-ACME-99',
        lines: [{ productId: 'prod-1', quantity: 2, unitPrice: 500 }],
        shippingAddress: { name: 'Acme Traders', line1: 'Ring Road', city: 'Indore', state: 'MP', postalCode: '452001' },
      },
      'user-sales-1'
    );

    expect(result).toBeDefined();
    expect(mockNotifications.notifyRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['admin', 'super-admin', 'store-manager', 'accountant', 'accounts-preparer', 'accounts-reviewer', 'finance-manager'],
        type: 'INFO',
        resource: 'SalesOrder',
        resourceId: 'so-123',
        href: '/sales/orders/so-123',
        title: expect.stringContaining('SO-2026-00001'),
        message: expect.stringContaining('Acme Traders'),
        metadata: expect.objectContaining({
          orderId: 'so-123',
          customerName: 'Acme Traders',
          createdBy: 'user-sales-1',
        }),
      })
    );
  });

  it('omits undefined optional fields from payment terms JSON metadata', async () => {
    await salesService.create(
      {
        channel: 'B2B_DIRECT',
        customerId: 'cust-1',
        paymentTerms: 'NET_30',
        lines: [{ productId: 'prod-1', quantity: 2, unitPrice: 500 }],
        shippingAddress: { name: 'Acme Traders', line1: 'Ring Road', city: 'Indore', state: 'MP', postalCode: '452001' },
      },
      'user-sales-1'
    );

    const references = mockPrisma.salesOrder.create.mock.calls.at(-1)?.[0].data.externalReferences.create;
    expect(references).toHaveLength(1);
    expect(references[0].payload).toEqual({
      system: 'COMMERCIAL_TERMS',
      referenceType: 'PAYMENT_TERMS',
      referenceId: 'NET_30',
      paymentTerms: 'NET_30',
    });
  });

  it('updates an existing draft order lines, addresses, and recalculates totals', async () => {
    mockPrisma.salesOrder.findUnique.mockResolvedValueOnce({
      id: 'so-123',
      orderNumber: 'SO-2026-00001',
      status: 'DRAFT',
      customerId: 'cust-1',
      currency: 'INR',
      metadata: {},
      lines: [
        {
          id: 'sol-1',
          productId: 'prod-1',
          quantityOrdered: 2,
          unitPrice: 500,
        },
      ],
      addresses: [],
    });

    mockPrisma.salesOrder.update = jest.fn().mockImplementation(({ data }) => ({
      id: 'so-123',
      orderNumber: 'SO-2026-00001',
      status: 'DRAFT',
      ...data,
      lines: [
        {
          id: 'sol-2',
          productId: 'prod-1',
          quantityOrdered: 5,
          unitPrice: 600,
        },
      ],
    }));

    mockPrisma.salesOrderLine = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    mockPrisma.salesOrderAddress = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    mockPrisma.user = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-sales-1',
        role: 'admin',
        userRoles: [],
      }),
    };

    const updated = await salesService.update(
      'so-123',
      {
        externalOrderRef: 'PO-NEW-123',
        lines: [
          {
            productId: 'prod-1',
            quantity: 5,
            unitPrice: 600,
            discountAmount: 100,
            taxRate: 0.18,
          },
        ],
        addresses: [
          {
            kind: 'SHIPPING',
            line1: 'MG Road',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560001',
            country: 'IN',
          },
        ],
      },
      'user-sales-1'
    );

    expect(updated).toBeDefined();
    expect(mockPrisma.salesOrderLine.deleteMany).toHaveBeenCalledWith({
      where: { salesOrderId: 'so-123' },
    });
    expect(mockPrisma.salesOrderLine.createMany).toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sales.order_update',
        entityType: 'SalesOrder',
        entityId: 'so-123',
      })
    );
    expect(mockNotifications.notifyRoles).toHaveBeenCalledWith(expect.objectContaining({
      roles: ['admin', 'super-admin', 'store-manager', 'accountant', 'accounts-preparer', 'accounts-reviewer', 'finance-manager'],
      title: expect.stringContaining('SO-2026-00001'),
      resourceId: 'so-123',
    }));
  });

  it('rejects payment recording if actor is purely a sales executive', async () => {
    mockPrisma.user = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-sales-1',
        role: 'sales_executive',
        userRoles: [],
      }),
    };

    await expect(
      salesService.recordPayment(
        'so-123',
        {
          amount: 500,
          method: 'UPI',
        },
        'user-sales-1'
      )
    ).rejects.toThrow(/Sales Executives are not authorized to record customer payments/);
  });

  it('allows payment recording when actor is an accountant or finance manager', async () => {
    mockPrisma.user = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-fin-1',
        role: 'accountant',
        userRoles: [],
      }),
    };

    mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
      id: 'so-123',
      orderNumber: 'SO-2026-00001',
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      grandTotal: 1000,
      lines: [],
      payments: [],
    });

    mockPrisma.salesOrderPayment = {
      create: jest.fn().mockResolvedValue({
        id: 'pay-1',
        salesOrderId: 'so-123',
        amount: 500,
        method: 'NEFT',
        status: 'PAID',
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'pay-1', salesOrderId: 'so-123', amount: 500, status: 'PAID' },
      ]),
    };

    mockPrisma.salesOrder.update = jest.fn().mockResolvedValue({
      id: 'so-123',
      paymentStatus: 'PARTIALLY_PAID',
    });

    const result = await salesService.recordPayment(
      'so-123',
      {
        amount: 500,
        method: 'NEFT',
        reference: 'UTR12345678',
      },
      'user-fin-1'
    );

    expect(result).toBeDefined();
    expect(mockPrisma.salesOrderPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salesOrderId: 'so-123',
          amount: 500,
          method: 'NEFT',
          reference: 'UTR12345678',
          status: 'PAID',
        }),
      })
    );
  });

  it('allows transitioning from DRAFT to ON_HOLD and dispatches admin warning notification', () => {
    expect(isSalesTransitionAllowed('DRAFT', 'ON_HOLD')).toBe(true);
    expect(isSalesTransitionAllowed('ON_HOLD', 'CONFIRMED')).toBe(true);
  });

  it('keeps confirmation separate from inventory allocation', async () => {
    const existingOrder = {
      id: 'so-confirm-1',
      orderNumber: 'SO-2026-00010',
      status: 'DRAFT',
      channel: 'PHYSICAL',
      customerId: 'cust-1',
      warehouseLocationId: 'wh-1',
      paymentStatus: 'PENDING',
      grandTotal: 1000,
      lines: [{ id: 'line-1', orderedQuantity: 2 }],
    };
    const confirmedOrder = { ...existingOrder, status: 'CONFIRMED' };

    mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue(existingOrder);
    mockPrisma.salesOrder.update = jest.fn().mockResolvedValue(confirmedOrder);
    mockPrisma.salesFulfillment.findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.salesFulfillment.create = jest.fn().mockResolvedValue({ id: 'fulfillment-1' });
    mockPrisma.salesCreditAuthorization.create = jest.fn().mockResolvedValue({ id: 'credit-auth-1' });
    mockPrisma.warehouseLocation.findUnique = jest.fn().mockResolvedValue({ fulfillmentV2Enabled: true });
    const internalAllocateOrder = jest.fn();
    salesService.internalAllocateOrder = internalAllocateOrder;

    const result = await salesService.transition('so-confirm-1', 'CONFIRMED', 'test-actor');

    expect(result.status).toBe('CONFIRMED');
    expect(internalAllocateOrder).not.toHaveBeenCalled();
    expect(mockPrisma.salesCreditAuthorization.create).toHaveBeenCalled();
  });

  it('rejects Sales Executive approval and modification attempts', async () => {
    mockPrisma.user = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'sales-user-1',
        role: 'employee',
        userRoles: [{ role: { name: 'sales_executive' } }],
      }),
    };
    mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
      id: 'so-1',
      status: 'CONFIRMED',
      lines: [],
      paymentTerms: 'NET_30',
    });

    await expect(
      salesService.transition('so-1', 'CONFIRMED', 'sales-user-1')
    ).rejects.toThrow(/Only Admin or Store Manager/);

    await expect(
      salesService.update('so-1', { notes: 'Sales revision' }, 'sales-user-1')
    ).rejects.toThrow(/Cannot edit sales order in status|Only Admin or Store Manager/);
  });

  it('allows Admin to override credit limit via INCREASE_LIMIT and confirms order', async () => {
    mockPrisma.user = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'admin-user-1',
        role: 'super_admin',
        userRoles: [],
      }),
    };

    mockPrisma.customer = {
      findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'New Dealer', creditLimit: 50000 }),
      update: jest.fn().mockResolvedValue({ id: 'cust-1', creditLimit: 80000 }),
    };

    mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
      id: 'so-held-1',
      orderNumber: 'SO-2026-00009',
      customerId: 'cust-1',
      channel: 'PHYSICAL',
      warehouseLocationId: 'wh-1',
      status: 'ON_HOLD',
      paymentStatus: 'PENDING',
      grandTotal: 75000,
      lines: [],
      payments: [],
    });

    mockPrisma.salesOrder.update = jest.fn().mockResolvedValue({
      id: 'so-held-1',
      orderNumber: 'SO-2026-00009',
      status: 'CONFIRMED',
      grandTotal: 75000,
    });

    mockPrisma.$transaction = jest.fn().mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    const result = await salesService.overrideCreditAndConfirm(
      'so-held-1',
      {
        overrideType: 'INCREASE_LIMIT',
        newCreditLimit: 80000,
        notes: 'Approved expansion for festive dealer stock',
      },
      'admin-user-1'
    );

    expect(result.status).toBe('CONFIRMED');
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { creditLimit: 80000 },
    });
    expect(mockNotifications.notifyRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'APPROVED',
        title: expect.stringContaining('Credit Hold Approved'),
      })
    );
  });

  describe('Remediation & Data-Consistency Gates', () => {
    it('rejects zero or negative payment amounts', async () => {
      await expect(
        salesService.recordPayment('so-123', { amount: 0, method: 'CASH' }, 'test-actor')
      ).rejects.toThrow(/Payment amount must be greater than zero/);

      await expect(
        salesService.recordPayment('so-123', { amount: -50, method: 'CASH' }, 'test-actor')
      ).rejects.toThrow(/Payment amount must be greater than zero/);
    });

    it('rejects payment amounts exceeding the remaining order balance', async () => {
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
        id: 'so-123',
        grandTotal: 1000,
        payments: [{ id: 'p1', amount: 800, status: 'PAID' }],
        lines: [],
      });

      await expect(
        salesService.recordPayment('so-123', { amount: 300, method: 'NEFT' }, 'test-actor')
      ).rejects.toThrow(/exceeds remaining order balance/);
    });

    it('returns existing order idempotently when payment reference is repeated', async () => {
      const existingOrder = {
        id: 'so-123',
        grandTotal: 1000,
        payments: [{ id: 'p1', reference: 'UTR-9999', amount: 500, status: 'PAID' }],
        lines: [],
      };
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue(existingOrder);

      const result = await salesService.recordPayment(
        'so-123',
        { amount: 500, method: 'NEFT', reference: 'UTR-9999' },
        'test-actor'
      );
      expect(result).toEqual(existingOrder);
    });

    it('rejects return creation if requested quantity exceeds shipped minus returned quantity', async () => {
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
        id: 'so-123',
        status: 'DISPATCHED',
        lines: [
          { id: 'line-1', sku: 'SKU-001', shippedQuantity: 10, returnedQuantity: 8 },
        ],
      });

      await expect(
        salesService.createReturn(
          'so-123',
          { reason: 'Defective item', items: [{ salesOrderLineId: 'line-1', quantity: 3 }] },
          'test-actor'
        )
      ).rejects.toThrow(/Cannot return 3 units/);
    });

    it('records return request lines separately from completed credits', async () => {
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
        id: 'so-123', currency: 'INR', status: 'DISPATCHED',
        lines: [{ id: 'line-1', sku: 'SKU-001', shippedQuantity: 3, returnedQuantity: 0 }],
      });
      mockPrisma.salesFinancialReturn = { create: jest.fn().mockResolvedValue({ id: 'return-1' }) };
      mockPrisma.salesOrderLine = { update: jest.fn().mockResolvedValue({}) };
      mockPrisma.salesOrderException = { create: jest.fn().mockResolvedValue({}) };
      mockPrisma.salesOrder.update = jest.fn().mockResolvedValue({ id: 'so-123', status: 'RETURNED' });

      await salesService.createReturn('so-123', { reason: 'Damaged', items: [{ salesOrderLineId: 'line-1', quantity: 1 }] }, 'user-sales-1');

      expect(mockPrisma.salesFinancialReturn.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          salesOrderId: 'so-123', status: 'REQUESTED', currency: 'INR',
          lines: { create: [{ salesOrderLineId: 'line-1', quantity: '1' }] },
        }),
      }));
    });

    it('records actual credited net and tax amounts on return completion', async () => {
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
        id: 'so-123', status: 'RETURNED', payments: [], lines: [],
      });
      mockPrisma.salesOrderException = {
        findFirst: jest.fn().mockResolvedValue({ id: 'exception-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      mockPrisma.salesFinancialReturn = {
        findFirst: jest.fn().mockResolvedValue({ id: 'return-1' }),
        update: jest.fn().mockResolvedValue({}),
      };
      mockPrisma.salesOrder.update = jest.fn().mockResolvedValue({ id: 'so-123', status: 'CLOSED' });

      await salesService.processReturnDisposition('so-123', {
        disposition: 'QUARANTINE', creditedNetAmount: 90, taxCreditAmount: 10,
      }, 'user-sales-1');

      expect(mockPrisma.salesFinancialReturn.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'return-1' },
        data: expect.objectContaining({ status: 'COMPLETED', creditedNetAmount: '90', taxCreditAmount: '10', completedByActorId: 'user-sales-1' }),
      }));
    });

    it('rejects return disposition if order is not in RETURNED status', async () => {
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue({
        id: 'so-123',
        status: 'CLOSED',
        lines: [],
      });

      await expect(
        salesService.processReturnDisposition(
          'so-123',
          { disposition: 'RESTOCK' },
          'test-actor'
        )
      ).rejects.toThrow(/Return disposition can only be processed on orders in RETURNED status/);
    });

    it('rejects POS checkout when warehouse stock is insufficient', async () => {
      mockPrisma.warehouseLocation.findUnique = jest.fn().mockResolvedValue({
        id: 'loc-store',
        name: 'Flagship Store',
      });
      mockPrisma.product.findMany = jest.fn().mockResolvedValue([
        { id: 'prod-1', sku: 'SKU-100', name: 'Almond Milk', uomId: 'uom-1' },
      ]);
      mockPrisma.inventoryBalance = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'bal-1',
          quantity: 3,
          reserved: 1,
        }),
      } as any;

      await expect(
        salesService.posCheckout(
          {
            warehouseLocationId: 'loc-store',
            lines: [{ productId: 'prod-1', quantity: 5, unitPrice: 100 }],
          },
          'cashier-1'
        )
      ).rejects.toThrow(/Insufficient available stock/);
    });

    it('rejects Amazon import when an unmapped SKU is encountered', async () => {
      mockPrisma.salesOrder.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.salesOrder.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.product.findMany = jest.fn().mockResolvedValue([]); // SKU not in DB
      mockPrisma.warehouseLocation.findFirst = jest.fn().mockResolvedValue({ id: 'loc-1', status: 'ACTIVE' });

      await expect(
        salesService.importAmazonOrder(
          {
            amazonOrderId: 'AMZ-404',
            purchaseDate: new Date().toISOString(),
            orderStatus: 'Unshipped',
            buyerName: 'Jane Doe',
            items: [
              {
                orderItemId: 'item-1',
                sku: 'NON-EXISTENT-SKU',
                title: 'Mysterious Item',
                quantity: 1,
                itemPrice: 500,
              },
            ],
          },
          'system'
        )
      ).rejects.toThrow(/Amazon import failed: Product SKU 'NON-EXISTENT-SKU'/);
    });

    it('ensures generic sales order creation always initializes in DRAFT status', async () => {
      mockPrisma.customer.findUnique = jest.fn().mockResolvedValue({ id: 'cust-1', status: 'ACTIVE' });
      mockPrisma.product.findMany = jest.fn().mockResolvedValue([
        { id: 'p-1', sku: 'SKU-1', status: 'ACTIVE', uomId: 'uom-1' },
      ]);
      mockPrisma.salesOrder.create = jest.fn().mockImplementation(({ data }) => ({
        id: 'so-created',
        ...data,
      }));

      const created = await salesService.create(
        {
          channel: 'STORE_POS',
          customerId: 'cust-1',
          shippingAddress: {
            line1: '123 Market Road',
            city: 'Bengaluru',
            postalCode: '560001',
          },
          lines: [{ productId: 'p-1', quantity: 1, unitPrice: 100 }],
        },
        'sales-exec-1'
      );

      expect(created.status).toBe('DRAFT');
      expect(created.paymentStatus).toBe('PENDING');
    });
  });
});
