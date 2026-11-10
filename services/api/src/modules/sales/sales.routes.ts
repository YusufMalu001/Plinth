import { Router, Request, Response, NextFunction } from 'express';
import { SalesOrderChannel, SalesOrderStatus, SalesPaymentStatus, SalesAllocationStatus } from './sales.types';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth';
import { getDefaultPermissionChecker, authorize } from '../../common/middleware/authorize';
import { ValidationError } from '../../common/errors/AppError';
import { prisma } from '../../database';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { NotificationService } from '../notifications/notification.service';
import { SalesService } from './sales.service';

const router = Router();
const permissionChecker = getDefaultPermissionChecker();
const service = new SalesService(prisma, permissionChecker, new DbAuditWriter(), new NotificationService());
const discountMoney = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? '0' : value),
  z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
);
const actor = (req: Request) => req.user?.id || 'system';
const respond = (res: Response, req: Request, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data, requestId: req.id });
const asyncRoute =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };

router.use(authenticate);

// 1. Order List & Metrics
router.get(
  '/sales/orders',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    respond(
      res,
      req,
      await service.list({
        page,
        limit,
        search: req.query.search as string | undefined,
        status: req.query.status as SalesOrderStatus | undefined,
        channel: req.query.channel as SalesOrderChannel | undefined,
        paymentStatus: req.query.paymentStatus as SalesPaymentStatus | undefined,
        allocationStatus: req.query.allocationStatus as SalesAllocationStatus | undefined,
        customerId: req.query.customerId as string | undefined,
        productId: req.query.productId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined,
      })
    );
  })
);

router.get(
  '/sales/orders/metrics',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.getMetrics()))
);

router.get(
  '/sales/inventory-availability',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(
      res,
      req,
      await service.getInventoryAvailability(actor(req), req.query.warehouseLocationId as string | undefined),
    )
  )
);

// 2. POS Checkout & Amazon Import
router.post(
  '/sales/pos/checkout',
  authorize('create', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.posCheckout(req.body, actor(req), req.id), 201))
);

router.post(
  '/sales/amazon/import',
  authorize('create', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.importAmazonOrder(req.body, actor(req), req.id), 201))
);

// 3. Single Order Operations
router.get(
  '/sales/orders/:id',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.get(req.params.id, actor(req))))
);

router.put(
  '/sales/orders/:id/pro-forma',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => {
    const schema = z.object({
      lines: z.array(z.object({
        salesOrderLineId: z.string().uuid(),
        unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/),
        discountAmount: discountMoney,
        taxRate: z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/),
      }).strict()).min(1),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid pro forma input.', parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
    respond(res, req, await service.updateProFormaFromSales(req.params.id, parsed.data.lines, actor(req), req.id || ''));
  })
);

router.post(
  '/sales/orders/:id/pro-forma',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.generateProFormaFromSales(req.params.id, actor(req), req.id || ''), 201))
);

router.post(
  '/sales/orders',
  authorize('create', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.create(req.body, actor(req), req.id), 201))
);

router.put(
  '/sales/orders/:id',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.update(req.params.id, req.body, actor(req), req.id)))
);

router.post(
  '/sales/orders/:id/validate',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.transition(req.params.id, 'VALIDATING', actor(req), req.body?.reason, req.id))
  )
);

router.post(
  '/sales/orders/:id/approve',
  authorize(['approve', 'confirm'], 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.transition(req.params.id, 'CONFIRMED', actor(req), req.body?.reason, req.id))
  )
);

router.post(
  '/sales/orders/:id/confirm',
  authorize('confirm', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.transition(req.params.id, 'CONFIRMED', actor(req), req.body?.reason, req.id))
  )
);

router.post(
  '/sales/orders/:id/hold',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.transition(req.params.id, 'ON_HOLD', actor(req), req.body?.reason, req.id))
  )
);

router.post(
  '/sales/orders/:id/credit-override',
  authorize(['approve', 'confirm'], 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.overrideCreditAndConfirm(req.params.id, req.body, actor(req), req.id))
  )
);

router.post(
  '/sales/orders/:id/cancel',
  authorize('cancel', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.transition(req.params.id, 'CANCELLED', actor(req), req.body?.reason, req.id))
  )
);

router.post(
  '/sales/orders/:id/allocate',
  authorize('allocate', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.allocate(req.params.id, actor(req), req.id, req.body?.lines)))
);

router.post(
  '/sales/orders/:id/packages',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.createPackage(req.params.id, req.body, actor(req), req.id), 201))
);

router.post(
  '/sales/orders/:id/dispatch',
  authorize('dispatch', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.confirmDispatch(req.params.id, req.body, actor(req), req.id)))
);

router.post(
  '/sales/orders/:id/returns',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => respond(res, req, await service.createReturn(req.params.id, req.body, actor(req), req.id), 201))
);

router.post(
  '/sales/orders/:id/returns/disposition',
  authorize('update', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.processReturnDisposition(req.params.id, req.body, actor(req), req.id))
  )
);

router.get(
  '/sales/orders/:id/timeline',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => {
    const order = await service.get(req.params.id, actor(req));
    respond(res, req, order.statusHistory);
  })
);

router.get(
  '/sales/orders/:id/exceptions',
  authorize('read', 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) => {
    const order = await service.get(req.params.id, actor(req));
    respond(res, req, order.exceptions);
  })
);

router.post(
  '/sales/stock-shortage-alert',
  authorize(['create', 'update', 'read'], 'SalesOrder', permissionChecker),
  asyncRoute(async (req, res) =>
    respond(res, req, await service.notifyStockShortage(req.body, actor(req), req.id), 200)
  )
);

export default router;
