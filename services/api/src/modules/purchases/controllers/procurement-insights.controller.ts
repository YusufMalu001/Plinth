import { NextFunction, Request, Response } from 'express';
import { ProcurementInsightsService } from '../services/procurement-insights.service';

export class ProcurementInsightsController {
  constructor(private readonly service: ProcurementInsightsService) {}

  dashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json({ success: true, data: await this.service.dashboard(), requestId: _req.id }); } catch (error) { next(error); }
  };

  notifications = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json({ success: true, data: await this.service.notifications(req.user!.id, Number(req.query.take) || 50), requestId: req.id }); } catch (error) { next(error); }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json({ success: true, data: await this.service.markNotificationRead(req.params.id, req.user!.id), requestId: req.id }); } catch (error) { next(error); }
  };

  markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json({ success: true, data: await this.service.markAllNotificationsRead(req.user!.id), requestId: req.id }); } catch (error) { next(error); }
  };
}
