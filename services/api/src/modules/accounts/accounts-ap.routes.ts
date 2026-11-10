import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ValidationError } from '../../common/errors/AppError';
import { AccountsPayablesService } from './accounts-ap.service';

const router = Router();
const permissions = new DbPermissionChecker();
const service = new AccountsPayablesService();
const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const line = z.object({
  description: z.string().trim().min(2).max(500),
  hsnSacCode: z.string().trim().max(20).optional(),
  poLineId: id.optional(),
  grnLineId: id.optional(),
  debitAccountId: id.optional(),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/),
  unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/),
  gstRate: z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/).default('0'),
  taxableAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
  cgstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
  sgstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
  igstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
}).strict();
const bill = z.object({
  entityId: id,
  vendorId: id,
  supplierInvoiceNumber: z.string().trim().min(1).max(100),
  invoiceDate: date,
  dueDate: date,
  kind: z.enum(['STOCK', 'SERVICE', 'CAPITAL', 'LOGISTICS']),
  lines: z.array(line).min(1).max(100),
}).strict();
const updateLine = z.object({
  lineNumber: z.number().optional(),
  description: z.string().trim().min(1).max(500),
  hsnSacCode: z.string().trim().max(20).nullable().optional(),
  poLineId: id.nullable().optional(),
  grnLineId: id.nullable().optional(),
  debitAccountId: id.nullable().optional(),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/),
  unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/),
  gstRate: z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/).default('0'),
  taxableAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
  cgstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
  sgstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
  igstAmount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).default('0'),
}).passthrough();
const billUpdate = z.object({
  entityId: id.optional(),
  vendorId: id.optional(),
  supplierInvoiceNumber: z.string().trim().min(1).max(100),
  invoiceDate: date,
  dueDate: date,
  kind: z.enum(['STOCK', 'SERVICE', 'CAPITAL', 'LOGISTICS']),
  note: z.string().trim().max(1000).optional(),
  lines: z.array(updateLine).min(1).max(100),
  version: z.number().int().positive().optional(),
}).passthrough();
const version = z.object({ version: z.number().int().positive() }).strict();
const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError('Invalid Accounts request.', result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
};
const respond = (res: Response, req: Request, data: unknown, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
const actor = (req: Request) => req.user!.id;
const key = (req: Request) => {
  const value = req.header('Idempotency-Key')?.trim();
  if (!value || value.length < 16 || value.length > 128) throw new ValidationError('A 16–128 character Idempotency-Key header is required.');
  return value;
};

router.use(authenticate);
router.get('/vendors', authorize('read', 'Accounts', permissions), run(async (_req, res) => respond(res, _req, await service.listVendors())));
router.get('/receipt-lines', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id }), req.query);
  respond(res, req, await service.listReceiptLines(query.entityId));
}));
router.get('/grns', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id }), req.query);
  respond(res, req, await service.listAcceptedGrns(query.entityId));
}));
router.get('/grns/:id', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.getAcceptedGrn(parse(id, req.params.id), actor(req), req.id))));
router.post('/grns/:id/payments', authorize('create', 'PurchaseBill', permissions), run(async (req, res) => {
  const body = parse(z.object({
    paymentDate: date,
    amount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
    paymentMode: z.enum(['NEFT_RTGS', 'UPI', 'CHEQUE', 'CASH', 'INTERNAL_TRANSFER']),
    reference: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1000).optional(),
  }).strict(), req.body);
  respond(res, req, await service.recordGrnPayment({ ...body, grnId: parse(id, req.params.id) }, key(req), actor(req), req.id), 201);
}));
router.get('/bills', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id, page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }), req.query);
  respond(res, req, await service.list(query.entityId, query.page, query.limit));
}));
router.get('/payments', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id }), req.query);
  respond(res, req, await service.listAllPayments(query.entityId));
}));
router.get('/bills/:id', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.get(parse(id, req.params.id)))));
router.post('/bills', authorize('create', 'PurchaseBill', permissions), run(async (req, res) => respond(res, req, await service.create(parse(bill, req.body), key(req), actor(req), req.id), 201)));
router.put('/bills/:id', authorize('update', 'PurchaseBill', permissions), run(async (req, res) => {
  const body = parse(billUpdate, req.body);
  respond(res, req, await service.update(parse(id, req.params.id), body as any, body.version, actor(req), req.id));
}));
router.post('/bills/:id/submit', authorize('submit', 'PurchaseBill', permissions), run(async (req, res) => respond(res, req, await service.submit(parse(id, req.params.id), parse(version, req.body).version, actor(req), req.id))));
router.post('/bills/:id/resolve', authorize('resolve', 'PurchaseBill', permissions), run(async (req, res) => {
  const body = parse(z.object({ version: z.number().int().positive(), note: z.string().trim().min(5).max(1000) }).strict(), req.body);
  respond(res, req, await service.resolve(parse(id, req.params.id), body.version, body.note, actor(req), req.id));
}));
router.post('/bills/:id/reopen', authorize('update', 'PurchaseBill', permissions), run(async (req, res) => {
  const body = parse(z.object({ version: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) }).strict(), req.body);
  respond(res, req, await service.reopen(parse(id, req.params.id), body.version, body.reason, actor(req), req.id));
}));
router.post('/bills/:id/approve', authorize('approve', 'PurchaseBill', permissions), run(async (req, res) => respond(res, req, await service.approve(parse(id, req.params.id), parse(version, req.body).version, actor(req), req.id))));
router.post('/bills/:id/payments', authorize('create', 'PurchaseBill', permissions), run(async (req, res) => {
  const body = parse(z.object({
    paymentDate: date,
    amount: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
    paymentMode: z.enum(['NEFT_RTGS', 'UPI', 'CHEQUE', 'CASH', 'INTERNAL_TRANSFER']),
    reference: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1000).optional(),
  }).strict(), req.body);
  respond(res, req, await service.recordBillPayment({ ...body, billId: parse(id, req.params.id) }, key(req), actor(req), req.id), 201);
}));
export default router;
