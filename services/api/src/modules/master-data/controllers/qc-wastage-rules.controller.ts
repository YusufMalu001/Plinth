import { Request, Response, NextFunction } from 'express';
import { QcWastageRulesService } from '../services/qc-wastage-rules.service';
import { ApiResponse, LifecycleStatus } from '@plinth/types';

export class QcWastageRulesController {
  constructor(private readonly qcWastageService: QcWastageRulesService) {}

  // ============================================================================
  // QC RULES
  // ============================================================================

  createQcRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.createQcRule({
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listQcRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.qcWastageService.listQcRules({
        targetType: req.query.targetType as string | undefined,
        targetId: req.query.targetId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getQcRuleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.getQcRuleById(req.params.id);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  updateQcRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.updateQcRule(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  resolveEffectiveQcRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetType = String(req.query.targetType || '');
      const targetId = String(req.query.targetId || '');
      const date = req.query.date ? new Date(String(req.query.date)) : new Date();

      const result = await this.qcWastageService.resolveEffectiveQcRule(targetType, targetId, date);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  transitionQcRuleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.transitionQcRuleStatus({
        id: req.params.id,
        targetStatus: req.body.targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  // ============================================================================
  // WASTAGE RULES
  // ============================================================================

  createWastageRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.createWastageRule({
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listWastageRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.qcWastageService.listWastageRules({
        materialId: req.query.materialId as string | undefined,
        workCenterId: req.query.workCenterId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getWastageRuleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.getWastageRuleById(req.params.id);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  updateWastageRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.updateWastageRule(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  resolveEffectiveWastageRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const materialId = String(req.query.materialId || '');
      const workCenterId = String(req.query.workCenterId || '');
      const date = req.query.date ? new Date(String(req.query.date)) : new Date();

      const result = await this.qcWastageService.resolveEffectiveWastageRule(materialId, workCenterId, date);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  transitionWastageRuleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.qcWastageService.transitionWastageRuleStatus({
        id: req.params.id,
        targetStatus: req.body.targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
