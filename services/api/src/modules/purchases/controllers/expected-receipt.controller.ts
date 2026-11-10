import { Request, Response, NextFunction } from 'express';
import { ExpectedReceiptService } from '../services/expected-receipt.service';

export class ExpectedReceiptController {
  constructor(private readonly receiptService: ExpectedReceiptService) {}

  listReceipts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 10;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const status = req.query.status as string | undefined;
      const poId = req.query.poId as string | undefined;
      const search = req.query.search as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const overdueOnly = req.query.overdueOnly === 'true';

      const result = await this.receiptService.listReceipts({
        skip,
        take: limit,
        status,
        poId,
        search,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
        overdueOnly
      });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.status(200).json({ success: true, data: await this.receiptService.getReceipt(req.params.id), requestId: req.id }); } catch (error) { next(error); }
  };

  updateReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.receiptService.updateReceipt(
        req.params.id,
        req.user?.id || 'system',
        req.body.status,
        req.id
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) { res.status(400).json({ success: false, error: { message: 'Receipt file is required.' }, requestId: req.id }); return; }
      const result = await this.receiptService.uploadReceiptDocument(req.params.id, req.user?.id || 'system', req.file);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) { next(error); }
  };
}
