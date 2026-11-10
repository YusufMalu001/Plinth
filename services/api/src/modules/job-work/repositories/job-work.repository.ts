import { PrismaClient, Prisma, JobWorkOrderStatus, JobWorkReconciliationStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

const JOB_WORK_ORDER_INCLUDE = {
  vendor: { select: { id: true, code: true, name: true, contactEmail: true, contactPhone: true } },
  purchaseOrder: { select: { id: true, poNumber: true, status: true, totalAmount: true } },
  product: { select: { id: true, sku: true, name: true } },
  targetUom: { select: { id: true, code: true, name: true, symbol: true } },
  deliveryLocation: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  closedBy: { select: { id: true, name: true, email: true } },
  lines: {
    include: {
      material: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, sku: true, name: true } },
      uom: { select: { id: true, code: true, name: true, symbol: true } }
    }
  },
  challans: {
    include: {
      material: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, sku: true, name: true } },
      uom: { select: { id: true, code: true, name: true, symbol: true } },
      dispatchLocation: { select: { id: true, code: true, name: true } },
      issuedBy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { issuedAt: 'desc' }
  },
  returns: {
    include: {
      material: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, sku: true, name: true } },
      uom: { select: { id: true, code: true, name: true, symbol: true } },
      location: { select: { id: true, code: true, name: true } },
      goodsReceipt: { select: { id: true, grnNumber: true, status: true } },
      receivedBy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { receivedAt: 'desc' }
  },
  reconciliations: {
    include: {
      debitNote: { select: { id: true, debitNoteNumber: true, status: true, totalAmount: true } },
      returnReceipt: { select: { id: true, returnNumber: true, shortQuantity: true, excessQuantity: true } },
      reconciledBy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { reconciledAt: 'desc' }
  }
} satisfies Prisma.JobWorkOrderInclude;

export class JobWorkRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findOrderById(id: string, client: PrismaOrTx = this.prisma) {
    return client.jobWorkOrder.findUnique({
      where: { id },
      include: JOB_WORK_ORDER_INCLUDE
    });
  }

  async findOrderByNumber(orderNumber: string, client: PrismaOrTx = this.prisma) {
    return client.jobWorkOrder.findUnique({
      where: { orderNumber },
      include: JOB_WORK_ORDER_INCLUDE
    });
  }

  async getNextOrderNumber(year = '2026', client: PrismaOrTx = this.prisma): Promise<string> {
    const prefix = `JWO-${year}-`;
    if (typeof (client as any).jobWorkOrder?.findFirst === 'function') {
      const latest = await (client as any).jobWorkOrder.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true }
      });
      if (latest?.orderNumber) {
        const lastNum = parseInt(latest.orderNumber.replace(prefix, ''), 10) || 0;
        return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
      }
    }
    const count = await this.countOrders(prefix);
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async getNextChallanNumber(year = '2026', client: PrismaOrTx = this.prisma): Promise<string> {
    const prefix = `JWC-${year}-`;
    if (typeof (client as any).jobWorkMaterialIssue?.findFirst === 'function') {
      const latest = await (client as any).jobWorkMaterialIssue.findFirst({
        where: { challanNumber: { startsWith: prefix } },
        orderBy: { challanNumber: 'desc' },
        select: { challanNumber: true }
      });
      if (latest?.challanNumber) {
        const lastNum = parseInt(latest.challanNumber.replace(prefix, ''), 10) || 0;
        return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
      }
    }
    const count = await this.countChallans(prefix);
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async getNextReturnNumber(year = '2026', client: PrismaOrTx = this.prisma): Promise<string> {
    const prefix = `JWR-${year}-`;
    if (typeof (client as any).jobWorkReceiptReturn?.findFirst === 'function') {
      const latest = await (client as any).jobWorkReceiptReturn.findFirst({
        where: { returnNumber: { startsWith: prefix } },
        orderBy: { returnNumber: 'desc' },
        select: { returnNumber: true }
      });
      if (latest?.returnNumber) {
        const lastNum = parseInt(latest.returnNumber.replace(prefix, ''), 10) || 0;
        return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
      }
    }
    const count = await this.countReturns(prefix);
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async getNextLedgerEntryNumber(year = '2026', client: PrismaOrTx = this.prisma): Promise<string> {
    const prefix = `JWL-${year}-`;
    if (typeof (client as any).jobWorkCustodyLedger?.findFirst === 'function') {
      const latest = await (client as any).jobWorkCustodyLedger.findFirst({
        where: { entryNumber: { startsWith: prefix } },
        orderBy: { entryNumber: 'desc' },
        select: { entryNumber: true }
      });
      if (latest?.entryNumber) {
        const lastNum = parseInt(latest.entryNumber.replace(prefix, ''), 10) || 0;
        return `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
      }
    }
    const count = await this.countLedgerEntries(prefix);
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async countOrders(prefix = 'JWO-') {
    return this.prisma.jobWorkOrder.count({
      where: { orderNumber: { startsWith: prefix } }
    });
  }

  async countChallans(prefix = 'JWC-') {
    return this.prisma.jobWorkMaterialIssue.count({
      where: { challanNumber: { startsWith: prefix } }
    });
  }

  async countReturns(prefix = 'JWR-') {
    return this.prisma.jobWorkReceiptReturn.count({
      where: { returnNumber: { startsWith: prefix } }
    });
  }

  async countReconciliations(prefix = 'JREC-') {
    return this.prisma.jobWorkReconciliation.count({
      where: { reconciliationNumber: { startsWith: prefix } }
    });
  }

  async countLedgerEntries(prefix = 'JWL-') {
    return this.prisma.jobWorkCustodyLedger.count({
      where: { entryNumber: { startsWith: prefix } }
    });
  }

  async createOrder(
    data: Prisma.JobWorkOrderCreateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkOrder.create({
      data,
      include: JOB_WORK_ORDER_INCLUDE
    });
  }

  async updateOrder(
    id: string,
    data: Prisma.JobWorkOrderUpdateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkOrder.update({
      where: { id },
      data,
      include: JOB_WORK_ORDER_INCLUDE
    });
  }

  async listOrders(params: {
    vendorId?: string;
    status?: JobWorkOrderStatus;
    productId?: string;
    materialId?: string;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWorkOrderWhereInput = {};
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.status) where.status = params.status;
    if (params.productId) where.productId = params.productId;
    if (params.materialId) {
      where.lines = { some: { materialId: params.materialId } };
    }
    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { natureOfProcessing: { contains: params.search, mode: 'insensitive' } },
        { vendor: { name: { contains: params.search, mode: 'insensitive' } } }
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.jobWorkOrder.findMany({
        where,
        include: JOB_WORK_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take
      }),
      this.prisma.jobWorkOrder.count({ where })
    ]);

    return { items, total };
  }

  async createMaterialIssue(
    data: Prisma.JobWorkMaterialIssueCreateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkMaterialIssue.create({
      data,
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        dispatchLocation: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
        uom: { select: { id: true, code: true, name: true, symbol: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
        jobWorkOrder: { select: { id: true, orderNumber: true } }
      }
    });
  }

  async findChallanById(id: string, client: PrismaOrTx = this.prisma) {
    return client.jobWorkMaterialIssue.findUnique({
      where: { id },
      include: {
        vendor: true,
        dispatchLocation: true,
        material: true,
        product: true,
        uom: true,
        issuedBy: true,
        jobWorkOrder: {
          include: { lines: true }
        }
      }
    });
  }

  async listChallans(params: {
    vendorId?: string;
    jobWorkOrderId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWorkMaterialIssueWhereInput = {};
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.jobWorkOrderId) where.jobWorkOrderId = params.jobWorkOrderId;

    const [items, total] = await Promise.all([
      this.prisma.jobWorkMaterialIssue.findMany({
        where,
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          dispatchLocation: { select: { id: true, code: true, name: true } },
          material: { select: { id: true, code: true, name: true } },
          product: { select: { id: true, sku: true, name: true } },
          uom: { select: { id: true, code: true, name: true, symbol: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
          jobWorkOrder: { select: { id: true, orderNumber: true } }
        },
        orderBy: { issuedAt: 'desc' },
        skip: params.skip,
        take: params.take
      }),
      this.prisma.jobWorkMaterialIssue.count({ where })
    ]);

    return { items, total };
  }

  async createCustodyLedgerEntry(
    data: Prisma.JobWorkCustodyLedgerCreateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkCustodyLedger.create({
      data,
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
        uom: { select: { id: true, code: true, name: true, symbol: true } }
      }
    });
  }

  async getLatestVendorCustodyEntry(params: {
    vendorId: string;
    materialId?: string | null;
    productId?: string | null;
  }, client: PrismaOrTx = this.prisma) {
    return client.jobWorkCustodyLedger.findFirst({
      where: {
        vendorId: params.vendorId,
        materialId: params.materialId ?? undefined,
        productId: params.productId ?? undefined
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listCustodyLedger(params: {
    vendorId?: string;
    jobWorkOrderId?: string;
    materialId?: string;
    productId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWorkCustodyLedgerWhereInput = {};
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.jobWorkOrderId) where.jobWorkOrderId = params.jobWorkOrderId;
    if (params.materialId) where.materialId = params.materialId;
    if (params.productId) where.productId = params.productId;

    const [items, total] = await Promise.all([
      this.prisma.jobWorkCustodyLedger.findMany({
        where,
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          jobWorkOrder: { select: { id: true, orderNumber: true } },
          materialIssue: { select: { id: true, challanNumber: true } },
          material: { select: { id: true, code: true, name: true } },
          product: { select: { id: true, sku: true, name: true } },
          uom: { select: { id: true, code: true, name: true, symbol: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take
      }),
      this.prisma.jobWorkCustodyLedger.count({ where })
    ]);

    return { items, total };
  }

  async createReceiptReturn(
    data: Prisma.JobWorkReceiptReturnCreateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkReceiptReturn.create({
      data,
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        jobWorkOrder: { select: { id: true, orderNumber: true } },
        goodsReceipt: { select: { id: true, grnNumber: true, status: true } },
        location: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
        uom: { select: { id: true, code: true, name: true, symbol: true } },
        receivedBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async findReturnById(id: string, client: PrismaOrTx = this.prisma) {
    return client.jobWorkReceiptReturn.findUnique({
      where: { id },
      include: {
        vendor: true,
        jobWorkOrder: { include: { lines: true } },
        goodsReceipt: true,
        location: true,
        product: true,
        material: true,
        uom: true,
        receivedBy: true,
        reconciliations: true
      }
    });
  }

  async listReturns(params: {
    vendorId?: string;
    jobWorkOrderId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWorkReceiptReturnWhereInput = {};
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.jobWorkOrderId) where.jobWorkOrderId = params.jobWorkOrderId;

    const [items, total] = await Promise.all([
      this.prisma.jobWorkReceiptReturn.findMany({
        where,
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          jobWorkOrder: { select: { id: true, orderNumber: true } },
          goodsReceipt: { select: { id: true, grnNumber: true, status: true } },
          location: { select: { id: true, code: true, name: true } },
          product: { select: { id: true, sku: true, name: true } },
          material: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true, name: true, symbol: true } },
          receivedBy: { select: { id: true, name: true, email: true } }
        },
        orderBy: { receivedAt: 'desc' },
        skip: params.skip,
        take: params.take
      }),
      this.prisma.jobWorkReceiptReturn.count({ where })
    ]);

    return { items, total };
  }

  async createReconciliation(
    data: Prisma.JobWorkReconciliationCreateInput,
    client: PrismaOrTx = this.prisma
  ) {
    return client.jobWorkReconciliation.create({
      data,
      include: {
        jobWorkOrder: { select: { id: true, orderNumber: true, vendorId: true } },
        returnReceipt: { select: { id: true, returnNumber: true, shortQuantity: true, excessQuantity: true } },
        debitNote: { select: { id: true, debitNoteNumber: true, status: true, totalAmount: true } },
        reconciledBy: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async listReconciliations(params: {
    jobWorkOrderId?: string;
    status?: JobWorkReconciliationStatus;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWorkReconciliationWhereInput = {};
    if (params.jobWorkOrderId) where.jobWorkOrderId = params.jobWorkOrderId;
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.jobWorkReconciliation.findMany({
        where,
        include: {
          jobWorkOrder: { select: { id: true, orderNumber: true, vendorId: true } },
          returnReceipt: { select: { id: true, returnNumber: true, shortQuantity: true, excessQuantity: true } },
          debitNote: { select: { id: true, debitNoteNumber: true, status: true, totalAmount: true } },
          reconciledBy: { select: { id: true, name: true, email: true } }
        },
        orderBy: { reconciledAt: 'desc' },
        skip: params.skip,
        take: params.take
      }),
      this.prisma.jobWorkReconciliation.count({ where })
    ]);

    return { items, total };
  }
}
