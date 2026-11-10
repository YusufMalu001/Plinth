import { Request, Response, NextFunction } from 'express';
import { FgReceiptService } from '../services/fg-receipt.service';

export class FgReceiptController {
  constructor(private readonly service: FgReceiptService) {}

  listReadyOutputs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.listReadyOutputs(
        req.query as any,
        req.user!.id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  createReadyOutput = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createReadyOutput(
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  updatePackagingStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.updatePackagingStatus(
        req.params.id,
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  evaluateGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.evaluateGate(req.params.id);
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  receiveThroughGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.receiveThroughGate(
        req.body,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  listReceipts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.listReceipts(
        req.query as any,
        req.user!.id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  holdReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.holdReceipt(
        req.params.id,
        req.body.reason,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  releaseReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.releaseReceipt(
        req.params.id,
        req.user!.id,
        (req as any).id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  traceGenealogy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.traceGenealogy(
        req.params.id,
        req.user!.id
      );
      res.json({
        success: true,
        data: result,
        requestId: (req as any).id || 'req-unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
