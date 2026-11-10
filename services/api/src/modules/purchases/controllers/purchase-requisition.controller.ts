import { Request, Response, NextFunction } from 'express';
import { PurchaseRequisitionService } from '../services/purchase-requisition.service';

export class PurchaseRequisitionController {
  constructor(private readonly prService: PurchaseRequisitionService) {}

  createPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.createPR(
        req.body,
        req.user?.id || 'system',
        { requestId: req.id }
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  createAndSubmitPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const created = await this.prService.createPR(req.body, actorId, { requestId: req.id });
      const submitted = await this.prService.submitPR(created.id, actorId, req.id);
      res.status(201).json({ success: true, data: submitted, requestId: req.id });
    } catch (error) { next(error); }
  };

  updatePR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.updatePR(
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

  listPRs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      const result = await this.prService.listPRs({ skip, take: limit, status, search, sortBy, sortOrder, startDate, endDate });
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  getPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.getPR(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  listRevisions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const result = await this.prService.listRevisions(req.params.id); res.status(200).json({ success: true, data: result, requestId: req.id }); } catch (error) { next(error); }
  };

  recommendVendors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { const result = await this.prService.recommendVendors(req.params.id, req.user?.id || 'system', req.id); res.status(200).json({ success: true, data: result, requestId: req.id }); } catch (error) { next(error); }
  };

  selectVendor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.selectVendor(req.params.id, req.body.vendorId, req.user?.id || 'system', req.body.overrideReason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) { next(error); }
  };

  getNextPrNumber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.getNextPrNumber();
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  submitPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.submitPR(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  approvePR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.approvePR(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  rejectPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.rejectPR(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  requestChangesPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.requestChangesPR(req.params.id, req.user?.id || 'system', req.body.reason, req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  cancelPR = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.prService.cancelPR(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
