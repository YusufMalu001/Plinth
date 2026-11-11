import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { ProductionPlanService } from './services/production-plan.service';
import { ProductionPlanController } from './controllers/production-plan.controller';
import { validate } from '../../common/middleware/validation';
import {
  createProductionPlanSchema,
  checkProductionPlanAvailabilitySchema,
  updateProductionPlanSchema,
  productionPlanQuerySchema,
  productionReasonSchema,
  productionMaterialIssueSchema,
  productionOutputSchema,
  departmentQueueQuerySchema,
  receiveBatchSchema,
  assignWorkerSchema,
  startBatchSchema,
  pauseBatchSchema,
  resumeBatchSchema,
  recordProgressSchema,
  recordExceptionSchema,
  completeBatchSchema,
  proposeHandoverSchema,
  decideHandoverSchema,
  managerialOverrideSchema,
  postToInventorySchema
} from '@plinth/validation';

import { DepartmentExecutionService } from './services/department-execution.service';
import { DepartmentExecutionController } from './controllers/department-execution.controller';
import { incompleteScheduleNotifierService } from './services/incomplete-schedule-notifier.service';
import { ParallelExecutionService, productionActorScope } from './services/parallel-execution.service';
import { prisma } from '../../database';
import { ForbiddenError, NotFoundError } from '../../common/errors/AppError';

const router = Router();
const permissionChecker = new DbPermissionChecker();
const service = new ProductionPlanService();
const controller = new ProductionPlanController(service);

const deptExecutionService = new DepartmentExecutionService();
const deptExecutionController = new DepartmentExecutionController(deptExecutionService);
const parallelExecutionService = new ParallelExecutionService();

router.use(authenticate);
router.use('/production/plans', async (req, _res, next) => {
  try { if (!(await productionActorScope(req.user!.id)).global) throw new ForbiddenError(); next(); }
  catch (error) { next(error); }
});

// Module 6 - Production Plans
router.get('/production/plans', authorize('view', 'ProductionPlan', permissionChecker), validate(productionPlanQuerySchema), controller.list);
router.post('/production/plans/check-availability', validate(checkProductionPlanAvailabilitySchema), controller.checkAvailability);
router.post('/production/plans', authorize('create', 'ProductionPlan', permissionChecker), validate(createProductionPlanSchema), controller.create);
router.patch('/production/plans/:id', authorize('update', 'ProductionPlan', permissionChecker), validate(updateProductionPlanSchema), controller.update);
router.put('/production/plans/:id', authorize('update', 'ProductionPlan', permissionChecker), validate(updateProductionPlanSchema), controller.update);
router.get('/production/plans/:id', authorize('view', 'ProductionPlan', permissionChecker), controller.getById);
router.get('/production/plans/:id/requirements', authorize('view', 'ProductionPlan', permissionChecker), controller.requirements);
router.get('/production/plans/:id/inventory-movements', authorize('view', 'ProductionPlan', permissionChecker), controller.inventoryMovements);
router.post('/production/plans/:id/check', authorize('update', 'ProductionPlan', permissionChecker), controller.check);
router.post('/production/plans/:id/submit', authorize('submit', 'ProductionPlan', permissionChecker), controller.submit);
router.post('/production/plans/:id/approve', authorize('approve', 'ProductionPlan', permissionChecker), controller.approve);
router.post('/production/plans/:id/release', authorize('release', 'ProductionPlan', permissionChecker), controller.release);
router.post('/production/plans/:id/partial-complete', authorize('update', 'ProductionPlan', permissionChecker), controller.partialComplete);
router.post('/production/plans/:id/interrupt', authorize('update', 'ProductionPlan', permissionChecker), validate(productionReasonSchema), controller.interrupt);
router.post('/production/plans/:id/start', authorize('update', 'ProductionPlan', permissionChecker), controller.start);
router.post('/production/plans/:id/cancel', authorize('update', 'ProductionPlan', permissionChecker), validate(productionReasonSchema), controller.cancel);
router.delete('/production/plans/:id', authorize('update', 'ProductionPlan', permissionChecker), controller.delete);
router.post('/production/plans/:id/material-issues', authorize('update', 'ProductionPlan', permissionChecker), validate(productionMaterialIssueSchema), controller.issueMaterial);
router.post('/production/plans/:id/material-issues/:issueId/reverse', authorize('update', 'ProductionPlan', permissionChecker), validate(productionReasonSchema), controller.reverseMaterialIssue);
router.post('/production/plans/:id/outputs', authorize('update', 'ProductionPlan', permissionChecker), validate(productionOutputSchema), controller.recordOutput);

// Module 8 - Department-Wise Execution & Shop-Floor Tracking
router.get('/production/executions', authorize('view', ['DepartmentExecution', 'AssemblyBatch'], permissionChecker), async (req, res, next) => {
  try { res.json({ success: true, data: await parallelExecutionService.listSchedules(req.user!.id, String(req.query.search || '')) }); }
  catch (error) { next(error); }
});
router.get('/production/executions/:planId', authorize('view', ['DepartmentExecution', 'AssemblyBatch'], permissionChecker), async (req, res, next) => {
  try { res.json({ success: true, data: await parallelExecutionService.getSchedule(req.params.planId, req.user!.id) }); }
  catch (error) { next(error); }
});
router.post('/production/material-assignments/:id/receive', authorize('receive', ['DepartmentExecution', 'AssemblyBatch'], permissionChecker), async (req, res, next) => {
  try { res.json({ success: true, data: await parallelExecutionService.receiveAssignment(req.params.id, req.user!.id, req.body?.quantity === undefined ? undefined : Number(req.body.quantity)) }); }
  catch (error) { next(error); }
});
router.post('/production/executions/:planId/assembly-waves', authorize('allocate', 'AssemblyBatch', permissionChecker), async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await parallelExecutionService.createAssemblyWave(req.params.planId, Number(req.body.quantity), req.user!.id, String(req.body.idempotencyKey || req.header('Idempotency-Key') || '')) }); }
  catch (error) { next(error); }
});
router.use('/production/batches/:id', async (req, _res, next) => {
  try {
    if (req.params.id === 'initialize') return next();
    const scope = await productionActorScope(req.user!.id);
    const batch = await prisma.departmentExecutionBatch.findUnique({ where: { id: req.params.id }, include: { workerAssignments: true } });
    if (!batch) throw new NotFoundError('Production task not found.');
    if (!scope.global && (scope.departmentId !== batch.departmentId || scope.operator && !batch.workerAssignments.some((row) => row.employeeId === scope.employeeId))) throw new ForbiddenError();
    if (scope.operator && req.method !== 'GET') {
      const action = req.path.split('/').filter(Boolean)[0];
      if (['assign', 'override', 'post-inventory'].includes(action)) throw new ForbiddenError('This action requires a department incharge or manager.');
      if (req.body?.employeeId && req.body.employeeId !== scope.employeeId) throw new ForbiddenError('Operators may record work only under their own employee profile.');
    }
    next();
  } catch (error) { next(error); }
});
router.use('/production/handovers/:handoverId', async (req, _res, next) => {
  try {
    const scope = await productionActorScope(req.user!.id);
    const handover = await prisma.handover.findUnique({ where: { id: req.params.handoverId } });
    if (!handover) throw new NotFoundError('Handover not found.');
    if (!scope.global && (scope.operator || scope.departmentId !== handover.incomingDepartmentId)) throw new ForbiddenError();
    next();
  } catch (error) { next(error); }
});
// 1. Department Queue (list batches at actor's department)
router.get(
  '/production/departments/:departmentId/queue',
  authorize('view', 'DepartmentExecution', permissionChecker),
  validate(departmentQueueQuerySchema),
  deptExecutionController.getDepartmentQueue
);

// 2. Initialize batch from production plan
router.post(
  '/production/batches/initialize',
  authorize('view', 'DepartmentExecution', permissionChecker),
  async (req, _res, next) => { try { if (!(await productionActorScope(req.user!.id)).global) throw new ForbiddenError(); next(); } catch (error) { next(error); } },
  deptExecutionController.initializeBatch
);

// 3. Batch Detail & History
router.get(
  '/production/batches/:id',
  authorize('view', 'DepartmentExecution', permissionChecker),
  deptExecutionController.getBatchById
);

router.get(
  '/production/batches/:id/history',
  authorize('view', 'DepartmentExecution', permissionChecker),
  deptExecutionController.getBatchHistory
);

// 4. Batch Lifecycle Operations
router.post(
  '/production/batches/:id/receive',
  authorize('receive', 'DepartmentExecution', permissionChecker),
  validate(receiveBatchSchema),
  deptExecutionController.receiveBatch
);

router.post(
  '/production/batches/:id/assign',
  authorize('assign', 'DepartmentExecution', permissionChecker),
  validate(assignWorkerSchema),
  deptExecutionController.assignWorker
);

router.delete(
  '/production/batches/:id/workers/:employeeId',
  authorize('assign', 'DepartmentExecution', permissionChecker),
  deptExecutionController.unassignWorker
);

router.post(
  '/production/batches/:id/start',
  authorize('start', 'DepartmentExecution', permissionChecker),
  validate(startBatchSchema),
  deptExecutionController.startBatch
);

router.post(
  '/production/batches/:id/pause',
  authorize('update', 'DepartmentExecution', permissionChecker),
  validate(pauseBatchSchema),
  deptExecutionController.pauseBatch
);

router.post(
  '/production/batches/:id/resume',
  authorize('update', 'DepartmentExecution', permissionChecker),
  validate(resumeBatchSchema),
  deptExecutionController.resumeBatch
);

router.post(
  '/production/batches/:id/progress',
  authorize('update', 'DepartmentExecution', permissionChecker),
  validate(recordProgressSchema),
  deptExecutionController.recordProgress
);

router.post(
  '/production/batches/:id/exceptions',
  authorize('update', 'DepartmentExecution', permissionChecker),
  validate(recordExceptionSchema),
  deptExecutionController.recordException
);

router.post(
  '/production/batches/:id/complete',
  authorize('complete', 'DepartmentExecution', permissionChecker),
  validate(completeBatchSchema),
  deptExecutionController.completeBatch
);

// 5. Handover Operations
router.post(
  '/production/batches/:id/handovers',
  authorize('handover_propose', 'DepartmentExecution', permissionChecker),
  validate(proposeHandoverSchema),
  deptExecutionController.proposeHandover
);

router.post(
  '/production/handovers/:handoverId/decide',
  authorize('handover_accept', 'DepartmentExecution', permissionChecker),
  validate(decideHandoverSchema),
  deptExecutionController.decideHandover
);

// 6. Managerial Override
router.post(
  '/production/batches/:id/override',
  authorize('override_manage', 'DepartmentExecution', permissionChecker),
  validate(managerialOverrideSchema),
  deptExecutionController.managerialOverride
);

// 7. Post Semi-Finished Goods to Inventory & Store
router.post(
  '/production/batches/:id/post-inventory',
  authorize('complete', 'DepartmentExecution', permissionChecker),
  validate(postToInventorySchema),
  deptExecutionController.postToInventory
);

// 8. Trigger Incomplete Schedule & Assembly Notification Evaluation
router.post(
  '/production/check-incomplete-schedules',
  authorize('view', 'ProductionPlan', permissionChecker),
  async (req, res, next) => {
    try {
      if (!(await productionActorScope(req.user!.id)).global) throw new ForbiddenError();
      const result = await incompleteScheduleNotifierService.checkAndNotifyIncompleteSchedules();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
