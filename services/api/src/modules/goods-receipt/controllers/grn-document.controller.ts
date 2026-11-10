import { Request, Response, NextFunction } from 'express';
import { GrnDocumentService } from '../services/grn-document.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';

export class GrnDocumentController {
  constructor(
    private readonly service: GrnDocumentService,
    private readonly goodsReceiptService: GoodsReceiptService
  ) {}

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.goodsReceiptService.getById(req.params.id, req.user?.id || 'system');
      const result = await this.service.upload(req.params.id, req.file, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.goodsReceiptService.getById(req.params.id, req.user?.id || 'system');
      const result = await this.service.list(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
