import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize, getDefaultPermissionChecker } from '../../common/middleware/authorize';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { prisma } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { FulfillmentService } from './fulfillment.service';

const router = Router();
const permissionChecker = getDefaultPermissionChecker();
const service = new FulfillmentService(prisma, permissionChecker, new DbAuditWriter(), new NotificationService());
const actor = (req: Request) => req.user?.id || 'system';
const respond = (res: Response, req: Request, data: unknown, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });
const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void handler(req, res, next).catch(next); };

router.use(authenticate);

router.get('/overview', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.overview())));
router.get('/', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.list({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 5)),
  stage: req.query.stage as string | undefined,
  channel: req.query.channel as string | undefined,
  warehouseLocationId: req.query.warehouseLocationId as string | undefined,
  search: req.query.search as string | undefined,
}))));
router.get('/carriers', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.listCarriers())));
router.post('/carriers', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.createCarrier(req.body, actor(req)), 201)));
router.get('/shipments/:id', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.getShipment(req.params.id))));

router.post('/orders/:orderId', authorize('update', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.ensureForOrder(req.params.orderId, actor(req)), 201)));
router.get('/:id', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.get(req.params.id))));
router.post('/:id/allocate', authorize('allocate', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.allocate(req.params.id, actor(req), req.id))));

router.post('/pick-lists/:id/assign', authorize('allocate', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.assignPickList(req.params.id, req.body.assignedToActorId, actor(req)))));
router.post('/pick-lists/:id/start', authorize('allocate', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.startPickList(req.params.id, actor(req)))));
router.post('/pick-lists/:id/scan', authorize('allocate', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.scanPickItem(req.params.id, req.body, actor(req)))));
router.post('/pick-lists/:id/complete', authorize('allocate', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.completePickList(req.params.id, actor(req)))));

router.post('/:id/packages', authorize('update', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.createPackage(req.params.id, req.body, actor(req), req.id), 201)));
router.post('/packages/:id/seal', authorize('update', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.sealPackage(req.params.id, actor(req), req.id))));
router.post('/packages/:id/reopen', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.reopenPackage(req.params.id, actor(req)))));

router.post('/:id/shipments', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.createShipment(req.params.id, { ...req.body, idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey }, actor(req), req.id), 201)));
router.get('/shipments/:id/validate', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.validateShipment(req.params.id))));
router.post('/shipments/:id/dispatch', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.dispatchShipment(req.params.id, actor(req), req.id))));
router.post('/shipments/:id/cancel', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.cancelShipment(req.params.id, req.body.reason, actor(req), req.id))));
router.post('/shipments/:id/events', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.addTrackingEvent(req.params.id, req.body, actor(req)), 201)));
router.post('/shipments/:id/delivery-attempts', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.recordDeliveryAttempt(req.params.id, req.body, actor(req)), 201)));
router.post('/shipments/:id/deliver', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.deliver(req.params.id, req.body, actor(req), req.id))));
router.post('/shipments/:id/documents', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.attachDocument(req.params.id, req.body, actor(req)), 201)));

router.post('/manifests', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.createManifest(req.body, actor(req), req.id), 201)));
router.get('/manifests/list', authorize('read', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.listManifests(Math.max(1, Number(req.query.page) || 1), Math.min(100, Math.max(1, Number(req.query.limit) || 5))))));
router.post('/manifests/:id/close', authorize('dispatch', 'SalesOrder', permissionChecker), asyncRoute(async (req, res) => respond(res, req, await service.closeManifest(req.params.id, actor(req)))));

export default router;
