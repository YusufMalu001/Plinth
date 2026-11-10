import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { validate } from '../../common/middleware/validation';
import {
  planAssemblyBatchSchema,
  allocateAssemblyComponentsSchema,
  startAssemblyBatchSchema,
  recordAssemblyWorkerAssignmentSchema,
  recordAssemblyProgressSchema,
  completeAssemblyBatchSchema,
  qcDispositionAssemblyBatchSchema,
  assemblyBatchQuerySchema,
  assemblyBatchParamSchema
} from '@synergy/validation';
import { prisma } from '../../database';
import { AssemblyBatchRepository } from './repositories/assembly-batch.repository';
import { AssemblyService } from './services/assembly.service';
import { AssemblyController } from './controllers/assembly.controller';
import { LossEventRepository, ReplacementChallanRepository } from '../loss-management/repositories';
import { ToleranceEvaluatorService, LossEventService } from '../loss-management/services';
import { AuditWriter } from '@synergy/types';
import { productionActorScope } from '../production/services/parallel-execution.service';
import { ForbiddenError, NotFoundError } from '../../common/errors/AppError';

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
      console.error('Audit recording failed in Assembly:', err);
    }
  }
};

const lossEventRepo = new LossEventRepository(prisma);
const replacementChallanRepo = new ReplacementChallanRepository(prisma);
const toleranceEvaluator = new ToleranceEvaluatorService(prisma);
const lossEventService = new LossEventService(
  lossEventRepo,
  replacementChallanRepo,
  toleranceEvaluator,
  permissionChecker,
  auditWriter,
  prisma
);

const assemblyRepo = new AssemblyBatchRepository(prisma);
const assemblyService = new AssemblyService(
  assemblyRepo,
  lossEventService,
  toleranceEvaluator,
  permissionChecker,
  auditWriter,
  prisma
);
const controller = new AssemblyController(assemblyService);

router.use(authenticate);
router.use('/batches/:id', async (req, _res, next) => {
  try {
    const scope = await productionActorScope(req.user!.id);
    const batch = await prisma.assemblyBatch.findUnique({ where: { id: req.params.id }, include: { productionPlan: { include: { route: true } }, workerAssignments: true } });
    if (!batch) throw new NotFoundError('Assembly wave not found.');
    if (!scope.global && (batch.productionPlan?.route?.assemblyDepartmentId !== scope.departmentId || scope.operator && !batch.workerAssignments.some((row) => row.employeeId === scope.employeeId))) throw new ForbiddenError();
    if (scope.operator && req.method !== 'GET') {
      const action = req.path.split('/').filter(Boolean)[0];
      if (['allocate', 'workers', 'qc-disposition'].includes(action)) throw new ForbiddenError('This action requires an Assembly incharge or manager.');
      if (req.body?.employeeId && req.body.employeeId !== scope.employeeId) throw new ForbiddenError('Operators may record work only under their own employee profile.');
    }
    next();
  } catch (error) { next(error); }
});

// 1. Plan Assembly Batch (V-002 & V-003 Gate)
router.post(
  '/batches',
  authorize('plan', 'AssemblyBatch', permissionChecker),
  async (req, _res, next) => { try { if (!(await productionActorScope(req.user!.id)).global) throw new ForbiddenError(); next(); } catch (error) { next(error); } },
  validate(planAssemblyBatchSchema),
  controller.planBatch
);

// 2. List Assembly Batches
router.get(
  '/batches',
  authorize('view', 'AssemblyBatch', permissionChecker),
  validate(assemblyBatchQuerySchema),
  controller.listBatches
);

// 3. Get Assembly Batch by ID
router.get(
  '/batches/:id',
  authorize('view', 'AssemblyBatch', permissionChecker),
  validate(assemblyBatchParamSchema),
  controller.getBatchById
);

// 4. Allocate Components (Convergence join)
router.post(
  '/batches/:id/allocate',
  authorize('allocate', 'AssemblyBatch', permissionChecker),
  validate(allocateAssemblyComponentsSchema),
  controller.allocateComponents
);

// 5. Start Assembly Execution
router.post(
  '/batches/:id/start',
  authorize('execute', 'AssemblyBatch', permissionChecker),
  validate(startAssemblyBatchSchema),
  controller.startBatch
);

// 6. Assign Worker
router.post(
  '/batches/:id/workers',
  authorize('assign_worker', 'AssemblyBatch', permissionChecker),
  validate(recordAssemblyWorkerAssignmentSchema),
  controller.assignWorker
);

router.delete(
  '/batches/:id/workers/:employeeId',
  authorize('assign_worker', 'AssemblyBatch', permissionChecker),
  controller.unassignWorker
);

// 7. Record Progress
router.post(
  '/batches/:id/progress',
  authorize('execute', 'AssemblyBatch', permissionChecker),
  validate(recordAssemblyProgressSchema),
  controller.recordProgress
);

// 8. Complete Assembly Batch (Quantity conservation check)
router.post(
  '/batches/:id/complete',
  authorize('complete', 'AssemblyBatch', permissionChecker),
  validate(completeAssemblyBatchSchema),
  controller.completeBatch
);

// 9. QC Disposition (V-009 Gate & LossEvent routing)
router.post(
  '/batches/:id/qc-disposition',
  authorize('qc_disposition', 'AssemblyBatch', permissionChecker),
  validate(qcDispositionAssemblyBatchSchema),
  controller.qcDisposition
);

export default router;
