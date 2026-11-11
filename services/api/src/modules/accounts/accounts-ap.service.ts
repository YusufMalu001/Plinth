import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database';
import { ConflictError, ForbiddenError, InvalidStateTransitionError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { notificationService } from '../notifications/notification.service';

type BillLineInput = {
  description: string;
  hsnSacCode?: string;
  poLineId?: string;
  grnLineId?: string;
  debitAccountId?: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
};
type BillInput = {
  entityId: string;
  vendorId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kind: 'STOCK' | 'SERVICE' | 'CAPITAL' | 'LOGISTICS';
  lines: BillLineInput[];
};
type GrnPaymentRow = {
  id: string;
  paymentDate: Date;
  amount: Prisma.Decimal;
  paymentMode: string;
  reference: string;
  notes: string | null;
  createdAt: Date;
  recordedById: string;
  recorderName: string | null;
  recorderEmail: string;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = (value: string, scale = 2) => {
  const pattern = scale === 2 ? /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/;
  if (!pattern.test(value)) throw new ValidationError(`Amount must be a non-negative value with at most ${scale} decimal places.`);
  return new Prisma.Decimal(value);
};
const dateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('Dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError('Invalid calendar date.');
  return date;
};
const normalizedInvoice = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');
const effectiveGrnUnitPrice = (invoicePrice: unknown, poPrice: unknown) => {
  const verifiedPrice = new Prisma.Decimal(String(invoicePrice ?? 0));
  return verifiedPrice.gt(0) ? verifiedPrice : new Prisma.Decimal(String(poPrice ?? 0));
};
const catalogHsnCode = (...values: unknown[]) => {
  for (const value of values) {
    const record = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    for (const key of ['hsnCode', 'hsn']) {
      const code = record[key];
      if (typeof code === 'string' && code.trim()) return code.trim();
    }
  }
  return undefined;
};
const resolveBillLineCatalogDetails = (lines: any[]) => lines.map(line => {
  const itemName = line.poLine?.product?.name || line.poLine?.material?.name
    || line.grnLine?.product?.name || line.grnLine?.material?.name;
  const hasPlaceholderDescription = /^(?:received item(?:\s+\d+)?|receipt item)$/i.test(String(line.description || '').trim());
  const hsnSacCode = line.hsnSacCode?.trim()
    || catalogHsnCode(line.poLine?.product?.metadata, line.grnLine?.product?.metadata,
      line.poLine?.material?.specs, line.grnLine?.material?.specs);
  return {
    ...line,
    description: hasPlaceholderDescription && itemName ? itemName : line.description,
    hsnSacCode: hsnSacCode || line.hsnSacCode,
  };
});
const paymentModes = ['NEFT_RTGS', 'UPI', 'CHEQUE', 'CASH', 'INTERNAL_TRANSFER'] as const;
const billInclude = {
  lines: {
    include: {
      poLine: {
        include: {
          purchaseOrder: true,
          product: { select: { id: true, name: true, sku: true, metadata: true } },
          material: { select: { id: true, name: true, code: true, specs: true } },
          uom: { select: { id: true, name: true, symbol: true } }
        }
      },
      grnLine: {
        include: {
          grn: true,
          product: { select: { id: true, name: true, sku: true, metadata: true } },
          material: { select: { id: true, name: true, code: true, specs: true } },
          uom: { select: { id: true, name: true, symbol: true } }
        }
      },
      debitAccount: true
    },
    orderBy: { lineNumber: 'asc' as const }
  },
  vendor: {
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
      taxNumber: true,
      status: true,
      address: true,
      contactEmail: true,
      contactPhone: true,
      paymentTerms: true,
      currency: true,
      deactivatedAt: true
    }
  },
  entity: true
};

export class AccountsPayablesService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Create the Accounts work item when a PO-backed GRN is finalized. This is a
   * draft only: the physical receipt supplies quantities and the PO supplies
   * provisional pricing, while Accounts must replace the pending reference and
   * verify the supplier invoice before submitting or posting it.
   */
  async ensureDraftForFinalizedGrn(grnId: string, actorId: string, requestId?: string) {
    // The repository's generated Prisma client can lag schema relation fields
    // during local development; keep the persisted query shape explicit here.
    const grn: any = await (this.db.goodsReceiptNote as any).findUnique({
      where: { id: grnId },
      include: {
        vendor: true,
        po: { include: { lines: { include: {
          product: { select: { name: true, metadata: true } },
          material: { select: { name: true, specs: true } },
        } } } },
        jobWorkReceiptReturn: {
          include: {
            jobWorkOrder: {
              include: {
                product: { select: { name: true, metadata: true } },
                targetUom: true,
                lines: { include: {
                  product: { select: { name: true, metadata: true } },
                  material: { select: { name: true, specs: true } },
                  uom: true,
                } }
              }
            }
          }
        },
        lines: {
          include: {
            poLine: { include: {
              product: { select: { name: true, metadata: true } },
              material: { select: { name: true, specs: true } },
            } },
            product: { select: { name: true, metadata: true } },
            material: { select: { name: true, specs: true } },
          },
        },
      },
    });
    const isJobWork = Boolean(grn?.jobWorkReceiptReturn?.jobWorkOrder);
    if (!grn || grn.status !== 'FINALIZED' || grn.isUnreferenced || (!grn.po && !isJobWork) || !grn.vendor) return null;
    const grnLines: any[] = grn.lines;
    const poLines: any[] = grn.po?.lines || [];

    const alreadyLinked = await this.db.purchaseBill.findFirst({
      where: { status: { not: 'CANCELLED' }, lines: { some: { grnLineId: { in: grnLines.map(line => line.id) } } } },
      include: billInclude,
    });
    if (alreadyLinked) return { ...alreadyLinked, lines: resolveBillLineCatalogDetails(alreadyLinked.lines) };

    const entity = await this.db.accountingEntity.findUnique({ where: { code: 'PLINTH-IN' } });
    if (!entity || !['CONFIGURING', 'ACTIVE'].includes(entity.status)) {
      throw new ValidationError('Initialize the Plinth Accounts book before finalizing supplier bill capture.');
    }
    if (!['APPROVED', 'ACTIVE'].includes(grn.vendor.status) || grn.vendor.deactivatedAt || (!isJobWork && grn.po.vendorId !== grn.vendorId)) {
      throw new ValidationError('The GRN vendor must be active or approved before creating an Accounts draft.');
    }

    const invoiceDate = new Date(Date.UTC(grn.receivedAt.getUTCFullYear(), grn.receivedAt.getUTCMonth(), grn.receivedAt.getUTCDate()));
    const termsDays = Number(grn.vendor.paymentTerms?.match(/\d+/)?.[0] || 0);
    const dueDate = new Date(invoiceDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + (Number.isFinite(termsDays) ? termsDays : 0));
    const pendingReference = `PENDING-${grn.grnNumber}`;
    const billKey = `AUTO-GRN-BILL:${grn.id}`;
    const jwOrder = grn.jobWorkReceiptReturn?.jobWorkOrder;
    const lines = grnLines.filter(line => line.acceptedQuantity > 0 && (line.poLineId || isJobWork)).map((line, index) => {
      const poLine = poLines.find(candidate => candidate.id === line.poLineId) || line.poLine;
      const product = poLine?.product || line.poLine?.product || line.product || jwOrder?.product;
      const material = poLine?.material || line.poLine?.material || line.material;
      const itemName = product?.name || material?.name || (isJobWork ? `Job Work Processing (${jwOrder?.orderNumber})` : undefined);
      const quantity = new Prisma.Decimal(String(line.acceptedQuantity));
      const lineRate = effectiveGrnUnitPrice(line.invoiceUnitPrice, poLine?.unitPrice);
      const unitPrice = lineRate.gt(0) ? lineRate : new Prisma.Decimal(line.invoiceUnitPrice || 0);

      // A purchase bill line requires taxableAmount > 0 according to purchase_bill_lines_amounts_check.
      // If invoice rate is 0, draft creation must wait until Accounts or Store Manager enters the supplier rate.
      if (!unitPrice.gt(0)) {
        return null;
      }

      const gstRate = new Prisma.Decimal(String(poLine?.taxRate ?? 18));
      const taxableAmount = quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const taxAmount = taxableAmount.mul(gstRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const vendorStateCode = grn.vendor.taxNumber?.match(/^\s*(\d{2})/)?.[1];
      const localTax = entity.stateCode && vendorStateCode && entity.stateCode !== vendorStateCode;
      return {
        lineNumber: index + 1,
        description: itemName || `Received item ${index + 1}`,
        hsnSacCode: catalogHsnCode(product?.metadata, material?.specs),
        poLineId: poLine?.id || null,
        grnLineId: line.id,
        quantity,
        unitPrice,
        gstRate,
        taxableAmount,
        cgstAmount: localTax ? new Prisma.Decimal(0) : taxAmount.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        sgstAmount: localTax ? new Prisma.Decimal(0) : taxAmount.minus(taxAmount.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)),
        igstAmount: localTax ? taxAmount : new Prisma.Decimal(0),
      };
    }).filter((l): l is NonNullable<typeof l> => l !== null);
    if (!lines.length) {
      throw new ValidationError(
        isJobWork
          ? 'Enter the supplier invoice rate before generating an Accounts bill draft for this Job Work receipt.'
          : 'Accepted receipt lines require a positive unit price before generating a supplier bill draft.'
      );
    }

    const payload = {
      grnId: grn.id,
      supplierInvoiceNumber: pendingReference,
      invoiceDate: invoiceDate.toISOString().slice(0, 10),
      dueDate: dueDate.toISOString().slice(0, 10),
      lines: lines.map(line => ({ ...line, quantity: line.quantity.toString(), unitPrice: line.unitPrice.toString(), gstRate: line.gstRate.toString(), taxableAmount: line.taxableAmount.toString(), cgstAmount: line.cgstAmount.toString(), sgstAmount: line.sgstAmount.toString(), igstAmount: line.igstAmount.toString() })),
    };
    const payloadHash = hash(payload);
    const note = 'Auto-created from finalized GRN accepted quantities. Replace the PENDING invoice reference, verify the supplier invoice/date/tax/rates and attachment, then submit for Accounts approval. This draft has not been posted to the ledger.';

    let bill;
    let createdNewBill = false;
    try {
      bill = await this.db.$transaction(async tx => {
        const replay = await tx.purchaseBill.findUnique({ where: { idempotencyKey: billKey }, include: billInclude });
        if (replay) return { ...replay, lines: resolveBillLineCatalogDetails(replay.lines) };
        // Recheck inside the transaction to make repeated/concurrent GRN calls safe.
        const linked = await tx.purchaseBill.findFirst({
          where: { status: { not: 'CANCELLED' }, lines: { some: { grnLineId: { in: grnLines.map(line => line.id) } } } },
          include: billInclude,
        });
        if (linked) return linked;
        const created = await tx.purchaseBill.create({
          data: {
            entityId: entity.id,
            vendorId: grn.vendorId!,
            vendorNameSnapshot: grn.vendor!.legalName || grn.vendor!.name,
            vendorGstinSnapshot: grn.vendor!.taxNumber,
            supplierInvoiceNumber: pendingReference,
            normalizedInvoiceNumber: normalizedInvoice(pendingReference),
            invoiceDate,
            dueDate,
            kind: 'STOCK',
            status: 'DRAFT',
            matchStatus: 'UNMATCHED',
            matchFindings: [{ code: 'INVOICE_DETAILS_PENDING', message: 'Accounts must verify the supplier invoice attachment and replace the pending invoice reference before submission.' }],
            resolutionNote: note,
            idempotencyKey: billKey,
            payloadHash,
            createdById: actorId,
            lines: { create: lines },
          },
          include: billInclude,
        });
        await tx.auditLog.create({ data: {
          userId: actorId,
          action: 'accounts.ap.bill.auto_draft_from_grn',
          resource: 'PurchaseBill',
          resourceId: created.id,
          after: { id: created.id, grnId: grn.id, grnNumber: grn.grnNumber, status: 'DRAFT', lineCount: lines.length },
          requestId: requestId || billKey,
        } });
        createdNewBill = true;
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.db.purchaseBill.findUnique({ where: { idempotencyKey: billKey }, include: billInclude });
        if (replay) return replay;
      }
      throw error;
    }

    if (createdNewBill) {
      await notificationService.notifyRoles({
        roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'],
        title: `Supplier bill draft created for GRN ${grn.grnNumber}`,
        message: `${grn.vendor.name}: accepted quantities and PO pricing were added to a draft. Verify the attached supplier invoice, reference, date, tax and rates before submitting.`,
        resource: 'PurchaseBill', resourceId: bill.id, href: `/accounts/purchases/bills/${bill.id}`, excludeUserIds: [actorId],
      }).catch(() => []);
    }
    return bill ? { ...bill, lines: resolveBillLineCatalogDetails(bill.lines) } : bill;
  }

  private async getAccountGrn(tx: Prisma.TransactionClient | PrismaClient, id: string) {
    const grn = await tx.goodsReceiptNote.findUnique({
      where: { id },
      include: {
        vendor: true,
        po: { include: { lines: true } },
        jobWorkReceiptReturn: {
          include: {
            jobWorkOrder: {
              include: {
                product: { select: { sku: true, name: true } },
                targetUom: true,
                lines: true
              }
            }
          }
        },
        location: true,
        lines: {
          include: {
            poLine: { include: { product: { select: { name: true, sku: true } }, material: { select: { name: true, code: true } } } },
            product: { select: { name: true, sku: true } },
            material: { select: { name: true, code: true } },
            uom: true,
            discrepancies: { orderBy: { createdAt: 'asc' } },
          },
        },
        documents: true,
      },
    });
    if (!grn) throw new NotFoundError('Goods receipt not found.');
    const isJobWork = Boolean(grn.jobWorkReceiptReturn?.jobWorkOrder);
    if ((!grn.po && !isJobWork) || !grn.vendor || (!isJobWork && grn.vendorId !== grn.po?.vendorId) || grn.isUnreferenced) {
      throw new ValidationError('Only PO-linked or Job Work receipts for an approved vendor can appear in Accounts.');
    }
    const vendor = grn.vendor!;
    const jwOrder = grn.jobWorkReceiptReturn?.jobWorkOrder;
    const po = grn.po || {
      id: jwOrder?.id || '',
      poNumber: jwOrder?.orderNumber || 'JOB-WORK',
      status: jwOrder?.status || 'APPROVED',
      paymentTerms: 'Job Work Terms',
      totalAmount: '0.00',
      createdAt: grn.receivedAt,
      lines: []
    };
    // The installed Prisma client does not yet contain the Accounts bill
    // relation. Query the link table directly so that opening a GRN detail
    // does not fail Prisma's runtime include validation.
    const supplierInvoices = await tx.$queryRaw<Array<{
      id: string; supplierInvoiceNumber: string; invoiceDate: Date; dueDate: Date;
      status: string; matchStatus: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal;
    }>>`
      SELECT DISTINCT pb."id", pb."supplierInvoiceNumber", pb."invoiceDate", pb."dueDate",
        pb."status"::text AS "status", pb."matchStatus"::text AS "matchStatus",
        (SELECT COALESCE(SUM(pbl2."taxableAmount" + pbl2."cgstAmount" + pbl2."sgstAmount" + pbl2."igstAmount"), 0)
         FROM "purchase_bill_lines" pbl2 WHERE pbl2."billId" = pb."id") AS "amount",
        (SELECT COALESCE(SUM(pbp."amount"), 0)
         FROM "purchase_bill_payments" pbp WHERE pbp."billId" = pb."id") AS "paidAmount"
      FROM "purchase_bills" pb
      JOIN "purchase_bill_lines" pbl ON pbl."billId" = pb."id"
      JOIN "goods_receipt_lines" grl ON grl."id" = pbl."grnLineId"
      WHERE grl."grnId" = ${id}
        AND pb."status" <> 'CANCELLED'
      ORDER BY pb."invoiceDate" DESC`;
    const invoiceSummaries = supplierInvoices.map(bill => {
      const amount = bill.amount;
      const paid = bill.paidAmount ?? new Prisma.Decimal(0);
      const balance = amount.minus(paid);
      const paymentStatus = amount.isZero() ? 'NO_VALUE' : balance.lte(0) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';
      return {
        id: bill.id, supplierInvoiceNumber: bill.supplierInvoiceNumber,
        invoiceDate: bill.invoiceDate.toISOString().slice(0, 10), dueDate: bill.dueDate.toISOString().slice(0, 10),
        status: bill.status, matchStatus: bill.matchStatus, amount: amount.toFixed(2),
        paidAmount: paid.toFixed(2),
        balanceAmount: (balance.lt(0) ? new Prisma.Decimal(0) : balance).toFixed(2),
        paymentStatus,
      };
    });
    const billedLines = grn.lines.length ? await tx.$queryRaw<Array<{ grnLineId: string; quantity: Prisma.Decimal }>>`
      SELECT pbl."grnLineId", SUM(pbl."quantity") AS "quantity"
      FROM "purchase_bill_lines" pbl JOIN "purchase_bills" pb ON pb."id" = pbl."billId"
      WHERE pbl."grnLineId" IN (${Prisma.join(grn.lines.map(line => line.id))})
        AND pb."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED')
      GROUP BY pbl."grnLineId"` : [];
    const billedByLine = new Map(billedLines.map(line => [line.grnLineId, line.quantity]));
    const lines = grn.lines.map(line => {
      const acceptedQuantity = new Prisma.Decimal(String(line.acceptedQuantity));
      const billedQuantity = billedByLine.get(line.id) ?? new Prisma.Decimal(0);
      const unitPrice = effectiveGrnUnitPrice(line.invoiceUnitPrice, line.poLine?.unitPrice);
      return {
        id: line.id, poLineId: line.poLineId,
        description: line.poLine?.product?.name || line.poLine?.material?.name || line.product?.name || line.material?.name || 'Received item',
        sku: line.poLine?.product?.sku || line.poLine?.material?.code || line.product?.sku || line.material?.code || null,
        uom: line.uom.code, expectedQuantity: line.expectedQuantity, receivedQuantity: line.receivedQuantity,
        acceptedQuantity: acceptedQuantity.toString(), billedQuantity: billedQuantity.toString(),
        remainingBillableQuantity: acceptedQuantity.minus(billedQuantity).lt(0) ? '0' : acceptedQuantity.minus(billedQuantity).toString(),
        rejectedQuantity: line.rejectedQuantity, damagedQuantity: line.damagedQuantity,
        shortQuantity: line.shortQuantity, discrepancies: line.discrepancies.map(discrepancy => ({ id: discrepancy.id, type: discrepancy.type, quantity: discrepancy.quantity, status: discrepancy.status })),
        unitPrice: unitPrice.toFixed(4), taxRate: line.poLine?.taxRate?.toFixed(2) || '0.00', expectedPayable: acceptedQuantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      };
    });
    const expectedAmount = lines.reduce((sum, line) => sum.plus(line.expectedPayable), new Prisma.Decimal(0));
    const [billPayments, grnPayments] = await Promise.all([
      tx.$queryRaw<GrnPaymentRow[]>`
        SELECT pbp."id", pbp."paymentDate", pbp."amount", pbp."paymentMode", pbp."reference", pbp."notes", pbp."createdAt", pbp."recordedById", u."name" AS "recorderName", u."email" AS "recorderEmail"
        FROM "purchase_bill_payments" pbp
        JOIN "users" u ON u."id" = pbp."recordedById"
        JOIN "purchase_bill_lines" pbl ON pbl."billId" = pbp."billId"
        JOIN "goods_receipt_lines" grl ON grl."id" = pbl."grnLineId"
        WHERE grl."grnId" = ${id}
        ORDER BY pbp."paymentDate" DESC, pbp."createdAt" DESC`.catch(() => []),
      tx.$queryRaw<GrnPaymentRow[]>`
        SELECT gp."id", gp."paymentDate", gp."amount", gp."paymentMode", gp."reference", gp."notes", gp."createdAt", gp."recordedById", u."name" AS "recorderName", u."email" AS "recorderEmail"
        FROM "grn_payments" gp JOIN "users" u ON u."id" = gp."recordedById"
        WHERE gp."grnId" = ${id} ORDER BY gp."paymentDate" DESC, gp."createdAt" DESC`.catch(() => []),
    ]);
    const accountsPayments = [...billPayments, ...grnPayments].sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
    const paymentHistory = accountsPayments.map(payment => ({
      id: payment.id, paymentDate: payment.paymentDate.toISOString().slice(0, 10), amount: payment.amount.toFixed(2),
      paymentMode: payment.paymentMode, reference: payment.reference, notes: payment.notes,
      createdAt: payment.createdAt.toISOString(), recordedBy: { id: payment.recordedById, name: payment.recorderName, email: payment.recorderEmail },
    }));
    // Use the existing procurement claim records, keyed by GRN, so Accounts and
    // Goods Receiving see one shared debit note instead of duplicate records.
    const debitNoteRows = await tx.$queryRaw<Array<{ id: string; debitNoteNumber: string; status: string; reason: string; taxableAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal; createdAt: Date; submittedAt: Date | null; approvedAt: Date | null }>>`
      SELECT "id", "debitNoteNumber", "status"::text AS "status", "reason", "taxableAmount", "taxAmount", "totalAmount", "createdAt", "submittedAt", "approvedAt"
      FROM "debit_notes" WHERE "grnId" = ${id} ORDER BY "createdAt" DESC`;
    const operationalDebitNotes = debitNoteRows.map(note => ({
      id: note.id, debitNoteNumber: note.debitNoteNumber, status: note.status, reason: note.reason,
      taxableAmount: note.taxableAmount.toFixed(2), taxAmount: note.taxAmount.toFixed(2), totalAmount: note.totalAmount.toFixed(2),
      createdAt: note.createdAt.toISOString(), submittedAt: note.submittedAt?.toISOString() ?? null, approvedAt: note.approvedAt?.toISOString() ?? null,
    }));
    const paidAmount = accountsPayments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    const balance = expectedAmount.minus(paidAmount).toDecimalPlaces(2);
    const paymentStatus = expectedAmount.isZero() ? 'NO_VALUE' : balance.lte(0) ? 'PAID' : paidAmount.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';
    return { ...grn, vendor, po, lines, supplierInvoices: invoiceSummaries, operationalDebitNotes, accountsPayments: paymentHistory, expectedAmount: expectedAmount.toFixed(2), paidAmount: paidAmount.toFixed(2), balanceAmount: (balance.lt(0) ? new Prisma.Decimal(0) : balance).toFixed(2), paymentStatus };
  }

  async listAcceptedGrns(entityId: string) {
    const [entity] = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "accounting_entities" WHERE "id" = ${entityId} AND "code" = 'PLINTH-IN' LIMIT 1`;
    // Accepted receipts are operational source records. They must remain visible to
    // Accounts while the accounting book is being configured; this endpoint does
    // not post a journal or otherwise activate the book.
    if (!entity) throw new ValidationError('An accounting entity is required.');
    const grns = await this.db.goodsReceiptNote.findMany({
      where: {
        status: { in: ['ARRIVED', 'UNDER_VERIFICATION', 'DISCREPANCY_PENDING', 'CLAIM_RAISED', 'VERIFIED', 'SIGNED_OFF', 'FINALIZED'] as any },
        isUnreferenced: false,
        vendorId: { not: null },
        OR: [
          { poId: { not: null }, po: { status: { notIn: ['DRAFT', 'REJECTED', 'CANCELLED', 'SUPERSEDED'] } } },
          { jobWorkReceiptReturn: { isNot: null } }
        ]
      },
      include: {
        vendor: true,
        po: true,
        jobWorkReceiptReturn: {
          include: {
            jobWorkOrder: {
              select: {
                id: true,
                orderNumber: true,
                natureOfProcessing: true,
                status: true
              }
            }
          }
        },
        lines: { include: {
          poLine: { include: { product: { select: { name: true, sku: true } }, material: { select: { name: true, code: true } } } },
          product: { select: { name: true, sku: true } },
          material: { select: { name: true, code: true } },
          uom: true,
        } }
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], take: 1000,
    });
    if (!grns.length) return [];
    const grnIdList = grns.map(grn => grn.id);
    const [billPaymentSums, grnPaymentSums] = await Promise.all([
      this.db.$queryRaw<Array<{ grnId: string; amount: Prisma.Decimal }>>`
        SELECT grl."grnId", SUM(pbp."amount") AS "amount"
        FROM "purchase_bill_payments" pbp
        JOIN "purchase_bill_lines" pbl ON pbl."billId" = pbp."billId"
        JOIN "goods_receipt_lines" grl ON grl."id" = pbl."grnLineId"
        WHERE grl."grnId" IN (${Prisma.join(grnIdList)})
        GROUP BY grl."grnId"`.catch(() => []),
      this.db.$queryRaw<Array<{ grnId: string; amount: Prisma.Decimal }>>`
        SELECT "grnId", SUM("amount") AS "amount" FROM "grn_payments"
        WHERE "grnId" IN (${Prisma.join(grnIdList)}) GROUP BY "grnId"`.catch(() => []),
    ]);
    const paidByGrn = new Map<string, Prisma.Decimal>();
    for (const p of [...billPaymentSums, ...grnPaymentSums]) {
      paidByGrn.set(p.grnId, (paidByGrn.get(p.grnId) ?? new Prisma.Decimal(0)).plus(p.amount));
    }
    const debitNotes = await this.db.$queryRaw<Array<{ id: string; grnId: string; debitNoteNumber: string; status: string; totalAmount: Prisma.Decimal }>>`
      SELECT "id", "grnId", "debitNoteNumber", "status"::text AS "status", "totalAmount"
      FROM "debit_notes" WHERE "grnId" IN (${Prisma.join(grns.map(grn => grn.id))}) ORDER BY "createdAt" DESC`;
    const supplierBills = await this.db.$queryRaw<Array<{ grnId: string; id: string; supplierInvoiceNumber: string; status: string; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>>`
      SELECT DISTINCT grl."grnId", pb."id", pb."supplierInvoiceNumber", pb."status"::text AS "status",
        (SELECT COALESCE(SUM(pbl2."taxableAmount" + pbl2."cgstAmount" + pbl2."sgstAmount" + pbl2."igstAmount"), 0)
         FROM "purchase_bill_lines" pbl2 WHERE pbl2."billId" = pb."id") AS "totalAmount",
        (SELECT COALESCE(SUM(pbp."amount"), 0)
         FROM "purchase_bill_payments" pbp WHERE pbp."billId" = pb."id") AS "paidAmount"
      FROM "purchase_bill_lines" pbl
      JOIN "purchase_bills" pb ON pb."id" = pbl."billId"
      JOIN "goods_receipt_lines" grl ON grl."id" = pbl."grnLineId"
      WHERE grl."grnId" IN (${Prisma.join(grns.map(grn => grn.id))}) AND pb."status" <> 'CANCELLED'
      ORDER BY pb."supplierInvoiceNumber"`;
    const grnLineIds = grns.flatMap(grn => grn.lines.map(line => line.id));
    const billedLines = grnLineIds.length ? await this.db.$queryRaw<Array<{ grnLineId: string; quantity: Prisma.Decimal }>>`
      SELECT pbl."grnLineId", SUM(pbl."quantity") AS "quantity"
      FROM "purchase_bill_lines" pbl JOIN "purchase_bills" pb ON pb."id" = pbl."billId"
      WHERE pbl."grnLineId" IN (${Prisma.join(grnLineIds)})
        AND pb."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED')
      GROUP BY pbl."grnLineId"` : [];
    const billedByLine = new Map(billedLines.map(line => [line.grnLineId, line.quantity]));
    const notesByGrn = new Map<string, typeof debitNotes>();
    for (const note of debitNotes) notesByGrn.set(note.grnId, [...(notesByGrn.get(note.grnId) ?? []), note]);
    return grns.filter(grn => grn.vendor && ((grn.po && grn.vendorId === grn.po.vendorId) || grn.jobWorkReceiptReturn)).map(grn => {
      const jwOrderNumber = grn.jobWorkReceiptReturn?.jobWorkOrder?.orderNumber || 'JOB-WORK';
      const expectedAmount = grn.lines.reduce((sum, line) => {
        const lineUnitPrice = Number(line.invoiceUnitPrice || line.poLine?.unitPrice || 0);
        return sum.plus(new Prisma.Decimal(String(line.acceptedQuantity)).mul(lineUnitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
      }, new Prisma.Decimal(0));
      const paidAmount = paidByGrn.get(grn.id) ?? new Prisma.Decimal(0);
      const balance = expectedAmount.minus(paidAmount);
      return {
        id: grn.id, grnNumber: grn.grnNumber, status: grn.status, receivedAt: grn.receivedAt,
        signedOffAt: grn.signedOffAt, finalizedAt: grn.finalizedAt,
        vendorId: grn.vendorId, vendorName: grn.vendor?.legalName || grn.vendor?.name || 'Vendor',
        poId: grn.poId || grn.jobWorkReceiptReturn?.jobWorkOrder?.id || '',
        poNumber: grn.po?.poNumber || jwOrderNumber,
        expectedAmount: expectedAmount.toFixed(2), paidAmount: paidAmount.toFixed(2), balanceAmount: (balance.lt(0) ? new Prisma.Decimal(0) : balance).toFixed(2),
        paymentStatus: expectedAmount.isZero() ? 'NO_VALUE' : balance.lte(0) ? 'PAID' : paidAmount.gt(0) ? 'PARTIALLY_PAID' : 'PENDING',
        debitNotes: (notesByGrn.get(grn.id) ?? []).map(note => ({ id: note.id, debitNoteNumber: note.debitNoteNumber, status: note.status, totalAmount: note.totalAmount.toFixed(2) })),
        supplierBills: supplierBills.filter(bill => bill.grnId === grn.id).map(bill => {
          const tot = bill.totalAmount ?? new Prisma.Decimal(0);
          const pd = bill.paidAmount ?? new Prisma.Decimal(0);
          const bal = tot.minus(pd);
          const status = tot.isZero() ? 'NO_VALUE' : bal.lte(0) ? 'PAID' : pd.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';
          return {
            id: bill.id,
            supplierInvoiceNumber: bill.supplierInvoiceNumber,
            status: bill.status,
            totalAmount: tot.toFixed(2),
            paidAmount: pd.toFixed(2),
            balanceAmount: (bal.lt(0) ? new Prisma.Decimal(0) : bal).toFixed(2),
            paymentStatus: status,
          };
        }),
        lineCount: grn.lines.length, lines: grn.lines.map(line => {
          const accepted = new Prisma.Decimal(String(line.acceptedQuantity));
          const billed = billedByLine.get(line.id) ?? new Prisma.Decimal(0);
          const rate = effectiveGrnUnitPrice(line.invoiceUnitPrice, line.poLine?.unitPrice);
          const remaining = accepted.minus(billed);
          return { id: line.id, poLineId: line.poLineId, description: line.poLine?.product?.name || line.poLine?.material?.name || line.product?.name || line.material?.name || 'Received item', sku: line.poLine?.product?.sku || line.poLine?.material?.code || line.product?.sku || line.material?.code || null, uom: line.uom.code, acceptedQuantity: accepted.toString(), billedQuantity: billed.toString(), remainingBillableQuantity: remaining.lt(0) ? '0' : remaining.toString(), unitPrice: rate.toFixed(4), taxRate: line.poLine?.taxRate?.toFixed(2) || '0.00', expectedPayable: accepted.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2) };
        }),
      };
    });
  }

  async getAcceptedGrn(id: string, actorId: string, requestId?: string) {
    let billCreationIssue: string | null = null;
    const receipt = await this.db.goodsReceiptNote.findUnique({ where: { id }, select: { status: true, isUnreferenced: true } });
    if (receipt?.status === 'FINALIZED' && !receipt.isUnreferenced) {
      try {
        await this.ensureDraftForFinalizedGrn(id, actorId, requestId);
      } catch (error) {
        // Keep the receiving record available, but return the reason the expected
        // Accounts draft could not be reconciled so the UI can guide the user.
        billCreationIssue = error instanceof Error ? error.message : 'Supplier bill draft could not be created.';
      }
    }
    return { ...await this.getAccountGrn(this.db, id), billCreationIssue };
  }

  async recordGrnPayment(input: { grnId: string; paymentDate: string; amount: string; paymentMode: string; reference: string; notes?: string }, idempotencyKey: string, actorId: string, requestId: string) {
    const paymentDate = dateOnly(input.paymentDate);
    const amount = money(input.amount);
    if (amount.isZero()) throw new ValidationError('Payment amount must be greater than zero.');
    if (!(paymentModes as readonly string[]).includes(input.paymentMode)) throw new ValidationError('Choose a supported payment mode.');
    if (!input.reference.trim()) throw new ValidationError('Payment reference is required.');
    const payloadHash = hash(input);
    const [replay] = await this.db.$queryRaw<Array<{ id: string; grnId: string; payloadHash: string; recordedById: string }>>`SELECT "id", "grnId", "payloadHash", "recordedById" FROM "grn_payments" WHERE "idempotencyKey" = ${idempotencyKey} LIMIT 1`;
    if (replay) {
      if (replay.payloadHash !== payloadHash || replay.recordedById !== actorId) throw new ConflictError('Idempotency key has already been used for another payment.');
      return this.getAcceptedGrn(replay.grnId, actorId, requestId);
    }
    const paymentResult = await this.db.$transaction(async tx => {
      const grn = await this.getAccountGrn(tx, input.grnId);
      const outstanding = new Prisma.Decimal(grn.balanceAmount);
      if (amount.gt(outstanding)) throw new ValidationError(`Payment exceeds the remaining balance of INR ${outstanding.toFixed(2)}.`);
      const paymentId = randomUUID();
      await tx.$executeRaw`INSERT INTO "grn_payments" ("id", "idempotencyKey", "payloadHash", "grnId", "paymentDate", "amount", "paymentMode", "reference", "notes", "recordedById") VALUES (${paymentId}, ${idempotencyKey}, ${payloadHash}, ${grn.id}, ${paymentDate}, ${amount}, ${input.paymentMode}, ${input.reference.trim()}, ${input.notes?.trim() || null}, ${actorId})`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ap.grn_payment.record', resource: 'GoodsReceiptNote', resourceId: grn.id, after: { paymentId, amount: amount.toFixed(2), paymentDate: input.paymentDate, paymentMode: input.paymentMode, reference: input.reference.trim() }, requestId } });
      return this.getAccountGrn(tx, grn.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await notificationService.notifyRoles({ roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'], title: `Payment recorded for GRN ${paymentResult.grnNumber}`, message: `Accounts recorded an INR ${amount.toFixed(2)} supplier payment.`, resource: 'GoodsReceiptNote', resourceId: input.grnId, href: '/accounts/purchase-payables', excludeUserIds: [actorId] }).catch(() => []);
    return paymentResult;
  }

  listVendors() {
    return this.db.vendor.findMany({ where: { status: { in: ['APPROVED', 'ACTIVE'] }, deactivatedAt: null }, select: { id: true, code: true, name: true, legalName: true, taxNumber: true, paymentTerms: true }, orderBy: { name: 'asc' }, take: 500 });
  }

  async listReceiptLines(entityId: string) {
    const entity = await this.db.accountingEntity.findUnique({ where: { id: entityId } });
    // Invoice capture may browse accepted operational receipts before the book is
    // active. Posting and payment actions retain their own accounting controls.
    if (!entity) throw new ValidationError('An accounting entity is required.');
    const lines = await this.db.goodsReceiptLine.findMany({
      where: {
        grn: {
          status: { in: ['SIGNED_OFF', 'FINALIZED'] },
          OR: [
            { po: { vendor: { status: { in: ['APPROVED', 'ACTIVE'] } } } },
            { jobWorkReceiptReturn: { isNot: null } }
          ]
        },
        acceptedQuantity: { gt: 0 }
      },
      include: {
        grn: {
          include: {
            po: { include: { vendor: true } },
            jobWorkReceiptReturn: {
              include: {
                jobWorkOrder: {
                  select: { id: true, orderNumber: true, status: true }
                }
              }
            }
          }
        },
        poLine: { include: { purchaseOrder: true, product: { select: { sku: true, name: true } }, material: { select: { code: true, name: true } } } },
        product: { select: { sku: true, name: true } },
        material: { select: { code: true, name: true } },
      },
      orderBy: { grn: { receivedAt: 'desc' } }, take: 1000,
    });
    return lines.filter(line => {
      if (line.grn.jobWorkReceiptReturn) return true;
      return line.grn.po?.vendorId && line.grn.po.status !== 'CANCELLED' && line.grn.po.status !== 'SUPERSEDED' && line.grn.po.vendorId === line.grn.vendorId;
    }).map(line => {
      const isJobWork = Boolean(line.grn.jobWorkReceiptReturn);
      const orderRef = line.grn.po?.poNumber || line.grn.jobWorkReceiptReturn?.jobWorkOrder?.orderNumber || 'JOB-WORK';
      const effectiveRate = effectiveGrnUnitPrice(line.invoiceUnitPrice, line.poLine?.unitPrice);
      return {
        id: line.id,
        grnNumber: line.grn.grnNumber,
        grnId: line.grnId,
        vendorId: line.grn.vendorId,
        poNumber: orderRef,
        poLineId: line.poLineId,
        acceptedQuantity: String(line.acceptedQuantity),
        unitPrice: effectiveRate.toFixed(4),
        item: line.poLine?.product?.name || line.poLine?.material?.name || line.product?.name || line.material?.name || (isJobWork ? 'Job Work Finished Output' : 'Receipt item'),
        entityId
      };
    });
  }
  async list(entityId: string, page: number, limit: number) {
    const where = { entityId };
    const [items, total] = await Promise.all([
      this.db.purchaseBill.findMany({ where, include: billInclude, orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.db.purchaseBill.count({ where }),
    ]);
    const billIds = items.map(b => b.id);
    const paymentSums = billIds.length ? await this.db.$queryRaw<Array<{ billId: string; amount: Prisma.Decimal }>>`
      SELECT "billId", SUM("amount") AS "amount"
      FROM "purchase_bill_payments"
      WHERE "billId" IN (${Prisma.join(billIds)})
      GROUP BY "billId"`.catch(() => []) : [];
    const paidByBill = new Map(paymentSums.map(p => [p.billId, p.amount]));

    const enriched = items.map(bill => {
      const totalTaxable = bill.lines.reduce((sum, line) => sum.plus(line.taxableAmount), new Prisma.Decimal(0));
      const totalTax = bill.lines.reduce((sum, line) => sum.plus(line.cgstAmount).plus(line.sgstAmount).plus(line.igstAmount), new Prisma.Decimal(0));
      const totalAmount = totalTaxable.plus(totalTax);
      const paidAmount = paidByBill.get(bill.id) ?? new Prisma.Decimal(0);
      const balance = totalAmount.minus(paidAmount);
      const paymentStatus = totalAmount.isZero() ? 'NO_VALUE' : balance.lte(0) ? 'PAID' : paidAmount.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';
      return {
        ...bill,
        lines: resolveBillLineCatalogDetails(bill.lines),
        totalTaxable: totalTaxable.toFixed(2),
        totalTax: totalTax.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        balanceAmount: (balance.lt(0) ? new Prisma.Decimal(0) : balance).toFixed(2),
        paymentStatus,
      };
    });
    return { items: enriched, total, page, limit };
  }

  async get(id: string) {
    const bill = await this.db.purchaseBill.findUnique({ where: { id }, include: billInclude });
    if (!bill) throw new NotFoundError('Purchase bill not found.');

    const billPayments = await this.db.$queryRaw<Array<{
      id: string; paymentDate: Date; amount: Prisma.Decimal; paymentMode: string;
      reference: string; notes: string | null; createdAt: Date; recordedById: string;
      recorderName: string | null; recorderEmail: string;
    }>>`
      SELECT pbp."id", pbp."paymentDate", pbp."amount", pbp."paymentMode", pbp."reference", pbp."notes", pbp."createdAt", pbp."recordedById", u."name" AS "recorderName", u."email" AS "recorderEmail"
      FROM "purchase_bill_payments" pbp
      JOIN "users" u ON u."id" = pbp."recordedById"
      WHERE pbp."billId" = ${id}
      ORDER BY pbp."paymentDate" DESC, pbp."createdAt" DESC`.catch(() => []);

    const totalTaxable = bill.lines.reduce((sum, line) => sum.plus(line.taxableAmount), new Prisma.Decimal(0));
    const totalCgst = bill.lines.reduce((sum, line) => sum.plus(line.cgstAmount), new Prisma.Decimal(0));
    const totalSgst = bill.lines.reduce((sum, line) => sum.plus(line.sgstAmount), new Prisma.Decimal(0));
    const totalIgst = bill.lines.reduce((sum, line) => sum.plus(line.igstAmount), new Prisma.Decimal(0));
    const totalTax = totalCgst.plus(totalSgst).plus(totalIgst);
    const grossTotal = totalTaxable.plus(totalTax);

    const grnIds = [...new Set(bill.lines.map(line => line.grnLine?.grn.id).filter((v): v is string => Boolean(v)))];
    const poIds = [...new Set(bill.lines.map(line => line.poLine?.purchaseOrder.id).filter((v): v is string => Boolean(v)))];

    const debitNoteRows = await this.db.$queryRaw<Array<{
      id: string; debitNoteNumber: string; status: string; reason: string;
      taxableAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal;
      createdAt: Date;
    }>>`
      SELECT "id", "debitNoteNumber", "status"::text AS "status", "reason",
             "taxableAmount", "taxAmount", "totalAmount", "createdAt"
      FROM "debit_notes"
      WHERE ("grnId" IN (${Prisma.join(grnIds.length ? grnIds : ['00000000-0000-0000-0000-000000000000'])})
         OR "poId" IN (${Prisma.join(poIds.length ? poIds : ['00000000-0000-0000-0000-000000000000'])})
         OR ("vendorId" = ${bill.vendorId} AND "invoiceNumber" = ${bill.supplierInvoiceNumber}))
      ORDER BY "createdAt" DESC`.catch(() => []);

    const debitNotes = debitNoteRows.map(dn => ({
      id: dn.id,
      debitNoteNumber: dn.debitNoteNumber,
      status: dn.status,
      reason: dn.reason,
      taxableAmount: dn.taxableAmount.toFixed(2),
      taxAmount: dn.taxAmount.toFixed(2),
      totalAmount: dn.totalAmount.toFixed(2),
      createdAt: dn.createdAt.toISOString()
    }));

    // Approved or submitted debit notes reduce the payable obligations
    const debitNoteDeduction = debitNoteRows
      .filter(dn => ['APPROVED', 'SUBMITTED', 'POSTED'].includes(dn.status))
      .reduce((sum, dn) => sum.plus(dn.totalAmount), new Prisma.Decimal(0));
    const debitNoteClaimTotal = debitNoteRows
      .reduce((sum, dn) => sum.plus(dn.totalAmount), new Prisma.Decimal(0));

    const netPayable = Prisma.Decimal.max(new Prisma.Decimal(0), grossTotal.minus(debitNoteDeduction));
    const paidAmount = billPayments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const balance = Prisma.Decimal.max(new Prisma.Decimal(0), netPayable.minus(paidAmount));
    const paymentStatus = netPayable.isZero() ? 'NO_VALUE' : balance.lte(0) ? 'PAID' : paidAmount.gt(0) ? 'PARTIALLY_PAID' : 'PENDING';

    const payments = billPayments.map(p => ({
      id: p.id,
      paymentDate: p.paymentDate.toISOString().slice(0, 10),
      amount: p.amount.toFixed(2),
      paymentMode: p.paymentMode,
      reference: p.reference,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
      recordedBy: { id: p.recordedById, name: p.recorderName, email: p.recorderEmail },
    }));

    const userIds = [bill.createdById, bill.submittedById, bill.approvedById, bill.resolvedById].filter((v): v is string => Boolean(v));
    const users = userIds.length ? await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: true }
    }) : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const relatedPurchaseOrders = [...new Map(
      bill.lines
        .map(l => l.poLine?.purchaseOrder)
        .filter((po): po is NonNullable<typeof po> => Boolean(po))
        .map(po => [po.id, { id: po.id, poNumber: po.poNumber, status: po.status, createdAt: po.createdAt.toISOString() }])
    ).values()];

    const relatedGrns = [...new Map(
      bill.lines
        .map(l => l.grnLine?.grn)
        .filter((grn): grn is NonNullable<typeof grn> => Boolean(grn))
        .map(grn => [grn.id, { id: grn.id, grnNumber: grn.grnNumber, status: grn.status, receivedAt: grn.receivedAt?.toISOString() }])
    ).values()];

    return {
      ...bill,
      lines: resolveBillLineCatalogDetails(bill.lines),
      totalTaxable: totalTaxable.toFixed(2),
      totalCgst: totalCgst.toFixed(2),
      totalSgst: totalSgst.toFixed(2),
      totalIgst: totalIgst.toFixed(2),
      totalTax: totalTax.toFixed(2),
      totalAmount: grossTotal.toFixed(2),
      grossTotal: grossTotal.toFixed(2),
      debitNoteClaimTotal: debitNoteClaimTotal.toFixed(2),
      pendingDebitNoteClaimTotal: Prisma.Decimal.max(new Prisma.Decimal(0), debitNoteClaimTotal.minus(debitNoteDeduction)).toFixed(2),
      debitNoteDeduction: debitNoteDeduction.toFixed(2),
      netPayable: netPayable.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      balanceAmount: balance.toFixed(2),
      paymentStatus,
      payments,
      debitNotes,
      relatedPurchaseOrders,
      relatedGrns,
      primaryPoNumber: relatedPurchaseOrders[0]?.poNumber || null,
      primaryGrnNumber: relatedGrns[0]?.grnNumber || null,
      createdByUser: userMap.get(bill.createdById) || null,
      submittedByUser: bill.submittedById ? userMap.get(bill.submittedById) || null : null,
      approvedByUser: bill.approvedById ? userMap.get(bill.approvedById) || null : null,
    };
  }

  async create(input: BillInput, idempotencyKey: string, actorId: string, requestId: string) {
    if (input.lines.length < 1 || input.lines.length > 100) throw new ValidationError('A bill must have between 1 and 100 lines.');
    const invoiceDate = dateOnly(input.invoiceDate);
    const dueDate = dateOnly(input.dueDate);
    if (dueDate < invoiceDate) throw new ValidationError('Due date cannot be before the supplier invoice date.');
    if (!input.supplierInvoiceNumber.trim()) throw new ValidationError('Supplier invoice number is required.');
    const payloadHash = hash(input);
    const existing = await this.db.purchaseBill.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.createdById !== actorId) throw new ConflictError('Idempotency key has already been used for another bill.');
      return this.get(existing.id);
    }
    const lines = input.lines.map((line, index) => {
      const quantity = money(line.quantity, 4);
      const unitPrice = money(line.unitPrice, 4);
      const gstRate = money(line.gstRate);
      const taxableAmount = money(line.taxableAmount);
      const cgstAmount = money(line.cgstAmount);
      const sgstAmount = money(line.sgstAmount);
      const igstAmount = money(line.igstAmount);
      if (quantity.isZero() || taxableAmount.isZero()) throw new ValidationError(`Line ${index + 1} quantity and taxable amount must be positive.`);
      if (gstRate.gt(100)) throw new ValidationError(`Line ${index + 1} GST rate cannot exceed 100%.`);
      if (!cgstAmount.equals(sgstAmount) || (cgstAmount.gt(0) && igstAmount.gt(0))) throw new ValidationError(`Line ${index + 1} must use equal CGST/SGST amounts or IGST, never both.`);
      if (input.kind === 'STOCK' && (!line.grnLineId || line.debitAccountId)) throw new ValidationError(`Stock line ${index + 1} must reference an accepted receipt line.`);
      if (input.kind !== 'STOCK' && (!line.debitAccountId || line.poLineId || line.grnLineId)) throw new ValidationError(`Direct ${input.kind.toLowerCase()} line ${index + 1} needs a debit account and cannot use stock receipt references.`);
      return { lineNumber: index + 1, description: line.description.trim(), hsnSacCode: line.hsnSacCode?.trim(), poLineId: line.poLineId || null, grnLineId: line.grnLineId, debitAccountId: line.debitAccountId, quantity, unitPrice, gstRate, taxableAmount, cgstAmount, sgstAmount, igstAmount };
    });
    const referencedGrnLines = lines.flatMap(line => line.grnLineId ? [line.grnLineId] : []);
    if (new Set(referencedGrnLines).size !== referencedGrnLines.length) throw new ValidationError('Each accepted GRN line can appear only once on a supplier bill.');
    try {
      const bill = await this.db.$transaction(async tx => {
        const [entity, vendor] = await Promise.all([
          tx.accountingEntity.findUnique({ where: { id: input.entityId } }),
          tx.vendor.findUnique({ where: { id: input.vendorId } }),
        ]);
        // Bill capture creates a non-posting DRAFT only. This lets Accounts
        // prepare invoices while the book is being configured; actions that
        // affect the ledger still require an active book.
        if (!entity || !['CONFIGURING', 'ACTIVE'].includes(entity.status)) {
          throw new ValidationError('The accounting entity is unavailable for bill capture.');
        }
        if (!vendor || !['APPROVED', 'ACTIVE'].includes(vendor.status) || vendor.deactivatedAt) throw new ValidationError('Vendor must be approved and active.');
        if (vendor.currency !== 'INR' || entity.baseCurrency !== 'INR') throw new ValidationError('Only INR bills are supported in this rollout.');
        if (input.kind === 'STOCK') {
          for (const line of lines) {
            const grnLine = await tx.goodsReceiptLine.findUnique({
              where: { id: line.grnLineId! },
              include: { grn: { include: { po: true, jobWorkReceiptReturn: true } }, poLine: true },
            });
            const isJobWork = Boolean(grnLine?.grn.jobWorkReceiptReturn);
            if (!grnLine || !['SIGNED_OFF', 'FINALIZED'].includes(grnLine.grn.status) || (!grnLine.grn.po && !isJobWork) || grnLine.grn.vendorId !== vendor.id || (!isJobWork && grnLine.grn.po?.vendorId !== vendor.id)) {
              throw new ValidationError(`Stock line ${line.lineNumber} must reference a verified GRN for the selected vendor.`);
            }
            if (!isJobWork && (!grnLine.poLineId || grnLine.poLineId !== line.poLineId || grnLine.poLine?.poId !== grnLine.grn.poId)) {
              throw new ValidationError(`Stock line ${line.lineNumber} PO line does not match the selected GRN line.`);
            }
            const billed = await tx.purchaseBillLine.aggregate({
              where: { grnLineId: grnLine.id, bill: { status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED'] } } },
              _sum: { quantity: true },
            });
            const available = new Prisma.Decimal(String(grnLine.acceptedQuantity)).minus(billed._sum.quantity || 0);
            if (line.quantity.gt(available)) {
              throw new ValidationError(`Stock line ${line.lineNumber} quantity exceeds the remaining accepted GRN quantity (${available.toString()}).`);
            }
          }
        }
        for (const line of lines) {
          if (line.debitAccountId) {
            const account = await tx.ledgerAccount.findFirst({ where: { id: line.debitAccountId, entityId: entity.id, status: 'ACTIVE', isControl: false } });
            const expectedType = input.kind === 'CAPITAL' ? 'ASSET' : 'EXPENSE';
            if (!account || account.type !== expectedType) throw new ValidationError(`Bill debit account must be an active ${expectedType.toLowerCase()} account in the selected entity.`);
          }
        }
        const created = await tx.purchaseBill.create({ data: {
          entityId: input.entityId, vendorId: input.vendorId, supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
          vendorNameSnapshot: vendor.legalName || vendor.name, vendorGstinSnapshot: vendor.taxNumber,
          normalizedInvoiceNumber: normalizedInvoice(input.supplierInvoiceNumber), invoiceDate, dueDate, kind: input.kind,
          idempotencyKey, payloadHash, createdById: actorId,
          lines: { create: lines },
        }, include: billInclude });
        await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ap.bill.create', resource: 'PurchaseBill', resourceId: created.id, after: { id: created.id, invoice: created.supplierInvoiceNumber, kind: created.kind }, requestId } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await notificationService.notifyRoles({ roles: ['accounts_reviewer', 'finance_manager', 'admin'], title: `Purchase bill ${bill.supplierInvoiceNumber} created`, message: `A ${bill.kind.toLowerCase()} purchase bill is ready for Accounts review.`, resource: 'PurchaseBill', resourceId: bill.id, href: '/accounts/purchase-payables', excludeUserIds: [actorId] }).catch(() => []);
      return bill;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.db.purchaseBill.findUnique({ where: { idempotencyKey } });
        if (replay && replay.payloadHash === payloadHash && replay.createdById === actorId) return this.get(replay.id);
        const duplicate = await this.db.purchaseBill.findFirst({ where: { entityId: input.entityId, vendorId: input.vendorId, normalizedInvoiceNumber: normalizedInvoice(input.supplierInvoiceNumber) } });
        if (duplicate) throw new ConflictError('A bill already exists for this vendor invoice number.');
        throw new ConflictError('Duplicate bill or idempotency key.');
      }
      throw error;
    }
  }

  async update(id: string, input: BillInput, version: number | undefined, actorId: string, requestId: string) {
    if (input.lines.length < 1 || input.lines.length > 100) throw new ValidationError('A bill must have between 1 and 100 lines.');
    const invoiceDate = dateOnly(input.invoiceDate);
    const dueDate = dateOnly(input.dueDate);
    if (dueDate < invoiceDate) throw new ValidationError('Due date cannot be before the supplier invoice date.');
    if (!input.supplierInvoiceNumber.trim()) throw new ValidationError('Supplier invoice number is required.');

    const lines = input.lines.map((line, index) => {
      const quantity = money(line.quantity, 4);
      let unitPrice = money(line.unitPrice, 4);
      if (unitPrice.isZero()) unitPrice = money('1.00', 4);
      const gstRate = money(line.gstRate || '0');
      let taxableAmount = money(line.taxableAmount);
      if (taxableAmount.isZero()) {
        taxableAmount = quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        if (taxableAmount.isZero()) taxableAmount = money('1.00');
      }
      const cgstAmount = money(line.cgstAmount || '0');
      const sgstAmount = money(line.sgstAmount || '0');
      const igstAmount = money(line.igstAmount || '0');

      if (quantity.isZero() || taxableAmount.isZero()) throw new ValidationError(`Line ${index + 1} quantity and taxable amount must be positive.`);
      if (gstRate.gt(100)) throw new ValidationError(`Line ${index + 1} GST rate cannot exceed 100%.`);
      if (!cgstAmount.equals(sgstAmount) || (cgstAmount.gt(0) && igstAmount.gt(0))) throw new ValidationError(`Line ${index + 1} must use equal CGST/SGST amounts or IGST, never both.`);

      return {
        lineNumber: index + 1,
        description: line.description.trim(),
        hsnSacCode: line.hsnSacCode?.trim() || '8471',
        poLineId: line.poLineId,
        grnLineId: line.grnLineId,
        debitAccountId: line.debitAccountId,
        quantity,
        unitPrice,
        gstRate,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount
      };
    });

    return this.db.$transaction(async tx => {
      const existing = await tx.purchaseBill.findUnique({ where: { id }, include: billInclude });
      if (!existing) throw new NotFoundError('Purchase bill not found.');
      if (['POSTED', 'CANCELLED'].includes(existing.status)) {
        throw new ConflictError('Posted or cancelled bills cannot be edited.');
      }
      const expectedVersion = typeof version === 'number' ? version : existing.version;
      if (existing.version !== expectedVersion) {
        throw new ConflictError('Bill state or version changed while editing. Refresh and retry.');
      }

      const entityId = input.entityId || existing.entityId;
      const vendorId = input.vendorId || existing.vendorId;

      const [entity, vendor] = await Promise.all([
        tx.accountingEntity.findUnique({ where: { id: entityId } }),
        tx.vendor.findUnique({ where: { id: vendorId } }),
      ]);
      if (!entity || !['CONFIGURING', 'ACTIVE'].includes(entity.status)) throw new ValidationError('The accounting entity is unavailable for bill capture.');
      if (!vendor || !['APPROVED', 'ACTIVE'].includes(vendor.status) || vendor.deactivatedAt) throw new ValidationError('Vendor must be approved and active.');

      const actorUser = await tx.user.findUnique({ where: { id: actorId } });
      const isAdmin = actorUser?.role === 'admin';

      // When edited by Accounts, bill moves to SUBMITTED (Pending Admin Approval).
      // When edited directly by Admin, it stays or moves to APPROVED.
      const targetStatus: 'SUBMITTED' | 'APPROVED' = isAdmin ? 'APPROVED' : 'SUBMITTED';

      const changed = await tx.purchaseBill.updateMany({
        where: { id, version: existing.version },
        data: {
          entityId,
          vendorId,
          vendorNameSnapshot: vendor.legalName || vendor.name,
          vendorGstinSnapshot: vendor.taxNumber,
          supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
          normalizedInvoiceNumber: normalizedInvoice(input.supplierInvoiceNumber),
          invoiceDate,
          dueDate,
          kind: input.kind,
          status: targetStatus,
          submittedById: actorId,
          submittedAt: new Date(),
          approvedById: isAdmin ? actorId : null,
          approvedAt: isAdmin ? new Date() : null,
          matchStatus: 'MATCHED',
          matchFindings: [],
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictError('Bill changed while you were editing. Refresh and retry.');

      await tx.purchaseBillLine.deleteMany({ where: { billId: id } });
      await tx.purchaseBillLine.createMany({ data: lines.map(line => ({ ...line, billId: id })) });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill.update',
          resource: 'PurchaseBill',
          resourceId: id,
          before: { version: existing.version, status: existing.status, supplierInvoiceNumber: existing.supplierInvoiceNumber },
          after: { version: expectedVersion + 1, status: targetStatus, supplierInvoiceNumber: input.supplierInvoiceNumber.trim() },
          requestId,
        }
      });

      if (!isAdmin) {
        await notificationService.notifyRoles({
          roles: ['admin', 'finance_manager'],
          title: `Supplier Bill ${input.supplierInvoiceNumber.trim()} modified by Accounts`,
          message: `${actorUser?.name || 'Accounts user'} modified bill details. Admin approval is required before payment.`,
          resource: 'PurchaseBill',
          resourceId: id,
          href: `/accounts/purchases/bills/${id}`,
          excludeUserIds: [actorId]
        }).catch(() => []);
      } else {
        await notificationService.notifyRoles({
          roles: ['accounts_preparer', 'accounts_reviewer'],
          title: `Supplier Bill ${input.supplierInvoiceNumber.trim()} updated by Admin`,
          message: `Admin updated and approved the bill. It is ready for payment disbursement.`,
          resource: 'PurchaseBill',
          resourceId: id,
          href: `/accounts/purchases/bills/${id}`,
          excludeUserIds: [actorId]
        }).catch(() => []);
      }

      return tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: billInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async submit(id: string, version: number, actorId: string, requestId: string) {
    const submitted = await this.db.$transaction(async tx => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, include: billInclude });
      if (!bill) throw new NotFoundError('Purchase bill not found.');
      if (bill.status !== 'DRAFT' || bill.version !== version) throw new ConflictError('Bill state or version changed. Refresh and retry.');
      if (!bill.lines.length) throw new ValidationError('Bill requires at least one line.');
      if (bill.supplierInvoiceNumber.startsWith('PENDING-')) {
        throw new ValidationError('Verify the supplier invoice attachment and replace the pending invoice number, invoice date, due date, tax and rates before submitting this draft.');
      }

      const changed = await tx.purchaseBill.updateMany({
        where: { id, status: 'DRAFT', version },
        data: {
          status: 'SUBMITTED',
          submittedById: actorId,
          submittedAt: new Date(),
          matchFindings: [],
          matchStatus: 'MATCHED',
          version: { increment: 1 }
        }
      });
      if (changed.count !== 1) throw new ConflictError('Bill changed while submitting.');
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill.submit',
          resource: 'PurchaseBill',
          resourceId: id,
          after: { status: 'SUBMITTED', matchStatus: 'MATCHED' },
          requestId
        }
      });
      return tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: billInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await notificationService.notifyRoles({
      roles: ['admin', 'finance_manager'],
      title: `Supplier Bill ${submitted.supplierInvoiceNumber} submitted for approval`,
      message: `A supplier bill was submitted and is awaiting Admin review and approval.`,
      resource: 'PurchaseBill',
      resourceId: submitted.id,
      href: `/accounts/purchases/bills/${submitted.id}`,
      excludeUserIds: [actorId]
    }).catch(() => []);

    return submitted;
  }

  async resolve(id: string, version: number, note: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, include: billInclude });
      if (!bill) throw new NotFoundError('Purchase bill not found.');
      if (bill.status !== 'SUBMITTED' || bill.version !== version) throw new ConflictError('Bill state or version changed.');

      const changed = await tx.purchaseBill.updateMany({
        where: { id, status: 'SUBMITTED', version },
        data: { matchStatus: 'MATCHED', resolutionNote: note, resolvedById: actorId, version: { increment: 1 } }
      });
      if (changed.count !== 1) throw new ConflictError('Bill changed while resolving.');
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill.resolve',
          resource: 'PurchaseBill',
          resourceId: id,
          after: { matchStatus: 'MATCHED', note },
          requestId
        }
      });
      return tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: billInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reopen(id: string, version: number, reason: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, include: billInclude });
      if (!bill) throw new NotFoundError('Purchase bill not found.');
      if (bill.status !== 'SUBMITTED' || bill.version !== version) {
        throw new ConflictError('Bill state or version changed.');
      }
      const changed = await tx.purchaseBill.updateMany({
        where: { id, status: 'SUBMITTED', version },
        data: { status: 'DRAFT', matchStatus: 'MATCHED', matchFindings: [], submittedById: null, submittedAt: null, resolutionNote: reason, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('Bill changed before it could be returned to draft. Refresh and retry.');
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill.reopen',
          resource: 'PurchaseBill',
          resourceId: id,
          before: { status: 'SUBMITTED', version },
          after: { status: 'DRAFT', reason },
          requestId,
        }
      });
      return tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: billInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async approve(id: string, version: number, actorId: string, requestId: string) {
    const approved = await this.db.$transaction(async tx => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, include: billInclude });
      if (!bill) throw new NotFoundError('Purchase bill not found.');
      if (bill.version !== version) throw new ConflictError('Bill version changed. Refresh and retry.');

      const actorUser = await tx.user.findUnique({ where: { id: actorId } });
      const isAdmin = actorUser?.role === 'admin';
      if (bill.status === 'DRAFT' && !isAdmin) {
        throw new ForbiddenError('Only an Admin can directly approve a draft supplier bill.');
      }
      if (bill.status !== 'SUBMITTED' && bill.status !== 'DRAFT') {
        throw new InvalidStateTransitionError(`Cannot approve a supplier bill in state [${bill.status}].`);
      }
      if (!isAdmin && (bill.createdById === actorId || bill.submittedById === actorId || bill.resolvedById === actorId)) {
        throw new ForbiddenError('Bill creator or submitter cannot approve the bill. An Admin or Finance Manager must approve.');
      }

      const changed = await tx.purchaseBill.updateMany({
        where: { id, status: bill.status, version },
        data: {
          status: 'APPROVED',
          approvedById: actorId,
          approvedAt: new Date(),
          matchStatus: 'MATCHED',
          matchFindings: [],
          version: { increment: 1 }
        }
      });
      if (changed.count !== 1) throw new ConflictError('Bill changed before approval.');

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill.approve',
          resource: 'PurchaseBill',
          resourceId: id,
          before: { status: bill.status, version: bill.version },
          after: { status: 'APPROVED', directDraftApproval: bill.status === 'DRAFT' },
          requestId
        }
      });
      return tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: billInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await notificationService.notifyRoles({
      roles: ['accounts_preparer', 'accounts_reviewer'],
      title: `Supplier Bill ${approved.supplierInvoiceNumber} approved by Admin`,
      message: `The bill has been approved by Admin and is ready for payment disbursement.`,
      resource: 'PurchaseBill',
      resourceId: approved.id,
      href: `/accounts/purchases/bills/${approved.id}`,
      excludeUserIds: [actorId]
    }).catch(() => []);

    return this.get(approved.id);
  }

  async recordBillPayment(input: { billId: string; paymentDate: string; amount: string; paymentMode: string; reference: string; notes?: string }, idempotencyKey: string, actorId: string, requestId?: string) {
    const reqId = requestId || randomUUID();
    const paymentDate = dateOnly(input.paymentDate);
    const amount = money(input.amount);
    if (amount.isZero()) throw new ValidationError('Payment amount must be greater than zero.');
    if (!(paymentModes as readonly string[]).includes(input.paymentMode)) throw new ValidationError('Choose a supported payment mode.');
    if (!input.reference.trim()) throw new ValidationError('Payment reference is required.');

    const payloadHash = hash(input);
    const [replay] = await this.db.$queryRaw<Array<{ id: string; billId: string; payloadHash: string; recordedById: string }>>`
      SELECT "id", "billId", "payloadHash", "recordedById" FROM "purchase_bill_payments" WHERE "idempotencyKey" = ${idempotencyKey} LIMIT 1`.catch(() => []);
    if (replay) {
      if (replay.payloadHash !== payloadHash || replay.recordedById !== actorId) throw new ConflictError('Idempotency key has already been used for another payment.');
      return this.get(replay.billId);
    }

    await this.db.$transaction(async tx => {
      const bill = await tx.purchaseBill.findUnique({ where: { id: input.billId }, include: billInclude });
      if (!bill) throw new NotFoundError('Purchase bill not found.');
      if (!['APPROVED', 'POSTED'].includes(bill.status)) {
        throw new ValidationError('Payments can only be recorded against approved or posted supplier bills.');
      }

      const totalAmount = bill.lines.reduce(
        (sum, line) => sum.plus(line.taxableAmount).plus(line.cgstAmount).plus(line.sgstAmount).plus(line.igstAmount),
        new Prisma.Decimal(0)
      );
      const existingPayments = await tx.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
        SELECT "amount" FROM "purchase_bill_payments" WHERE "billId" = ${bill.id}`.catch(() => []);
      const alreadyPaid = existingPayments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
      const outstanding = totalAmount.minus(alreadyPaid);

      if (amount.gt(outstanding)) {
        throw new ValidationError(`Payment exceeds the remaining bill balance of INR ${outstanding.toFixed(2)}.`);
      }

      const paymentId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "purchase_bill_payments" ("id", "idempotencyKey", "payloadHash", "billId", "paymentDate", "amount", "paymentMode", "reference", "notes", "recordedById")
        VALUES (${paymentId}, ${idempotencyKey}, ${payloadHash}, ${bill.id}, ${paymentDate}, ${amount}, ${input.paymentMode}, ${input.reference.trim()}, ${input.notes?.trim() || null}, ${actorId})`;

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ap.bill_payment.record',
          resource: 'PurchaseBill',
          resourceId: bill.id,
          after: { paymentId, amount: amount.toFixed(2), paymentDate: input.paymentDate, paymentMode: input.paymentMode, reference: input.reference.trim() },
          requestId: reqId
        }
      });
      return paymentId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await notificationService.notifyRoles({
      roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'],
      title: `Payment recorded for bill ${input.billId}`,
      message: `Accounts recorded an INR ${amount.toFixed(2)} supplier payment.`,
      resource: 'PurchaseBill',
      resourceId: input.billId,
      href: `/accounts/purchases/bills/${input.billId}`,
      excludeUserIds: [actorId]
    }).catch(() => []);

    return this.get(input.billId);
  }

  async listAllPayments(entityId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`
      SELECT pbp."id", pbp."paymentDate", pbp."amount", pbp."paymentMode", pbp."reference", pbp."notes", pbp."createdAt",
             pb."id" AS "billId", pb."supplierInvoiceNumber", pb."vendorNameSnapshot", pb."vendorId"
      FROM "purchase_bill_payments" pbp
      JOIN "purchase_bills" pb ON pb."id" = pbp."billId"
      WHERE pb."entityId" = ${entityId}
      ORDER BY pbp."paymentDate" DESC, pbp."createdAt" DESC
    `;
    return rows.map(r => ({
      ...r,
      paymentNumber: `PAY-${String(r.reference || r.id).slice(0, 16).toUpperCase()}`,
      paymentType: 'VENDOR_PAYMENT',
      paymentDate: r.paymentDate,
      partyName: r.vendorNameSnapshot,
      partyId: r.vendorId,
      amount: String(r.amount),
      paymentMode: r.paymentMode,
      referenceNumber: r.reference,
      status: 'SETTLED',
      linkedDocumentNumber: r.supplierInvoiceNumber,
      billId: r.billId,
    }));
  }
}
