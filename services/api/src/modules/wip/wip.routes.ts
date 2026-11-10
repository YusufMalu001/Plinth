import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { validate } from '../../common/middleware/validation';
import {
  wipOverviewQuerySchema,
  wipBatchQuerySchema,
  wipDepartmentQueueQuerySchema,
  wipTimingQuerySchema,
  wipBatchParamSchema,
  runReconciliationSchema,
  wipExceptionQuerySchema,
  wipExceptionParamSchema,
  investigateExceptionSchema,
  resolveExceptionSchema,
  dismissExceptionSchema
} from '@synergy/validation';

import { WipService } from './services/wip.service';
import { WipController } from './controllers/wip.controller';

const router = Router();
const permissionChecker = new DbPermissionChecker();
const service = new WipService();
const controller = new WipController(service, permissionChecker);

router.use(authenticate);

// 1. WIP Overview (Org/Department-scoped)
router.get(
  '/wip/overview',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipOverviewQuerySchema),
  controller.getOverview
);

// 2. Batch Search & List (with derived WIP states)
router.get(
  '/wip/batches',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipBatchQuerySchema),
  controller.listBatches
);

// 3. Batch Detail (with derived stage history & timings)
router.get(
  '/wip/batches/:id',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipBatchParamSchema),
  controller.getBatchById
);

// 4. Batch Genealogy Trace (Forward & Backward walk)
router.get(
  '/wip/batches/:id/genealogy',
  authorize('trace', 'WipTracking', permissionChecker),
  validate(wipBatchParamSchema),
  controller.getBatchGenealogy
);

// 5. Department WIP Queue
router.get(
  '/wip/departments/:departmentId/queue',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipDepartmentQueueQuerySchema),
  controller.getDepartmentQueue
);

// 6. Timing Metrics (Raw stage durations & queue wait times)
router.get(
  '/wip/timing-metrics',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipTimingQuerySchema),
  controller.getTimingMetrics
);

// 7. Trigger Reconciliation Check
router.post(
  '/wip/reconcile',
  authorize('reconcile', 'WipTracking', permissionChecker),
  validate(runReconciliationSchema),
  controller.runReconciliation
);

// 8. Reconciliation Exceptions List & Detail
router.get(
  '/wip/exceptions',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipExceptionQuerySchema),
  controller.listExceptions
);

router.get(
  '/wip/exceptions/:id',
  authorize('view', 'WipTracking', permissionChecker),
  validate(wipExceptionParamSchema),
  controller.getExceptionById
);

// 9. Exception Investigation & Resolution Lifecycle
router.post(
  '/wip/exceptions/:id/investigate',
  authorize('manage_exception', 'WipTracking', permissionChecker),
  validate(investigateExceptionSchema),
  controller.investigateException
);

router.post(
  '/wip/exceptions/:id/resolve',
  authorize('manage_exception', 'WipTracking', permissionChecker),
  validate(resolveExceptionSchema),
  controller.resolveException
);

router.post(
  '/wip/exceptions/:id/dismiss',
  authorize('manage_exception', 'WipTracking', permissionChecker),
  validate(dismissExceptionSchema),
  controller.dismissException
);

export default router;
