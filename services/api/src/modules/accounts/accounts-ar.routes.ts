import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ValidationError } from '../../common/errors/AppError';
import { AccountsReceivablesService } from './accounts-ar.service';

const router = Router();
const permissions = new DbPermissionChecker();
const service = new AccountsReceivablesService();
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
// Blank editable discounts represent no discount. Normalize them at the API
// boundary as well, so older clients cannot fail pro forma updates.
const discountMoney = z.preprocess(value => typeof value === 'string' && value.trim() === '' ? '0' : value, money);
const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError('Invalid Accounts request.', result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
};
const actor = (req: Request) => req.user!.id;
const respond = (res: Response, req: Request, data: unknown, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
const key = (req: Request) => {
  const value = req.header('Idempotency-Key')?.trim();
  if (!value || value.length < 16 || value.length > 128) throw new ValidationError('A 16–128 character Idempotency-Key header is required.');
  return value;
};
const version = z.object({ version: z.number().int().positive() }).strict();

router.use(authenticate);
router.get('/pro-formas', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listProformas(q.entityId));
}));
router.put('/pro-formas/:id', authorize('update', 'SalesARInvoice', permissions), run(async (req, res) => {
  const body = parse(z.object({ lines: z.array(z.object({ salesOrderLineId: uuid, unitPrice: money, discountAmount: discountMoney, taxRate: money }).strict()).min(1) }).strict(), req.body);
  respond(res, req, await service.updateProforma(parse(uuid, req.params.id), body.lines, actor(req), req.id));
}));
router.get('/ar/invoices', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid, page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }), req.query);
  respond(res, req, await service.listInvoices(q.entityId, q.page, q.limit));
}));
router.get('/ar/invoices/:id', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.getInvoice(parse(uuid, req.params.id)))));
for (const action of ['submit', 'approve', 'post'] as const) {
  router.post(`/ar/invoices/:id/${action}`, authorize(action === 'submit' ? 'submit' : action === 'approve' ? 'approve' : 'post', 'SalesARInvoice', permissions), run(async (req, res) => {
    const body = parse(version, req.body);
    respond(res, req, await service.transitionInvoice(parse(uuid, req.params.id), action, body.version, actor(req), req.id));
  }));
}
router.patch('/ar/invoices/:id', authorize('update', 'SalesARInvoice', permissions), run(async (req, res) => {
  const body = parse(z.object({
    lines: z.array(z.object({
      salesOrderLineId: uuid.optional(),
      lineNumber: z.number().int().positive(),
      description: z.string().optional(),
      quantity: money,
      unitPrice: money,
      discountAmount: discountMoney.optional(),
      taxRate: money,
    }).strict()).min(1),
    notes: z.string().optional(),
  }).strict(), req.body);
  respond(res, req, await service.updateInvoice(parse(uuid, req.params.id), body, actor(req), req.id));
}));
router.post('/ar/credit-notes', authorize('create', 'SalesARInvoice', permissions), run(async (req, res) => {
  const body = parse(z.object({
    entityId: uuid,
    invoiceId: uuid,
    reasonCode: z.string().optional(),
    reasonDescription: z.string().optional(),
    taxableAmount: money,
    taxAmount: money,
    totalAmount: money,
    creditDate: date.optional(),
  }).strict(), req.body);
  respond(res, req, await service.createCreditNote(body, actor(req), req.id), 201);
}));
router.get('/ar/mappings', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listMappings(q.entityId));
}));
router.put('/ar/mappings/:key', authorize('manage', 'AccountConfiguration', permissions), run(async (req, res) => {
  const body = parse(z.object({ entityId: uuid, accountId: uuid }).strict(), req.body);
  respond(res, req, await service.upsertMapping(body.entityId, req.params.key, body.accountId, actor(req), req.id));
}));
router.get('/ar/receipts', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listReceipts(q.entityId));
}));
router.post('/ar/receipts', authorize('create', 'SalesARReceipt', permissions), run(async (req, res) => {
  const body = parse(z.object({ entityId: uuid, customerId: uuid.optional(), customerName: z.string().trim().min(1).max(200), salesOrderId: uuid.optional(), invoiceId: uuid.optional(), receiptDate: date, amount: money, method: z.enum(['BANK_TRANSFER','NEFT_RTGS','IMPS','UPI','CHEQUE','CASH','CARD','MARKETPLACE']), reference: z.string().trim().min(1).max(120), notes: z.string().optional() }).strict(), req.body);
  respond(res, req, await service.recordReceipt({ ...body, idempotencyKey: key(req) }, actor(req), req.id), 201);
}));
router.post('/ar/receipts/:id/verify', authorize('approve', 'SalesARReceipt', permissions), run(async (req, res) => {
  const body = parse(version, req.body); respond(res, req, await service.verifyReceipt(parse(uuid, req.params.id), body.version, actor(req), req.id));
}));
router.post('/ar/receipts/:id/allocate', authorize('update', 'SalesARReceipt', permissions), run(async (req, res) => {
  const body = parse(z.object({ invoiceId: uuid, amount: money }).strict(), req.body);
  respond(res, req, await service.allocateReceipt(parse(uuid, req.params.id), body.invoiceId, body.amount, actor(req), req.id));
}));
router.post('/ar/receipts/:id/post', authorize('post', 'SalesARReceipt', permissions), run(async (req, res) => {
  const body = parse(version, req.body); respond(res, req, await service.postReceipt(parse(uuid, req.params.id), body.version, actor(req), req.id));
}));
router.get('/marketplace/batches', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listMarketplaceBatches(q.entityId));
}));
router.get('/ar/events/failed', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.listFailedEvents())));
router.post('/ar/events/retry', authorize('manage', 'AccountConfiguration', permissions), run(async (req, res) => respond(res, req, await service.retryFailedEvents(actor(req), req.id))));
router.get('/ar/credit-notes', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listCreditNotes(q.entityId));
}));
router.get('/ar/credit-notes/:id', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  respond(res, req, await service.getCreditNote(parse(uuid, req.params.id)));
}));
router.get('/ar/aging', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid, asOf: date }), req.query); respond(res, req, await service.aging(q.entityId, q.asOf));
}));
router.get('/ar/customers/credit-balances', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.listCustomerCreditBalances(q.entityId));
}));
router.get('/ar/customers/:customerId/ledger', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const q = parse(z.object({ entityId: uuid }), req.query); respond(res, req, await service.customerLedger(q.entityId, parse(uuid, req.params.customerId)));
}));
for (const action of ['submit', 'approve', 'post'] as const) {
  router.post(`/ar/credit-notes/:id/${action}`, authorize(action === 'submit' ? 'submit' : action === 'approve' ? 'approve' : 'post', 'SalesARInvoice', permissions), run(async (req, res) => {
    const body = parse(version, req.body); respond(res, req, await service.transitionCreditNote(parse(uuid, req.params.id), action, body.version, actor(req), req.id));
  }));
}
router.post('/marketplace/batches', authorize('create', 'SalesARMarketplaceBatch', permissions), run(async (req, res) => {
  const body = parse(z.object({ entityId: uuid, channel: z.enum(['AMAZON','E_TRADE']), externalBatchId: z.string().trim().min(1).max(120), settlementDate: date, grossAmount: money, feesAmount: money, gstTcsAmount: money, incomeTdsAmount: money, netPayoutAmount: money }).strict(), req.body);
  respond(res, req, await service.recordMarketplaceBatch(body, actor(req), req.id), 201);
}));
router.post('/marketplace/batches/:id/match', authorize('approve', 'SalesARMarketplaceBatch', permissions), run(async (req, res) => {
  const body = parse(z.object({ bankReference: z.string().trim().min(1).max(120) }).strict(), req.body);
  respond(res, req, await service.matchMarketplaceBatch(parse(uuid, req.params.id), body.bankReference, actor(req), req.id));
}));
router.post('/marketplace/batches/:id/post', authorize('post', 'SalesARMarketplaceBatch', permissions), run(async (req, res) => respond(res, req, await service.postMarketplaceBatch(parse(uuid, req.params.id), actor(req), req.id))));

export default router;
