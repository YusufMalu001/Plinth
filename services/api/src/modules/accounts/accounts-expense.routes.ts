import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth';
import { ValidationError } from '../../common/errors/AppError';
import { accountsExpenseService } from './accounts-expense.service';

const router = Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const expenseCategoryEnum = z.enum([
  'TRANSPORTATION',
  'ELECTRICIAN_MAINTENANCE',
  'LABOUR_WAGES',
  'WAREHOUSE_OPERATIONS',
  'UTILITIES_ELECTRICITY',
  'OFFICE_SUPPLIES',
  'FUEL_CONVEYANCE',
  'TEA_REFRESHMENTS',
  'FREIGHT_COURIER',
  'PROFESSIONAL_LEGAL',
  'MISCELLANEOUS',
]);

const expensePaymentStatusEnum = z.enum(['PAID', 'PENDING']);

const expensePaymentModeEnum = z.enum([
  'CASH',
  'PETTY_CASH',
  'UPI',
  'BANK_TRANSFER',
  'CHEQUE',
  'CREDIT',
]);

const createExpenseSchema = z.object({
  entityId: z.string().min(1),
  category: expenseCategoryEnum,
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  amount: z.union([z.string(), z.number()]),
  taxAmount: z.union([z.string(), z.number()]).optional().nullable(),
  expenseDate: date,
  payeeName: z.string().trim().min(2).max(200),
  payeeContact: z.string().trim().max(50).optional().nullable(),
  paymentStatus: expensePaymentStatusEnum.default('PAID'),
  paymentMode: expensePaymentModeEnum.default('CASH'),
  referenceNumber: z.string().trim().max(100).optional().nullable(),
  paidThroughAccountId: z.string().uuid().optional().nullable(),
  expenseAccountId: z.string().uuid().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  receiptFileName: z.string().optional().nullable(),
  receiptFileType: z.string().optional().nullable(),
  receiptFileSize: z.number().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateExpenseSchema = createExpenseSchema.partial();

const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      'Invalid expense request payload.',
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  return result.data;
};

const actor = (req: Request) => req.user?.id || 'system';
const respond = (res: Response, req: Request, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data, requestId: req.id });
const run = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };

router.use(authenticate);

// GET /api/v1/accounts/expenses
router.get(
  '/',
  run(async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const entityId = query.entityId;
    if (!entityId) {
      throw new ValidationError('entityId is required in query params.');
    }

    const result = await accountsExpenseService.listExpenses({
      entityId,
      search: query.search,
      category: query.category,
      paymentStatus: query.paymentStatus,
      date: query.date,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 25,
    });

    respond(res, req, result);
  })
);

// GET /api/v1/accounts/expenses/:id
router.get(
  '/:id',
  run(async (req, res) => {
    const expense = await accountsExpenseService.getExpense(req.params.id);
    respond(res, req, expense);
  })
);

// POST /api/v1/accounts/expenses
router.post(
  '/',
  run(async (req, res) => {
    const input = parse(createExpenseSchema, req.body);
    const created = await accountsExpenseService.createExpense(input, actor(req), req.id);
    respond(res, req, created, 201);
  })
);

// PUT /api/v1/accounts/expenses/:id
router.put(
  '/:id',
  run(async (req, res) => {
    const input = parse(updateExpenseSchema, req.body);
    const updated = await accountsExpenseService.updateExpense(req.params.id, input, actor(req), req.id);
    respond(res, req, updated);
  })
);

// DELETE /api/v1/accounts/expenses/:id
router.delete(
  '/:id',
  run(async (req, res) => {
    const result = await accountsExpenseService.deleteExpense(req.params.id, actor(req), req.id);
    respond(res, req, result);
  })
);

export default router;
