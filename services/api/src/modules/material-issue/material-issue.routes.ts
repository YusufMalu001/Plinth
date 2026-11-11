import { Router } from 'express';
import {
  requestMaterialIssueSchema,
  emptyMaterialIssueActionSchema,
  cancelMaterialIssueSchema,
  requestMaterialIssueReturnSchema
} from '@plinth/validation';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { UomRepository } from '../master-data/repositories/uom.repository';
import { UomService } from '../master-data/services/uom.service';
import { BomVersionRepository } from '../bom/repositories';
import { BomCalculatorService } from '../bom/services';
import { MaterialIssueRepository, MaterialIssueReturnRepository } from './repositories';
import { MaterialIssueService, MaterialIssueReturnService } from './services';
import { MaterialIssueController, MaterialIssueReturnController } from './controllers';

const router = Router();

// Scoped to Material Issue only, same opt-in pattern as GRN/Inventory/BOM - every other module
// keeps running on the global AllowAllPermissionChecker default until it opts in the same way.
const permissionChecker = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();

const uomService = new UomService(new UomRepository(), permissionChecker, auditWriter);
const bomVersionRepository = new BomVersionRepository();
const bomCalculatorService = new BomCalculatorService();

const materialIssueRepository = new MaterialIssueRepository();
const materialIssueReturnRepository = new MaterialIssueReturnRepository();

const materialIssueService = new MaterialIssueService(
  materialIssueRepository,
  bomVersionRepository,
  bomCalculatorService,
  uomService,
  permissionChecker,
  auditWriter
);
const materialIssueReturnService = new MaterialIssueReturnService(
  materialIssueReturnRepository,
  materialIssueRepository,
  permissionChecker,
  auditWriter
);

const materialIssueController = new MaterialIssueController(materialIssueService);
const materialIssueReturnController = new MaterialIssueReturnController(materialIssueReturnService);

router.use(authenticate);

// Mounted at `${apiPrefix}/material-issues` in app.ts - routes here are written relative to
// that prefix (bare `/`, `/:id`, ...), same convention as goods-receipt.routes.ts.
router.get('/', authorize('view', 'MaterialIssue', permissionChecker), materialIssueController.list);
router.post(
  '/',
  authorize('request', 'MaterialIssue', permissionChecker),
  validate(requestMaterialIssueSchema),
  materialIssueController.request
);
router.get('/:id', authorize('view', 'MaterialIssue', permissionChecker), materialIssueController.getById);

router.post(
  '/:id/verify',
  authorize('verify', 'MaterialIssue', permissionChecker),
  validate(emptyMaterialIssueActionSchema),
  materialIssueController.verify
);
router.post(
  '/:id/prepare',
  authorize('prepare', 'MaterialIssue', permissionChecker),
  validate(emptyMaterialIssueActionSchema),
  materialIssueController.prepare
);
router.post(
  '/:id/hand-over',
  authorize('issue', 'MaterialIssue', permissionChecker),
  validate(emptyMaterialIssueActionSchema),
  materialIssueController.handOver
);
router.post(
  '/:id/acknowledge',
  authorize('acknowledge', 'MaterialIssue', permissionChecker),
  validate(emptyMaterialIssueActionSchema),
  materialIssueController.acknowledge
);
router.post(
  '/:id/cancel',
  authorize('request', 'MaterialIssue', permissionChecker),
  validate(cancelMaterialIssueSchema),
  materialIssueController.cancel
);

router.get(
  '/:id/returns',
  authorize('view', 'MaterialIssue', permissionChecker),
  materialIssueReturnController.list
);
router.post(
  '/:id/returns',
  authorize(['return', 'replace'], 'MaterialIssue', permissionChecker),
  validate(requestMaterialIssueReturnSchema),
  materialIssueReturnController.request
);
router.post(
  '/:id/returns/:returnId/acknowledge',
  authorize(['return', 'replace'], 'MaterialIssue', permissionChecker),
  validate(emptyMaterialIssueActionSchema),
  materialIssueReturnController.acknowledge
);

export default router;
