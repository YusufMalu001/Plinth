import { Request, Response, NextFunction } from 'express';
import { MaterialIssueStatus } from '@prisma/client';
import { MaterialIssueService } from '../services/material-issue.service';

function getIdempotencyKey(req: Request): string | undefined {
  const header = req.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
}

export class MaterialIssueController {
  constructor(private readonly service: MaterialIssueService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;
      const result = await this.service.list({
        productionPlanId: req.query.productionPlanId as string | undefined,
        status: req.query.status as MaterialIssueStatus | undefined,
        locationId: req.query.locationId as string | undefined,
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
      const result = await this.service.getById(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  request = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.request(req.body, req.user?.id || 'system', getIdempotencyKey(req), req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.verify(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  prepare = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.prepare(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  handOver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.handOver(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  acknowledge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.acknowledge(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.cancel(req.params.id, req.body?.reason, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
