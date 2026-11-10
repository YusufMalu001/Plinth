import { describe, it, expect, jest } from '@jest/globals';
import { ProductsService } from '../services/products.service';
import { MaterialsService } from '../services/materials.service';
import { UomService } from '../services/uom.service';
import { ProductsRepository } from '../repositories/products.repository';
import { MaterialsRepository } from '../repositories/materials.repository';
import { UomRepository } from '../repositories/uom.repository';
import { AllowAllPermissionChecker, AuditWriter, AuditEvent } from '@synergy/types';

describe('AuditWriter Event Emission Verification', () => {
  const permissionChecker = new AllowAllPermissionChecker();

  it('should emit an audit event on product creation', async () => {
    const recordedEvents: AuditEvent[] = [];
    const mockAuditWriter: AuditWriter = {
      async record(event: AuditEvent): Promise<void> {
        recordedEvents.push(event);
      }
    };

    const mockRepo = {
      findProductBySku: jest.fn<any>().mockResolvedValue(null),
      findInventoryNameConflict: jest.fn<any>().mockResolvedValue(null),
      findUomById: jest.fn<any>().mockResolvedValue({ id: 'uom-1', status: 'ACTIVE' }),
      findCategoryById: jest.fn<any>().mockResolvedValue({ id: 'cat-1', status: 'ACTIVE' }),
      findFamilyById: jest.fn<any>().mockResolvedValue({ id: 'fam-1', status: 'ACTIVE', categoryId: 'cat-1' }),
      createProduct: jest.fn<any>().mockResolvedValue({ id: 'prod-new', sku: 'SKU-001', status: 'DRAFT', version: 1 })
    } as unknown as ProductsRepository;

    const service = new ProductsService(mockRepo, permissionChecker, mockAuditWriter);

    await service.createProduct({
      sku: 'SKU-001',
      name: 'Test Product',
      categoryId: 'cat-1',
      productFamilyId: 'fam-1',
      uomId: 'uom-1',
      actorId: 'user-actor-123',
      requestId: 'req-abc-999'
    });

    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]).toMatchObject({
      actorId: 'user-actor-123',
      action: 'product.create',
      entityType: 'Product',
      entityId: 'prod-new',
      requestId: 'req-abc-999'
    });
  });

  it('should emit an audit event on material creation', async () => {
    const recordedEvents: AuditEvent[] = [];
    const mockAuditWriter: AuditWriter = {
      async record(event: AuditEvent): Promise<void> {
        recordedEvents.push(event);
      }
    };

    const mockRepo = {
      findByCode: jest.fn<any>().mockResolvedValue(null),
      findInventoryNameConflict: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'mat-new', code: 'MAT-001', status: 'DRAFT', version: 1 })
    } as unknown as MaterialsRepository;
    const mockUomRepo = {
      findUomById: jest.fn<any>().mockResolvedValue({ id: 'uom-kg', status: 'ACTIVE' })
    } as unknown as UomRepository;

    const service = new MaterialsService(mockRepo, mockUomRepo, permissionChecker, mockAuditWriter);

    await service.createMaterial({
      code: 'MAT-001',
      name: 'Copper Sheet',
      materialType: 'RAW_MATERIAL',
      uomId: 'uom-kg',
      specs: { thickness: 2 },
      actorId: 'user-actor-456'
    });

    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]).toMatchObject({
      actorId: 'user-actor-456',
      action: 'material.create',
      entityType: 'Material',
      entityId: 'mat-new'
    });
  });

  it('should create Products and Materials as ACTIVE when the caller is an Admin', async () => {
    const productRepo = {
      findProductBySku: jest.fn<any>().mockResolvedValue(null),
      findInventoryNameConflict: jest.fn<any>().mockResolvedValue(null),
      findUomById: jest.fn<any>().mockResolvedValue({ id: 'uom-1', status: 'ACTIVE' }),
      findCategoryById: jest.fn<any>().mockResolvedValue({ id: 'cat-1', status: 'ACTIVE' }),
      findFamilyById: jest.fn<any>().mockResolvedValue({ id: 'fam-1', status: 'ACTIVE', categoryId: 'cat-1' }),
      createProduct: jest.fn<any>().mockResolvedValue({ id: 'prod-active', sku: 'ACTIVE-001', status: 'ACTIVE', version: 1 })
    } as unknown as ProductsRepository;
    const materialRepo = {
      findByCode: jest.fn<any>().mockResolvedValue(null),
      findInventoryNameConflict: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'mat-active', code: 'ACTIVE-MAT-001', status: 'ACTIVE', version: 1 })
    } as unknown as MaterialsRepository;
    const uomRepo = {
      findUomById: jest.fn<any>().mockResolvedValue({ id: 'uom-1', status: 'ACTIVE' })
    } as unknown as UomRepository;
    const auditWriter: AuditWriter = { record: jest.fn<any>().mockResolvedValue(undefined) };

    await new ProductsService(productRepo, permissionChecker, auditWriter).createProduct({
      sku: 'ACTIVE-001',
      name: 'Admin Product',
      categoryId: 'cat-1',
      productFamilyId: 'fam-1',
      uomId: 'uom-1',
      actorId: 'admin-1',
      activateImmediately: true
    });
    await new MaterialsService(materialRepo, uomRepo, permissionChecker, auditWriter).createMaterial({
      code: 'ACTIVE-MAT-001',
      name: 'Admin Material',
      materialType: 'RAW_MATERIAL',
      uomId: 'uom-1',
      actorId: 'admin-1',
      activateImmediately: true
    });

    expect((productRepo as unknown as { createProduct: jest.Mock }).createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' })
    );
    expect((materialRepo as unknown as { create: jest.Mock }).create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' })
    );
  });

  it('should emit an audit event on UOM creation', async () => {
    const recordedEvents: AuditEvent[] = [];
    const mockAuditWriter: AuditWriter = {
      async record(event: AuditEvent): Promise<void> {
        recordedEvents.push(event);
      }
    };

    const mockUomRepo = {
      findUomByCode: jest.fn<any>().mockResolvedValue(null),
      createUom: jest.fn<any>().mockResolvedValue({ id: 'uom-box', code: 'BOX', status: 'DRAFT' })
    } as unknown as UomRepository;

    const service = new UomService(mockUomRepo, permissionChecker, mockAuditWriter);

    await service.createUom({
      code: 'BOX',
      name: 'Standard Box',
      symbol: 'bx',
      actorId: 'user-actor-789'
    });

    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]).toMatchObject({
      actorId: 'user-actor-789',
      action: 'uom.create',
      entityType: 'UnitOfMeasure',
      entityId: 'uom-box'
    });
  });
});
