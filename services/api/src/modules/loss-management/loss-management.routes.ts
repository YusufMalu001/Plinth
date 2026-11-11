import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { validate } from '../../common/middleware/validation';
import {
  createLossEventSchema,
  classifyLossEventSchema,
  reviewLossEventSchema,
  approveLossEventSchema,
  rejectLossEventSchema,
  investigateLossEventSchema,
  postLossEventStockEffectSchema,
  createReplacementChallanSchema,
  acknowledgeReplacementChallanSchema,
  lossEventQuerySchema,
  lossAnalyticsQuerySchema,
  lossEventParamSchema
} from '@plinth/validation';
import { prisma } from '../../database';
import { LossEventRepository, ReplacementChallanRepository } from './repositories';
import { ToleranceEvaluatorService, LossEventService } from './services';
import { LossEventController } from './controllers';
import { AuditWriter } from '@plinth/types';

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
    } catch {
      // Non-blocking audit logger
    }
  }
};

const lossRepo = new LossEventRepository(prisma);
const challanRepo = new ReplacementChallanRepository(prisma);
const toleranceEvaluator = new ToleranceEvaluatorService(prisma);
const service = new LossEventService(
  lossRepo,
  challanRepo,
  toleranceEvaluator,
  permissionChecker,
  auditWriter
);
const controller = new LossEventController(service);

router.use(authenticate);

// 1. Plant-wide Loss Analytics Rollup
router.get(
  '/loss-events/analytics',
  authorize('read', 'LossEvent', permissionChecker),
  validate(lossAnalyticsQuerySchema),
  controller.getAnalytics
);

// 2. Abnormal Loss Events Review Queue
router.get(
  '/loss-events/abnormal-queue',
  authorize('read', 'LossEvent', permissionChecker),
  validate(lossEventQuerySchema),
  controller.getAbnormalQueue
);

// 3. Loss Events List & Search
router.get(
  '/loss-events',
  authorize('read', 'LossEvent', permissionChecker),
  validate(lossEventQuerySchema),
  controller.list
);

// 4. Report Loss Event (Create)
router.post(
  '/loss-events',
  authorize('report', 'LossEvent', permissionChecker),
  validate(createLossEventSchema),
  controller.report
);

// 5. Get Loss Event by ID
router.get(
  '/loss-events/:id',
  authorize('read', 'LossEvent', permissionChecker),
  validate(lossEventParamSchema),
  controller.getById
);

// 6. Classify Loss Event against WastageRule (Tolerance Comparison)
router.post(
  '/loss-events/:id/classify',
  authorize('review', 'LossEvent', permissionChecker),
  validate(classifyLossEventSchema),
  controller.classify
);

// 7. Review Loss Event
router.post(
  '/loss-events/:id/review',
  authorize('review', 'LossEvent', permissionChecker),
  validate(reviewLossEventSchema),
  controller.review
);

// 8. Approve Loss Event
router.post(
  '/loss-events/:id/approve',
  authorize('approve', 'LossEvent', permissionChecker),
  validate(approveLossEventSchema),
  controller.approve
);

// 9. Reject Loss Event
router.post(
  '/loss-events/:id/reject',
  authorize('reject', 'LossEvent', permissionChecker),
  validate(rejectLossEventSchema),
  controller.reject
);

// 10. Investigate Abnormal Loss Event
router.post(
  '/loss-events/:id/investigate',
  authorize('investigate', 'LossEvent', permissionChecker),
  validate(investigateLossEventSchema),
  controller.investigate
);

// 11. Post Inventory Stock Effect (Atomic StockAdjustment / StockLedgerEntry)
router.post(
  '/loss-events/:id/post',
  authorize('post', 'LossEvent', permissionChecker),
  validate(postLossEventStockEffectSchema),
  controller.postStockEffect
);

// 12. Issue Replacement Challan
router.post(
  '/loss-events/:id/replacement-challan',
  authorize('replace', 'LossEvent', permissionChecker),
  validate(createReplacementChallanSchema),
  controller.issueReplacementChallan
);

// 13. Acknowledge Replacement Challan
router.post(
  '/replacement-challans/:id/acknowledge',
  authorize('acknowledge', 'ReplacementChallan', permissionChecker),
  validate(acknowledgeReplacementChallanSchema),
  controller.acknowledgeReplacementChallan
);

export default router;
