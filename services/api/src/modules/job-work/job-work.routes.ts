import { Router } from 'express';
import { JobWorkController } from './controllers/job-work.controller';
import { JobWorkService } from './services/job-work.service';
import { JobWorkRepository } from './repositories/job-work.repository';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import {
  createJobWorkOrderSchema,
  approveJobWorkOrderSchema,
  closeJobWorkOrderSchema,
  issueJobWorkMaterialSchema,
  receiveJobWorkReturnSchema,
  createJobWorkReconciliationSchema,
  jobWorkQuerySchema
} from '@plinth/validation';

const router = Router();

const permissionChecker = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();
const repository = new JobWorkRepository();
const service = new JobWorkService(repository, permissionChecker, auditWriter);
const controller = new JobWorkController(service, repository);

// 1. Dashboard & Analytics
router.get(
  '/analytics',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getAnalyticsSummary
);

router.get(
  '/analytics/scoring',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getVendorScoring
);

// 2. Vendor Custody Balances & Ledger
router.get(
  '/custody/balances',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getVendorCustodyBalances
);

router.get(
  '/custody/ledger',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.listCustodyLedger
);

// 3. Delivery Challans / Material Issues
router.post(
  '/challans',
  authorize('issue', 'JobWorkOrder', permissionChecker),
  validate(issueJobWorkMaterialSchema),
  controller.issueMaterial
);

router.get(
  '/challans',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.listChallans
);

router.get(
  '/challans/:id',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getChallan
);

// 4. Returns & Receiving (GRN + Custody deduction + Debit note)
router.post(
  '/returns',
  authorize('receive', 'JobWorkOrder', permissionChecker),
  validate(receiveJobWorkReturnSchema),
  controller.receiveReturn
);

router.get(
  '/returns',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.listReturns
);

router.get(
  '/returns/:id',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getReturn
);

// 5. Reconciliations
router.post(
  '/reconciliations',
  authorize('reconcile', 'JobWorkOrder', permissionChecker),
  validate(createJobWorkReconciliationSchema),
  controller.reconcileOrder
);

router.get(
  '/reconciliations',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.listReconciliations
);

// 6. Job Work Orders CRUD & Lifecycles
router.get(
  '/orders',
  authorize('read', 'JobWorkOrder', permissionChecker),
  validate(jobWorkQuerySchema),
  controller.listOrders
);

router.post(
  '/orders',
  authorize('create', 'JobWorkOrder', permissionChecker),
  validate(createJobWorkOrderSchema),
  controller.createOrder
);

router.get(
  '/orders/:id',
  authorize('read', 'JobWorkOrder', permissionChecker),
  controller.getOrder
);

router.post(
  '/orders/:id/approve',
  authorize('approve', 'JobWorkOrder', permissionChecker),
  validate(approveJobWorkOrderSchema),
  controller.approveOrder
);

router.post(
  '/orders/:id/close',
  authorize('close', 'JobWorkOrder', permissionChecker),
  validate(closeJobWorkOrderSchema),
  controller.closeOrder
);

export default router;
