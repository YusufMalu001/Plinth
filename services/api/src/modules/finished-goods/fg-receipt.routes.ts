import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { validate } from '../../common/middleware/validation';
import {
  createFgReadyOutputSchema,
  updateFgPackagingSchema,
  createFgReceiptSchema,
  holdFgReceiptSchema,
  releaseFgReceiptSchema,
  fgReadyOutputQuerySchema,
  fgReceiptQuerySchema
} from '@synergy/validation';
import { prisma } from '../../database';
import { FgReceiptRepository } from './repositories/fg-receipt.repository';
import { FgReceiptService } from './services/fg-receipt.service';
import { FgReceiptController } from './controllers/fg-receipt.controller';
import { AuditWriter } from '@synergy/types';

const router = Router();
const permissionChecker = new DbPermissionChecker();

const auditWriter: AuditWriter = {
  record: async (event) => {
    try {
      await prisma.auditLog.create({
        data: {
          userId: event.actorId,
          action: event.action,
          resource: event.entityType,
          resourceId: event.entityId,
          before: (event.before ? JSON.parse(JSON.stringify(event.before)) : undefined) ?? undefined,
          after: (event.after ? JSON.parse(JSON.stringify(event.after)) : undefined) ?? undefined,
          requestId: event.requestId ?? 'system'
        }
      });
    } catch (err) {
      console.error('Audit recording failed in Finished Goods:', err);
    }
  }
};

const repository = new FgReceiptRepository(prisma);
const service = new FgReceiptService(repository, permissionChecker, auditWriter, prisma);
const controller = new FgReceiptController(service);

// 1. Ready Outputs (Pre-FG Queue)
router.get(
  '/ready-outputs',
  authenticate,
  authorize('view', 'FgReadyOutput'),
  validate(fgReadyOutputQuerySchema),
  controller.listReadyOutputs
);

router.post(
  '/ready-outputs',
  authenticate,
  authorize('create', 'FgReadyOutput'),
  validate(createFgReadyOutputSchema),
  controller.createReadyOutput
);

router.get(
  '/ready-outputs/:id/gate',
  authenticate,
  authorize('view', 'FgReadyOutput'),
  controller.evaluateGate
);

router.patch(
  '/ready-outputs/:id/packaging',
  authenticate,
  authorize('update_packaging', 'FgPackagingRecord'),
  validate(updateFgPackagingSchema),
  controller.updatePackagingStatus
);

// 2. FG Receipts & Gate Entry
router.get(
  '/receipts',
  authenticate,
  authorize('view', 'FgReceipt'),
  validate(fgReceiptQuerySchema),
  controller.listReceipts
);

router.post(
  '/receipts',
  authenticate,
  authorize('receive', 'FgReceipt'),
  validate(createFgReceiptSchema),
  controller.receiveThroughGate
);

router.post(
  '/receipts/:id/hold',
  authenticate,
  authorize('hold', 'FgReceipt'),
  validate(holdFgReceiptSchema),
  controller.holdReceipt
);

router.post(
  '/receipts/:id/release',
  authenticate,
  authorize('release', 'FgReceipt'),
  validate(releaseFgReceiptSchema),
  controller.releaseReceipt
);

router.get(
  '/receipts/:id/genealogy',
  authenticate,
  authorize('view', 'FgReceipt'),
  controller.traceGenealogy
);

export default router;
