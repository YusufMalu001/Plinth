import { Request, Response, NextFunction } from 'express';
import { StockTransferService } from '../services/stock-transfer.service';
import { getIdempotencyKey } from './shared';

export class StockTransferController {
  constructor(private readonly service: StockTransferService) {}

  request = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.request(req.body, req.user?.id || 'system', getIdempotencyKey(req), req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  issue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.issue(req.params.id, req.body.quantity, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  receive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.receive(req.params.id, req.body.quantity, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.cancel(req.params.id, req.user?.id || 'system', req.id);
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
