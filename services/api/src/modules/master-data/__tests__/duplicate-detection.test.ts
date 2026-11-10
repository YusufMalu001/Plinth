import { describe, it, expect, jest } from '@jest/globals';
import { ProductsService } from '../services/products.service';
import { MaterialsService } from '../services/materials.service';
import { VendorsService } from '../services/vendors.service';
import { CustomersService } from '../services/customers.service';
import { ProductsRepository } from '../repositories/products.repository';
import { MaterialsRepository } from '../repositories/materials.repository';
import { UomRepository } from '../repositories/uom.repository';
import { VendorsRepository } from '../repositories/vendors.repository';
import { CustomersRepository } from '../repositories/customers.repository';
import { AllowAllPermissionChecker, ConsoleAuditWriter } from '@synergy/types';
import { ConflictError } from '../../../common/errors/AppError';

describe('Duplicate Detection Across Master Data Services', () => {
  const permissionChecker = new AllowAllPermissionChecker();
  const auditWriter = new ConsoleAuditWriter();

  describe('ProductsService - Duplicate Detection', () => {
    it('should normalize code and throw ConflictError if category code exists', async () => {
      const mockRepo = {
        findCategoryByCode: jest.fn<any>().mockResolvedValue({ id: 'cat-1', code: 'ELEC-CABLES' })
      } as unknown as ProductsRepository;

      const service = new ProductsService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.createCategory({
          code: '  elec-cables  ',
          name: 'Electrical Cables',
          actorId: 'user-1'
        })
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.findCategoryByCode).toHaveBeenCalledWith('ELEC-CABLES');
    });

    it('should normalize SKU and throw ConflictError if product SKU exists', async () => {
      const mockRepo = {
        findProductBySku: jest.fn<any>().mockResolvedValue({ id: 'prod-1', sku: 'SKU-CAB-001' })
      } as unknown as ProductsRepository;

      const service = new ProductsService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.createProduct({
          sku: 'sku-cab-001 ',
          name: 'Copper Cable 10m',
          categoryId: 'cat-1',
          productFamilyId: 'fam-1',
          uomId: 'uom-1',
          actorId: 'user-1'
        })
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.findProductBySku).toHaveBeenCalledWith('SKU-CAB-001');
    });
  });

  describe('MaterialsService - Duplicate Detection', () => {
    it('should normalize material code and reject duplicate creation', async () => {
      const mockRepo = {
        findByCode: jest.fn<any>().mockResolvedValue({ id: 'mat-1', code: 'RAW-CU-ROD' })
      } as unknown as MaterialsRepository;
      const mockUomRepo = {} as unknown as UomRepository;

      const service = new MaterialsService(mockRepo, mockUomRepo, permissionChecker, auditWriter);

      await expect(
        service.createMaterial({
          code: 'raw-cu-rod',
          name: 'Copper Rod 8mm',
          materialType: 'RAW_MATERIAL',
          uomId: 'uom-1',
          specs: { diameter: 8 },
          actorId: 'user-1'
        })
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.findByCode).toHaveBeenCalledWith('RAW-CU-ROD');
    });
  });

  describe('VendorsService - Duplicate Detection', () => {
    it('should normalize vendor code and reject duplicate creation', async () => {
      const mockRepo = {
        findByCode: jest.fn<any>().mockResolvedValue({ id: 'ven-1', code: 'VEN-IND-001' })
      } as unknown as VendorsRepository;

      const service = new VendorsService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.createVendor({
          code: 'ven-ind-001',
          name: 'Industrial Metals Ltd',
          actorId: 'user-1'
        })
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.findByCode).toHaveBeenCalledWith('VEN-IND-001');
    });
  });

  describe('CustomersService - Duplicate Detection', () => {
    it('should normalize customer code and reject duplicate creation', async () => {
      const mockRepo = {
        findByCode: jest.fn<any>().mockResolvedValue({ id: 'cust-1', code: 'CUST-METRO-001' })
      } as unknown as CustomersRepository;

      const service = new CustomersService(mockRepo, permissionChecker, auditWriter);

      await expect(
        service.createCustomer({
          code: 'cust-metro-001',
          name: 'Metro Retailers',
          actorId: 'user-1'
        })
      ).rejects.toThrow(ConflictError);

      expect(mockRepo.findByCode).toHaveBeenCalledWith('CUST-METRO-001');
    });
  });
});
