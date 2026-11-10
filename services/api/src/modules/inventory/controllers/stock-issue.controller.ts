import { Request, Response, NextFunction } from 'express';
import { StockIssueService } from '../services/stock-issue.service';
import { getIdempotencyKey } from './shared';

export class StockIssueController {
  constructor(private readonly service: StockIssueService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.create(req.body, req.user?.id || 'system', getIdempotencyKey(req), req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  reverse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.reverse(req.params.id, req.body.reason, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getById(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const result = await this.service.list({
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        status: req.query.status as string | undefined,
        skip,
        take: limit
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
