import { Request, Response, NextFunction } from 'express';
import { DepartmentExecutionService } from '../services/department-execution.service';

export class DepartmentExecutionController {
  constructor(private readonly service: DepartmentExecutionService) {}

  getDepartmentQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDepartmentQueue(
        req.params.departmentId,
        req.user!.id,
        req.query
      );
      res.json({
        success: true,
        data: {
          items: data.items,
          total: data.total,
          page: data.page,
          limit: data.limit,
          incomingHandovers: data.incomingHandovers
        },
        meta: { page: data.page, limit: data.limit, total: data.total },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  initializeBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.initializeBatch(req.body, req.user!.id);
      res.status(201).json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getBatchById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBatchById(req.params.id, req.user!.id);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getBatchHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBatchHistory(req.params.id, req.user!.id);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  receiveBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.receiveBatch(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  assignWorker = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.assignWorker(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  unassignWorker = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.unassignWorker(req.params.id, req.user!.id, req.params.employeeId);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  startBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.startBatch(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  pauseBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.pauseBatch(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  resumeBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.resumeBatch(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  recordProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.recordProgress(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  recordException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.recordException(req.params.id, req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  completeBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.completeBatch(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  proposeHandover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.proposeHandover(req.params.id, req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  decideHandover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.decideHandover(req.params.handoverId, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  managerialOverride = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.managerialOverride(req.params.id, req.user!.id, req.body);
      res.json({
        success: true,
        data,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  postToInventory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.postBatchToInventory(req.params.id, req.user!.id, req.body);
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
