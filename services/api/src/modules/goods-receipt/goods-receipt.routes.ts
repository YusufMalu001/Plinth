import { NextFunction, Request, Response, Router } from 'express';
import {
  createGrnFromPoSchema,
  createUnreferencedGrnSchema,
  updateGrnSchema,
  recordMeasurementSchema,
  resolveDiscrepancySchema,
  signOffGrnSchema,
  finalizeGrnSchema,
  reprintLabelSchema,
  verifyGrnLinesSchema,
  notifyAccountantForDebitNoteSchema
} from '@synergy/validation';
import multer from 'multer';
import { authenticate, isAdminActor } from '../../common/middleware/auth';
import { ForbiddenError } from '../../common/errors/AppError';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ExpectedReceiptService } from '../purchases/services';
import { ExpectedReceiptController } from '../purchases/controllers';
import { GoodsReceiptRepository, DiscrepancyRepository, LabelRepository, GrnDocumentRepository } from './repositories';
import { GoodsReceiptService, DiscrepancyService, LabelService, GrnDocumentService } from './services';
import { GoodsReceiptController, DiscrepancyController, LabelController, GrnDocumentController } from './controllers';

const router = Router();
// Scoped to GRN + Procurement only - every other module keeps using the global
// AllowAllPermissionChecker default until it opts in the same way.
const permissionChecker = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const goodsReceiptRepo = new GoodsReceiptRepository();
const discrepancyRepo = new DiscrepancyRepository();
const labelRepo = new LabelRepository();
const grnDocumentRepo = new GrnDocumentRepository();

const labelService = new LabelService(labelRepo, permissionChecker, auditWriter);

// Reuses Module 2's existing ExpectedReceiptService/Controller rather than duplicating it.
// Constructed before GoodsReceiptService because finalize() calls its syncPoLineReceiptStatus.
const erService = new ExpectedReceiptService(permissionChecker, auditWriter);
const erController = new ExpectedReceiptController(erService);

const goodsReceiptService = new GoodsReceiptService(
  goodsReceiptRepo,
  discrepancyRepo,
  labelService,
  permissionChecker,
  auditWriter,
  erService
);
const discrepancyService = new DiscrepancyService(discrepancyRepo, goodsReceiptRepo, permissionChecker, auditWriter);
const grnDocumentService = new GrnDocumentService(grnDocumentRepo, goodsReceiptRepo, permissionChecker, auditWriter);

const goodsReceiptController = new GoodsReceiptController(goodsReceiptService);
const discrepancyController = new DiscrepancyController(discrepancyService, goodsReceiptService);
const labelController = new LabelController(labelService, goodsReceiptService);
const grnDocumentController = new GrnDocumentController(grnDocumentService, goodsReceiptService);
function requireStoreManagerOrAdmin(req: Request, _res: Response, next: NextFunction) {
  const role = String(req.user?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const roleKey = String(req.user?.roleDefinitionKey || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isAdminActor(req.user) || role === 'store_manager' || roleKey === 'store_manager') return next();
  return next(new ForbiddenError('Only an Admin or Store Manager can perform GRN physical verification or change receipt values.'));
}

router.use(authenticate);

// ==============================================================================
// EXPECTED RECEIPTS QUEUE (sourced from Module 2's ExpectedReceipt)
// ==============================================================================

router.get(
  '/expected',
  authorize('read', 'ExpectedReceipt', permissionChecker),
  erController.listReceipts
);

// ==============================================================================
// GOODS RECEIPT NOTES
// ==============================================================================

router.get(
  '/dashboard',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.dashboard
);

router.get(
  '/capabilities',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.capabilities
);

router.post(
  '/',
  authorize('receive', 'GoodsReceiptNote', permissionChecker),
  validate(createGrnFromPoSchema),
  goodsReceiptController.createFromPo
);

router.post(
  '/unreferenced',
  authorize('receive', 'GoodsReceiptNote', permissionChecker),
  validate(createUnreferencedGrnSchema),
  goodsReceiptController.createUnreferenced
);

router.get(
  '/',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.listGrns
);

router.get(
  '/:id/history',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.getHistory
);

router.patch(
  '/:id',
  requireStoreManagerOrAdmin,
  authorize('update', 'GoodsReceiptNote', permissionChecker),
  validate(updateGrnSchema),
  goodsReceiptController.updateGrn
);

router.post(
  '/:id/lines/:lineId/measurements',
  requireStoreManagerOrAdmin,
  authorize('verify', 'GoodsReceiptNote', permissionChecker),
  validate(recordMeasurementSchema),
  goodsReceiptController.recordMeasurement
);

router.post(
  '/:id/verify-lines',
  requireStoreManagerOrAdmin,
  authorize('verify', 'GoodsReceiptNote', permissionChecker),
  validate(verifyGrnLinesSchema),
  goodsReceiptController.verifyLines
);

router.post(
  '/:id/notify-accountant',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  validate(notifyAccountantForDebitNoteSchema),
  goodsReceiptController.notifyAccountant
);

router.post(
  '/:id/lines/:lineId/label/reprint',
  authorize('update', 'GoodsReceiptLabel', permissionChecker),
  validate(reprintLabelSchema),
  labelController.reprint
);

// ==============================================================================
// DISCREPANCIES
// ==============================================================================

router.get(
  '/:id/discrepancies',
  authorize('read', 'GoodsReceiptDiscrepancy', permissionChecker),
  discrepancyController.list
);

router.post(
  '/:id/discrepancies/:discrepancyId/resolve',
  // Baseline check here; resolving as RETURN_TO_VENDOR is additionally re-checked for the
  // distinct 'return' permission inside DiscrepancyService.resolve.
  authorize('resolve_discrepancy', 'GoodsReceiptDiscrepancy', permissionChecker),
  validate(resolveDiscrepancySchema),
  discrepancyController.resolve
);

// ==============================================================================
// SIGN-OFF & FINALIZATION (distinct permissions - never collapsed)
// ==============================================================================

router.post(
  '/:id/sign-off',
  authorize('sign_off', 'GoodsReceiptNote', permissionChecker),
  validate(signOffGrnSchema),
  goodsReceiptController.signOff
);

router.post(
  '/:id/finalize',
  authorize('finalize', 'GoodsReceiptNote', permissionChecker),
  validate(finalizeGrnSchema),
  goodsReceiptController.finalize
);

// ==============================================================================
// EXPORT - explicitly deferred (same documented-stub pattern as PO export)
// ==============================================================================

router.post(
  '/export',
  authorize('export', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.exportCsv
);

// ==============================================================================
// ATTACHMENTS (invoice / supporting documents, stored in Supabase Storage)
// ==============================================================================

router.post(
  '/:id/documents',
  authorize('upload_document', 'GoodsReceiptNote', permissionChecker),
  documentUpload.single('file'),
  grnDocumentController.upload
);

router.get(
  '/:id/documents',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  grnDocumentController.list
);

// Keep the single-resource route after all GET sub-resources. Otherwise
// /:id/history, /:id/discrepancies, and /:id/documents are swallowed as a GRN
// whose id is the first path segment.
router.get(
  '/:id',
  authorize('read', 'GoodsReceiptNote', permissionChecker),
  goodsReceiptController.getGrn
);

export default router;
