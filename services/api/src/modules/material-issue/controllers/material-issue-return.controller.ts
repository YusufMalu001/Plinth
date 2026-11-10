import { Request, Response, NextFunction } from 'express';
import { MaterialIssueReturnService } from '../services/material-issue-return.service';

export class MaterialIssueReturnController {
  constructor(private readonly service: MaterialIssueReturnService) {}

  request = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.request(
        req.params.id,
        req.body.materialIssueLineId,
        req.body,
        req.user?.id || 'system',
        req.id
      );
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  acknowledge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.acknowledge(req.params.returnId, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listByMaterialIssueId(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
