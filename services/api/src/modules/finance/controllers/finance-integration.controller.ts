import { Request, Response, NextFunction } from 'express';
import { TallyIntegrationService } from '../services/tally-integration.service';
import { MappingConfigRepository } from '../repositories/mapping-config.repository';
import { IntegrationJobRepository } from '../repositories/integration-job.repository';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import { TransactionSourceType, LifecycleStatus, IntegrationJobStatus, IntegrationJobItemStatus, InternalReconciliationStatus } from '@prisma/client';

export class FinanceIntegrationController {
  constructor(
    private readonly integrationService: TallyIntegrationService,
    private readonly mappingRepo: MappingConfigRepository = new MappingConfigRepository(),
    private readonly jobRepo: IntegrationJobRepository = new IntegrationJobRepository(),
    private readonly reconRepo: ReconciliationRepository = new ReconciliationRepository()
  ) {}

  // 1. Integration Readiness
  getReadinessStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.integrationService.getReadinessStatus();
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-readiness'
      });
    } catch (err) {
      next(err);
    }
  };

  // 2. Check Eligibility per Source Type
  checkEligibility = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sourceType = req.query.sourceType as TransactionSourceType;
      const data = await this.integrationService.checkEligibility(sourceType);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-eligibility'
      });
    } catch (err) {
      next(err);
    }
  };

  // 3. Mapping Configuration CRUD & Approval
  listMappings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sourceType = req.query.sourceType as TransactionSourceType | undefined;
      const status = req.query.status as LifecycleStatus | undefined;
      const data = await this.mappingRepo.list({ sourceType, status });
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-mappings-list'
      });
    } catch (err) {
      next(err);
    }
  };

  createMapping = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const data = await this.integrationService.createMappingConfiguration(actorId, req.body);
      res.status(201).json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-mapping-create'
      });
    } catch (err) {
      next(err);
    }
  };

  approveMapping = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const mappingId = req.params.id;
      const data = await this.integrationService.approveMappingConfiguration(actorId, mappingId);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-mapping-approve'
      });
    } catch (err) {
      next(err);
    }
  };

  // 4. Queue Transactions
  queueTransactions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const { sourceType, sourceIds } = req.body;
      const data = await this.integrationService.queueTransactions(actorId, sourceType, sourceIds);
      res.status(201).json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-queue'
      });
    } catch (err) {
      next(err);
    }
  };

  // 5. Trigger Batch Export
  exportBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const { jobId } = req.body;
      const data = await this.integrationService.exportBatch(actorId, jobId);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-export'
      });
    } catch (err) {
      next(err);
    }
  };

  // 6. Manual Finance Acknowledgement
  acknowledgeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const { itemId } = req.params;
      const data = await this.integrationService.manualAcknowledge(actorId, itemId, req.body);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-acknowledge'
      });
    } catch (err) {
      next(err);
    }
  };

  // 7. Internal Reconciliation Workspace
  reconcileItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const { itemId } = req.params;
      const data = await this.integrationService.reconcileInternal(actorId, itemId, req.body);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-reconcile'
      });
    } catch (err) {
      next(err);
    }
  };

  listReconciliationRecords = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as InternalReconciliationStatus | undefined;
      const data = await this.reconRepo.list({ status });
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-reconciliation-records'
      });
    } catch (err) {
      next(err);
    }
  };

  // 8. Investigate & Retry
  investigateAndRetry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = (req as any).user?.id || 'system-user';
      const { itemId } = req.params;
      const { action, reason } = req.body;
      const data = await this.integrationService.investigateAndRetry(actorId, itemId, action, reason);
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-retry'
      });
    } catch (err) {
      next(err);
    }
  };

  // 9. Query Jobs & Job Items (Traceability Drill-down)
  listJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sourceType = req.query.sourceType as TransactionSourceType | undefined;
      const status = req.query.status as IntegrationJobStatus | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const data = await this.jobRepo.listJobs({ sourceType, status, page, limit });
      res.json({
        success: true,
        data: data.jobs,
        pagination: {
          page,
          limit,
          total: data.total,
          totalPages: Math.ceil(data.total / limit)
        },
        requestId: req.headers['x-request-id'] || 'req-finance-jobs-list'
      });
    } catch (err) {
      next(err);
    }
  };

  getJobById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.jobRepo.findJobById(id);
      if (!data) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Integration job with ID ${id} not found` },
          requestId: req.headers['x-request-id'] || 'req-finance-job-get'
        });
        return;
      }
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-job-get'
      });
    } catch (err) {
      next(err);
    }
  };

  listJobItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = req.query.jobId as string | undefined;
      const sourceType = req.query.sourceType as TransactionSourceType | undefined;
      const status = req.query.status as IntegrationJobItemStatus | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const data = await this.jobRepo.listJobItems({ jobId, sourceType, status, page, limit });
      res.json({
        success: true,
        data: data.items,
        pagination: {
          page,
          limit,
          total: data.total,
          totalPages: Math.ceil(data.total / limit)
        },
        requestId: req.headers['x-request-id'] || 'req-finance-items-list'
      });
    } catch (err) {
      next(err);
    }
  };

  getJobItemById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await this.jobRepo.findJobItemById(id);
      if (!data) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Integration job item with ID ${id} not found` },
          requestId: req.headers['x-request-id'] || 'req-finance-item-get'
        });
        return;
      }
      res.json({
        success: true,
        data,
        requestId: req.headers['x-request-id'] || 'req-finance-item-get'
      });
    } catch (err) {
      next(err);
    }
  };
}
