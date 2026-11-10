import { Request, Response, NextFunction } from 'express';
import { MaterialsService } from '../services/materials.service';
import { ApiResponse, LifecycleStatus, MaterialType } from '@synergy/types';
import { isAdminActor } from '../../../common/middleware/auth';

export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  createMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.createMaterial({
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

  listMaterials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await this.materialsService.listMaterials({
        materialType: req.query.materialType as MaterialType | undefined,
        categoryId: req.query.categoryId as string | undefined,
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

  getMaterialById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.getMaterialById(req.params.id);
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

  getMaterialVersionHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.getMaterialVersionHistory(req.params.id);
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

  updateMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.updateMaterial(req.params.id, {
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

  transitionMaterialStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.transitionStatus({
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

  submitMaterialForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.transitionStatus({
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

  approveMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.transitionStatus({
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

  rejectMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.materialsService.transitionStatus({
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

  deactivateMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.materialsService.transitionStatus({
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
}
