import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { TallyIntegrationService } from './services/tally-integration.service';
import { FinanceIntegrationController } from './controllers/finance-integration.controller';
import {
  createMappingConfigSchema,
  approveMappingConfigSchema,
  queryMappingConfigSchema,
  checkEligibilityQuerySchema,
  queueTransactionsSchema,
  triggerExportBatchSchema,
  acknowledgeJobItemSchema,
  reconcileJobItemSchema,
  investigateAndRetrySchema,
  queryJobsSchema,
  queryJobItemsSchema
} from '@synergy/validation';

const router = Router();
const permissions = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();
const service = new TallyIntegrationService(
  undefined,
  undefined,
  undefined,
  undefined,
  permissions,
  auditWriter
);
const controller = new FinanceIntegrationController(service);

router.use(authenticate);

// 1. Integration Readiness Status (Per source type: ACTIVE vs NOT_YET_SUPPORTED)
router.get(
  '/readiness',
  authorize('read', 'FinanceIntegration', permissions),
  controller.getReadinessStatus
);

// 2. Eligibility Check (Per source type)
router.get(
  '/eligibility',
  authorize('read', 'FinanceIntegration', permissions),
  validate(checkEligibilityQuerySchema),
  controller.checkEligibility
);

// 3. Mapping Configuration CRUD & Approval
router.get(
  '/mappings',
  authorize('read', 'FinanceIntegration', permissions),
  validate(queryMappingConfigSchema),
  controller.listMappings
);

router.post(
  '/mappings',
  authorize('create', 'FinanceMapping', permissions),
  validate(createMappingConfigSchema),
  controller.createMapping
);

router.post(
  '/mappings/:id/approve',
  authorize('approve', 'FinanceMapping', permissions),
  validate(approveMappingConfigSchema),
  controller.approveMapping
);

// 4. Eligible Transaction Queue
router.post(
  '/queue',
  authorize('queue', 'FinanceIntegration', permissions),
  validate(queueTransactionsSchema),
  controller.queueTransactions
);

// 5. Trigger Export / Sync Run
router.post(
  '/export',
  authorize('export', 'FinanceIntegration', permissions),
  validate(triggerExportBatchSchema),
  controller.exportBatch
);

// 6. Manual Finance Acknowledgement Action
router.post(
  '/items/:itemId/acknowledge',
  authorize('acknowledge', 'FinanceIntegration', permissions),
  validate(acknowledgeJobItemSchema),
  controller.acknowledgeItem
);

// 7. Reconciliation Workspace (Internal Consistency Only)
router.post(
  '/items/:itemId/reconcile',
  authorize('reconcile', 'FinanceIntegration', permissions),
  validate(reconcileJobItemSchema),
  controller.reconcileItem
);

router.get(
  '/reconciliation-records',
  authorize('read', 'FinanceIntegration', permissions),
  controller.listReconciliationRecords
);

// 8. Error / Retry Queue
router.post(
  '/items/:itemId/retry',
  authorize('retry', 'FinanceIntegration', permissions),
  validate(investigateAndRetrySchema),
  controller.investigateAndRetry
);

// 9. Drill-Down Traceability (Jobs & Job Items)
router.get(
  '/jobs',
  authorize('read', 'FinanceIntegration', permissions),
  validate(queryJobsSchema),
  controller.listJobs
);

router.get(
  '/jobs/:id',
  authorize('read', 'FinanceIntegration', permissions),
  controller.getJobById
);

router.get(
  '/items',
  authorize('read', 'FinanceIntegration', permissions),
  validate(queryJobItemsSchema),
  controller.listJobItems
);

router.get(
  '/items/:id',
  authorize('read', 'FinanceIntegration', permissions),
  controller.getJobItemById
);

export default router;
