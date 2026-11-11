import { Router } from 'express';
import multer from 'multer';
import {
  createPrSchema,
  submitPrSchema,
  approvePrSchema,
  rejectPrSchema,
  requestChangesPrSchema,
  cancelPrSchema,
  generatePoSchema,
  updatePoSchema,
  approvePoSchema,
  requestChangesPoSchema,
  revisePoSchema,
  sendPoSchema,
  cancelPoSchema,
  updateExpectedReceiptSchema,
  updatePrSchema
} from '@plinth/validation';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validation';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import {
  PurchaseRequisitionService,
  PurchaseOrderService,
  ExpectedReceiptService,
  ProcurementInsightsService
} from './services';
import {
  PurchaseRequisitionController,
  PurchaseOrderController,
  ExpectedReceiptController,
  ProcurementInsightsController
} from './controllers';

const router = Router();
const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Scoped to GRN + Procurement only - every other module keeps using the global
// AllowAllPermissionChecker default until it opts in the same way.
const permissionChecker = new DbPermissionChecker();
const auditWriter = new DbAuditWriter();

const prService = new PurchaseRequisitionService(permissionChecker, auditWriter);
const poService = new PurchaseOrderService(permissionChecker, auditWriter);
const erService = new ExpectedReceiptService(permissionChecker, auditWriter);

const prController = new PurchaseRequisitionController(prService);
const poController = new PurchaseOrderController(poService);
const erController = new ExpectedReceiptController(erService);
const insightsController = new ProcurementInsightsController(new ProcurementInsightsService());

router.use(authenticate);

router.get('/dashboard', authorize('read', 'PurchaseRequisition', permissionChecker), insightsController.dashboard);
router.get('/notifications', insightsController.notifications);
router.patch('/notifications/read-all', insightsController.markAllNotificationsRead);
router.patch('/notifications/:id/read', insightsController.markNotificationRead);

// ==============================================================================
// PURCHASE REQUISITIONS
// ==============================================================================

router.post(
  '/requisitions',
  authorize('request', 'PurchaseRequisition', permissionChecker),
  validate(createPrSchema),
  prController.createPR
);

router.post(
  '/requisitions/submit',
  authorize('request', 'PurchaseRequisition', permissionChecker),
  validate(createPrSchema),
  prController.createAndSubmitPR
);

router.get(
  '/requisitions',
  authorize('read', 'PurchaseRequisition', permissionChecker),
  prController.listPRs
);

router.get(
  '/requisitions/next-number',
  authorize('request', 'PurchaseRequisition', permissionChecker),
  prController.getNextPrNumber
);

router.get(
  '/requisitions/:id',
  authorize('read', 'PurchaseRequisition', permissionChecker),
  prController.getPR
);

router.get(
  '/requisitions/:id/revisions',
  authorize('read', 'PurchaseRequisition', permissionChecker),
  prController.listRevisions
);

router.post(
  '/requisitions/:id/vendor-recommendations',
  authorize('read', 'PurchaseRequisition', permissionChecker),
  prController.recommendVendors
);

router.post(
  '/requisitions/:id/vendor-selection',
  authorize('request', 'PurchaseRequisition', permissionChecker),
  prController.selectVendor
);

router.put(
  '/requisitions/:id',
  authorize('request', 'PurchaseRequisition', permissionChecker),
  validate(updatePrSchema),
  prController.updatePR
);

router.post(
  '/requisitions/:id/submit',
  authorize('submit', 'PurchaseRequisition', permissionChecker),
  validate(submitPrSchema),
  prController.submitPR
);

router.post(
  '/requisitions/:id/approve',
  authorize('approve', 'PurchaseRequisition', permissionChecker),
  validate(approvePrSchema),
  prController.approvePR
);

router.post(
  '/requisitions/:id/reject',
  authorize('reject', 'PurchaseRequisition', permissionChecker),
  validate(rejectPrSchema),
  prController.rejectPR
);

router.post(
  '/requisitions/:id/request-changes',
  authorize('request_changes', 'PurchaseRequisition', permissionChecker),
  validate(requestChangesPrSchema),
  prController.requestChangesPR
);

router.post(
  '/requisitions/:id/cancel',
  authorize('cancel', 'PurchaseRequisition', permissionChecker),
  validate(cancelPrSchema),
  prController.cancelPR
);

// ==============================================================================
// PURCHASE ORDERS
// ==============================================================================

router.post(
  '/orders',
  authorize('create', 'PurchaseOrder', permissionChecker),
  validate(generatePoSchema),
  poController.generatePO
);

router.post(
  '/orders/vendor-recommendations',
  authorize('read', 'MasterData', permissionChecker),
  poController.recommendVendors
);

router.get(
  '/orders',
  authorize('read', 'PurchaseOrder', permissionChecker),
  poController.listPOs
);

router.get(
  '/orders/next-number',
  authorize('create', 'PurchaseOrder', permissionChecker),
  poController.getNextPoNumber
);

router.get(
  '/orders/:id/document',
  authorize('read', 'PurchaseOrder', permissionChecker),
  poController.getPODocument
);

router.get(
  '/orders/:id',
  authorize('read', 'PurchaseOrder', permissionChecker),
  poController.getPO
);

router.put(
  '/orders/:id',
  authorize('create', 'PurchaseOrder', permissionChecker),
  validate(updatePoSchema),
  poController.updatePO
);

router.post(
  '/orders/:id/approve',
  authorize('approve', 'PurchaseOrder', permissionChecker),
  validate(approvePoSchema),
  poController.approvePO
);

router.post(
  '/orders/:id/request-changes',
  authorize('approve', 'PurchaseOrder', permissionChecker),
  validate(requestChangesPoSchema),
  poController.requestChangesPO
);

router.post(
  '/orders/:id/reject',
  authorize('cancel', 'PurchaseOrder', permissionChecker),
  validate(cancelPoSchema), // Reuse reason schema
  poController.rejectPO
);

router.post(
  '/orders/:id/send',
  authorize('issue', 'PurchaseOrder', permissionChecker),
  validate(sendPoSchema),
  poController.sendPO
);

router.post(
  '/orders/:id/resend-email',
  authorize('issue', 'PurchaseOrder', permissionChecker),
  poController.resendPOEmail
);

router.post(
  '/orders/:id/revise',
  authorize('revise', 'PurchaseOrder', permissionChecker),
  validate(revisePoSchema),
  poController.revisePO
);

router.post(
  '/orders/:id/cancel',
  authorize('cancel', 'PurchaseOrder', permissionChecker),
  validate(cancelPoSchema),
  poController.cancelPO
);

router.delete(
  '/orders/:id',
  authorize('delete', 'PurchaseOrder', permissionChecker), // Assumes admin role checks in authorize or service
  poController.deletePO
);

router.post(
  '/orders/export',
  authorize('export', 'PurchaseOrder', permissionChecker),
  (_req, res) => {
    res.status(501).json({ error: 'Export endpoint deferred / not implemented' });
  }
);

// ==============================================================================
// VENDOR PROCUREMENT HISTORY
// ==============================================================================

router.get(
  '/vendors/:vendorId/history',
  authorize('read', 'PurchaseOrder', permissionChecker),
  poController.getVendorHistory
);

// ==============================================================================
// EXPECTED RECEIPTS
// ==============================================================================

router.get(
  '/expected-receipts',
  authorize('read', 'ExpectedReceipt', permissionChecker),
  erController.listReceipts
);

router.get(
  '/expected-receipts/:id',
  authorize('read', 'ExpectedReceipt', permissionChecker),
  erController.getReceipt
);

router.patch(
  '/expected-receipts/:id',
  authorize('submit', 'ExpectedReceipt', permissionChecker),
  validate(updateExpectedReceiptSchema),
  erController.updateReceipt
);

router.post(
  '/expected-receipts/:id/document',
  authorize('submit', 'ExpectedReceipt', permissionChecker),
  receiptUpload.single('file'),
  erController.uploadDocument
);

export default router;
