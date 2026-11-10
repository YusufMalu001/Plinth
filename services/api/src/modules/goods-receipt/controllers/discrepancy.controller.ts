import { Request, Response, NextFunction } from 'express';
import { DiscrepancyService } from '../services/discrepancy.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';

export class DiscrepancyController {
  constructor(
    private readonly discrepancyService: DiscrepancyService,
    private readonly goodsReceiptService: GoodsReceiptService
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.goodsReceiptService.getById(req.params.id, req.user?.id || 'system');
      const result = await this.discrepancyService.list(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  resolve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      await this.goodsReceiptService.getById(req.params.id, actorId);
      const resolved = await this.discrepancyService.resolve({
        grnId: req.params.id,
        discrepancyId: req.params.discrepancyId,
        resolutionType: req.body.resolutionType,
        acceptanceJustification: req.body.acceptanceJustification,
        returnReference: req.body.returnReference,
        actorId,
        requestId: req.id
      });
      const grn = await this.goodsReceiptService.recomputeLineAndGrnStatus(resolved.grnLineId, actorId, req.id);
      res.status(200).json({ success: true, data: { discrepancy: resolved, grn }, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
