import { Request, Response, NextFunction } from 'express';
import { CalendarService } from './calendar.service';

export class CalendarController {
  constructor(private readonly service = new CalendarService()) {}

  getDaySummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dateStr = String(req.query.date || new Date().toISOString().split('T')[0]);
      const userId = req.user?.id || 'system';
      const summary = await this.service.getDaySummary(userId, dateStr);
      res.status(200).json({
        success: true,
        data: summary,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  };

  getMonthOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const year = req.query.year ? parseInt(String(req.query.year), 10) : now.getUTCFullYear();
      const month = req.query.month ? parseInt(String(req.query.month), 10) : now.getUTCMonth() + 1;
      const userId = req.user?.id || 'system';
      const overview = await this.service.getMonthOverview(userId, year, month);
      res.status(200).json({
        success: true,
        data: overview,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  };
}
