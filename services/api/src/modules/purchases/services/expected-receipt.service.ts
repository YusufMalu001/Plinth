import { ExpectedReceipt, ExpectedReceiptStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { prisma } from '../../../database';
import { uploadGrnDocument, UploadableFile } from '../../../common/storage/supabase-storage.client';
import {
  NotFoundError,
  InvalidStateTransitionError,
  ForbiddenError
} from '../../../common/errors/AppError';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export class ExpectedReceiptService {
  constructor(
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async listReceipts(options: {
    skip?: number;
    take?: number;
    status?: string;
    poId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
    overdueOnly?: boolean;
  }): Promise<{ items: ExpectedReceipt[]; total: number; page?: number; limit?: number; totalPages?: number; summary: { total: number; pending: number; partiallyReceived: number; fullyReceived: number; overdue: number } }> {
    // Older approved POs may predate automatic dispatch and therefore have no
    // ExpectedReceipt rows yet. Backfill those rows when the queue is opened
    // so every receivable PO is visible without requiring a manual resend.
    await this.ensureExpectedReceipts();

    const where: Prisma.ExpectedReceiptWhereInput = {};

    const basePoLineCondition: Prisma.PurchaseOrderLineWhereInput = options.poId
      ? { poId: options.poId }
      : { purchaseOrder: { status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'] } } };

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.AND = [
        { poLine: basePoLineCondition },
        {
          OR: [
            { poLine: { purchaseOrder: { poNumber: { contains: term, mode: 'insensitive' } } } },
            { poLine: { purchaseOrder: { vendor: { name: { contains: term, mode: 'insensitive' } } } } },
            { poLine: { product: { name: { contains: term, mode: 'insensitive' } } } },
            { poLine: { product: { sku: { contains: term, mode: 'insensitive' } } } },
            { poLine: { material: { name: { contains: term, mode: 'insensitive' } } } },
            { poLine: { material: { code: { contains: term, mode: 'insensitive' } } } },
          ]
        }
      ];
    } else {
      where.poLine = basePoLineCondition;
    }

    if (options.dateFrom || options.dateTo) {
      where.expectedDate = {};
      if (options.dateFrom) where.expectedDate.gte = new Date(`${options.dateFrom}T00:00:00.000Z`);
      if (options.dateTo) {
        const endExclusive = new Date(`${options.dateTo}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        where.expectedDate.lt = endExclusive;
      }
    }

    // Summary cards describe the entire filtered date/search set, independent
    // of the current status tab and page.
    const summaryWhere: Prisma.ExpectedReceiptWhereInput = { ...where };
    if (options.status && options.status !== 'ALL') {
      where.status = options.status as ExpectedReceiptStatus;
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (options.overdueOnly) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { expectedDate: { lt: today }, status: { in: ['PENDING', 'PARTIALLY_RECEIVED'] } },
      ];
    }

    // Dynamic sorting
    let orderBy: Prisma.ExpectedReceiptOrderByWithRelationInput = { expectedDate: 'asc' };
    const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';

    if (options.sortBy === 'expectedDate') {
      orderBy = { expectedDate: sortOrder };
    } else if (options.sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    } else if (options.sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else if (options.sortBy === 'poNumber') {
      orderBy = { poLine: { purchaseOrder: { poNumber: sortOrder } } };
    } else if (options.sortBy === 'vendor') {
      orderBy = { poLine: { purchaseOrder: { vendor: { name: sortOrder } } } };
    } else if (options.sortBy === 'poCreatedAt') {
      orderBy = { poLine: { purchaseOrder: { createdAt: sortOrder } } };
    } else if (!options.sortBy) {
      orderBy = { createdAt: 'desc' };
    }
    const take = options.take || 10;
    const skip = options.skip || 0;
    const page = Math.floor(skip / take) + 1;
    const [items, total, summaryTotal, pending, partiallyReceived, fullyReceived, overdue] = await Promise.all([
      prisma.expectedReceipt.findMany({
        where,
        skip,
        take,
        include: {
          poLine: {
            include: {
              purchaseOrder: {
                include: {
                  vendor: true
                }
              },
              product: true,
              material: true,
              uom: true
            }
          }
        },
        orderBy
      }),
      prisma.expectedReceipt.count({ where }),
      prisma.expectedReceipt.count({ where: summaryWhere }),
      prisma.expectedReceipt.count({ where: { ...summaryWhere, status: 'PENDING' } }),
      prisma.expectedReceipt.count({ where: { ...summaryWhere, status: 'PARTIALLY_RECEIVED' } }),
      prisma.expectedReceipt.count({ where: { ...summaryWhere, status: 'FULLY_RECEIVED' } }),
      prisma.expectedReceipt.count({
        where: {
          ...summaryWhere,
          AND: [
            ...(Array.isArray(summaryWhere.AND) ? summaryWhere.AND : summaryWhere.AND ? [summaryWhere.AND] : []),
            { expectedDate: { lt: today }, status: { in: ['PENDING', 'PARTIALLY_RECEIVED'] } },
          ],
        },
      }),
    ]);
    const totalPages = Math.ceil(total / take);
    const mappedItems = items.map(item => ({
      ...item,
      poId: item.poLine?.poId || item.poLine?.purchaseOrder?.id || null,
      po: item.poLine?.purchaseOrder ? {
        id: item.poLine.purchaseOrder.id,
        poNumber: item.poLine.purchaseOrder.poNumber
      } : null
    }));

    return {
      items: mappedItems as unknown as ExpectedReceipt[], total, page, limit: take, totalPages,
      summary: { total: summaryTotal, pending, partiallyReceived, fullyReceived, overdue },
    };
  }

  private async ensureExpectedReceipts(): Promise<void> {
    const orders = await prisma.purchaseOrder.findMany({
      where: { status: { in: ['APPROVED', 'SENT'] } },
      select: {
        lines: {
          select: {
            id: true,
            quantity: true,
            needDate: true,
            expectedReceipts: { select: { id: true }, take: 1 }
          }
        }
      }
    });

    const missing = orders.flatMap(order => order.lines.filter(line => line.expectedReceipts.length === 0));
    await Promise.all(missing.map(line => prisma.expectedReceipt.create({
      data: {
        poLineId: line.id,
        expectedQuantity: line.quantity,
        expectedDate: line.needDate,
        status: 'PENDING'
      }
    })));
  }

  async getReceipt(id: string) {
    const receipt = await prisma.expectedReceipt.findUnique({
      where: { id },
      include: { poLine: { include: { purchaseOrder: { include: { vendor: true, sourcePr: true } }, product: true, material: true, uom: true } } }
    });
    if (!receipt) throw new NotFoundError(`ExpectedReceipt [${id}] not found.`);
    const poId = receipt.poLine.poId;
    const documents = await prisma.procurementDocument.findMany({ where: { poId }, orderBy: { createdAt: 'desc' }, include: { uploader: { select: { id: true, name: true, email: true } } } });
    return {
      ...receipt,
      poId,
      po: receipt.poLine.purchaseOrder ? {
        id: receipt.poLine.purchaseOrder.id,
        poNumber: receipt.poLine.purchaseOrder.poNumber
      } : null,
      documents
    };
  }

  async updateReceipt(id: string, actorId: string, newStatus: ExpectedReceiptStatus, requestId?: string): Promise<ExpectedReceipt> {
    const before = await prisma.expectedReceipt.findUnique({ where: { id }, include: { poLine: true } });
    if (!before) throw new NotFoundError(`ExpectedReceipt [${id}] not found.`);

    const canUpdate = await this.permissionChecker.can(actorId, 'submit', 'ExpectedReceipt');
    if (!canUpdate) throw new ForbiddenError(`Lacks permission to update ExpectedReceipt.`);

    const updated = await prisma.$transaction((tx) => this.applyReceiptStatusChange(tx, id, newStatus));

    await this.auditWriter.record({
      actorId,
      action: 'expected_receipt.update',
      entityType: 'ExpectedReceipt',
      entityId: id,
      before,
      after: updated,
      requestId
    });

    return updated;
  }

  async uploadReceiptDocument(id: string, actorId: string, file: UploadableFile) {
    const receipt = await prisma.expectedReceipt.findUnique({ where: { id }, include: { poLine: true } });
    if (!receipt) throw new NotFoundError(`ExpectedReceipt [${id}] not found.`);
    const uploaded = await uploadGrnDocument(`expected-receipt/${id}`, file);
    return prisma.procurementDocument.create({ data: { poId: receipt.poLine.poId, fileUrl: uploaded.publicUrl, fileName: file.originalname, uploadedBy: actorId } });
  }

  /**
   * Transaction-aware core write, reused verbatim by updateReceipt's manual-route path above.
   * Kept separate so callers already inside a transaction (e.g. GRN finalize) can compose it
   * without nesting a second $transaction.
   */
  async applyReceiptStatusChange(
    tx: PrismaOrTx,
    expectedReceiptId: string,
    newStatus: ExpectedReceiptStatus
  ): Promise<ExpectedReceipt> {
    const receipt = await tx.expectedReceipt.findUnique({ where: { id: expectedReceiptId }, include: { poLine: true } });
    if (!receipt) throw new NotFoundError(`ExpectedReceipt [${expectedReceiptId}] not found.`);
    if (receipt.status === 'FULLY_RECEIVED') {
      throw new InvalidStateTransitionError(`Cannot update receipt from terminal state [${receipt.status}].`);
    }

    const updated = await tx.expectedReceipt.update({
      where: { id: expectedReceiptId },
      data: { status: newStatus }
    });

    return updated;
  }

  /**
   * Called from GoodsReceiptService.finalize() inside its own transaction, once per unique
   * poLineId touched by the GRN. Derives ExpectedReceipt/PO status from cumulative accepted
   * quantity across all FINALIZED GRN lines against this PO line, rather than accepting a
   * caller-supplied status like applyReceiptStatusChange does above.
   */
  async syncPoLineReceiptStatus(tx: PrismaOrTx, poLineId: string): Promise<void> {
    const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
      where: { id: poLineId },
      include: {
        expectedReceipts: true,
        goodsReceiptLines: { include: { grn: true } }
      }
    });

    const cumulativeAccepted = poLine.goodsReceiptLines
      .filter((line) => line.grn.status === 'FINALIZED')
      .reduce((sum, line) => sum + line.acceptedQuantity, 0);

    const derived: ExpectedReceiptStatus = cumulativeAccepted >= poLine.quantity ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';

    for (const er of poLine.expectedReceipts) {
      if (er.status !== 'FULLY_RECEIVED' && er.status !== derived) {
        await tx.expectedReceipt.update({ where: { id: er.id }, data: { status: derived } });
      }
    }

  }

}
