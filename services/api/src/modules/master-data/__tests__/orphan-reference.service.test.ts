import { describe, it, expect, jest } from '@jest/globals';
import { ProductsService } from '../services/products.service';
import { UomService } from '../services/uom.service';
import { OrgStructureService } from '../services/org-structure.service';
import { ProductsRepository } from '../repositories/products.repository';
import { UomRepository } from '../repositories/uom.repository';
import { OrgStructureRepository } from '../repositories/org-structure.repository';
import { AllowAllPermissionChecker, ConsoleAuditWriter } from '@synergy/types';
import { ReferentialIntegrityError } from '../../../common/errors/AppError';

describe('Orphan-Reference Prevention Before Deactivation', () => {
  const permissionChecker = new AllowAllPermissionChecker();
  const auditWriter = new ConsoleAuditWriter();

  describe('ProductsService - Category Deactivation Reference Guard', () => {
    it('should block deactivation when Category has active subcategories or products', async () => {
      const mockRepo = {
        findCategoryById: jest.fn<any>().mockResolvedValue({ id: 'cat-1', code: 'CABLES', status: 'ACTIVE' }),
        countCategoryActiveReferences: jest.fn<any>().mockResolvedValue({
          childCategories: 2,
          productFamilies: 1,
          products: 5,
          materials: 0
        })
      } as unknown as ProductsRepository;

      const service = new ProductsService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.updateCategoryStatus({
          id: 'cat-1',
          targetStatus: 'INACTIVE',
          actorId: 'admin-1'
        })
      ).rejects.toThrow(ReferentialIntegrityError);

      expect(mockRepo.countCategoryActiveReferences).toHaveBeenCalledWith('cat-1');
    });

    it('should allow deactivation when Category has 0 active references', async () => {
      const mockRepo = {
        findCategoryById: jest.fn<any>().mockResolvedValue({ id: 'cat-empty', code: 'EMPTY', status: 'ACTIVE' }),
        countCategoryActiveReferences: jest.fn<any>().mockResolvedValue({
          childCategories: 0,
          productFamilies: 0,
          products: 0,
          materials: 0
        }),
        updateCategory: jest.fn<any>().mockResolvedValue({ id: 'cat-empty', code: 'EMPTY', status: 'INACTIVE' })
      } as unknown as ProductsRepository;

      const service = new ProductsService(mockRepo, permissionChecker, auditWriter);

      const result = await service.updateCategoryStatus({
        id: 'cat-empty',
        targetStatus: 'INACTIVE',
        actorId: 'admin-1'
      });

      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('UomService - UOM Deactivation Reference Guard', () => {
    it('should block deactivation when UnitOfMeasure is actively referenced by products/materials', async () => {
      const mockRepo = {
        findUomById: jest.fn<any>().mockResolvedValue({ id: 'uom-kg', code: 'KG', status: 'ACTIVE' }),
        countUomActiveReferences: jest.fn<any>().mockResolvedValue({
          products: 10,
          materials: 25,
          conversions: 2,
          packSizes: 4
        })
      } as unknown as UomRepository;

      const service = new UomService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.transitionUomStatus({
          id: 'uom-kg',
          targetStatus: 'INACTIVE',
          actorId: 'admin-1'
        })
      ).rejects.toThrow(ReferentialIntegrityError);
    });
  });

  describe('OrgStructureService - Department & WorkCenter Deactivation Guard', () => {
    it('should block Department deactivation when active WorkCenters or Employees exist', async () => {
      const mockRepo = {
        findDepartmentById: jest.fn<any>().mockResolvedValue({ id: 'dept-1', code: 'EXTRUSION', status: 'ACTIVE' }),
        countDepartmentActiveReferences: jest.fn<any>().mockResolvedValue({
          workCenters: 3,
          employees: 12,
          routeSteps: 5
        })
      } as unknown as OrgStructureRepository;

      const service = new OrgStructureService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.transitionDepartmentStatus({
          id: 'dept-1',
          targetStatus: 'INACTIVE',
          actorId: 'admin-1'
        })
      ).rejects.toThrow(ReferentialIntegrityError);
    });
  });
});
