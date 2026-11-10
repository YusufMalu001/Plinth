import { Request, Response, NextFunction } from 'express';
import { VendorsService } from '../services/vendors.service';
import { ApiResponse, LifecycleStatus } from '@synergy/types';
import { isAdminActor } from '../../../common/middleware/auth';
import { ForbiddenError } from '../../../common/errors/AppError';

export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  createVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.createVendor({
        ...req.body,
        activateImmediately: isAdminActor(req.user),
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

  listVendors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await this.vendorsService.listVendors({
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit,
        activeOnly: String(req.query.activeOnly || '').toLowerCase() === 'true'
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

  getVendorById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.getVendorById(req.params.id);
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

  getVendorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.getVendorProfile(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  listEvaluations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.listVendorEvaluations(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  createEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.createVendorEvaluation(req.params.id, req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  listScorecards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.listScorecards();
      res.status(200).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  createScorecard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.createScorecard(req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  activateScorecard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.activateScorecard(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) { next(error); }
  };

  updateVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.updateVendor(req.params.id, {
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

  deleteVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAdminActor(req.user)) throw new ForbiddenError('Only an administrator can delete vendors.');
      const result = await this.vendorsService.deleteVendor(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id } satisfies ApiResponse<typeof result>);
    } catch (error) {
      next(error);
    }
  };

  transitionVendorStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAdminActor(req.user)) throw new ForbiddenError('Only an administrator can change vendor availability.');
      const result = await this.vendorsService.transitionStatus({
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

  submitVendorForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vendorsService.transitionStatus({
        id: req.params.id,
        targetStatus: 'PENDING_VALIDATION',
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

  approveVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAdminActor(req.user)) throw new ForbiddenError('Only an administrator can approve vendors.');
      const result = await this.vendorsService.transitionStatus({
        id: req.params.id,
        targetStatus: 'ACTIVE',
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

  rejectVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAdminActor(req.user)) throw new ForbiddenError('Only an administrator can reject vendor requests.');
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.vendorsService.transitionStatus({
        id: req.params.id,
        targetStatus,
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

  deactivateVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAdminActor(req.user)) throw new ForbiddenError('Only an administrator can change vendor availability.');
      const result = await this.vendorsService.transitionStatus({
        id: req.params.id,
        targetStatus: 'INACTIVE',
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

  getVendorAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = (req.query.type as 'MATERIAL' | 'OUTSOURCING' | 'ALL') || 'ALL';
      const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
      const report = await this.vendorsService.scoreVendors(type, vendorId);
      res.status(200).json({
        success: true,
        data: report,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getVendorEvaluationDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = req.params.id;
      const windowDays = req.query.windowDays ? Number(req.query.windowDays) : undefined;
      const engine = this.vendorsService.getScoringEngine();
      const evaluation = await engine.evaluateVendor(vendorId, { windowDays });
      res.status(200).json({
        success: true,
        data: evaluation,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getActiveScoringPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const engine = this.vendorsService.getScoringEngine();
      const policy = await engine.getActivePolicy();
      res.status(200).json({
        success: true,
        data: policy,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  updateScoringPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const engine = this.vendorsService.getScoringEngine();
      const actorId = req.user?.id || 'SYSTEM';
      const policy = await engine.createPolicy(req.body, actorId);
      res.status(200).json({
        success: true,
        data: policy,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };
}
