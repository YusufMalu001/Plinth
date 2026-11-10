import { Request, Response, NextFunction } from 'express';
import { BomSimulationService } from '../services/bom-simulation.service';

export class BomSimulationController {
  constructor(private readonly service: BomSimulationService) {}

  simulate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.simulate(req.params.id, req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listByVersion(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
