import { Request, Response, NextFunction } from 'express';
import { GrnStatus } from '@prisma/client';
import { GoodsReceiptService } from '../services/goods-receipt.service';

function getIdempotencyKey(req: Request): string | undefined {
  const header = req.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
}

export class GoodsReceiptController {
  constructor(private readonly service: GoodsReceiptService) {}

  createFromPo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.createFromPo(
        req.body,
        req.user?.id || 'system',
        getIdempotencyKey(req),
        req.id
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  createUnreferenced = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.createUnreferenced(
        req.body,
        req.user?.id || 'system',
        getIdempotencyKey(req),
        req.id
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  listGrns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const status = req.query.status as GrnStatus | undefined;
      const poId = req.query.poId as string | undefined;
      const search = req.query.search as string | undefined;
      const result = await this.service.list(
        { skip, take: Math.min(Math.max(limit, 1), 100), status, poId, search },
        req.user?.id || 'system'
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getGrn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getById(req.params.id, req.user?.id || 'system');
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getHistory(req.params.id, req.user?.id || 'system');
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  recordMeasurement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.recordMeasurement(
        req.params.id,
        req.params.lineId,
        req.body,
        req.user?.id || 'system',
        req.id
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  verifyLines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.completePhysicalVerification(
        req.params.id,
        req.body,
        req.user?.id || 'system',
        req.id
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  notifyAccountant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.notifyAccountantForDebitNote(
        req.params.id,
        req.user?.id || 'system',
        req.body,
        req.id
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  updateGrn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.updateLines(
        req.params.id,
        req.body.lines || [],
        req.user?.id || 'system',
        req.id
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  signOff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.signOff(req.params.id, req.user?.id || 'system', req.body.note, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  finalize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.finalize(req.params.id, req.user?.id || 'system', req.body.note, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  dashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.dashboard(req.user?.id || 'system');
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  capabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.capabilities(req.user?.id || 'system');
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const csv = await this.service.exportCsv(req.user?.id || 'system', req.id);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="goods-receipts-${date}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };
}
