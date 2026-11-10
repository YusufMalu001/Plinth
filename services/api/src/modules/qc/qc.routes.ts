import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { validate } from '../../common/middleware/validation';
import {
  qcQueueQuerySchema,
  resolveCheckpointsQuerySchema,
  recordInspectionSchema,
  reinspectInspectionSchema,
  createCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  batchQualityHistoryParamSchema,
  grnLineQualityHistoryParamSchema,
  createQcRuleRequestSchema,
  approveQcRuleSchema,
  qcOverrideSchema,
  releaseGateCheckQuerySchema
} from '@synergy/validation';

import { QcService } from './services/qc.service';
import { QcReleaseGateService } from './services/qc-release-gate.service';
import { QcController } from './controllers/qc.controller';

const router = Router();
const permissionChecker = new DbPermissionChecker();
const service = new QcService();
const releaseGateService = new QcReleaseGateService();
const controller = new QcController(service, releaseGateService);

router.use(authenticate);

// 1. Inspection Queue
router.get(
  '/qc/queue',
  authorize('view', 'QualityInspection', permissionChecker),
  validate(qcQueueQuerySchema),
  controller.getInspectionQueue
);

// 2. Checkpoint Resolution & V-009 Gate Info
router.get(
  '/qc/checkpoints/resolve',
  authorize('view', 'QualityInspection', permissionChecker),
  validate(resolveCheckpointsQuerySchema),
  controller.resolveCheckpoints
);

// 3. Record Inspection Result (Normal Inspection)
router.post(
  '/qc/inspections',
  authorize('inspect', 'QualityInspection', permissionChecker),
  validate(recordInspectionSchema),
  controller.recordInspection
);

// 4. Record Re-Inspection
router.post(
  '/qc/inspections/:id/reinspect',
  authorize('inspect', 'QualityInspection', permissionChecker),
  validate(reinspectInspectionSchema),
  controller.recordReinspection
);

// 5. Corrective Action Create & Update
router.post(
  '/qc/inspections/:id/corrective-actions',
  authorize('rework_disposition', 'QualityInspection', permissionChecker),
  validate(createCorrectiveActionSchema),
  controller.createCorrectiveAction
);

router.patch(
  '/qc/corrective-actions/:actionId',
  authorize('rework_disposition', 'QualityInspection', permissionChecker),
  validate(updateCorrectiveActionSchema),
  controller.updateCorrectiveAction
);

// 6. Quality Histories
router.get(
  '/qc/history/batch/:batchId',
  authorize('view', 'QualityInspection', permissionChecker),
  validate(batchQualityHistoryParamSchema),
  controller.getBatchQualityHistory
);

router.get(
  '/qc/history/grn-line/:grnLineId',
  authorize('view', 'QualityInspection', permissionChecker),
  validate(grnLineQualityHistoryParamSchema),
  controller.getGrnLineQualityHistory
);

// 7. QC Rules & Criteria Management
router.get(
  '/qc/rules',
  authorize('view', 'QualityInspection', permissionChecker),
  controller.listQcRules
);

router.get(
  '/qc/rules/:id',
  authorize('view', 'QualityInspection', permissionChecker),
  controller.getQcRuleById
);

router.post(
  '/qc/rules',
  authorize('configure', 'QualityInspection', permissionChecker),
  validate(createQcRuleRequestSchema),
  controller.createQcRule
);

router.post(
  '/qc/rules/:id/approve',
  authorize('configure', 'QualityInspection', permissionChecker),
  validate(approveQcRuleSchema),
  controller.approveQcRule
);

router.post(
  '/qc/batches/:id/link-rule',
  authorize('configure', 'QualityInspection', permissionChecker),
  controller.linkRuleToBatch
);

// 8. Mandatory Gate Override (Distinct Audited Action)
router.post(
  '/qc/override',
  authorize('override', 'QualityInspection', permissionChecker),
  validate(qcOverrideSchema),
  controller.recordOverride
);

// 9. Release Gate Check (Downstream Release Read-only Query)
router.get(
  '/qc/release-gate/check',
  authorize('release', 'QualityInspection', permissionChecker),
  validate(releaseGateCheckQuerySchema),
  controller.checkReleaseGate
);

export default router;
