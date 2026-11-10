import { Request, Response, NextFunction } from 'express';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { purchaseOrderEmailService } from '../services/purchase-order-email.service';

export class PurchaseOrderController {
  constructor(private readonly poService: PurchaseOrderService) {}

  generatePO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.generatePO(req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  recommendVendors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.recommendVendorsForOrder(req.body);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) { next(error); }
  };

  listPOs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const status = req.query.status as string;
      const search = req.query.search as string;
      const sortBy = req.query.sortBy as string;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const result = await this.poService.listPOs({ skip, take: limit, status, search, sortBy, sortOrder, startDate, endDate });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getPO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.getPO(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getPODocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const document = await purchaseOrderEmailService.getDocument(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${document.filename.replace(/["\\]/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(document.content);
    } catch (error) { next(error); }
  };

  getNextPoNumber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.getNextPoNumber();
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  approvePO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.approvePO(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  rejectPO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.rejectPO(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  requestChangesPO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.requestChangesPO(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  updatePO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.updatePO(req.params.id, req.user?.id || 'system', req.body, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  sendPO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.sendPO(req.params.id, req.user?.id || 'system', req.body.method, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  resendPOEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.resendPOEmail(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) { next(error); }
  };

  revisePO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.revisePO(
        req.params.id,
        req.user?.id || 'system',
        { lines: req.body.lines },
        req.body.reason,
        req.id
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  cancelPO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.cancelPO(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  deletePO = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const poNumber = typeof req.query.poNumber === 'string' ? req.query.poNumber : undefined;
      await this.poService.deletePO(req.params.id, req.user?.id || 'system', req.id, poNumber);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  getVendorHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.poService.getVendorHistory(req.params.vendorId);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
