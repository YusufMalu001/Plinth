import { Request, Response, NextFunction } from 'express';
import { StockBalanceService } from '../services/stock-balance.service';

export class StockBalanceController {
  constructor(private readonly service: StockBalanceService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const result = await this.service.list(req.user?.id || 'system', {
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        ownership: req.query.ownership as never,
        skip,
        take: limit
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getById(req.user?.id || 'system', req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getMovementHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getMovementHistory(req.user?.id || 'system', {
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        locationId: req.params.id
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const result = await this.service.getLedger(req.user?.id || 'system', {
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        entryType: req.query.entryType as string | undefined,
        postedFrom: req.query.postedFrom ? new Date(req.query.postedFrom as string) : undefined,
        postedTo: req.query.postedTo ? new Date(req.query.postedTo as string) : undefined,
        skip,
        take: limit
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getLedgerEntryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getLedgerEntryById(req.user?.id || 'system', req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getReorderSignals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getReorderSignals(req.user?.id || 'system');
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  createSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.createSnapshot(req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  listSnapshots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listSnapshots(req.user?.id || 'system', {
        asOfDate: req.query.asOfDate ? new Date(req.query.asOfDate as string) : undefined,
        locationId: req.query.locationId as string | undefined
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
