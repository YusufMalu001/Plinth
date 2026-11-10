import { Request, Response, NextFunction } from 'express';
import { SummaryService } from '../services/summary.service';
import { ApiResponse } from '@synergy/types';

export class SummaryController {
  constructor(private summaryService: SummaryService) {}

  getOverviewSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.summaryService.getOverviewSummary();
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
