import { Request, Response, NextFunction } from 'express';
import { LabelService } from '../services/label.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';

export class LabelController {
  constructor(
    private readonly service: LabelService,
    private readonly goodsReceiptService: GoodsReceiptService
  ) {}

  reprint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.goodsReceiptService.assertLineAccess(req.params.id, req.params.lineId, req.user?.id || 'system');
      const result = await this.service.reprint(
        req.params.lineId,
        req.user?.id || 'system',
        req.body.reason,
        req.id
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
