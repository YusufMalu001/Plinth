import { Request, Response, NextFunction } from 'express';
import { BomStatus } from '@prisma/client';
import { BomVersionService } from '../services/bom-version.service';
import { ValidationError } from '../../../common/errors/AppError';

export class BomVersionController {
  constructor(private readonly service: BomVersionService) {}

  checkName = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
      const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId.trim() : undefined;
      if (!name || name.length > 100) throw new ValidationError('Enter a BOM name of up to 100 characters.');
      const exists = await this.service.isBomNameTaken(name, excludeId);
      res.status(200).json({ success: true, data: { exists }, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || Number(req.query.take) || 50;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : (page - 1) * limit;

      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const validStatus = rawStatus && Object.values(BomStatus).includes(rawStatus as BomStatus)
        ? (rawStatus as BomStatus)
        : undefined;

      const rawProductId = typeof req.query.productId === 'string' ? req.query.productId.trim() : undefined;
      const productId = rawProductId && rawProductId !== '' && rawProductId !== 'all' ? rawProductId : undefined;
      const rawMaterialId = typeof req.query.materialId === 'string' ? req.query.materialId.trim() : undefined;
      const materialId = rawMaterialId && rawMaterialId !== '' && rawMaterialId !== 'all' ? rawMaterialId : undefined;

      const rawVariantId = typeof req.query.productVariantId === 'string' ? req.query.productVariantId.trim() : undefined;
      const productVariantId = rawVariantId && rawVariantId !== '' && rawVariantId !== 'all' ? rawVariantId : undefined;

      const result = await this.service.list({
        productId,
        materialId,
        productVariantId,
        status: validStatus,
        search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
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

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getHistory(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  compare = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fromId, toId } = req.query as { fromId: string; toId: string };
      const result = await this.service.compareVersions(fromId, toId);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.createDraft(req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.updateDraft(req.params.id, req.body, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  deleteDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.deleteDraft(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  deleteDrafts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== 'string')) {
        throw new ValidationError('Provide an array of BOM IDs to delete.');
      }
      const result = await this.service.deleteDrafts(ids, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  detachFromItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.detachFromItem(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  validate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.validate(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.approve(req.params.id, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  supersede = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.supersede(req.params.id, req.body, req.user?.id || 'system', req.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  addGoldenExample = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.addGoldenExample(req.params.id, req.body, req.user?.id || 'system', req.id);
      res.status(201).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  listGoldenExamples = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listGoldenExamples(req.params.id);
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  calculate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.query as Record<string, unknown>;
      const requestedQuantity = Number(raw.requestedQuantity ?? raw.quantity);
      const requestedUomId = String(raw.requestedUomId ?? raw.uomId ?? '');
      const result = await this.service.calculateRequirements(
        {
          productId: String(raw.productId ?? ''),
          productVariantId: raw.productVariantId ? String(raw.productVariantId) : undefined,
          requestedQuantity,
          requestedUomId,
          date: raw.date ? new Date(String(raw.date)) : undefined
        },
        req.user?.id || 'system'
      );
      res.status(200).json({ success: true, data: result, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };
}
