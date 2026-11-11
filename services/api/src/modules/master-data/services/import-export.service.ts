import {
  MasterDataImportBatch,
  MasterDataImportRow,
  ImportBatchStatus,
  ImportRowStatus,
  LifecycleStatus,
  Prisma
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import {
  createProductSchema,
  createMaterialSchema,
  createUomSchema,
  createVendorSchema,
  createCustomerSchema
} from '@plinth/validation';
import { ZodSchema, ZodError } from 'zod';
import crypto from 'crypto';
import { ImportRepository } from '../repositories/import.repository';
import { ProductsService } from './products.service';
import { MaterialsService } from './materials.service';
import { UomService } from './uom.service';
import { VendorsService } from './vendors.service';
import { CustomersService } from './customers.service';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
export class ImportExportService {
  constructor(
    private readonly importRepository: ImportRepository,
    private readonly productsService: ProductsService,
    private readonly materialsService: MaterialsService,
    private readonly uomService: UomService,
    private readonly vendorsService: VendorsService,
    private readonly customersService: CustomersService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  private getSchemaForEntity(entityType: string): ZodSchema | null {
    switch (entityType.toUpperCase()) {
      case 'PRODUCT':
        return createProductSchema;
      case 'MATERIAL':
        return createMaterialSchema;
      case 'UOM':
      case 'UNITOFMEASURE':
        return createUomSchema;
      case 'VENDOR':
        return createVendorSchema;
      case 'CUSTOMER':
        return createCustomerSchema;
      default:
        return null;
    }
  }

  private async findDuplicateEntity(entityType: string, payload: Record<string, unknown>): Promise<string | null> {
    const code = (payload.sku || payload.code) as string;
    if (!code) return null;
    const normalizedCode = code.trim().toUpperCase();

    let existing: { id: string } | null = null;
    switch (entityType.toUpperCase()) {
      case 'PRODUCT':
        existing = await prisma.product.findUnique({ where: { sku: normalizedCode }, select: { id: true } });
        break;
      case 'MATERIAL':
        existing = await prisma.material.findUnique({ where: { code: normalizedCode }, select: { id: true } });
        break;
      case 'UOM':
      case 'UNITOFMEASURE':
        existing = await prisma.unitOfMeasure.findUnique({ where: { code: normalizedCode }, select: { id: true } });
        break;
      case 'VENDOR':
        existing = await prisma.vendor.findUnique({ where: { code: normalizedCode }, select: { id: true } });
        break;
      case 'CUSTOMER':
        existing = await prisma.customer.findUnique({ where: { code: normalizedCode }, select: { id: true } });
        break;
    }
    return existing ? existing.id : null;
  }

  async stageBatch(params: {
    entityType: string;
    filename?: string | null;
    rows: Array<Record<string, unknown>>;
    actorId: string;
    requestId?: string;
  }): Promise<{ batch: MasterDataImportBatch; preview: Array<Record<string, unknown>> }> {
    const hasPerm = await this.permissionChecker.can(params.actorId, 'import', 'MasterData');
    if (!hasPerm) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to import master data.`);
    }

    const entityType = params.entityType.toUpperCase();
    const schema = this.getSchemaForEntity(entityType);
    if (!schema) {
      throw new ValidationError(`Unsupported entity type for staged import: [${params.entityType}]`);
    }

    const batchNumber = `IMP-${entityType}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const batch = await this.importRepository.createBatch({
      batchNumber,
      entityType,
      importedBy: params.actorId,
      metadata: (params.filename ? { filename: params.filename } : {}) as Prisma.InputJsonValue,
      status: 'PENDING_VALIDATION',
      totalRows: params.rows.length,
      validRows: 0,
      invalidRows: 0,
      committedRows: 0
    });

    let validCount = 0;
    let invalidCount = 0;

    const rowInserts: Prisma.MasterDataImportRowCreateManyInput[] = [];
    const previewList: Array<Record<string, unknown>> = [];

    for (let idx = 0; idx < params.rows.length; idx++) {
      const row = params.rows[idx];
      const rowNumber = idx + 1;
      let status: ImportRowStatus = 'VALID';
      let validationErrors: Array<{ field: string; message: string }> | null = null;
      let parsedPayload = row;
      let duplicateMatchId: string | null = null;

      try {
        parsedPayload = schema.parse(row) as Record<string, unknown>;
        
        duplicateMatchId = await this.findDuplicateEntity(entityType, parsedPayload);
        if (duplicateMatchId) {
          status = 'DUPLICATE_FLAGGED';
        } else {
          validCount++;
        }
      } catch (err) {
        status = 'INVALID';
        invalidCount++;
        if (err instanceof ZodError) {
          validationErrors = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message
          }));
        } else {
          validationErrors = [{ field: 'root', message: (err as Error).message }];
        }
      }

      rowInserts.push({
        batchId: batch.id,
        rowNumber,
        rawData: row as Prisma.InputJsonValue,
        normalizedData: (parsedPayload || {}) as Prisma.InputJsonValue,
        errors: (validationErrors ? validationErrors : Prisma.JsonNull) as Prisma.InputJsonValue,
        status,
        duplicateMatchId
      });

      previewList.push({
        rowNumber,
        status,
        errors: validationErrors,
        duplicateMatchId,
        data: row
      });
    }

    await this.importRepository.bulkInsertRows(rowInserts);

    const finalStatus: ImportBatchStatus = invalidCount === 0 ? 'VALIDATED' : 'PENDING_VALIDATION';
    const updatedBatch = await this.importRepository.updateBatchStatus(batch.id, finalStatus, {
      validRows: validCount,
      invalidRows: invalidCount
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'master_data.import_stage',
      entityType: 'MasterDataImportBatch',
      entityId: updatedBatch.id,
      after: {
        batchNumber: updatedBatch.batchNumber,
        totalRows: updatedBatch.totalRows,
        validRows: validCount,
        invalidRows: invalidCount
      },
      requestId: params.requestId
    });

    return { batch: updatedBatch, preview: previewList };
  }

  async getBatchPreview(batchId: string): Promise<{
    batch: MasterDataImportBatch;
    rows: MasterDataImportRow[];
  }> {
    const batch = await this.importRepository.findBatchById(batchId);
    if (!batch) throw new NotFoundError(`Import Batch [${batchId}] not found.`);
    return { batch, rows: batch.rows };
  }

  async resolveDuplicateRow(params: {
    batchId: string;
    rowId: string;
    decision: string;
    newCode?: string;
    actorId: string;
    requestId?: string;
  }): Promise<MasterDataImportRow> {
    const hasPerm = await this.permissionChecker.can(params.actorId, 'import', 'MasterData');
    if (!hasPerm) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to resolve duplicates.`);
    }

    const batch = await this.importRepository.findBatchById(params.batchId);
    if (!batch) throw new NotFoundError(`Import Batch [${params.batchId}] not found.`);
    
    if (batch.status === 'COMMITTED') {
      throw new ValidationError(`Batch [${batch.batchNumber}] has already been fully committed.`);
    }

    const row = batch.rows.find(r => r.id === params.rowId);
    if (!row) throw new NotFoundError(`Import Row [${params.rowId}] not found in batch.`);

    if (row.status !== 'DUPLICATE_FLAGGED') {
      throw new ValidationError(`Row [${params.rowId}] is not flagged as a duplicate.`);
    }

    let status: ImportRowStatus = 'VALID';
    let updatedNormalizedData = row.normalizedData as Record<string, unknown> | null;

    if (params.decision === 'SKIP') {
      status = 'SKIPPED';
    } else if (params.decision === 'CREATE_NEW') {
      const codeToUse = params.newCode || (updatedNormalizedData?.sku as string) || (updatedNormalizedData?.code as string);
      const newPayload = { ...(updatedNormalizedData || {}), sku: codeToUse, code: codeToUse };
      const conflict = await this.findDuplicateEntity(batch.entityType, newPayload);
      if (conflict) {
        throw new ConflictError(`The code/sku [${codeToUse}] is already in use.`);
      }
      updatedNormalizedData = newPayload;
    } else if (params.decision === 'FLAG_MERGE') {
       // status remains 'VALID', commitBatch will handle the update
       // To avoid unique constraint violations, we will suffix the code during commit,
       // but for now, we just accept the decision.
    } else {
       throw new ValidationError(`Unknown resolution decision: [${params.decision}]`);
    }

    const updatedRow = await prisma.masterDataImportRow.update({
      where: { id: params.rowId },
      data: {
        status,
        resolutionDecision: params.decision,
        ...(updatedNormalizedData ? { normalizedData: updatedNormalizedData as Prisma.InputJsonValue } : {})
      }
    });
    
    // Also update batch validRows count if it changes
    if (status === 'VALID' || status === 'SKIPPED') {
       const counts = await prisma.masterDataImportRow.groupBy({
         by: ['status'],
         where: { batchId: batch.id },
         _count: true
       });
       const getCount = (s: string) => counts.find(c => c.status === s)?._count || 0;
       await this.importRepository.updateBatchStatus(batch.id, batch.status, {
          validRows: getCount('VALID') + getCount('COMMITTED') + (status === 'VALID' ? 1 : 0)
       });
    }

    return updatedRow;
  }

  async commitBatch(params: {
    batchId: string;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<{
    batch: MasterDataImportBatch;
    committedCount: number;
    skippedCount: number;
    failedRows: Array<{ rowNumber: number; reason: string }>;
  }> {
    const hasPerm = await this.permissionChecker.can(params.actorId, 'import', 'MasterData');
    if (!hasPerm) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to commit import batch.`);
    }

    const batch = await this.importRepository.findBatchById(params.batchId);
    if (!batch) throw new NotFoundError(`Import Batch [${params.batchId}] not found.`);

    if (batch.status === 'COMMITTED') {
      throw new ValidationError(`Batch [${batch.batchNumber}] has already been fully committed.`);
    }

    const rows = await this.importRepository.listRowsByBatch(params.batchId);
    let committedCount = 0;
    let skippedCount = 0;
    const failedRows: Array<{ rowNumber: number; reason: string }> = [];

    for (const row of rows) {
      if (row.status !== 'VALID') {
        skippedCount++;
        await this.importRepository.updateRowDecision(row.id, 'SKIPPED_DUE_TO_VALIDATION_ERRORS', 'SKIPPED');
        continue;
      }

      const payload = (row.normalizedData || row.rawData) as Record<string, unknown>;
      
      if (row.resolutionDecision === 'FLAG_MERGE' && row.duplicateMatchId) {
        // Handle FLAG_MERGE: Suffix the code to bypass unique constraint and link via metadata
        const codeKey = batch.entityType === 'PRODUCT' ? 'sku' : 'code';
        const originalCode = payload[codeKey];
        payload[codeKey] = `${originalCode}__MERGE__${row.id}`;
        payload.metadata = {
          ...(payload.metadata as object || {}),
          mergeTargetId: row.duplicateMatchId,
          originalCode
        };
      }

      try {
        let createdEntityId: string | null = null;
        switch (batch.entityType) {
          case 'PRODUCT': {
            const prod = await this.productsService.createProduct({
              sku: payload.sku as string,
              name: payload.name as string,
              description: payload.description as string | undefined,
              categoryId: payload.categoryId as string,
              productFamilyId: payload.productFamilyId as string,
              uomId: payload.uomId as string,
              minStockLevel: payload.minStockLevel as number | undefined,
              reorderPoint: payload.reorderPoint as number | undefined,
              leadTimeDays: payload.leadTimeDays as number | undefined,
              costPrice: payload.costPrice as number | undefined,
              sellingPrice: payload.sellingPrice as number | undefined,
              metadata: payload.metadata as Record<string, unknown> | undefined,
              actorId: params.actorId,
              activateImmediately: params.activateImmediately,
              requestId: params.requestId
            });
            createdEntityId = prod.id;
            break;
          }
          case 'MATERIAL': {
            const mat = await this.materialsService.createMaterial({
              code: payload.code as string,
              name: payload.name as string,
              description: payload.description as string | undefined,
              materialType: payload.materialType as 'RAW_MATERIAL' | 'HARDWARE' | 'PACKAGING' | 'COMPONENT',
              uomId: payload.uomId as string,
              categoryId: payload.categoryId as string | undefined,
              specs: (payload.specs as Record<string, unknown>) || {},
              minStockLevel: payload.minStockLevel as number | undefined,
              reorderPoint: payload.reorderPoint as number | undefined,
              leadTimeDays: payload.leadTimeDays as number | undefined,
              standardCost: payload.standardCost as number | undefined,
              actorId: params.actorId,
              activateImmediately: params.activateImmediately,
              requestId: params.requestId
            });
            createdEntityId = mat.id;
            // Update metadata for material since createMaterial doesn't have metadata param
            if (row.resolutionDecision === 'FLAG_MERGE') {
               await prisma.material.update({ where: { id: mat.id }, data: { specs: { ...(mat.specs as object), _metadata: payload.metadata as Prisma.InputJsonValue } } });
            }
            break;
          }
          case 'UOM':
          case 'UNITOFMEASURE': {
            const uom = await this.uomService.createUom({
              code: payload.code as string,
              name: payload.name as string,
              symbol: payload.symbol as string,
              dimension: payload.dimension as string | undefined,
              isBaseUnit: payload.isBaseUnit as boolean | undefined,
              actorId: params.actorId,
              requestId: params.requestId
            });
            createdEntityId = uom.id;
            break;
          }
          case 'VENDOR': {
            const vendor = await this.vendorsService.createVendor({
              code: payload.code as string,
              name: payload.name as string,
              legalName: payload.legalName as string | undefined,
              taxNumber: (payload.taxNumber || payload.taxId) as string | undefined,
              contactEmail: payload.contactEmail as string | undefined,
              contactPhone: payload.contactPhone as string | undefined,
              paymentTerms: payload.paymentTerms as string | undefined,
              currency: payload.currency as string | undefined,
              leadTimeDays: payload.leadTimeDays as number | undefined,
              address: payload.address as Record<string, unknown> | undefined,
              actorId: params.actorId,
              requestId: params.requestId
            });
            createdEntityId = vendor.id;
            break;
          }
          case 'CUSTOMER': {
            const customer = await this.customersService.createCustomer({
              code: payload.code as string,
              name: payload.name as string,
              legalName: payload.legalName as string | undefined,
              taxNumber: (payload.taxNumber || payload.taxId) as string | undefined,
              contactEmail: payload.contactEmail as string | undefined,
              contactPhone: payload.contactPhone as string | undefined,
              creditLimit: payload.creditLimit as number | undefined,
              paymentTerms: payload.paymentTerms as string | undefined,
              currency: payload.currency as string | undefined,
              billingAddress: payload.billingAddress as Record<string, unknown> | undefined,
              shippingAddress: payload.shippingAddress as Record<string, unknown> | undefined,
              actorId: params.actorId,
              requestId: params.requestId
            });
            createdEntityId = customer.id;
            break;
          }
          default:
            throw new Error(`Unsupported entity type: ${batch.entityType}`);
        }

        if (createdEntityId) {
          // Imported items always land as PENDING_VALIDATION.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let model: any;
          switch(batch.entityType.toUpperCase()) {
             case 'PRODUCT': model = prisma.product; break;
             case 'MATERIAL': model = prisma.material; break;
             case 'UOM':
             case 'UNITOFMEASURE': model = prisma.unitOfMeasure; break;
             case 'VENDOR': model = prisma.vendor; break;
             case 'CUSTOMER': model = prisma.customer; break;
          }
          if (model) {
             await model.update({ where: { id: createdEntityId }, data: { status: 'PENDING_VALIDATION' } });
          }
        }

        committedCount++;
        await this.importRepository.updateRowDecision(row.id, 'COMMITTED_SUCCESSFULLY', 'COMMITTED');
      } catch (applyError) {
        const errorMsg = (applyError as Error).message;
        failedRows.push({ rowNumber: row.rowNumber, reason: errorMsg });
        await this.importRepository.updateRowDecision(row.id, `FAILED: ${errorMsg}`, 'INVALID');
      }
    }

    const finalBatchStatus: ImportBatchStatus =
      failedRows.length === 0 && skippedCount === 0
        ? 'COMMITTED'
        : committedCount > 0
        ? 'PARTIALLY_COMMITTED'
        : 'FAILED';

    const updatedBatch = await this.importRepository.updateBatchStatus(batch.id, finalBatchStatus, {
      committedRows: committedCount
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'master_data.import_commit',
      entityType: 'MasterDataImportBatch',
      entityId: updatedBatch.id,
      after: {
        status: finalBatchStatus,
        committedCount,
        skippedCount,
        failedRows
      },
      requestId: params.requestId
    });

    return {
      batch: updatedBatch,
      committedCount,
      skippedCount,
      failedRows
    };
  }

  async exportData(params: {
    entityType: string;
    status?: string;
    actorId: string;
    requestId?: string;
  }): Promise<{ entityType: string; total: number; items: unknown[] }> {
    const hasPerm = await this.permissionChecker.can(params.actorId, 'export', 'MasterData');
    if (!hasPerm) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to export master data.`);
    }

    const entityType = params.entityType.toUpperCase();
    let items: unknown[] = [];

    switch (entityType) {
      case 'PRODUCT': {
        const res = await this.productsService.listProducts({
          status: params.status as LifecycleStatus | undefined
        });
        items = res.items;
        break;
      }
      case 'MATERIAL': {
        const res = await this.materialsService.listMaterials({
          status: params.status as LifecycleStatus | undefined
        });
        items = res.items;
        break;
      }
      case 'UOM':
      case 'UNITOFMEASURE': {
        const res = await this.uomService.listUoms({
          status: params.status as LifecycleStatus | undefined
        });
        items = res.items;
        break;
      }
      case 'VENDOR': {
        const res = await this.vendorsService.listVendors({
          status: params.status as LifecycleStatus | undefined
        });
        items = res.items;
        break;
      }
      case 'CUSTOMER': {
        const res = await this.customersService.listCustomers({
          status: params.status as LifecycleStatus | undefined
        });
        items = res.items;
        break;
      }
      default:
        throw new ValidationError(`Unsupported entity type for export: [${params.entityType}]`);
    }

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'master_data.export',
      entityType: 'ExportPayload',
      entityId: entityType,
      after: { entityType, count: items.length, statusFilter: params.status },
      requestId: params.requestId
    });

    return {
      entityType,
      total: items.length,
      items
    };
  }
}
