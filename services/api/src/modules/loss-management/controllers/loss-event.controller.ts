import { Request, Response, NextFunction } from 'express';
import { LossEventService } from '../services/loss-event.service';

const getReqId = (req: Request): string => (req as any).id || (req.headers['x-correlation-id'] as string) || 'req-unknown';

export class LossEventController {
  constructor(
    private readonly service: LossEventService
  ) {}

  report = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const created = await this.service.report(req.body, actorId, requestId);
      res.status(201).json({
        success: true,
        data: created,
        message: `Loss event ${created.lossNumber} reported successfully`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  classify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.classify(
        req.params.id,
        req.body || {},
        actorId,
        requestId
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} classified as ${updated.classification}`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.review(
        req.params.id,
        req.body?.reviewNotes,
        actorId,
        requestId
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} reviewed successfully`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.approve(req.params.id, actorId, requestId);
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} approved`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.reject(
        req.params.id,
        req.body.rejectionReason,
        actorId,
        requestId,
        req.body.rejectedQuantity ? Number(req.body.rejectedQuantity) : undefined
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} rejected`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  investigate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.investigate(
        req.params.id,
        req.body.investigationNotes,
        actorId,
        requestId
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} investigation recorded`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  postStockEffect = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const updated = await this.service.postStockEffect(req.params.id, actorId, requestId);
      res.status(200).json({
        success: true,
        data: updated,
        message: `Loss event ${updated.lossNumber} inventory effect posted successfully`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  issueReplacementChallan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const challan = await this.service.issueReplacementChallan(
        req.params.id,
        req.body,
        actorId,
        requestId
      );
      res.status(201).json({
        success: true,
        data: challan,
        message: `Replacement challan ${challan.challanNumber} issued successfully`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  acknowledgeReplacementChallan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user!.id;
      const requestId = getReqId(req);
      const challan = await this.service.acknowledgeReplacementChallan(
        req.params.id,
        actorId,
        requestId
      );
      res.status(200).json({
        success: true,
        data: challan,
        message: `Replacement challan ${challan.challanNumber} acknowledged`,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = getReqId(req);
      const loss = await this.service.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: loss,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = getReqId(req);
      const query = req.query as any;
      const result = await this.service.list({
        sourceType: query.sourceType,
        classification: query.classification,
        status: query.status,
        departmentId: query.departmentId,
        locationId: query.locationId,
        materialId: query.materialId,
        productId: query.productId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        search: query.search ? String(query.search) : undefined,
        skip: query.skip ? Number(query.skip) : undefined,
        take: query.take ? Number(query.take) : undefined
      });
      res.status(200).json({
        success: true,
        data: {
          items: result.items,
          total: result.total
        },
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  getAbnormalQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = getReqId(req);
      const query = req.query as any;
      const result = await this.service.list({
        classification: 'ABNORMAL',
        departmentId: query.departmentId,
        locationId: query.locationId,
        status: query.status,
        skip: query.skip ? Number(query.skip) : undefined,
        take: query.take ? Number(query.take) : undefined
      });
      res.status(200).json({
        success: true,
        data: {
          items: result.items,
          total: result.total
        },
        requestId
      });
    } catch (err) {
      next(err);
    }
  };

  getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = getReqId(req);
      const query = req.query as any;
      const analytics = await this.service.getAnalytics({
        departmentId: query.departmentId,
        locationId: query.locationId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined
      });
      res.status(200).json({
        success: true,
        data: analytics,
        requestId
      });
    } catch (err) {
      next(err);
    }
  };
}
