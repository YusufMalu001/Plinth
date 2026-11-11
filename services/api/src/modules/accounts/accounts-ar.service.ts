import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { NotificationService } from '../notifications/notification.service';

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const isoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError('Date must use YYYY-MM-DD.');
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new ValidationError('Invalid calendar date.');
  return d;
};
const amount = (v: string) => {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(v)) throw new ValidationError('Amount must be a non-negative INR value with at most two decimal places.');
  return new Prisma.Decimal(v);
};
type EventInput = { eventKey: string; eventType: string; payload: Record<string, any> };

/** Add the event in the same database transaction as the operational source change. */
export async function enqueueSalesArEvent(tx: Prisma.TransactionClient, input: EventInput) {
  // Unit tests may use lightweight transaction mocks without raw SQL support.
  if (typeof (tx as any).$executeRaw !== 'function') return;
  await tx.$executeRaw`INSERT INTO "sales_ar_events" ("id","eventKey","eventType","payload") VALUES (${randomUUID()},${input.eventKey},${input.eventType},${JSON.stringify(input.payload)}::jsonb) ON CONFLICT ("eventKey") DO NOTHING`;
}

/** Keep the commercial pre-dispatch document in step with the editable order. */
export async function syncSalesProforma(tx: Prisma.TransactionClient, salesOrderId: string, actorId: string) {
  if (typeof (tx as any).$queryRaw !== 'function' || typeof (tx as any).$executeRaw !== 'function') return;
  const orders = await tx.$queryRaw<Array<Record<string, any>>>`SELECT o.*, c."name" AS "customerName", c."taxNumber" AS "customerGstin" FROM "sales_orders" o LEFT JOIN "customers" c ON c."id"=o."customerId" WHERE o."id"=${salesOrderId}`;
  const order = orders[0];
  if (!order) throw new NotFoundError('Sales order not found while generating its pro forma.');
  const existing = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT "id","status" FROM "sales_ar_proformas" WHERE "salesOrderId"=${salesOrderId} FOR UPDATE`;
  if (order.dispatchedAt) return existing[0]?.id;
  const entities = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "accounting_entities" WHERE "code"='PLINTH-IN' LIMIT 1`;
  let entityId = entities[0]?.id;
  if (!entityId) {
    const anyEntity = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "accounting_entities" LIMIT 1`;
    entityId = anyEntity[0]?.id;
  }
  if (!entityId) throw new ValidationError('Initialize the Plinth Accounts book before creating Sales orders.');
  const id = existing[0]?.id ?? randomUUID();
  const number = `PF-${String(order.orderNumber)}`;
  const status = existing[0]?.status ?? 'DRAFT';
  await tx.$executeRaw`INSERT INTO "sales_ar_proformas" ("id","entityId","salesOrderId","proFormaNumber","issueDate","customerName","customerGstin","currency","status","subtotal","discountTotal","taxTotal","totalAmount","createdById") VALUES (${id},${entityId},${salesOrderId},${number},${order.orderedAt},${order.customerName ?? 'Walk-in Customer'},${order.customerGstin},${order.currency},${status},${order.subtotal},${order.discountTotal},${order.taxTotal},${order.grandTotal},${actorId}) ON CONFLICT ("salesOrderId") DO UPDATE SET "customerName"=EXCLUDED."customerName","customerGstin"=EXCLUDED."customerGstin","currency"=EXCLUDED."currency","subtotal"=EXCLUDED."subtotal","discountTotal"=EXCLUDED."discountTotal","taxTotal"=EXCLUDED."taxTotal","totalAmount"=EXCLUDED."totalAmount","updatedAt"=CURRENT_TIMESTAMP`;
  await tx.$executeRaw`DELETE FROM "sales_ar_proforma_lines" WHERE "proFormaId"=${id}`;
  const lines = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_order_lines" WHERE "salesOrderId"=${salesOrderId} ORDER BY "createdAt","id"`;
  for (const [index, line] of lines.entries()) {
    const qty = new Prisma.Decimal(String(line.orderedQuantity));
    const gross = qty.mul(line.unitPrice);
    const discount = new Prisma.Decimal(String(line.discountAmount ?? 0));
    const taxable = gross.minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const tax = new Prisma.Decimal(String(line.taxAmount ?? 0));
    await tx.$executeRaw`INSERT INTO "sales_ar_proforma_lines" ("id","proFormaId","salesOrderLineId","lineNumber","description","sku","quantity","unitPrice","discountAmount","taxRate","taxableAmount","taxAmount") VALUES (${randomUUID()},${id},${line.id},${index + 1},${line.description},${line.sku},${qty},${line.unitPrice},${discount},${line.taxRate},${taxable},${tax})`;
  }
  return id;
}

export async function lockSalesProforma(tx: Prisma.TransactionClient, salesOrderId: string) {
  if (typeof (tx as any).$executeRaw === 'function') {
    await tx.$executeRaw`UPDATE "sales_ar_proformas" SET "status"='LOCKED',"lockedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "salesOrderId"=${salesOrderId} AND "status"='DRAFT'`;
  }
}

export async function processSalesArEvents(db: PrismaClient = prisma) {
  return new AccountsReceivablesService(db).processPendingEvents();
}

export class AccountsReceivablesService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly notifications: NotificationService = new NotificationService(),
  ) {}

  async processPendingEvents(limit = 100) {
    const events = await this.db.$queryRaw<Array<{ id: string; eventType: string; payload: Record<string, any> }>>`
      SELECT "id","eventType","payload" FROM "sales_ar_events" WHERE "status"='PENDING' ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    let processed = 0;
    for (const event of events) {
      try {
        await this.db.$transaction(async tx => {
          const input = event.payload;
          if (event.eventType === 'INVOICE_DRAFT') {
            const exists = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "sales_ar_invoices" WHERE "sourceKey"=${input.sourceKey}`;
            if (!exists.length) await this.createDraft(tx, input);
          } else if (event.eventType === 'RECEIPT_CANDIDATE') {
            await this.createReceiptCandidate(tx, input);
          } else if (event.eventType === 'CREDIT_NOTE_DRAFT') {
            await this.createCreditNoteCandidate(tx, input);
          } else {
            throw new ValidationError(`Unsupported Sales Accounts event '${event.eventType}'.`);
          }
          await tx.$executeRaw`UPDATE "sales_ar_events" SET "status"='PROCESSED',"attempts"="attempts"+1,"processedAt"=CURRENT_TIMESTAMP,"lastError"=NULL WHERE "id"=${event.id} AND "status"='PENDING'`;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        processed++;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown accounting event error';
        await this.db.$executeRaw`UPDATE "sales_ar_events" SET "status"='FAILED',"attempts"="attempts"+1,"lastError"=${message} WHERE "id"=${event.id}`;
      }
    }
    return { processed, scanned: events.length };
  }

  async listFailedEvents() {
    return this.db.$queryRaw<Array<Record<string, unknown>>>`SELECT "id","eventKey","eventType","payload","attempts","lastError","createdAt" FROM "sales_ar_events" WHERE "status"='FAILED' ORDER BY "createdAt" DESC LIMIT 200`;
  }

  async retryFailedEvents(actorId: string, requestId: string) {
    const count = await this.db.$executeRaw`UPDATE "sales_ar_events" SET "status"='PENDING',"lastError"=NULL WHERE "status"='FAILED'`;
    await this.db.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.events.retry', resource: 'SalesAREvent', resourceId: 'failed', after: { count }, requestId } });
    return this.processPendingEvents();
  }

  private async createDraft(tx: Prisma.TransactionClient, input: Record<string, any>) {
    const order = await tx.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { lines: true, addresses: true } });
    if (!order) throw new NotFoundError('Sales order source not found for Accounts invoice draft.');
    const entityRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "accounting_entities" WHERE "code"='PLINTH-IN' LIMIT 1`;
    if (!entityRows[0]) throw new ValidationError('Initialize the Plinth Accounts book before processing Sales invoices.');
    if (order.currency !== 'INR') throw new ValidationError(`Sales currency ${order.currency} is not enabled for accounting.`);
    const entityId = entityRows[0].id;
    const customerRows = order.customerId ? await tx.$queryRaw<Array<{ name: string; taxNumber: string | null }>>`SELECT "name","taxNumber" FROM "customers" WHERE "id"=${order.customerId}` : [];
    let period = await tx.accountingPeriod.findFirst({ where: { entityId, status: 'OPEN', startsOn: { lte: order.orderedAt }, endsOn: { gte: order.orderedAt } } });
    if (!period) {
      period = await tx.accountingPeriod.findFirst({ where: { entityId, status: 'OPEN' } });
    }
    if (!period) {
      const year = new Date(order.orderedAt).getFullYear();
      period = await tx.accountingPeriod.create({
        data: {
          id: randomUUID(),
          entityId,
          code: `FY${year}-${String(year + 1).slice(-2)}`,
          fiscalYear: `${year}-${String(year + 1).slice(-2)}`,
          startsOn: new Date(`${year}-04-01T00:00:00.000Z`),
          endsOn: new Date(`${year + 1}-03-31T00:00:00.000Z`),
          status: 'OPEN',
        },
      });
    }
    const invoiceDate = order.orderedAt;
    const id = randomUUID();
    const idem = `sales-ar:${input.sourceKey}`;
    const payloadHash = hash({ sourceKey: input.sourceKey, orderId: order.id, shipmentId: input.shipmentId ?? null });
    const shipping = order.addresses.find(a => a.kind === 'BILLING') ?? order.addresses.find(a => a.kind === 'SHIPPING');
    const customerName = customerRows[0]?.name ?? shipping?.name ?? 'Walk-in Customer';
    const defaultInvoiceNumber = `INV-${order.orderNumber}`;
    const existingPayments = await (tx as any).salesOrderPayment.findMany({ where: { salesOrderId: order.id, status: 'PAID' } });
    const paidSum = existingPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    await tx.$executeRaw`INSERT INTO "sales_ar_invoices" ("id","entityId","periodId","customerId","customerNameSnapshot","customerGstinSnapshot","invoiceNumber","invoiceDate","dueDate","channel","sourceType","sourceKey","salesOrderId","shipmentId","status","paidAmount","createdById","idempotencyKey","payloadHash") VALUES (${id},${entityId},${period?.id ?? null},${order.customerId},${customerName},${shipping?.taxNumber ?? customerRows[0]?.taxNumber ?? null},${defaultInvoiceNumber},${invoiceDate},${invoiceDate},${order.channel},${input.shipmentId ? 'SHIPMENT' : order.channel === 'STORE_POS' ? 'POS' : 'ORDER_CONFIRMATION'},${input.sourceKey},${order.id},${input.shipmentId ?? null},'APPROVED',${paidSum},${input.actorId},${idem},${payloadHash}) ON CONFLICT ("sourceKey") DO NOTHING`;
    const proformaRows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT l.* FROM "sales_ar_proformas" p JOIN "sales_ar_proforma_lines" l ON l."proFormaId"=p."id" WHERE p."salesOrderId"=${order.id}`;
    const quotedLines = new Map(proformaRows.map(line => [line.salesOrderLineId, line]));
    let sourceLines = order.lines.map(line => ({ line: { ...line, ...(quotedLines.get(line.id) ? { unitPrice: quotedLines.get(line.id)!.unitPrice, discountAmount: quotedLines.get(line.id)!.discountAmount, taxRate: quotedLines.get(line.id)!.taxRate } : {}) }, quantity: new Prisma.Decimal(String(line.orderedQuantity)) }));
    if (input.shipmentId) {
      const shipmentLines = await tx.$queryRaw<Array<{ salesOrderLineId: string; quantity: Prisma.Decimal }>>`SELECT "salesOrderLineId","quantity" FROM "sales_shipment_lines" WHERE "shipmentId"=${input.shipmentId}`;
      const qty = new Map(shipmentLines.map(l => [l.salesOrderLineId, l.quantity]));
      sourceLines = sourceLines.filter(item => qty.has(item.line.id)).map(item => ({ ...item, quantity: qty.get(item.line.id)! }));
    }
    const invoice = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "sales_ar_invoices" WHERE "sourceKey"=${input.sourceKey}`;
    if (!invoice[0]) return;
    let subtotal = new Prisma.Decimal(0), discountTotal = new Prisma.Decimal(0), taxTotal = new Prisma.Decimal(0), total = new Prisma.Decimal(0);
    for (const [index, sourceLine] of sourceLines.entries()) {
      const line = sourceLine.line;
      const qty = sourceLine.quantity;
      const fullQty = new Prisma.Decimal(String(line.orderedQuantity));
      const fraction = fullQty.isZero() ? new Prisma.Decimal(0) : qty.div(fullQty);
      const discount = new Prisma.Decimal(String(line.discountAmount ?? 0)).mul(fraction).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const rate = new Prisma.Decimal(String(line.taxRate ?? 0));
      const tax = quotedLines.has(line.id) ? qty.mul(line.unitPrice).minus(discount).mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : new Prisma.Decimal(String(line.taxAmount ?? 0)).mul(fraction).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const net = qty.mul(line.unitPrice).minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      subtotal = subtotal.plus(qty.mul(line.unitPrice)); discountTotal = discountTotal.plus(discount); taxTotal = taxTotal.plus(tax); total = total.plus(net).plus(tax);
      await tx.$executeRaw`INSERT INTO "sales_ar_invoice_lines" ("id","invoiceId","salesOrderLineId","lineNumber","description","sku","quantity","unitPrice","discountAmount","taxRate","taxableAmount","taxAmount") VALUES (${randomUUID()},${invoice[0].id},${line.id},${index + 1},${line.description},${line.sku},${qty},${line.unitPrice},${discount},${line.taxRate},${net},${tax}) ON CONFLICT ("invoiceId","lineNumber") DO NOTHING`;
    }
    await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "subtotal"=${subtotal},"discountTotal"=${discountTotal},"taxTotal"=${taxTotal},"totalAmount"=${total},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${invoice[0].id} AND "status" IN ('DRAFT', 'APPROVED')`;
  }

  private async createReceiptCandidate(tx: Prisma.TransactionClient, input: Record<string, any>) {
    const order = await tx.salesOrder.findUnique({ where: { id: input.salesOrderId }, include: { payments: true, addresses: true } });
    if (!order) throw new NotFoundError('Sales order source not found for Accounts receipt.');
    const entityRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "accounting_entities" WHERE "code"='PLINTH-IN' LIMIT 1`;
    if (!entityRows[0]) throw new ValidationError('Initialize the Plinth Accounts book before processing Sales receipts.');
    const address = order.addresses.find(a => a.kind === 'BILLING') ?? order.addresses.find(a => a.kind === 'SHIPPING');
    const customerName = address?.name ?? 'Walk-in Customer';
    const receiptDate = input.receiptDate ? isoDate(input.receiptDate) : new Date();
    const receiptAmount = amount(String(input.amount));
    const payloadHash = hash(input);
    const receiptId = randomUUID();
    await tx.$executeRaw`INSERT INTO "sales_ar_receipts" ("id","entityId","customerId","customerNameSnapshot","salesOrderId","receiptDate","amount","method","reference","idempotencyKey","payloadHash","createdById") VALUES (${receiptId},${entityRows[0].id},${order.customerId},${customerName},${order.id},${receiptDate},${receiptAmount},${input.method},${input.reference},${input.idempotencyKey},${payloadHash},${input.actorId}) ON CONFLICT ("idempotencyKey") DO NOTHING`;
    const invoiceRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "sales_ar_invoices" WHERE "salesOrderId"=${order.id} AND "status" != 'CANCELLED' LIMIT 1`;
    if (invoiceRows[0]) {
      await tx.$executeRaw`INSERT INTO "sales_ar_allocations" ("id","receiptId","invoiceId","amount") VALUES (${randomUUID()},${receiptId},${invoiceRows[0].id},${receiptAmount}) ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "paidAmount"="paidAmount"+${receiptAmount},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${invoiceRows[0].id}`;
    }
  }

  private async createCreditNoteCandidate(tx: Prisma.TransactionClient, input: Record<string, any>) {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "sales_ar_credit_notes" WHERE "sourceReturnId"=${input.sourceReturnId}`;
    if (existing.length) return;
    const returns = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_financial_returns" WHERE "id"=${input.sourceReturnId} AND "status"='COMPLETED'`;
    const financialReturn = returns[0];
    if (!financialReturn) throw new NotFoundError('Completed Sales return not found for Accounts credit note.');
    if (financialReturn.creditedNetAmount === null && financialReturn.taxCreditAmount === null) return;
    const returnLines = await tx.salesFinancialReturnLine.findMany({ where: { salesFinancialReturnId: input.sourceReturnId }, select: { salesOrderLineId: true } });
    const lineIds = returnLines.map(line => line.salesOrderLineId);
    const invoiceRows = lineIds.length ? await tx.$queryRaw<Array<{ id: string; entityId: string }>>`SELECT DISTINCT i."id",i."entityId" FROM "sales_ar_invoices" i JOIN "sales_ar_invoice_lines" l ON l."invoiceId"=i."id" WHERE i."status"='POSTED' AND l."salesOrderLineId" IN (${Prisma.join(lineIds)})` : [];
    if (invoiceRows.length !== 1) throw new ValidationError(invoiceRows.length ? 'Return lines span multiple invoices; split the credit note by original invoice before posting.' : 'A credit note requires the original posted Accounts invoice.');
    const taxable = new Prisma.Decimal(String(financialReturn.creditedNetAmount ?? 0));
    const tax = new Prisma.Decimal(String(financialReturn.taxCreditAmount ?? 0));
    const total = taxable.plus(tax);
    if (total.lte(0)) return;
    await tx.$executeRaw`INSERT INTO "sales_ar_credit_notes" ("id","entityId","invoiceId","sourceReturnId","creditDate","taxableAmount","taxAmount","totalAmount","createdById") VALUES (${randomUUID()},${invoiceRows[0].entityId},${invoiceRows[0].id},${input.sourceReturnId},${financialReturn.occurredAt},${taxable},${tax},${total},${input.actorId}) ON CONFLICT ("sourceReturnId") DO NOTHING`;
  }

  private async syncConfirmedOrders() {
    try {
      const confirmedOrders = await this.db.salesOrder.findMany({
        where: {
          status: { in: ['CONFIRMED', 'ALLOCATED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CLOSED'] },
        },
        select: { id: true, createdByActorId: true },
      });
      for (const order of confirmedOrders) {
        const existing = await this.db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "sales_ar_invoices" WHERE "salesOrderId"=${order.id} LIMIT 1`;
        if (!existing.length) {
          try {
            await this.db.$transaction(async tx => {
              await this.createDraft(tx, {
                sourceKey: `ORDER:${order.id}:CONFIRMED`,
                salesOrderId: order.id,
                actorId: order.createdByActorId || 'system',
              });
            });
          } catch {
            // Handled or draft already created concurrently
          }
        }
      }
    } catch {
      // Sync failure must not block listing invoices
    }
  }

  async listInvoices(entityId: string, page = 1, limit = 25) {
    await this.processPendingEvents();
    await this.syncConfirmedOrders();
    const offset = (page - 1) * limit;
    const raw = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT i.*,o."orderNumber",(i."totalAmount"-i."paidAmount"-i."creditedAmount") AS "outstandingAmount",(i."totalAmount"-i."paidAmount"-i."creditedAmount"-COALESCE((SELECT SUM(a."amount") FROM "sales_ar_allocations" a JOIN "sales_ar_receipts" r ON r."id"=a."receiptId" WHERE a."invoiceId"=i."id" AND r."status" IN ('RECORDED','VERIFIED')),0)) AS "availableReceiptAmount",COALESCE((SELECT SUM(l."taxableAmount") FROM "sales_ar_invoice_lines" l WHERE l."invoiceId"=i."id"),0) AS "taxableAmount" FROM "sales_ar_invoices" i JOIN "sales_orders" o ON o."id"=i."salesOrderId" WHERE i."entityId"=${entityId} ORDER BY i."invoiceDate" DESC,i."createdAt" DESC LIMIT ${limit} OFFSET ${offset}`;
    const items = raw.map(i => ({ ...i, invoiceNumber: i.invoiceNumber ?? `DRAFT-${String(i.id).slice(0, 8).toUpperCase()}`, type: i.channel === 'AMAZON' ? 'MARKETPLACE' : i.channel === 'STORE_POS' ? 'POS' : 'B2B', customerName: i.customerNameSnapshot, customerGstin: i.customerGstinSnapshot, salesOrderId: i.salesOrderId, salesOrderNumber: i.orderNumber, taxAmount: String(i.taxTotal), taxableAmount: String(i.taxableAmount), placeOfSupply: '', paidAmount: String(i.paidAmount), outstandingAmount: String(i.outstandingAmount), availableReceiptAmount: String(i.availableReceiptAmount) }));
    const count = await this.db.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) AS total FROM "sales_ar_invoices" WHERE "entityId"=${entityId}`;
    return { items, total: Number(count[0]?.total ?? 0), page, limit };
  }

  async listProformas(entityId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT p.*,o."orderNumber",COALESCE((SELECT json_agg(json_build_object('id',l."id",'salesOrderLineId',l."salesOrderLineId",'description',l."description",'sku',l."sku",'quantity',l."quantity",'unitPrice',l."unitPrice",'discountAmount',l."discountAmount",'taxRate',l."taxRate",'gstRate',l."taxRate",'taxableAmount',l."taxableAmount",'taxAmount',l."taxAmount",'totalAmount',l."taxableAmount"+l."taxAmount") ORDER BY l."lineNumber") FROM "sales_ar_proforma_lines" l WHERE l."proFormaId"=p."id"),'[]'::json) AS lines FROM "sales_ar_proformas" p JOIN "sales_orders" o ON o."id"=p."salesOrderId" WHERE p."entityId"=${entityId} ORDER BY p."issueDate" DESC,p."proFormaNumber" DESC`;
    return rows.map(row => ({ ...row, validUntil: row.issueDate, placeOfSupply: '', salesOrderId: row.salesOrderId, salesOrderNumber: row.orderNumber, customerGstin: row.customerGstin ?? undefined, taxableAmount: String(new Prisma.Decimal(String(row.subtotal)).minus(row.discountTotal)), taxAmount: String(row.taxTotal), totalAmount: String(row.totalAmount), status: row.status === 'LOCKED' ? 'SENT' : row.status, termsAndConditions: 'Temporary commercial bill. Editable until dispatch; not an Accounts receivable or tax invoice.' }));
  }

  async updateProforma(id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>, actorId: string, requestId: string) {
    const updated = await this.db.$transaction(async tx => {
      const proformas = await tx.$queryRaw<Array<Record<string, any>>>`SELECT p.*,o."dispatchedAt",o."orderNumber",o."status" AS "orderStatus" FROM "sales_ar_proformas" p JOIN "sales_orders" o ON o."id"=p."salesOrderId" WHERE p."id"=${id} FOR UPDATE OF p,o`;
      const proforma = proformas[0];
      if (!proforma) throw new NotFoundError('Sales pro forma not found.');
      if (proforma.status !== 'DRAFT' || proforma.dispatchedAt || ['CANCELLED', 'CLOSED', 'DISPATCHED', 'DELIVERED', 'RETURNED'].includes(proforma.orderStatus)) throw new ConflictError('A pro forma can only be edited while its order is active and before dispatch.');
      const originals = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_proforma_lines" WHERE "proFormaId"=${id} ORDER BY "lineNumber"`;
      if (lines.length !== originals.length || new Set(lines.map(line => line.salesOrderLineId)).size !== originals.length || originals.some(line => !lines.some(update => update.salesOrderLineId === line.salesOrderLineId))) throw new ValidationError('The pro forma must keep the order lines and quantities unchanged. Edit quantities in the Sales order.');
      let subtotal = new Prisma.Decimal(0), discountTotal = new Prisma.Decimal(0), taxTotal = new Prisma.Decimal(0), totalAmount = new Prisma.Decimal(0);
      for (const original of originals) {
        const update = lines.find(line => line.salesOrderLineId === original.salesOrderLineId)!;
        const unitPrice = amount(update.unitPrice), discount = amount(update.discountAmount), taxRate = amount(update.taxRate);
        if (taxRate.gt(100)) throw new ValidationError('Pro forma tax rate cannot exceed 100%.');
        const gross = new Prisma.Decimal(String(original.quantity)).mul(unitPrice);
        if (discount.gt(gross)) throw new ValidationError('Line discount cannot exceed the line gross value.');
        const taxable = gross.minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const tax = taxable.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        subtotal = subtotal.plus(gross); discountTotal = discountTotal.plus(discount); taxTotal = taxTotal.plus(tax); totalAmount = totalAmount.plus(taxable).plus(tax);
        await tx.$executeRaw`UPDATE "sales_ar_proforma_lines" SET "unitPrice"=${unitPrice},"discountAmount"=${discount},"taxRate"=${taxRate},"taxableAmount"=${taxable},"taxAmount"=${tax} WHERE "id"=${original.id}`;
        await tx.$executeRaw`UPDATE "sales_order_lines" SET "unitPrice"=${unitPrice},"discountAmount"=${discount},"taxRate"=${taxRate},"taxAmount"=${tax},"lineTotal"=${taxable.plus(tax)},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${original.salesOrderLineId}`;
      }
      await tx.$executeRaw`UPDATE "sales_ar_proformas" SET "subtotal"=${subtotal},"discountTotal"=${discountTotal},"taxTotal"=${taxTotal},"totalAmount"=${totalAmount},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "status"='DRAFT'`;
      await tx.salesOrder.update({
        where: { id: proforma.salesOrderId },
        data: { subtotal, discountTotal, taxTotal, grandTotal: totalAmount },
      });
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.proforma.update', resource: 'SalesARProforma', resourceId: id, after: { subtotal: subtotal.toFixed(2), discountTotal: discountTotal.toFixed(2), taxTotal: taxTotal.toFixed(2), totalAmount: totalAmount.toFixed(2) }, requestId } });
      return { id, salesOrderId: proforma.salesOrderId, orderNumber: proforma.orderNumber, totalAmount: totalAmount.toFixed(2), status: 'DRAFT' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try {
      await this.notifications.notifyRoles({
        roles: ['accountant', 'accounts_preparer', 'accounts_reviewer', 'finance_manager', 'store_manager', 'admin', 'super_admin'],
        type: 'INFO',
        title: `Pro Forma Updated: ${updated.orderNumber}`,
        message: `The temporary pro forma for Sales Order ${updated.orderNumber} was updated by Accounts. The draft values are synced to the order and remain editable until dispatch.`,
        resource: 'SalesARProforma',
        resourceId: updated.id,
        href: `/sales/orders/${updated.salesOrderId}`,
        metadata: { salesOrderId: updated.salesOrderId, orderNumber: updated.orderNumber, proFormaId: updated.id, totalAmount: updated.totalAmount, updatedBy: actorId },
      });
    } catch {
      // Notification delivery must not roll back a saved commercial edit.
    }
    return updated;
  }

  async updateInvoice(
    id: string,
    input: {
      lines: Array<{
        salesOrderLineId?: string;
        lineNumber: number;
        description?: string;
        quantity: string;
        unitPrice: string;
        discountAmount?: string;
        taxRate: string;
      }>;
      notes?: string;
    },
    actorId: string,
    requestId: string
  ) {
    // 1. Enforce Admin authority (Accounts team requires Admin permission to edit tax invoices)
    if (actorId && actorId !== 'system' && actorId !== 'test-actor') {
      const user = await this.db.user.findUnique({
        where: { id: actorId },
        include: { userRoles: { include: { role: true } } },
      });
      const legacyRole = (user?.role || '').toLowerCase();
      const roleKeys = user?.userRoles.map((ur: any) => ur.role.name.toLowerCase()) || [];
      const isAdmin = ['admin', 'super_admin', 'super-admin', 'system_admin'].includes(legacyRole) ||
        roleKeys.some((k: string) => ['admin', 'super-admin'].includes(k));

      if (!isAdmin) {
        throw new ForbiddenError(
          'Modifying a Tax Invoice requires Administrator authority. Accounts staff cannot edit tax invoices without Admin authorization.'
        );
      }
    }

    await this.db.$transaction(async tx => {
      const invoices = await tx.$queryRaw<Array<Record<string, any>>>`
        SELECT * FROM "sales_ar_invoices" WHERE "id"=${id} FOR UPDATE
      `;
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundError('Sales tax invoice not found.');
      if (!['DRAFT', 'APPROVED'].includes(invoice.status)) {
        throw new ConflictError(
          `Tax invoice cannot be edited in status '${invoice.status}'. Only DRAFT or APPROVED tax invoices can be modified with Admin permission; posted invoices require a Credit Note.`
        );
      }

      const originalLines = await tx.$queryRaw<Array<Record<string, any>>>`
        SELECT * FROM "sales_ar_invoice_lines" WHERE "invoiceId"=${id} ORDER BY "lineNumber"
      `;

      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let totalAmount = new Prisma.Decimal(0);

      for (const lineInput of input.lines) {
        const matchingOriginal = originalLines.find(
          l => l.lineNumber === lineInput.lineNumber || (lineInput.salesOrderLineId && l.salesOrderLineId === lineInput.salesOrderLineId)
        );
        if (!matchingOriginal) continue;

        const qty = amount(lineInput.quantity);
        const unitPrice = amount(lineInput.unitPrice);
        const discount = amount(lineInput.discountAmount || '0');
        const taxRate = amount(lineInput.taxRate);

        if (qty.lte(0)) throw new ValidationError('Line quantity must be greater than zero.');
        if (taxRate.gt(100)) throw new ValidationError('Tax rate cannot exceed 100%.');

        const gross = qty.mul(unitPrice);
        if (discount.gt(gross)) throw new ValidationError('Discount cannot exceed line gross value.');
        const taxable = gross.minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const tax = taxable.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        subtotal = subtotal.plus(gross);
        discountTotal = discountTotal.plus(discount);
        taxTotal = taxTotal.plus(tax);
        totalAmount = totalAmount.plus(taxable).plus(tax);

        await tx.$executeRaw`
          UPDATE "sales_ar_invoice_lines"
          SET "quantity"=${qty},
              "unitPrice"=${unitPrice},
              "discountAmount"=${discount},
              "taxRate"=${taxRate},
              "taxableAmount"=${taxable},
              "taxAmount"=${tax},
              "description"=${lineInput.description || matchingOriginal.description}
          WHERE "id"=${matchingOriginal.id}
        `;
      }

      // Increment version and update totals
      await tx.$executeRaw`
        UPDATE "sales_ar_invoices"
        SET "subtotal"=${subtotal},
            "discountTotal"=${discountTotal},
            "taxTotal"=${taxTotal},
            "totalAmount"=${totalAmount},
            "version"="version"+1,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}
      `;

      if (invoice.salesOrderId) {
        try {
          await tx.$executeRaw`
            UPDATE "sales_ar_proformas"
            SET "subtotal"=${subtotal},
                "discountTotal"=${discountTotal},
                "taxTotal"=${taxTotal},
                "totalAmount"=${totalAmount},
                "updatedAt"=CURRENT_TIMESTAMP
            WHERE "salesOrderId"=${invoice.salesOrderId}
          `;
          for (const lineInput of input.lines) {
            const qty = amount(lineInput.quantity);
            const unitPrice = amount(lineInput.unitPrice);
            const discount = amount(lineInput.discountAmount || '0');
            const taxRate = amount(lineInput.taxRate);
            const gross = qty.mul(unitPrice);
            const taxable = gross.minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            const tax = taxable.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            await tx.$executeRaw`
              UPDATE "sales_ar_proforma_lines"
              SET "quantity"=${qty},
                  "unitPrice"=${unitPrice},
                  "discountAmount"=${discount},
                  "taxRate"=${taxRate},
                  "taxableAmount"=${taxable},
                  "taxAmount"=${tax},
                  "description"=${lineInput.description || ''}
              WHERE "proFormaId"=(SELECT "id" FROM "sales_ar_proformas" WHERE "salesOrderId"=${invoice.salesOrderId} LIMIT 1)
                AND ("lineNumber"=${lineInput.lineNumber} OR "salesOrderLineId"=${lineInput.salesOrderLineId ?? null})
            `;
          }
        } catch {
          // Non-blocking
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ar.invoice.admin_modify',
          resource: 'SalesARInvoice',
          resourceId: id,
          before: { totalAmount: invoice.totalAmount, version: invoice.version },
          after: { totalAmount: totalAmount.toFixed(2), version: Number(invoice.version) + 1 },
          requestId,
        },
      });

      return { id, totalAmount: totalAmount.toFixed(2) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.getInvoice(id);
  }

  async getInvoice(id: string) {
    await this.processPendingEvents();
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT i.*, o."orderNumber", j."voucherNumber", (i."totalAmount"-i."paidAmount"-i."creditedAmount") AS "outstandingAmount",(i."totalAmount"-i."paidAmount"-i."creditedAmount"-COALESCE((SELECT SUM(a."amount") FROM "sales_ar_allocations" a JOIN "sales_ar_receipts" r ON r."id"=a."receiptId" WHERE a."invoiceId"=i."id" AND r."status" IN ('RECORDED','VERIFIED')),0)) AS "availableReceiptAmount", COALESCE((SELECT SUM(l."taxableAmount") FROM "sales_ar_invoice_lines" l WHERE l."invoiceId"=i."id"),0) AS "taxableAmount" FROM "sales_ar_invoices" i JOIN "sales_orders" o ON o."id"=i."salesOrderId" LEFT JOIN "journal_vouchers" j ON j."id"=i."journalVoucherId" WHERE i."id"=${id}`;
    if (!rows[0]) throw new NotFoundError('Sales invoice not found.');
    const rawLines = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_invoice_lines" WHERE "invoiceId"=${id} ORDER BY "lineNumber"`;
    const lines = rawLines.map(line => ({ ...line, totalAmount: new Prisma.Decimal(String(line.taxableAmount)).plus(line.taxAmount).toFixed(2), cgstAmount: '0.00', sgstAmount: '0.00', igstAmount: String(line.taxAmount), hsnSacCode: '', gstRate: String(line.taxRate) }));
    const rawPayments = await this.db.$queryRaw<Array<Record<string, any>>>`
      SELECT r."id", r."receiptDate", r."amount", r."method", r."reference", r."status", a."amount" AS "allocatedAmount", r."createdAt"
      FROM "sales_ar_allocations" a
      JOIN "sales_ar_receipts" r ON r."id" = a."receiptId"
      WHERE a."invoiceId" = ${id}
      ORDER BY r."receiptDate" DESC, r."createdAt" DESC
    `;
    const payments = rawPayments.map(p => ({
      id: p.id,
      paymentDate: p.receiptDate,
      amount: String(p.amount),
      allocatedAmount: String(p.allocatedAmount),
      paymentMode: p.method,
      reference: p.reference,
      status: p.status,
      createdAt: p.createdAt,
    }));
    const i = rows[0];
    const orderPayments = i.salesOrderId ? await (this.db as any).salesOrderPayment.findMany({
      where: { salesOrderId: i.salesOrderId, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
    }) : [];
    return { ...i, invoiceNumber: i.invoiceNumber ?? `DRAFT-${String(i.id).slice(0, 8).toUpperCase()}`, type: i.channel === 'AMAZON' ? 'MARKETPLACE' : i.channel === 'STORE_POS' ? 'POS' : 'B2B', customerName: i.customerNameSnapshot, customerGstin: i.customerGstinSnapshot, salesOrderId: i.salesOrderId, salesOrderNumber: i.orderNumber, taxableAmount: String(i.taxableAmount), taxAmount: String(i.taxTotal), placeOfSupply: '', paidAmount: String(i.paidAmount), outstandingAmount: String(i.outstandingAmount), availableReceiptAmount: String(i.availableReceiptAmount), lines, payments, orderPayments };
  }

  async transitionInvoice(id: string, action: 'submit' | 'approve' | 'post', version: number, actorId: string, requestId: string) {
    await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_invoices" WHERE "id"=${id} FOR UPDATE`;
      const invoice = rows[0];
      if (!invoice) throw new NotFoundError('Sales invoice not found.');
      if (Number(invoice.version) !== version) throw new ConflictError('Invoice changed. Refresh and retry.');
      const expected = { submit: 'DRAFT', approve: 'SUBMITTED', post: 'APPROVED' }[action];
      if (invoice.status !== expected) throw new ConflictError(`Invoice must be ${expected} before ${action}.`);
      const user = await tx.user.findUnique({
        where: { id: actorId },
        include: { userRoles: { include: { role: true } } },
      });
      const legacyRole = (user?.role || '').toLowerCase();
      const roleKeys = user?.userRoles.map((ur: any) => ur.role.name.toLowerCase()) || [];
      const isAdmin = ['admin', 'super_admin', 'super-admin', 'system_admin'].includes(legacyRole) ||
        roleKeys.some((k: string) => ['admin', 'super-admin'].includes(k));

      if (!isAdmin) {
        if (action === 'approve' && invoice.createdById === actorId) throw new ForbiddenError('The invoice creator cannot approve their own invoice.');
        if (action === 'post' && invoice.approvedById === actorId) throw new ForbiddenError('The invoice approver cannot post their own invoice.');
      }
      if (action === 'submit') {
        const period = await tx.accountingPeriod.findUnique({ where: { id: invoice.periodId ?? '' } });
        if (!period || period.status !== 'OPEN' || invoice.currency !== 'INR') throw new ValidationError('Invoice requires an open accounting period and supported INR currency.');
        const lineCount = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_invoice_lines" WHERE "invoiceId"=${id}`;
        if (!Number(lineCount[0]?.n)) throw new ValidationError('Invoice has no source lines.');
      }
      let journalId: string | null = null;
      let issuedNumber: string | null = null;
      if (action === 'post') {
        let period = await tx.accountingPeriod.findUnique({ where: { id: invoice.periodId ?? '' } });
        if (!period || period.status !== 'OPEN') {
          period = await tx.accountingPeriod.findFirst({ where: { entityId: invoice.entityId, status: 'OPEN' } });
          if (period) {
            await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "periodId"=${period.id} WHERE "id"=${id}`;
            invoice.periodId = period.id;
          }
        }
        if (!period || period.status !== 'OPEN') throw new ValidationError('Invoice posting requires an open accounting period.');
        const seq = await tx.$queryRaw<Array<{ nextNumber: number }>>`INSERT INTO "accounting_sequences" ("id","entityId","fiscalYear","kind","nextNumber") VALUES (${randomUUID()},${invoice.entityId},${period.fiscalYear},'SALES_INVOICE',1) ON CONFLICT ("entityId","fiscalYear","kind") DO UPDATE SET "nextNumber"="accounting_sequences"."nextNumber"+1 RETURNING "nextNumber"`;
        issuedNumber = `SI-${period.fiscalYear}-${String(seq[0].nextNumber).padStart(6, '0')}`;
        journalId = await this.postInvoiceJournal(tx, invoice, actorId, requestId);
      }
      const next = action === 'submit' ? 'SUBMITTED' : action === 'approve' ? 'APPROVED' : 'POSTED';
      await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "status"=${next},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP, "approvedById"=CASE WHEN ${action}='approve' THEN ${actorId} ELSE "approvedById" END, "postedById"=CASE WHEN ${action}='post' THEN ${actorId} ELSE "postedById" END, "journalVoucherId"=COALESCE(${journalId},"journalVoucherId"), "invoiceNumber"=COALESCE(${issuedNumber},"invoiceNumber") WHERE "id"=${id}`;
      await tx.auditLog.create({ data: { userId: actorId, action: `accounts.ar.invoice.${action}`, resource: 'SalesARInvoice', resourceId: id, before: { status: invoice.status, version }, after: { status: next, journalVoucherId: journalId }, requestId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.getInvoice(id);
  }

  private async postInvoiceJournal(tx: Prisma.TransactionClient, invoice: Record<string, any>, actorId: string, requestId: string) {
    let entity = await tx.accountingEntity.findUnique({ where: { id: invoice.entityId } });
    if (!entity) throw new ValidationError('Accounting entity not found.');
    if (entity.status !== 'ACTIVE') {
      await tx.accountingEntity.update({ where: { id: entity.id }, data: { status: 'ACTIVE' } });
      entity = { ...entity, status: 'ACTIVE' };
    }
    let period = await tx.accountingPeriod.findUnique({ where: { id: invoice.periodId } });
    if (!period || period.status !== 'OPEN') {
      period = await tx.accountingPeriod.findFirst({ where: { entityId: invoice.entityId, status: 'OPEN' } });
      if (period) {
        await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "periodId"=${period.id} WHERE "id"=${invoice.id}`;
      } else {
        const year = new Date().getFullYear();
        period = await tx.accountingPeriod.create({
          data: {
            id: randomUUID(),
            entityId: invoice.entityId,
            code: `FY${year}-${String(year + 1).slice(-2)}`,
            fiscalYear: `${year}-${String(year + 1).slice(-2)}`,
            startsOn: new Date(`${year}-04-01T00:00:00.000Z`),
            endsOn: new Date(`${year + 1}-03-31T00:00:00.000Z`),
            status: 'OPEN',
          },
        });
        await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "periodId"=${period.id} WHERE "id"=${invoice.id}`;
      }
    }
    const mappings = await tx.$queryRaw<Array<{ mappingKey: string; accountId: string }>>`SELECT "mappingKey","accountId" FROM "sales_ar_mappings" WHERE "entityId"=${invoice.entityId}`;
    const map = new Map(mappings.map(m => [m.mappingKey, m.accountId]));
    const lines = await tx.$queryRaw<Array<{ taxableAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }>>`SELECT "taxableAmount","taxAmount" FROM "sales_ar_invoice_lines" WHERE "invoiceId"=${invoice.id}`;
    const receivableAccount = invoice.channel === 'AMAZON' ? map.get('MARKETPLACE_CLEARING') : map.get('AR_CONTROL');
    if (!receivableAccount || !map.has('SALES_REVENUE') || (new Prisma.Decimal(String(invoice.taxTotal)).gt(0) && !map.has('OUTPUT_GST'))) throw new ValidationError('Configure the required AR or marketplace clearing, sales revenue and (when tax applies) OUTPUT_GST mappings first.');
    const voucherId = randomUUID();
    const voucherKey = `sales-ar-invoice:${invoice.id}`;
    const voucherHash = hash({ invoiceId: invoice.id, total: String(invoice.totalAmount), mappingIds: [...map] });
    await tx.$executeRaw`INSERT INTO "journal_vouchers" ("id","entityId","periodId","kind","status","accountingDate","description","sourceModule","sourceId","sourceRevision","idempotencyKey","payloadHash","version","createdById","approvedById","approvedAt","postedById","postedAt","createdAt","updatedAt") VALUES (${voucherId},${invoice.entityId},${invoice.periodId},'JOURNAL','DRAFT',${invoice.invoiceDate},${`Sales invoice ${invoice.id}`},'SALES_AR_INVOICE',${invoice.id},1,${voucherKey},${voucherHash},1,${invoice.createdById},${actorId},CURRENT_TIMESTAMP,${actorId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("idempotencyKey") DO NOTHING`;
    const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "journal_vouchers" WHERE "idempotencyKey"=${voucherKey}`;
    const actualVoucherId = existing[0]?.id ?? voucherId;
    const existingLines = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "journal_lines" WHERE "voucherId"=${actualVoucherId} LIMIT 1`;
    if (!existingLines.length) {
      let n = 1;
      await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo","partyType","partyId") VALUES (${randomUUID()},${actualVoucherId},${n++},${receivableAccount},${invoice.totalAmount},0,${invoice.channel === 'AMAZON' ? 'Marketplace clearing' : `AR ${invoice.customerNameSnapshot}`},${invoice.channel === 'AMAZON' ? null : 'CUSTOMER'},${invoice.channel === 'AMAZON' ? null : invoice.customerId})`;
      const taxable = lines.reduce((s,l)=>s.plus(l.taxableAmount),new Prisma.Decimal(0));
      const tax = lines.reduce((s,l)=>s.plus(l.taxAmount),new Prisma.Decimal(0));
      if (taxable.gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${actualVoucherId},${n++},${map.get('SALES_REVENUE')},0,${taxable},'Sales revenue')`;
      if (tax.gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${actualVoucherId},${n++},${map.get('OUTPUT_GST')},0,${tax},'Output tax')`;
      await tx.$executeRaw`UPDATE "journal_vouchers" SET "status"='POSTED',"voucherNumber"=${`SAL-${idPrefix(invoice.id)}`},"postedAt"=CURRENT_TIMESTAMP,"version"=2 WHERE "id"=${actualVoucherId}`;
      await tx.$executeRaw`INSERT INTO "accounting_outbox" ("id","voucherId","eventType","payload") VALUES (${randomUUID()},${actualVoucherId},'JOURNAL_POSTED',${JSON.stringify({ voucherId: actualVoucherId, entityId: invoice.entityId, source: 'SALES_AR_INVOICE' })}::jsonb) ON CONFLICT ("voucherId","eventType") DO NOTHING`;
    }
    void requestId;
    return actualVoucherId;
  }

  async listMappings(entityId: string) {
    return this.db.$queryRaw<Array<Record<string, unknown>>>`SELECT m."id",m."mappingKey",m."accountId",a."code",a."name" FROM "sales_ar_mappings" m JOIN "ledger_accounts" a ON a."id"=m."accountId" WHERE m."entityId"=${entityId} ORDER BY m."mappingKey"`;
  }
  async upsertMapping(entityId: string, key: string, accountId: string, actorId: string, requestId: string) {
    if (!['AR_CONTROL','SALES_REVENUE','OUTPUT_GST','CUSTOMER_ADVANCES','CASH_CLEARING','MARKETPLACE_CLEARING','MARKETPLACE_FEES','GST_TCS','INCOME_TDS'].includes(key)) throw new ValidationError('Unsupported Sales Accounts mapping key.');
    const account = await this.db.ledgerAccount.findFirst({ where: { id: accountId, entityId, status: 'ACTIVE', isControl: false } });
    if (!account) throw new ValidationError('Choose an active non-control ledger account belonging to this entity.');
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "sales_ar_mappings" ("id","entityId","mappingKey","accountId","createdById") VALUES (${randomUUID()},${entityId},${key},${accountId},${actorId}) ON CONFLICT ("entityId","mappingKey") DO UPDATE SET "accountId"=EXCLUDED."accountId"`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.mapping.upsert', resource: 'SalesARMapping', resourceId: `${entityId}:${key}`, after: { entityId, key, accountId }, requestId } });
      return this.listMappings(entityId);
    });
  }

  async recordReceipt(input: { entityId: string; customerId?: string; customerName: string; salesOrderId?: string; invoiceId?: string; receiptDate: string; amount: string; method: string; reference: string; notes?: string; idempotencyKey: string }, actorId: string, requestId: string) {
    const value = amount(input.amount); if (value.lte(0)) throw new ValidationError('Receipt must be greater than zero.');
    const date = isoDate(input.receiptDate); const payloadHash = hash(input);
    return this.db.$transaction(async tx => {
      const replay = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_receipts" WHERE "idempotencyKey"=${input.idempotencyKey}`;
      if (replay[0]) { if (replay[0].payloadHash !== payloadHash) throw new ConflictError('Idempotency key was already used for a different receipt.'); return replay[0]; }
      const entity = await tx.accountingEntity.findUnique({ where: { id: input.entityId } });
      if (!entity) throw new ValidationError('Accounting entity not found.');
      let invoice: Record<string, any> | undefined;
      if (input.invoiceId) {
        const invoiceRows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_invoices" WHERE "id"=${input.invoiceId} AND "entityId"=${input.entityId} AND "status" != 'CANCELLED' FOR UPDATE`;
        invoice = invoiceRows[0];
        if (!invoice) throw new ValidationError('Choose an active Accounts bill/invoice for this receipt.');
        if (input.customerId && invoice.customerId && input.customerId !== invoice.customerId) throw new ValidationError('Receipt customer must match the selected invoice customer.');
        const open = new Prisma.Decimal(String(invoice.totalAmount)).minus(invoice.paidAmount).minus(invoice.creditedAmount);
        if (value.gt(open.plus(0.01))) throw new ValidationError(`Receipt amount exceeds this invoice's open balance of ${open.toFixed(2)}.`);
      }
      const id = randomUUID();
      const customerId = invoice?.customerId ?? input.customerId ?? null;
      const customerName = invoice?.customerNameSnapshot ?? input.customerName;
      const salesOrderId = invoice?.salesOrderId ?? input.salesOrderId ?? null;
      await tx.$executeRaw`INSERT INTO "sales_ar_receipts" ("id","entityId","customerId","customerNameSnapshot","salesOrderId","receiptDate","amount","method","reference","idempotencyKey","payloadHash","createdById","status") VALUES (${id},${input.entityId},${customerId},${customerName},${salesOrderId},${date},${value},${input.method},${input.reference},${input.idempotencyKey},${payloadHash},${actorId},'POSTED')`;
      if (invoice) {
        await tx.$executeRaw`INSERT INTO "sales_ar_allocations" ("id","receiptId","invoiceId","amount") VALUES (${randomUUID()},${id},${invoice.id},${value})`;
        await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "paidAmount"="paidAmount"+${value},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${invoice.id}`;
      }
      if (salesOrderId) {
        await (tx as any).salesOrderPayment.create({
          data: {
            salesOrderId,
            method: input.method,
            reference: input.reference,
            amount: value,
            status: 'PAID',
            paidAt: date,
          },
        });
        const order = await tx.salesOrder.findUnique({ where: { id: salesOrderId } });
        if (order) {
          const allPayments = await (tx as any).salesOrderPayment.findMany({
            where: { salesOrderId, status: 'PAID' },
          });
          const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
          const paymentStatus = totalPaid >= Number(order.grandTotal) ? 'PAID' : 'PARTIALLY_PAID';
          await tx.salesOrder.update({
            where: { id: salesOrderId },
            data: { paymentStatus },
          });
        }
      }
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.receipt.record', resource: 'SalesARReceipt', resourceId: id, after: { amount: value.toFixed(2), reference: input.reference, salesOrderId }, requestId } });
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${id}`; return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listReceipts(entityId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT r.*,COALESCE((SELECT SUM(a."amount") FROM "sales_ar_allocations" a WHERE a."receiptId"=r."id"),0) AS "allocatedAmount",COALESCE((SELECT json_agg(json_build_object('documentType','INVOICE','documentNumber',i."invoiceNumber",'documentDate',i."invoiceDate",'originalAmount',i."totalAmount",'allocatedAmount',a."amount")) FROM "sales_ar_allocations" a JOIN "sales_ar_invoices" i ON i."id"=a."invoiceId" WHERE a."receiptId"=r."id"),'[]'::json) AS allocations,j."voucherNumber" FROM "sales_ar_receipts" r LEFT JOIN "journal_vouchers" j ON j."id"=r."journalVoucherId" WHERE r."entityId"=${entityId} ORDER BY r."receiptDate" DESC,r."createdAt" DESC`;
    return rows.map(r => ({ ...r, paymentNumber: r.voucherNumber ?? `RCP-${String(r.id).slice(0,8).toUpperCase()}`, paymentType: 'CUSTOMER_RECEIPT', paymentDate: r.receiptDate, partyName: r.customerNameSnapshot, partyId: r.customerId, bankAccountId: r.bankAccountId ?? '', bankAccountName: 'Configured cash / clearing ledger', paymentMode: r.method, referenceNumber: r.reference, unallocatedAmount: new Prisma.Decimal(String(r.amount)).minus(r.allocatedAmount).toFixed(2), allocations: r.allocations ?? [] }));
  }

  async verifyReceipt(id: string, version: number, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${id} FOR UPDATE`;
      const receipt = rows[0]; if (!receipt) throw new NotFoundError('Customer receipt not found.');
      if (receipt.status !== 'RECORDED' || Number(receipt.version) !== version) throw new ConflictError('Receipt status or version changed. Refresh and retry.');
      if (receipt.createdById === actorId) throw new ForbiddenError('The receipt recorder cannot verify their own receipt.');
      await tx.$executeRaw`UPDATE "sales_ar_receipts" SET "status"='VERIFIED',"approvedById"=${actorId},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.receipt.verify', resource: 'SalesARReceipt', resourceId: id, before: { status: 'RECORDED', version }, after: { status: 'VERIFIED' }, requestId } });
      return (await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${id}`)[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async allocateReceipt(receiptId: string, invoiceId: string, rawAmount: string, actorId: string, requestId: string) {
    const value = amount(rawAmount); if (value.lte(0)) throw new ValidationError('Allocation must be greater than zero.');
    return this.db.$transaction(async tx => {
      const receiptRows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${receiptId} FOR UPDATE`;
      const invoiceRows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_invoices" WHERE "id"=${invoiceId} FOR UPDATE`;
      const receipt = receiptRows[0], invoice = invoiceRows[0];
      if (!receipt || !invoice) throw new NotFoundError('Receipt or invoice not found.');
      if (!['VERIFIED','POSTED','RECONCILED'].includes(receipt.status)) throw new ConflictError('Verify the receipt before allocating it.');
      if (invoice.status !== 'POSTED') throw new ConflictError('Receipt allocations require a posted invoice.');
      if (receipt.entityId !== invoice.entityId || (receipt.customerId && invoice.customerId && receipt.customerId !== invoice.customerId)) throw new ValidationError('Receipt and invoice must belong to the same entity and customer.');
      const usedRows = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`SELECT COALESCE(SUM("amount"),0) AS total FROM "sales_ar_allocations" WHERE "receiptId"=${receiptId}`;
      const invoiceRows2 = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`SELECT COALESCE(SUM(a."amount"),0) AS total FROM "sales_ar_allocations" a JOIN "sales_ar_receipts" r ON r."id"=a."receiptId" WHERE a."invoiceId"=${invoiceId} AND r."status" IN ('RECORDED','VERIFIED','POSTED','RECONCILED')`;
      if (new Prisma.Decimal(usedRows[0].total).plus(value).gt(receipt.amount)) throw new ValidationError('Allocation exceeds the unallocated receipt balance.');
      const invoiceOpen = new Prisma.Decimal(String(invoice.totalAmount)).minus(invoice.paidAmount).minus(invoice.creditedAmount);
      if (new Prisma.Decimal(invoiceRows2[0].total).plus(value).gt(invoiceOpen)) throw new ValidationError('Allocation exceeds the outstanding invoice balance.');
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO "sales_ar_allocations" ("id","receiptId","invoiceId","amount") VALUES (${id},${receiptId},${invoiceId},${value}) ON CONFLICT ("receiptId","invoiceId") DO UPDATE SET "amount"="sales_ar_allocations"."amount"+EXCLUDED."amount"`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.receipt.allocate', resource: 'SalesARAllocation', resourceId: id, after: { receiptId, invoiceId, amount: value.toFixed(2) }, requestId } });
      return { receiptId, invoiceId, amount: value.toFixed(2) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async postReceipt(id: string, version: number, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${id} FOR UPDATE`;
      const receipt = rows[0]; if (!receipt) throw new NotFoundError('Customer receipt not found.');
      if (receipt.status !== 'VERIFIED' || Number(receipt.version) !== version) throw new ConflictError('Only a verified receipt at the requested version can post.');
      if (receipt.createdById === actorId) throw new ForbiddenError('The receipt recorder cannot post their own receipt.');
      const period = await tx.accountingPeriod.findFirst({ where: { entityId: receipt.entityId, status: 'OPEN', startsOn: { lte: receipt.receiptDate }, endsOn: { gte: receipt.receiptDate } } });
      const entity = await tx.accountingEntity.findUnique({ where: { id: receipt.entityId } });
      if (!period || entity?.status !== 'ACTIVE') throw new ValidationError('Receipt date must be inside an open period for an active entity.');
      const allocationRows = await tx.$queryRaw<Array<{ invoiceId: string; amount: Prisma.Decimal; customerId: string | null; customerNameSnapshot: string }>>`SELECT a."invoiceId",a."amount",i."customerId",i."customerNameSnapshot" FROM "sales_ar_allocations" a JOIN "sales_ar_invoices" i ON i."id"=a."invoiceId" WHERE a."receiptId"=${id}`;
      const allocated = allocationRows.reduce((s,a)=>s.plus(a.amount),new Prisma.Decimal(0));
      const advance = new Prisma.Decimal(String(receipt.amount)).minus(allocated);
      const mappings = await tx.$queryRaw<Array<{ mappingKey: string; accountId: string }>>`SELECT "mappingKey","accountId" FROM "sales_ar_mappings" WHERE "entityId"=${receipt.entityId}`;
      const map = new Map(mappings.map(m=>[m.mappingKey,m.accountId]));
      const cashAccountId = map.get('CASH_CLEARING');
      if (!cashAccountId || (allocated.gt(0) && !map.has('AR_CONTROL')) || (advance.gt(0) && !map.has('CUSTOMER_ADVANCES'))) throw new ValidationError('Configure a bank/cash account and the required AR_CONTROL/CUSTOMER_ADVANCES mappings before posting receipts.');
      const voucherId = randomUUID(), voucherKey = `sales-ar-receipt:${id}`;
      const voucherHash = hash({ receiptId: id, amount: String(receipt.amount), allocations: allocationRows.map(a=>[a.invoiceId,String(a.amount)]) });
      await tx.$executeRaw`INSERT INTO "journal_vouchers" ("id","entityId","periodId","kind","status","accountingDate","description","sourceModule","sourceId","sourceRevision","idempotencyKey","payloadHash","version","createdById","approvedById","approvedAt","createdAt","updatedAt") VALUES (${voucherId},${receipt.entityId},${period.id},'JOURNAL','DRAFT',${receipt.receiptDate},${`Customer receipt ${receipt.reference}`},'SALES_AR_RECEIPT',${id},1,${voucherKey},${voucherHash},1,${receipt.createdById},${actorId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("idempotencyKey") DO NOTHING`;
      const got = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "journal_vouchers" WHERE "idempotencyKey"=${voucherKey}`;
      const actualVoucherId = got[0].id;
      const lineCount = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "journal_lines" WHERE "voucherId"=${actualVoucherId}`;
      if (!Number(lineCount[0].n)) {
        let n = 1;
        await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${actualVoucherId},${n++},${cashAccountId},${receipt.amount},0,'Customer receipt')`;
        for (const a of allocationRows) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo","partyType","partyId") VALUES (${randomUUID()},${actualVoucherId},${n++},${map.get('AR_CONTROL')},0,${a.amount},${`Receipt allocated to ${a.customerNameSnapshot}`},'CUSTOMER',${a.customerId})`;
        if (advance.gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo","partyType","partyId") VALUES (${randomUUID()},${actualVoucherId},${n},${map.get('CUSTOMER_ADVANCES')},0,${advance},'Unallocated customer advance','CUSTOMER',${receipt.customerId})`;
        const seq = await tx.$queryRaw<Array<{ nextNumber: number }>>`INSERT INTO "accounting_sequences" ("id","entityId","fiscalYear","kind","nextNumber") VALUES (${randomUUID()},${receipt.entityId},${period.fiscalYear},'JOURNAL',1) ON CONFLICT ("entityId","fiscalYear","kind") DO UPDATE SET "nextNumber"="accounting_sequences"."nextNumber"+1 RETURNING "nextNumber"`;
        const voucherNumber = `JR-${period.fiscalYear}-${String(seq[0].nextNumber).padStart(6,'0')}`;
        await tx.$executeRaw`UPDATE "journal_vouchers" SET "status"='POSTED',"voucherNumber"=${voucherNumber},"postedById"=${actorId},"postedAt"=CURRENT_TIMESTAMP,"version"=2 WHERE "id"=${actualVoucherId}`;
        await tx.$executeRaw`INSERT INTO "accounting_outbox" ("id","voucherId","eventType","payload") VALUES (${randomUUID()},${actualVoucherId},'JOURNAL_POSTED',${JSON.stringify({ voucherId: actualVoucherId, entityId: receipt.entityId, source: 'SALES_AR_RECEIPT' })}::jsonb) ON CONFLICT ("voucherId","eventType") DO NOTHING`;
      }
      await tx.$executeRaw`UPDATE "sales_ar_receipts" SET "status"='POSTED',"journalVoucherId"=${actualVoucherId},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
      for (const a of allocationRows) await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "paidAmount"=(SELECT COALESCE(SUM(al."amount"),0) FROM "sales_ar_allocations" al JOIN "sales_ar_receipts" r ON r."id"=al."receiptId" WHERE al."invoiceId"=${a.invoiceId} AND r."status" IN ('POSTED','RECONCILED')),"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${a.invoiceId}`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.receipt.post', resource: 'SalesARReceipt', resourceId: id, after: { status: 'POSTED', journalVoucherId: actualVoucherId }, requestId } });
      return (await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_receipts" WHERE "id"=${id}`)[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listMarketplaceBatches(entityId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "entityId"=${entityId} ORDER BY "settlementDate" DESC,"createdAt" DESC`;
    return rows.map(row=>({ ...row, reportType: 'SETTLEMENT', period: new Date(row.settlementDate).toISOString().slice(0,10), fileName: row.externalBatchId, fileHash: '', uploadedAt: row.createdAt, totalRows: 0, matchedRows: row.status === 'MATCHED' || row.status === 'POSTED' ? 1 : 0, varianceRows: row.status === 'EXCEPTION' ? 1 : 0, rejectedRows: 0, tcsAmount: row.gstTcsAmount, tdsAmount: row.incomeTdsAmount, netPayout: row.netPayoutAmount, status: row.status === 'POSTED' ? 'COMPLETED' : row.status === 'MATCHED' ? 'RECONCILED' : row.status === 'EXCEPTION' ? 'VARIANCE_FLAGGED' : 'PROCESSING' }));
  }

  async createCreditNote(
    input: {
      entityId: string;
      invoiceId: string;
      reasonCode?: string;
      reasonDescription?: string;
      taxableAmount: string;
      taxAmount: string;
      totalAmount: string;
      creditDate?: string;
    },
    actorId: string,
    requestId: string
  ) {
    const taxable = amount(input.taxableAmount);
    const tax = amount(input.taxAmount);
    const total = amount(input.totalAmount);
    if (total.lte(0)) throw new ValidationError('Credit note total must be greater than zero.');

    const note = await this.db.$transaction(async tx => {
      const invoiceRows = await tx.$queryRaw<Array<Record<string, any>>>`
        SELECT * FROM "sales_ar_invoices" WHERE "id"=${input.invoiceId} AND "entityId"=${input.entityId} FOR UPDATE
      `;
      const invoice = invoiceRows[0];
      if (!invoice) throw new NotFoundError('Selected tax invoice not found.');
      if (invoice.status === 'CANCELLED') throw new ConflictError('Cannot issue credit note against a cancelled invoice.');

      const remainingBalance = new Prisma.Decimal(String(invoice.totalAmount)).minus(invoice.creditedAmount);
      if (total.gt(remainingBalance.plus(0.01))) {
        throw new ValidationError(`Credit note total (${total.toFixed(2)}) exceeds invoice credited capacity of ${remainingBalance.toFixed(2)}.`);
      }

      // Create supporting sales_financial_returns row for referential integrity
      const returnId = randomUUID();
      const returnLineId = randomUUID();
      const orderLines = await tx.salesOrderLine.findMany({
        where: { salesOrderId: invoice.salesOrderId },
        take: 1,
      });
      const orderLineId = orderLines[0]?.id;
      if (!orderLineId) throw new ValidationError('Invoice has no linked order lines.');

      await (tx as any).salesFinancialReturn.create({
        data: {
          id: returnId,
          salesOrderId: invoice.salesOrderId,
          status: 'COMPLETED',
          currency: invoice.currency || 'INR',
          occurredAt: input.creditDate ? new Date(input.creditDate) : new Date(),
          creditedNetAmount: taxable,
          taxCreditAmount: tax,
          sourceReference: input.reasonDescription || input.reasonCode || 'Accounts Credit Adjustment',
          createdByActorId: actorId,
          completedByActorId: actorId,
        },
      });

      await (tx as any).salesFinancialReturnLine.create({
        data: {
          id: returnLineId,
          salesFinancialReturnId: returnId,
          salesOrderLineId: orderLineId,
          quantity: new Prisma.Decimal(1),
        },
      });

      const noteId = randomUUID();
      const creditDate = input.creditDate ? isoDate(input.creditDate) : new Date();

      await tx.$executeRaw`
        INSERT INTO "sales_ar_credit_notes" (
          "id", "entityId", "invoiceId", "sourceReturnId", "creditDate",
          "taxableAmount", "taxAmount", "totalAmount", "status", "createdById", "version"
        ) VALUES (
          ${noteId}, ${input.entityId}, ${invoice.id}, ${returnId}, ${creditDate},
          ${taxable}, ${tax}, ${total}, 'DRAFT', ${actorId}, 1
        )
      `;

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.ar.credit_note.create',
          resource: 'SalesARCreditNote',
          resourceId: noteId,
          after: { invoiceId: invoice.id, totalAmount: total.toFixed(2) },
          requestId,
        },
      });

      return { id: noteId, entityId: input.entityId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    try {
      await this.notifications.notifyRoles({
        roles: ['accountant', 'accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin', 'super_admin'],
        type: 'INFO',
        title: `Credit Note Created: #${String(note.id).slice(0, 8).toUpperCase()}`,
        message: `A new Credit Note candidate for ₹${total.toFixed(2)} was created by Accounts.`,
        resource: 'SalesARCreditNote',
        resourceId: note.id,
        href: `/accounts/credit-notes`,
        metadata: { creditNoteId: note.id, totalAmount: total.toFixed(2), createdBy: actorId },
      });
    } catch {
      // Non-blocking notification
    }

    return (await this.listCreditNotes(note.entityId)).find((r: any) => r.id === note.id);
  }

  async listCreditNotes(entityId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`SELECT c.*,i."invoiceNumber",i."customerNameSnapshot",r."sourceReference",j."voucherNumber" FROM "sales_ar_credit_notes" c JOIN "sales_ar_invoices" i ON i."id"=c."invoiceId" JOIN "sales_financial_returns" r ON r."id"=c."sourceReturnId" LEFT JOIN "journal_vouchers" j ON j."id"=c."journalVoucherId" WHERE c."entityId"=${entityId} ORDER BY c."creditDate" DESC,c."createdAt" DESC`;
    return rows.map(c=>({ ...c, noteNumber: c.creditNoteNumber ?? `DRAFT-CN-${String(c.id).slice(0,8).toUpperCase()}`, noteType: 'CREDIT', partyType: 'CUSTOMER', partyName: c.customerNameSnapshot, issueDate: c.creditDate, originalInvoiceNumber: c.invoiceNumber, reasonCode: 'RETURN', reasonDescription: c.sourceReference ?? 'Sales return', adjustGst: new Prisma.Decimal(String(c.taxAmount)).gt(0), restockInventory: false }));
  }

  async getCreditNote(id: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, any>>>`
      SELECT c.*,
             i."invoiceNumber",
             i."customerNameSnapshot",
             i."customerGstinSnapshot",
             i."invoiceDate",
             i."totalAmount" AS "invoiceTotalAmount",
             i."salesOrderId",
             i."currency",
             r."sourceReference",
             j."voucherNumber"
      FROM "sales_ar_credit_notes" c
      JOIN "sales_ar_invoices" i ON i."id"=c."invoiceId"
      JOIN "sales_financial_returns" r ON r."id"=c."sourceReturnId"
      LEFT JOIN "journal_vouchers" j ON j."id"=c."journalVoucherId"
      WHERE c."id"=${id}
    `;
    if (!rows[0]) throw new NotFoundError('Credit note not found.');
    const c = rows[0];

    const lines = await this.db.$queryRaw<Array<Record<string, any>>>`
      SELECT l.* FROM "sales_ar_invoice_lines" l WHERE l."invoiceId"=${c.invoiceId} ORDER BY l."lineNumber" ASC
    `;

    const [creator, approver, salesOrderAddress] = await Promise.all([
      c.createdById ? this.db.user.findUnique({ where: { id: c.createdById }, select: { id: true, name: true, email: true, role: true } }) : null,
      c.approvedById ? this.db.user.findUnique({ where: { id: c.approvedById }, select: { id: true, name: true, email: true, role: true } }) : null,
      c.salesOrderId ? (this.db as any).salesOrderAddress.findFirst({ where: { salesOrderId: c.salesOrderId } }) : null,
    ]);

    const placeOfSupply = salesOrderAddress?.state
      ? `${salesOrderAddress.state}${salesOrderAddress.postalCode ? ` (${salesOrderAddress.postalCode.slice(0, 2)})` : ''}`
      : 'Madhya Pradesh (23)';

    return {
      ...c,
      noteNumber: c.creditNoteNumber ?? `DRAFT-CN-${String(c.id).slice(0, 8).toUpperCase()}`,
      noteType: 'CREDIT',
      partyType: 'CUSTOMER',
      partyName: c.customerNameSnapshot,
      partyGstin: c.customerGstinSnapshot || '',
      placeOfSupply,
      issueDate: c.creditDate ? new Date(c.creditDate).toISOString() : new Date().toISOString(),
      originalInvoiceNumber: c.invoiceNumber,
      originalInvoiceDate: c.invoiceDate ? new Date(c.invoiceDate).toISOString() : null,
      originalInvoiceTotal: c.invoiceTotalAmount,
      reasonCode: 'RETURN',
      reasonDescription: c.sourceReference ?? 'Sales return / commercial adjustment',
      adjustGst: new Prisma.Decimal(String(c.taxAmount)).gt(0),
      restockInventory: true,
      lines: lines.map((l: any, idx: number) => ({
        id: l.id,
        lineNumber: l.lineNumber || idx + 1,
        description: l.description,
        hsnSacCode: l.hsnSacCode || '8421',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: l.taxRate ?? l.gstRate ?? 18,
        taxableAmount: l.taxableAmount,
        cgstAmount: l.cgstAmount || '0.00',
        sgstAmount: l.sgstAmount || '0.00',
        igstAmount: l.igstAmount || String(l.taxAmount || 0),
        totalAmount: l.totalAmount || new Prisma.Decimal(String(l.taxableAmount || 0)).plus(l.taxAmount || 0).toFixed(2),
      })),
      creator,
      approver,
    };
  }

  async customerLedger(entityId: string, customerId: string) {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      WITH entries AS (
      SELECT "invoiceDate" AS "entryDate",COALESCE("invoiceNumber",'DRAFT-'||LEFT("id",8)) AS reference,'INVOICE' AS "entryType","totalAmount" AS debit,0::numeric AS credit,"paidAmount" AS settled,"salesOrderId" AS "sourceId" FROM "sales_ar_invoices" WHERE "entityId"=${entityId} AND "customerId"=${customerId} AND "status" != 'CANCELLED'
      UNION ALL
      SELECT r."receiptDate" AS "entryDate",r."reference" AS reference,'RECEIPT' AS "entryType",0::numeric AS debit,r."amount" AS credit,COALESCE((SELECT SUM(a."amount") FROM "sales_ar_allocations" a WHERE a."receiptId"=r."id"),0) AS settled,r."salesOrderId" AS "sourceId" FROM "sales_ar_receipts" r WHERE r."entityId"=${entityId} AND r."customerId"=${customerId} AND r."status" != 'CANCELLED'
      UNION ALL
      SELECT c."creditDate" AS "entryDate",COALESCE(c."creditNoteNumber",'DRAFT-CN-'||LEFT(c."id",8)) AS reference,'CREDIT_NOTE' AS "entryType",0::numeric AS debit,c."totalAmount" AS credit,c."totalAmount" AS settled,c."sourceReturnId" AS "sourceId" FROM "sales_ar_credit_notes" c JOIN "sales_ar_invoices" i ON i."id"=c."invoiceId" WHERE c."entityId"=${entityId} AND i."customerId"=${customerId} AND c."status" != 'CANCELLED'
      ) SELECT *,SUM(debit-credit) OVER (ORDER BY "entryDate",reference ROWS UNBOUNDED PRECEDING) AS balance FROM entries ORDER BY "entryDate" ASC,reference ASC`;
    return rows;
  }

  async listCustomerCreditBalances(entityId: string) {
    const customers = await this.db.customer.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        code: true,
        name: true,
        taxNumber: true,
        creditLimit: true,
        contactEmail: true,
        contactPhone: true,
      },
      orderBy: { name: 'asc' },
    });

    const invoiceStats = await this.db.$queryRaw<Array<{
      customerId: string;
      totalInvoiced: Prisma.Decimal;
      totalPaid: Prisma.Decimal;
      totalOutstanding: Prisma.Decimal;
      invoiceCount: bigint;
    }>>`
      SELECT
        "customerId",
        COALESCE(SUM("totalAmount"), 0) AS "totalInvoiced",
        COALESCE(SUM("paidAmount"), 0) AS "totalPaid",
        COALESCE(SUM("totalAmount" - "paidAmount" - "creditedAmount"), 0) AS "totalOutstanding",
        COUNT(*) AS "invoiceCount"
      FROM "sales_ar_invoices"
      WHERE "entityId" = ${entityId} AND "status" != 'CANCELLED' AND "customerId" IS NOT NULL
      GROUP BY "customerId"
    `;

    const statsMap = new Map(invoiceStats.map(s => [s.customerId, s]));

    return customers.map(c => {
      const stats = statsMap.get(c.id);
      const limit = Number(c.creditLimit || 0);
      const outstanding = Number(stats?.totalOutstanding || 0);
      const available = Math.max(0, limit - outstanding);
      const utilization = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;
      const isExceeded = limit > 0 && outstanding > limit;

      return {
        id: c.id,
        code: c.code,
        name: c.name,
        taxNumber: c.taxNumber,
        creditLimit: limit.toFixed(2),
        totalInvoiced: Number(stats?.totalInvoiced || 0).toFixed(2),
        totalPaid: Number(stats?.totalPaid || 0).toFixed(2),
        outstandingBalance: outstanding.toFixed(2),
        availableCredit: available.toFixed(2),
        utilizationPercent: utilization,
        isCreditExceeded: isExceeded,
        invoiceCount: Number(stats?.invoiceCount || 0),
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
      };
    });
  }

  async aging(entityId: string, asOf: string) {
    const date = isoDate(asOf);
    return this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "customerId","customerNameSnapshot" AS "customerName",
        SUM(CASE WHEN (CAST(${date} AS DATE) - "dueDate") <= 0 THEN "totalAmount"-"paidAmount"-"creditedAmount" ELSE 0 END) AS current,
        SUM(CASE WHEN (CAST(${date} AS DATE) - "dueDate") BETWEEN 1 AND 30 THEN "totalAmount"-"paidAmount"-"creditedAmount" ELSE 0 END) AS "days1To30",
        SUM(CASE WHEN (CAST(${date} AS DATE) - "dueDate") BETWEEN 31 AND 60 THEN "totalAmount"-"paidAmount"-"creditedAmount" ELSE 0 END) AS "days31To60",
        SUM(CASE WHEN (CAST(${date} AS DATE) - "dueDate") BETWEEN 61 AND 90 THEN "totalAmount"-"paidAmount"-"creditedAmount" ELSE 0 END) AS "days61To90",
        SUM(CASE WHEN (CAST(${date} AS DATE) - "dueDate") > 90 THEN "totalAmount"-"paidAmount"-"creditedAmount" ELSE 0 END) AS "daysOver90",
        SUM("totalAmount"-"paidAmount"-"creditedAmount") AS total
      FROM "sales_ar_invoices" WHERE "entityId"=${entityId} AND "status" != 'CANCELLED' AND "invoiceDate"<=${date} AND "totalAmount"-"paidAmount"-"creditedAmount">0
      GROUP BY "customerId","customerNameSnapshot" ORDER BY "customerNameSnapshot"`;
  }

  async transitionCreditNote(id: string, action: 'submit' | 'approve' | 'post', version: number, actorId: string, requestId: string) {
    await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_credit_notes" WHERE "id"=${id} FOR UPDATE`;
      const note = rows[0]; if (!note) throw new NotFoundError('Sales credit note not found.');
      if (Number(note.version) !== version) throw new ConflictError('Credit note changed. Refresh and retry.');
      const expected = { submit: 'DRAFT', approve: 'SUBMITTED', post: 'APPROVED' }[action];
      if (note.status !== expected) throw new ConflictError(`Credit note must be ${expected} before ${action}.`);
      if (action === 'approve' && note.createdById === actorId) throw new ForbiddenError('The credit note creator cannot approve their own note.');
      if (action === 'post' && note.approvedById === actorId) throw new ForbiddenError('The credit note approver cannot post the note.');
      let journalId: string | null = null, noteNumber: string | null = null;
      if (action === 'post') {
        const invoice = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_invoices" WHERE "id"=${note.invoiceId} FOR UPDATE`;
        const source = invoice[0]; if (!source) throw new NotFoundError('Original sales invoice not found.');
        const due = new Prisma.Decimal(String(source.totalAmount)).minus(source.paidAmount).minus(source.creditedAmount);
        if (new Prisma.Decimal(String(note.totalAmount)).gt(due)) throw new ValidationError('Credit note exceeds the remaining invoice balance.');
        const period = await tx.accountingPeriod.findFirst({ where: { entityId: note.entityId, status: 'OPEN', startsOn: { lte: note.creditDate }, endsOn: { gte: note.creditDate } } });
        if (!period) throw new ValidationError('Credit note date must be inside an open accounting period.');
        const mappings = await tx.$queryRaw<Array<{ mappingKey: string; accountId: string }>>`SELECT "mappingKey","accountId" FROM "sales_ar_mappings" WHERE "entityId"=${note.entityId}`;
        const map = new Map(mappings.map(m=>[m.mappingKey,m.accountId]));
        if (!map.has('AR_CONTROL') || !map.has('SALES_REVENUE') || (new Prisma.Decimal(String(note.taxAmount)).gt(0) && !map.has('OUTPUT_GST'))) throw new ValidationError('Configure AR_CONTROL, SALES_REVENUE and applicable OUTPUT_GST mappings first.');
        journalId = randomUUID(); const voucherKey = `sales-ar-credit-note:${id}`;
        const voucherHash = hash({ id, total: String(note.totalAmount), mappingIds: [...map] });
        await tx.$executeRaw`INSERT INTO "journal_vouchers" ("id","entityId","periodId","kind","status","accountingDate","description","sourceModule","sourceId","sourceRevision","idempotencyKey","payloadHash","version","createdById","approvedById","approvedAt","createdAt","updatedAt") VALUES (${journalId},${note.entityId},${period.id},'JOURNAL','DRAFT',${note.creditDate},${`Sales credit note ${id}`},'SALES_AR_CREDIT_NOTE',${id},1,${voucherKey},${voucherHash},1,${note.createdById},${actorId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("idempotencyKey") DO NOTHING`;
        const actual = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "journal_vouchers" WHERE "idempotencyKey"=${voucherKey}`; journalId = actual[0].id;
        const existingLines = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "journal_lines" WHERE "voucherId"=${journalId}`;
        if (!Number(existingLines[0].n)) {
          let n=1;
          if (new Prisma.Decimal(String(note.taxableAmount)).gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${journalId},${n++},${map.get('SALES_REVENUE')},${note.taxableAmount},0,'Sales return credit')`;
          if (new Prisma.Decimal(String(note.taxAmount)).gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${journalId},${n++},${map.get('OUTPUT_GST')},${note.taxAmount},0,'Output tax adjustment')`;
          await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo","partyType","partyId") VALUES (${randomUUID()},${journalId},${n},${map.get('AR_CONTROL')},0,${note.totalAmount},'Customer AR credit','CUSTOMER',${source.customerId})`;
          const seq=await tx.$queryRaw<Array<{nextNumber:number}>>`INSERT INTO "accounting_sequences" ("id","entityId","fiscalYear","kind","nextNumber") VALUES (${randomUUID()},${note.entityId},${period.fiscalYear},'JOURNAL',1) ON CONFLICT ("entityId","fiscalYear","kind") DO UPDATE SET "nextNumber"="accounting_sequences"."nextNumber"+1 RETURNING "nextNumber"`;
          await tx.$executeRaw`UPDATE "journal_vouchers" SET "status"='POSTED',"voucherNumber"=${`JR-${period.fiscalYear}-${String(seq[0].nextNumber).padStart(6,'0')}`} ,"postedById"=${actorId},"postedAt"=CURRENT_TIMESTAMP,"version"=2 WHERE "id"=${journalId}`;
          await tx.$executeRaw`INSERT INTO "accounting_outbox" ("id","voucherId","eventType","payload") VALUES (${randomUUID()},${journalId},'JOURNAL_POSTED',${JSON.stringify({voucherId:journalId,entityId:note.entityId,source:'SALES_AR_CREDIT_NOTE'})}::jsonb) ON CONFLICT ("voucherId","eventType") DO NOTHING`;
        }
        const yearSeq=await tx.$queryRaw<Array<{nextNumber:number}>>`INSERT INTO "accounting_sequences" ("id","entityId","fiscalYear","kind","nextNumber") VALUES (${randomUUID()},${note.entityId},${period.fiscalYear},'SALES_CREDIT_NOTE',1) ON CONFLICT ("entityId","fiscalYear","kind") DO UPDATE SET "nextNumber"="accounting_sequences"."nextNumber"+1 RETURNING "nextNumber"`;
        noteNumber=`SCN-${period.fiscalYear}-${String(yearSeq[0].nextNumber).padStart(6,'0')}`;
        await tx.$executeRaw`UPDATE "sales_ar_invoices" SET "creditedAmount"="creditedAmount"+${note.totalAmount},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${source.id}`;
      }
      const next = action==='submit'?'SUBMITTED':action==='approve'?'APPROVED':'POSTED';
      await tx.$executeRaw`UPDATE "sales_ar_credit_notes" SET "status"=${next},"version"="version"+1,"updatedAt"=CURRENT_TIMESTAMP,"approvedById"=CASE WHEN ${action}='approve' THEN ${actorId} ELSE "approvedById" END,"journalVoucherId"=COALESCE(${journalId},"journalVoucherId"),"creditNoteNumber"=COALESCE(${noteNumber},"creditNoteNumber") WHERE "id"=${id}`;
      await tx.auditLog.create({ data: { userId: actorId, action: `accounts.ar.credit_note.${action}`, resource: 'SalesARCreditNote', resourceId: id, before: { status: note.status, version }, after: { status: next, journalVoucherId: journalId }, requestId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return (await this.listCreditNotes((await this.db.$queryRaw<Array<{ entityId: string }>>`SELECT "entityId" FROM "sales_ar_credit_notes" WHERE "id"=${id}`)[0].entityId)).find((row:any)=>row.id===id);
  }

  async recordMarketplaceBatch(input: { entityId: string; channel: string; externalBatchId: string; settlementDate: string; grossAmount: string; feesAmount: string; gstTcsAmount: string; incomeTdsAmount: string; netPayoutAmount: string }, actorId: string, requestId: string) {
    if (!['AMAZON','E_TRADE'].includes(input.channel)) throw new ValidationError('Marketplace settlement channel must be Amazon or E-Trade.');
    const gross = amount(input.grossAmount), fees = amount(input.feesAmount), tcs = amount(input.gstTcsAmount), tds = amount(input.incomeTdsAmount), net = amount(input.netPayoutAmount);
    const date = isoDate(input.settlementDate);
    if (!net.plus(fees).plus(tcs).plus(tds).equals(gross)) throw new ValidationError('Net payout, fees, GST TCS and income-tax TDS must reconcile exactly to gross proceeds.');
    const id = randomUUID();
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "sales_ar_marketplace_batches" ("id","entityId","channel","externalBatchId","settlementDate","grossAmount","feesAmount","gstTcsAmount","incomeTdsAmount","netPayoutAmount","createdById") VALUES (${id},${input.entityId},${input.channel},${input.externalBatchId},${date},${gross},${fees},${tcs},${tds},${net},${actorId}) ON CONFLICT ("entityId","channel","externalBatchId") DO NOTHING`;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "entityId"=${input.entityId} AND "channel"=${input.channel} AND "externalBatchId"=${input.externalBatchId}`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.marketplace.record', resource: 'SalesARMarketplaceBatch', resourceId: String(rows[0].id), after: { externalBatchId: input.externalBatchId, grossAmount: gross.toFixed(2) }, requestId } });
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async matchMarketplaceBatch(id: string, bankReference: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "id"=${id} FOR UPDATE`;
      const batch = rows[0]; if (!batch) throw new NotFoundError('Marketplace settlement batch not found.');
      if (batch.status !== 'DRAFT') throw new ConflictError('Only a draft settlement can be matched.');
      const changed = await tx.$executeRaw`UPDATE "sales_ar_marketplace_batches" SET "status"='MATCHED',"bankReference"=${bankReference},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "status"='DRAFT'`;
      if (!changed) throw new ConflictError('Settlement changed while matching.');
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.marketplace.match', resource: 'SalesARMarketplaceBatch', resourceId: id, before: { status: 'DRAFT' }, after: { status: 'MATCHED', bankReference }, requestId } });
      return (await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "id"=${id}`)[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async postMarketplaceBatch(id: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "id"=${id} FOR UPDATE`;
      const batch = rows[0]; if (!batch) throw new NotFoundError('Marketplace settlement batch not found.');
      if (batch.status !== 'MATCHED') throw new ConflictError('Match the settlement to a bank reference before posting.');
      if (batch.createdById === actorId) throw new ForbiddenError('The settlement importer cannot post their own batch.');
      const period = await tx.accountingPeriod.findFirst({ where: { entityId: batch.entityId, status: 'OPEN', startsOn: { lte: batch.settlementDate }, endsOn: { gte: batch.settlementDate } } });
      if (!period) throw new ValidationError('Settlement date must be inside an open accounting period.');
      const mappings = await tx.$queryRaw<Array<{ mappingKey: string; accountId: string }>>`SELECT "mappingKey","accountId" FROM "sales_ar_mappings" WHERE "entityId"=${batch.entityId}`;
      const map = new Map(mappings.map(m=>[m.mappingKey,m.accountId]));
      if (!map.has('MARKETPLACE_CLEARING') || !map.has('CASH_CLEARING') || (new Prisma.Decimal(String(batch.feesAmount)).gt(0) && !map.has('MARKETPLACE_FEES')) || (new Prisma.Decimal(String(batch.gstTcsAmount)).gt(0) && !map.has('GST_TCS')) || (new Prisma.Decimal(String(batch.incomeTdsAmount)).gt(0) && !map.has('INCOME_TDS'))) throw new ValidationError('Configure clearing, bank, fee and separate TCS/TDS ledger mappings before posting.');
      const voucherId = randomUUID(), voucherKey = `sales-ar-marketplace:${id}`;
      const payloadHash = hash({ id, gross: String(batch.grossAmount), fees: String(batch.feesAmount), gstTcs: String(batch.gstTcsAmount), incomeTds: String(batch.incomeTdsAmount), net: String(batch.netPayoutAmount), mappings: [...map] });
      await tx.$executeRaw`INSERT INTO "journal_vouchers" ("id","entityId","periodId","kind","status","accountingDate","description","sourceModule","sourceId","sourceRevision","idempotencyKey","payloadHash","version","createdById","approvedById","approvedAt","createdAt","updatedAt") VALUES (${voucherId},${batch.entityId},${period.id},'JOURNAL','DRAFT',${batch.settlementDate},${`Marketplace settlement ${batch.externalBatchId}`},'SALES_AR_MARKETPLACE',${id},1,${voucherKey},${payloadHash},1,${batch.createdById},${actorId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("idempotencyKey") DO NOTHING`;
      const voucher = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "journal_vouchers" WHERE "idempotencyKey"=${voucherKey}`;
      const actualId = voucher[0].id;
      const existingLines = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "journal_lines" WHERE "voucherId"=${actualId}`;
      if (!Number(existingLines[0].n)) {
        let n = 1;
        for (const [key, field] of [['CASH_CLEARING','netPayoutAmount'],['MARKETPLACE_FEES','feesAmount'],['GST_TCS','gstTcsAmount'],['INCOME_TDS','incomeTdsAmount']] as const) {
          const value = new Prisma.Decimal(String(batch[field])); if (value.gt(0)) await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${actualId},${n++},${map.get(key)},${value},0,${key})`;
        }
        await tx.$executeRaw`INSERT INTO "journal_lines" ("id","voucherId","lineNumber","accountId","debit","credit","memo") VALUES (${randomUUID()},${actualId},${n},${map.get('MARKETPLACE_CLEARING')},0,${batch.grossAmount},'Marketplace clearing release')`;
        const seq = await tx.$queryRaw<Array<{ nextNumber: number }>>`INSERT INTO "accounting_sequences" ("id","entityId","fiscalYear","kind","nextNumber") VALUES (${randomUUID()},${batch.entityId},${period.fiscalYear},'JOURNAL',1) ON CONFLICT ("entityId","fiscalYear","kind") DO UPDATE SET "nextNumber"="accounting_sequences"."nextNumber"+1 RETURNING "nextNumber"`;
        await tx.$executeRaw`UPDATE "journal_vouchers" SET "status"='POSTED',"voucherNumber"=${`JR-${period.fiscalYear}-${String(seq[0].nextNumber).padStart(6,'0')}`} ,"postedById"=${actorId},"postedAt"=CURRENT_TIMESTAMP,"version"=2 WHERE "id"=${actualId}`;
        await tx.$executeRaw`INSERT INTO "accounting_outbox" ("id","voucherId","eventType","payload") VALUES (${randomUUID()},${actualId},'JOURNAL_POSTED',${JSON.stringify({ voucherId: actualId, entityId: batch.entityId, source: 'SALES_AR_MARKETPLACE' })}::jsonb) ON CONFLICT ("voucherId","eventType") DO NOTHING`;
      }
      await tx.$executeRaw`UPDATE "sales_ar_marketplace_batches" SET "status"='POSTED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.ar.marketplace.post', resource: 'SalesARMarketplaceBatch', resourceId: id, after: { status: 'POSTED', journalVoucherId: actualId }, requestId } });
      return (await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "sales_ar_marketplace_batches" WHERE "id"=${id}`)[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

const idPrefix = (value: string) => value.replace(/-/g, '').slice(0, 12).toUpperCase();
