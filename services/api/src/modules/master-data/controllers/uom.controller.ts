import { Request, Response, NextFunction } from 'express';
import { UomService } from '../services/uom.service';
import { ApiResponse, LifecycleStatus } from '@synergy/types';
import { isAdminActor } from '../../../common/middleware/auth';

export class UomController {
  constructor(private readonly uomService: UomService) {}

  // ============================================================================
  // UNIT OF MEASURE
  // ============================================================================

  createUom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.createUom({
        ...req.body,
        actorId: req.user?.id || 'system',
        activateImmediately: isAdminActor(req.user),
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

  listUoms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.uomService.listUoms({
        status: req.query.status as LifecycleStatus | undefined,
        dimension: req.query.dimension as string | undefined,
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

  getUomById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.getUomById(req.params.id);
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

  updateUom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.updateUom(req.params.id, {
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

  transitionUomStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionUomStatus({
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

  submitUomForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionUomStatus({
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

  approveUom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionUomStatus({
        id: req.params.id,
        targetStatus: 'APPROVED',
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

  rejectUom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.uomService.transitionUomStatus({
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

  deactivateUom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionUomStatus({
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

  // ============================================================================
  // UOM CONVERSIONS
  // ============================================================================

  createConversion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.createConversion({
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

  listConversions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.uomService.listConversions({
        fromUomId: req.query.fromUomId as string | undefined,
        toUomId: req.query.toUomId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
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

  getConversionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.getConversionById(req.params.id);
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

  transitionConversionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionConversionStatus({
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
  // PACK SIZES
  // ============================================================================

  createPackSize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.createPackSize({
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

  listPackSizes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.uomService.listPackSizes({
        materialId: req.query.materialId as string | undefined,
        uomId: req.query.uomId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
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

  getPackSizeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.getPackSizeById(req.params.id);
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

  transitionPackSizeStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uomService.transitionPackSizeStatus({
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
