import { Request, Response, NextFunction } from 'express';
import { JobWorkService } from '../services/job-work.service';
import { JobWorkRepository } from '../repositories/job-work.repository';
import { NotFoundError } from '../../../common/errors/AppError';
import { vendorScoringService } from '../../master-data/services/vendor-scoring.service';

export class JobWorkController {
  constructor(
    private readonly service: JobWorkService,
    private readonly repository: JobWorkRepository
  ) {}

  // Orders
  listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const skip = (page - 1) * limit;

      const result = await this.repository.listOrders({
        vendorId: req.query.vendorId as string | undefined,
        status: req.query.status as any,
        productId: req.query.productId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        search: req.query.search as string | undefined,
        skip,
        take: limit
      });

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit
        },
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.repository.findOrderById(req.params.id);
      if (!order) throw new NotFoundError(`Job Work Order [${req.params.id}] not found.`);

      res.json({
        success: true,
        data: order,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const order = await this.service.createOrder(req.body, actorId, { requestId: req.id });

      res.status(201).json({
        success: true,
        data: order,
        message: 'Job Work Order created successfully.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  approveOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const order = await this.service.approveOrder(req.params.id, actorId, req.body.remarks, { requestId: req.id });

      res.json({
        success: true,
        data: order,
        message: 'Job Work Order approved successfully.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  closeOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const order = await this.service.closeOrder(req.params.id, actorId, req.body.remarks, { requestId: req.id });

      res.json({
        success: true,
        data: order,
        message: 'Job Work Order closed successfully.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  // Material Issues / Challans
  issueMaterial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const challan = await this.service.issueMaterial(req.body, actorId, { requestId: req.id });

      res.status(201).json({
        success: true,
        data: challan,
        message: 'Material issue challan generated and stock dispatched to vendor custody.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  listChallans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const skip = (page - 1) * limit;

      const result = await this.repository.listChallans({
        vendorId: req.query.vendorId as string | undefined,
        jobWorkOrderId: req.query.jobWorkOrderId as string | undefined,
        skip,
        take: limit
      });

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit
        },
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getChallan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const challan = await this.repository.findChallanById(req.params.id);
      if (!challan) throw new NotFoundError(`Challan [${req.params.id}] not found.`);

      res.json({
        success: true,
        data: challan,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  // Returns / Receiving
  receiveReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const result = await this.service.receiveReturn(req.body, actorId, { requestId: req.id });

      res.status(201).json({
        success: true,
        data: result,
        message: result.debitNote
          ? `Goods received with shortage. Debit Note ${result.debitNote.debitNoteNumber} automatically initiated.`
          : 'Goods receipt and vendor custody return processed successfully.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  listReturns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const skip = (page - 1) * limit;

      const result = await this.repository.listReturns({
        vendorId: req.query.vendorId as string | undefined,
        jobWorkOrderId: req.query.jobWorkOrderId as string | undefined,
        skip,
        take: limit
      });

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit
        },
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const returnReceipt = await this.repository.findReturnById(req.params.id);
      if (!returnReceipt) throw new NotFoundError(`Return Receipt [${req.params.id}] not found.`);

      res.json({
        success: true,
        data: returnReceipt,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  // Custody Ledger
  listCustodyLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const skip = (page - 1) * limit;

      const result = await this.repository.listCustodyLedger({
        vendorId: req.query.vendorId as string | undefined,
        jobWorkOrderId: req.query.jobWorkOrderId as string | undefined,
        materialId: req.query.materialId as string | undefined,
        productId: req.query.productId as string | undefined,
        skip,
        take: limit
      });

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit
        },
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getVendorCustodyBalances = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const balances = await this.service.getVendorCustodyBalances(req.query.vendorId as string | undefined);

      res.json({
        success: true,
        data: balances,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  // Reconciliation
  reconcileOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user?.id || 'system';
      const reconciliation = await this.service.reconcileOrder(req.body, actorId, { requestId: req.id });

      res.status(201).json({
        success: true,
        data: reconciliation,
        message: 'Job Work reconciliation completed.',
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  listReconciliations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const skip = (page - 1) * limit;

      const result = await this.repository.listReconciliations({
        jobWorkOrderId: req.query.jobWorkOrderId as string | undefined,
        status: req.query.status as any,
        skip,
        take: limit
      });

      res.json({
        success: true,
        data: {
          items: result.items,
          total: result.total,
          page,
          limit
        },
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  // Analytics & Summary
  getAnalyticsSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.getAnalyticsSummary();

      res.json({
        success: true,
        data: summary,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };

  getVendorScoring = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
      const report = await vendorScoringService.scoreVendors('OUTSOURCING', vendorId);

      res.json({
        success: true,
        data: report,
        requestId: req.id
      });
    } catch (error) {
      next(error);
    }
  };
}

