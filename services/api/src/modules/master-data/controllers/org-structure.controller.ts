import { Request, Response, NextFunction } from 'express';
import { OrgStructureService } from '../services/org-structure.service';
import { ApiResponse, LifecycleStatus } from '@plinth/types';

export class OrgStructureController {
  constructor(private readonly orgService: OrgStructureService) {}

  // ============================================================================
  // FACTORIES
  // ============================================================================

  createFactory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createFactory({
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

  listFactories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listFactories({
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

  getFactoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getFactoryById(req.params.id);
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

  updateFactory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateFactory(req.params.id, {
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

  transitionFactoryStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionFactoryStatus({
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

  submitFactoryForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionFactoryStatus({
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

  approveFactory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionFactoryStatus({
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

  rejectFactory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.orgService.transitionFactoryStatus({
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

  deactivateFactory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionFactoryStatus({
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
  // DEPARTMENTS
  // ============================================================================

  createDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createDepartment({
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

  listDepartments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listDepartments({
        factoryId: req.query.factoryId as string | undefined,
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

  getDepartmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getDepartmentById(req.params.id);
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

  updateDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateDepartment(req.params.id, {
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

  transitionDepartmentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionDepartmentStatus({
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

  submitDepartmentForValidation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionDepartmentStatus({
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

  approveDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionDepartmentStatus({
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

  rejectDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetStatus: LifecycleStatus = req.body?.targetStatus || 'DRAFT';
      const result = await this.orgService.transitionDepartmentStatus({
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

  deactivateDepartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionDepartmentStatus({
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
  // WORK CENTERS
  // ============================================================================

  createWorkCenter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createWorkCenter({
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

  listWorkCenters = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listWorkCenters({
        departmentId: req.query.departmentId as string | undefined,
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

  getWorkCenterById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getWorkCenterById(req.params.id);
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

  updateWorkCenter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateWorkCenter(req.params.id, {
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

  transitionWorkCenterStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.transitionWorkCenterStatus({
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
  // WAREHOUSE LOCATIONS
  // ============================================================================

  createWarehouseLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createWarehouseLocation({
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

  listWarehouseLocations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listLocations({
        factoryId: req.query.factoryId as string | undefined,
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

  getWarehouseLocationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getLocationById(req.params.id);
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

  updateWarehouseLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateLocation(req.params.id, {
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

  // ============================================================================
  // EMPLOYEES
  // ============================================================================

  createEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createEmployee({
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

  listEmployees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listEmployees({
        departmentId: req.query.departmentId as string | undefined,
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

  getEmployeeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getEmployeeById(req.params.id);
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

  updateEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateEmployee(req.params.id, {
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

  // ============================================================================
  // SALES CHANNELS
  // ============================================================================

  createSalesChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.createSalesChannel({
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

  listSalesChannels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const result = await this.orgService.listSalesChannels({
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

  getSalesChannelById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.getSalesChannelById(req.params.id);
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

  updateSalesChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.orgService.updateSalesChannel(req.params.id, {
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
