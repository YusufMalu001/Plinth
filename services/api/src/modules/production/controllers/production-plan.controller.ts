import { Request, Response, NextFunction } from 'express';
import { ProductionPlanService } from '../services/production-plan.service';

export class ProductionPlanController {
  constructor(private readonly service: ProductionPlanService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.list(req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  checkAvailability = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.checkAvailability(req.body, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.create(req.body, req.user!.id, req.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.update(req.params.id, req.body, req.user!.id, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDetailById(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  requirements = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.getRequirements(req.params.id) }); } catch (err) { next(err); }
  };

  inventoryMovements = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.getInventoryMovements(req.params.id) }); } catch (err) { next(err); }
  };

  check = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.check(req.params.id, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.submit(req.params.id, req.user!.id, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.approve(req.params.id, req.user!.id, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  release = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.release(req.params.id, req.user!.id, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  partialComplete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.partialComplete(req.params.id, req.user!.id, req.body, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  interrupt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.interrupt(req.params.id, req.user!.id, req.body, req.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  start = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.start(req.params.id, req.user!.id, req.id) }); } catch (err) { next(err); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.cancel(req.params.id, req.user!.id, req.body?.reason, req.id) }); } catch (err) { next(err); }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.delete(req.params.id, req.user!.id) }); } catch (err) { next(err); }
  };

  issueMaterial = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ success: true, data: await this.service.issueMaterial(req.params.id, req.user!.id, req.body) }); } catch (err) { next(err); }
  };

  reverseMaterialIssue = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await this.service.reverseMaterialIssue(req.params.id, req.params.issueId, req.user!.id, req.body?.reason) }); } catch (err) { next(err); }
  };

  recordOutput = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ success: true, data: await this.service.recordOutput(req.params.id, req.user!.id, req.body) }); } catch (err) { next(err); }
  };
}
