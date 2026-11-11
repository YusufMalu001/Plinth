import { Request, Response, NextFunction } from 'express';
import { RoutingService } from '../services/routing.service';
import { ApiResponse, LifecycleStatus } from '@plinth/types';

export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  createRoute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.createRoute({
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

  listRoutes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.routingService.listRoutes({
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        productVariantId: req.query.productVariantId as string | undefined,
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

  getRouteById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.getRouteById(req.params.id);
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

  updateRoute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.updateRoute(req.params.id, {
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

  resolveEffectiveRoute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = String(req.query.productId || '');
      const variantId = req.query.productVariantId ? String(req.query.productVariantId) : undefined;
      const date = req.query.date ? new Date(String(req.query.date)) : new Date();

      const result = await this.routingService.resolveEffectiveRoute(productId, date, variantId);
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

  addRouteStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.addRouteStep({
        routeId: req.params.id || req.body.routeId,
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

  updateRouteStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.updateRouteStep(req.params.stepId || req.params.id, {
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

  deleteRouteStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.deleteRouteStep(req.params.stepId || req.params.id, {
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

  transitionRouteStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.routingService.transitionRouteStatus({
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
