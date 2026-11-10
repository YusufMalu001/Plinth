import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ValidationError } from '../../common/errors/AppError';
import { AccountsCoreService } from './accounts-core.service';

const router = Router();
const permissions = new DbPermissionChecker();
const service = new AccountsCoreService();
const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
const periodSchema = z.object({ entityId: id, code: z.string().trim().min(4).max(16), fiscalYear: z.string().regex(/^FY\d{4}-\d{2}$/), startsOn: date, endsOn: date }).strict();
const accountSchema = z.object({ entityId: id, code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/), name: z.string().trim().min(2).max(160), type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']), isControl: z.boolean().default(false), tallyLedger: z.string().trim().max(160).optional() }).strict();
const lineSchema = z.object({ accountId: id, debit: money, credit: money, memo: z.string().trim().max(500).optional() }).strict();
const journalSchema = z.object({ entityId: id, periodId: id, accountingDate: date, kind: z.enum(['JOURNAL', 'OPENING', 'CONTRA']).default('JOURNAL'), description: z.string().trim().min(3).max(1000), lines: z.array(lineSchema).min(2).max(100) }).strict();
const versionSchema = z.object({ version: z.number().int().positive() }).strict();
const reversalSchema = z.object({ periodId: id, accountingDate: date, reason: z.string().trim().min(5).max(1000) }).strict();
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

router.use(authenticate);
router.get('/entities', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.listEntities())));
router.post('/entities/initialize-synergy', authorize('manage', 'AccountConfiguration', permissions), run(async (req, res) => respond(res, req, await service.initializeSynergyBook(actor(req), req.id), 201)));
router.post('/entities/:id/activate', authorize('approve', 'AccountConfiguration', permissions), run(async (req, res) => {
  const body = parse(z.object({ verificationReference: z.string().trim().min(5).max(200) }).strict(), req.body);
  respond(res, req, await service.activateEntity(parse(id, req.params.id), body.verificationReference, actor(req), req.id));
}));
router.get('/periods', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.listPeriods(parse(id, req.query.entityId)))));
router.post('/periods', authorize('manage', 'AccountConfiguration', permissions), run(async (req, res) => respond(res, req, await service.createPeriod(parse(periodSchema, req.body), actor(req), req.id), 201)));
router.post('/periods/:id/close', authorize('close', 'AccountingPeriod', permissions), run(async (req, res) => {
  const body = parse(z.object({ expectedStatus: z.literal('OPEN') }).strict(), req.body);
  respond(res, req, await service.closePeriod(parse(id, req.params.id), body.expectedStatus, actor(req), req.id));
}));
router.get('/chart', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.listAccounts(parse(id, req.query.entityId)))));
router.post('/chart', authorize('manage', 'AccountConfiguration', permissions), run(async (req, res) => respond(res, req, await service.createAccount(parse(accountSchema, req.body), actor(req), req.id), 201)));
router.get('/journals', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id, page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }), req.query);
  respond(res, req, await service.listJournals(query.entityId, query.page, query.limit));
}));
router.get('/journals/:id', authorize('read', 'Accounts', permissions), run(async (req, res) => respond(res, req, await service.getJournal(parse(id, req.params.id)))));
router.post('/journals', authorize('create', 'JournalVoucher', permissions), run(async (req, res) => respond(res, req, await service.createJournal(parse(journalSchema, req.body), key(req), actor(req), req.id), 201)));
router.post('/journals/:id/submit', authorize('submit', 'JournalVoucher', permissions), run(async (req, res) => respond(res, req, await service.submitJournal(parse(id, req.params.id), parse(versionSchema, req.body).version, actor(req), req.id))));
router.post('/journals/:id/approve', authorize('approve', 'JournalVoucher', permissions), run(async (req, res) => respond(res, req, await service.approveJournal(parse(id, req.params.id), parse(versionSchema, req.body).version, actor(req), req.id))));
router.post('/journals/:id/post', authorize('post', 'JournalVoucher', permissions), run(async (req, res) => respond(res, req, await service.postJournal(parse(id, req.params.id), parse(versionSchema, req.body).version, actor(req), req.id))));
router.post('/journals/:id/reversal', authorize('reverse', 'JournalVoucher', permissions), run(async (req, res) => respond(res, req, await service.draftReversal(parse(id, req.params.id), parse(reversalSchema, req.body), key(req), actor(req), req.id), 201)));
router.get('/reports/trial-balance', authorize('read', 'Accounts', permissions), run(async (req, res) => {
  const query = parse(z.object({ entityId: id, through: date }), req.query);
  respond(res, req, await service.trialBalance(query.entityId, query.through));
}));

export default router;
