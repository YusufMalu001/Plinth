import { Request, Response, NextFunction } from 'express';
import { ApiResponse, LifecycleStatus } from '@synergy/types';
import { ValidationError } from '../../../common/errors/AppError';
import { QcService } from '../services/qc.service';
import { QcReleaseGateService } from '../services/qc-release-gate.service';
import { QcCheckpointType } from '@prisma/client';

export class QcController {
  constructor(
    private readonly service: QcService = new QcService(),
    private readonly releaseGateService: QcReleaseGateService = new QcReleaseGateService()
  ) {}

  // 1. GET /api/v1/qc/queue
  getInspectionQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as {
        checkpointType?: QcCheckpointType;
        targetType?: 'BATCH' | 'GRN_LINE' | 'ALL';
        departmentId?: string;
        requiresInspectionOnly?: string | boolean;
        page?: string;
        limit?: string;
      };

      const result = await this.service.getInspectionQueue({
        checkpointType: query.checkpointType,
        targetType: query.targetType,
        departmentId: query.departmentId,
        requiresInspectionOnly: query.requiresInspectionOnly === 'true' || query.requiresInspectionOnly === true,
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 50
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-queue'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 2. GET /api/v1/qc/checkpoints/resolve
  resolveCheckpoints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetType, targetId } = req.query as { targetType: 'BATCH' | 'GRN_LINE'; targetId: string };
      const result = await this.service.resolveCheckpoints(targetType, targetId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-resolve'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 3. POST /api/v1/qc/inspections
  recordInspection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const result = await this.service.recordInspection(req.body, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `Inspection recorded successfully with status ${result.status}`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-insp'
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 4. POST /api/v1/qc/inspections/:id/reinspect
  recordReinspection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const inspectionResultId = req.params.id;
      const result = await this.service.recordReinspection({
        ...req.body,
        inspectionResultId
      }, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `Re-inspection recorded successfully with status ${result.status}`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-reinsp'
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 5. POST /api/v1/qc/inspections/:id/corrective-actions
  createCorrectiveAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const inspectionResultId = req.params.id;
      const result = await this.service.createCorrectiveAction({
        ...req.body,
        inspectionResultId
      }, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Corrective action created successfully',
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-ca'
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 6. PATCH /api/v1/qc/corrective-actions/:actionId
  updateCorrectiveAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const actionId = req.params.actionId;
      const result = await this.service.updateCorrectiveAction({
        ...req.body,
        actionId
      }, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Corrective action updated successfully',
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-ca-upd'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 7. GET /api/v1/qc/history/batch/:batchId
  getBatchQualityHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId } = req.params;
      const result = await this.service.getBatchQualityHistory(batchId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-bh'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 8. GET /api/v1/qc/history/grn-line/:grnLineId
  getGrnLineQualityHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { grnLineId } = req.params;
      const result = await this.service.getGrnLineQualityHistory(grnLineId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-gh'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 9. GET /api/v1/qc/rules
  listQcRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetType, status } = req.query as { targetType?: string; status?: LifecycleStatus };
      const result = await this.service.listQcRules({ targetType, status });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rules'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // GET /api/v1/qc/rules/:id
  getQcRuleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.service.getQcRuleById(id);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rule-get'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 10. POST /api/v1/qc/rules
  createQcRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const result = await this.service.createQcRule({
        ...req.body,
        effectiveFrom: new Date(req.body.effectiveFrom),
        effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null
      }, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `QC Rule '${result.code}' created in DRAFT status`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rule-cr'
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 11. POST /api/v1/qc/rules/:id/approve
  approveQcRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const { id } = req.params;
      const result = await this.service.approveQcRule(id, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `QC Rule '${result.code}' approved successfully`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rule-app'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 11b. POST /api/v1/qc/batches/:id/link-rule
  linkRuleToBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const { id } = req.params;
      const { qcRuleId } = req.body;
      if (!qcRuleId) {
        throw new ValidationError('qcRuleId is required');
      }
      const result = await this.service.linkRuleToBatch(id, qcRuleId, actorId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `QC Rule linked successfully to batch '${id}'`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rule-link'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 12. POST /api/v1/qc/override
  recordOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const result = await this.service.recordOverride({
        ...req.body,
        actorId
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `Mandatory QC gate override recorded for checkpoint ${result.checkpointType}`,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-over'
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // 13. GET /api/v1/qc/release-gate/check
  checkReleaseGate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetType, targetId } = req.query as { targetType: 'BATCH' | 'GRN_LINE'; targetId: string };
      const result = await this.releaseGateService.checkReleaseGate(targetType, targetId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id || (req.headers['x-correlation-id'] as string) || 'req-qc-rg'
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
