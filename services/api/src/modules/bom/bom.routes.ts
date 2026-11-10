// Module 5 — BOM / Formula Engine Routes (Reloaded schema)
import { Router } from 'express';
import {
  createBomDraftSchema,
  updateBomDraftSchema,
  validateBomVersionSchema,
  approveBomVersionSchema,
  supersedeBomVersionSchema,
  createGoldenExampleSchema,
  simulateBomSchema
} from '@synergy/validation';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { UomRepository } from '../master-data/repositories/uom.repository';
import { UomService } from '../master-data/services/uom.service';
import { BomVersionRepository, BomGoldenExampleRepository, BomSimulationRepository } from './repositories';
import { BomCalculatorService, BomVersionService, BomSimulationService } from './services';
import { BomVersionController, BomSimulationController } from './controllers';

const router = Router();

// Scoped to BOM only, same opt-in pattern as GRN/Procurement/Inventory - every other module
// keeps running on the global AllowAllPermissionChecker default until it opts in the same way.
const permissionChecker = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();

const uomRepository = new UomRepository();
const uomService = new UomService(uomRepository, permissionChecker, auditWriter);

const bomVersionRepository = new BomVersionRepository();
const bomGoldenExampleRepository = new BomGoldenExampleRepository();
const bomSimulationRepository = new BomSimulationRepository();
const bomCalculatorService = new BomCalculatorService();

const bomVersionService = new BomVersionService(
  bomVersionRepository,
  bomGoldenExampleRepository,
  bomCalculatorService,
  uomService,
  permissionChecker,
  auditWriter
);
const bomSimulationService = new BomSimulationService(
  bomVersionRepository,
  bomSimulationRepository,
  bomCalculatorService,
  uomService,
  permissionChecker,
  auditWriter
);

const bomVersionController = new BomVersionController(bomVersionService);
const bomSimulationController = new BomSimulationController(bomSimulationService);

router.use(authenticate);

// ==============================================================================
// COLLECTION-LEVEL / NON-:id ROUTES - must be registered before the /:id routes below,
// otherwise Express would treat "compare"/"calculate" as an :id path segment.
// ==============================================================================

router.get('/bom-versions/compare', authorize('view', 'BomVersion', permissionChecker), bomVersionController.compare);
router.get('/bom-versions/name-availability', authorize('view', 'BomVersion', permissionChecker), bomVersionController.checkName);
router.get('/bom-versions/calculate', authorize('export', 'BomVersion', permissionChecker), bomVersionController.calculate);

router.get('/bom-versions', authorize('view', 'BomVersion', permissionChecker), bomVersionController.list);
router.post(
  '/bom-versions/bulk-delete',
  authorize('delete', 'BomVersion', permissionChecker),
  bomVersionController.deleteDrafts
);
router.post(
  '/bom-versions',
  authorize('create', 'BomVersion', permissionChecker),
  validate(createBomDraftSchema),
  bomVersionController.create
);

// ==============================================================================
// SINGLE-VERSION ROUTES
// ==============================================================================

router.get('/bom-versions/:id', authorize('view', 'BomVersion', permissionChecker), bomVersionController.getById);
router.get('/bom-versions/:id/history', authorize('view', 'BomVersion', permissionChecker), bomVersionController.getHistory);
router.patch(
  '/bom-versions/:id',
  authorize('update', 'BomVersion', permissionChecker),
  validate(updateBomDraftSchema),
  bomVersionController.update
);
router.delete(
  '/bom-versions/:id',
  authorize('delete', 'BomVersion', permissionChecker),
  bomVersionController.deleteDraft
);
router.post(
  '/bom-versions/:id/detach-from-item',
  authorize('update', 'BomVersion', permissionChecker),
  bomVersionController.detachFromItem
);
router.post(
  '/bom-versions/:id/validate',
  authorize('validate', 'BomVersion', permissionChecker),
  validate(validateBomVersionSchema),
  bomVersionController.validate
);
router.post(
  '/bom-versions/:id/approve',
  authorize('approve', 'BomVersion', permissionChecker),
  validate(approveBomVersionSchema),
  bomVersionController.approve
);
router.post(
  '/bom-versions/:id/supersede',
  authorize('supersede', 'BomVersion', permissionChecker),
  validate(supersedeBomVersionSchema),
  bomVersionController.supersede
);

router.get('/bom-versions/:id/golden-examples', authorize('view', 'BomVersion', permissionChecker), bomVersionController.listGoldenExamples);
router.post(
  '/bom-versions/:id/golden-examples',
  authorize('update', 'BomVersion', permissionChecker),
  validate(createGoldenExampleSchema),
  bomVersionController.addGoldenExample
);

router.get('/bom-versions/:id/simulations', authorize('view', 'BomVersion', permissionChecker), bomSimulationController.list);
router.post(
  '/bom-versions/:id/simulate',
  authorize('simulate', 'BomVersion', permissionChecker),
  validate(simulateBomSchema),
  bomSimulationController.simulate
);

export default router;
