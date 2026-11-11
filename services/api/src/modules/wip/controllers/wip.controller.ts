import { Request, Response, NextFunction } from 'express';
import { WipService } from '../services/wip.service';
import { PermissionChecker } from '@plinth/types';

export class WipController {
  constructor(
    private readonly service: WipService,
    private readonly permissionChecker?: PermissionChecker
  ) {}

  getOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getWipOverview(
        req.user!.id,
        req.query as any,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  listBatches = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = {
        ...req.query,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        stageSequenceNumber: req.query.stageSequenceNumber ? Number(req.query.stageSequenceNumber) : undefined
      };
      const result = await this.service.listWipBatches(
        query as any,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getBatchById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBatchWipDetail(
        req.params.id,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getBatchGenealogy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBatchGenealogy(
        req.params.id,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getDepartmentQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getDepartmentQueue(
        req.params.departmentId,
        req.user!.id,
        req.query as any,
        this.permissionChecker
      );
      res.json({
        success: true,
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getTimingMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = {
        ...req.query,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20
      };
      const result = await this.service.getTimingMetrics(
        query as any,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  runReconciliation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.runReconciliationCheck(
        req.body || {},
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  listExceptions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = {
        ...req.query,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20
      };
      const result = await this.service.listExceptions(
        query as any,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getExceptionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getExceptionById(
        req.params.id,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  investigateException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.investigateException(
        req.params.id,
        req.body?.investigationNotes,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  resolveException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.resolveException(
        req.params.id,
        req.body.resolutionNotes,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  dismissException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.dismissException(
        req.params.id,
        req.body.resolutionNotes,
        req.user!.id,
        this.permissionChecker
      );
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
