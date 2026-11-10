import { Request, Response, NextFunction } from 'express';
import { AssemblyService } from '../services/assembly.service';

export class AssemblyController {
  constructor(private readonly service: AssemblyService) {}

  planBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batch = await this.service.planBatch(
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({
        success: true,
        data: batch,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  allocateComponents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await this.service.allocateComponents(
        req.params.id,
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: updated,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  startBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await this.service.startBatch(
        req.params.id,
        req.body.actualStartDate,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: updated,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  assignWorker = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await this.service.assignWorker(
        req.params.id,
        req.body.employeeId,
        req.body.subtaskDescription,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({
        success: true,
        data: assignment,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  unassignWorker = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.unassignWorker(
        req.params.id,
        req.params.employeeId,
        req.user!.id,
        (req as any).id
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

  recordProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await this.service.recordProgress(
        req.params.id,
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({
        success: true,
        data: event,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  completeBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await this.service.completeBatch(
        req.params.id,
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: updated,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  qcDisposition = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await this.service.qcDisposition(
        req.params.id,
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: updated,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getBatchById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batch = await this.service.getBatchById(
        req.params.id,
        req.user?.id
      );
      res.json({
        success: true,
        data: batch,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  listBatches = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        productId: req.query.productId as string,
        productionPlanId: req.query.productionPlanId as string,
        status: req.query.status as any,
        skip: req.query.skip ? Number(req.query.skip) : 0,
        take: req.query.take ? Number(req.query.take) : 50
      };
      const result = await this.service.listBatches(
        filters,
        req.user?.id
      );
      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          skip: filters.skip,
          take: filters.take
        },
        meta: { total: result.total, skip: filters.skip, take: filters.take },
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
