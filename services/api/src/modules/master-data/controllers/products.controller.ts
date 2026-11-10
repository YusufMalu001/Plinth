import { Request, Response, NextFunction } from 'express';
import { isAdminActor } from '../../../common/middleware/auth';
import { ProductsService } from '../services/products.service';
import { ApiResponse, LifecycleStatus } from '@synergy/types';
import { uploadProductImages } from '../../../common/storage/supabase-storage';

export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  uploadProductImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (!files.length) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one image is required.' }, requestId: req.id });
        return;
      }
      const images = await uploadProductImages(String(req.body.productKey || 'new-product'), files);
      res.status(201).json({ success: true, data: { images }, requestId: req.id });
    } catch (error) {
      next(error);
    }
  };

  // ============================================================================
  // CATEGORIES
  // ============================================================================

  createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.createCategory({
        ...req.body,
        actorId: req.user?.id || 'system',
        activateImmediately: isAdminActor(req.user),
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.productsService.listCategories({
        parentCategoryId: req.query.parentCategoryId as string | undefined,
        parentId: req.query.parentId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
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

  getCategoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.getCategoryById(req.params.id);
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

  updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateCategory(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  transitionCategoryStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateCategoryStatus({
        id: req.params.id,
        targetStatus: req.body.targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  submitCategoryForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateCategoryStatus({
        id: req.params.id,
        targetStatus: 'PENDING_VALIDATION',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  approveCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateCategoryStatus({
        id: req.params.id,
        targetStatus: 'APPROVED',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  rejectCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.productsService.updateCategoryStatus({
        id: req.params.id,
        targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  deactivateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateCategoryStatus({
        id: req.params.id,
        targetStatus: 'INACTIVE',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  // ============================================================================
  // PRODUCT FAMILIES
  // ============================================================================

  createProductFamily = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.createProductFamily({
        ...req.body,
        actorId: req.user?.id || 'system',
        activateImmediately: isAdminActor(req.user),
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listProductFamilies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.productsService.listProductFamilies({
        categoryId: req.query.categoryId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
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

  getProductFamilyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.getFamilyById(req.params.id);
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

  updateProductFamily = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateProductFamily(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  transitionProductFamilyStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateFamilyStatus({
        id: req.params.id,
        targetStatus: req.body.targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.createProduct({
        ...req.body,
        actorId: req.user?.id || 'system',
        activateImmediately: isAdminActor(req.user),
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await this.productsService.listProducts({
        categoryId: req.query.categoryId as string | undefined,
        productFamilyId: req.query.productFamilyId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
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

  getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.getProductById(req.params.id);
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

  getProductVersionHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.getProductVersionHistory(req.params.id);
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

  updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateProduct(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  transitionProductStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.transitionProductStatus({
        id: req.params.id,
        targetStatus: req.body.targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  submitProductForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.transitionProductStatus({
        id: req.params.id,
        targetStatus: 'PENDING_VALIDATION',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  approveProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.transitionProductStatus({
        id: req.params.id,
        targetStatus: 'APPROVED',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  rejectProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.productsService.transitionProductStatus({
        id: req.params.id,
        targetStatus,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  deactivateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.transitionProductStatus({
        id: req.params.id,
        targetStatus: 'INACTIVE',
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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

  // ============================================================================
  // PRODUCT VARIANTS
  // ============================================================================

  createProductVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.createProductVariant({
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        requestId: req.id
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  listProductVariants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.productsService.listProductVariants({
        productId: req.query.productId as string | undefined,
        status: req.query.status as LifecycleStatus | undefined,
        search: req.query.search as string | undefined,
        skip: (page - 1) * limit,
        take: limit
      });
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

  getProductVariantById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.getVariantById(req.params.id);
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

  updateProductVariant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.productsService.updateProductVariant(req.params.id, {
        ...req.body,
        actorId: req.user?.id || 'system',
        requestId: req.id
      });
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
