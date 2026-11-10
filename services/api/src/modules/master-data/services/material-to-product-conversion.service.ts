import { randomUUID } from 'crypto';
import { LifecycleStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../database';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors/AppError';

/** Convert an active Finished Goods material without dropping its BOM or stock history. */
export class MaterialToProductConversionService {
  async convert(materialId: string, actorId: string, requestId?: string) {
    return prisma.$transaction(async (tx) => {
      const db = tx as any;
      const material = await db.material.findUnique({ where: { id: materialId } });
      if (!material) throw new NotFoundError(`Material [${materialId}] not found.`);
      const specs = (material.specs || {}) as Record<string, unknown>;
      if (typeof specs.convertedToProductId === 'string') {
        const converted = await db.product.findUnique({ where: { id: specs.convertedToProductId } });
        if (converted) return converted;
      }
      if (!['ACTIVE', 'APPROVED'].includes(material.status)) {
        throw new ValidationError('Only an active or approved material can be converted.');
      }

      const category = material.categoryId ? await db.category.findUnique({ where: { id: material.categoryId } }) : null;
      if (!category || !/finished[\s_-]*goods?/i.test(`${category.code} ${category.name}`)) {
        throw new ValidationError('Choose a Finished Goods category before converting this material.');
      }
      if (!['ACTIVE', 'APPROVED'].includes(category.status)) throw new ValidationError('The Finished Goods category must be active.');
      const familyId = typeof specs.productFamilyId === 'string' ? specs.productFamilyId : null;
      const family = familyId ? await db.productFamily.findUnique({ where: { id: familyId } }) : null;
      if (!family || family.categoryId !== category.id || !['ACTIVE', 'APPROVED'].includes(family.status)) {
        throw new ValidationError('Choose an active subcategory under the selected Finished Goods category.');
      }

      const variants = await db.material.findMany({
        where: { specs: { path: ['parentMaterialId'], equals: materialId }, status: { in: ['ACTIVE', 'APPROVED'] } },
        orderBy: { createdAt: 'asc' },
      });
      const materialIds = [materialId, ...variants.map((row: any) => row.id)];
      const [skuConflict, nameConflict, otherMaterialConflict] = await Promise.all([
        db.product.findUnique({ where: { sku: material.code }, select: { id: true } }),
        db.product.findFirst({ where: { name: { equals: material.name, mode: 'insensitive' } }, select: { id: true } }),
        db.material.findFirst({ where: { id: { notIn: materialIds }, name: { equals: material.name, mode: 'insensitive' }, status: { notIn: ['INACTIVE', 'SUPERSEDED'] } }, select: { id: true } }),
      ]);
      if (skuConflict || nameConflict || otherMaterialConflict) {
        throw new ConflictError('A Product or active inventory item already uses this name or code. Resolve the duplicate before conversion.');
      }

      // These records have material-specific business meaning. Refuse conversion
      // rather than silently relabeling purchasing, consumption, or job-work history.
      const blockers: Array<[string, string]> = [
        ['purchaseRequisitionLine', 'purchase requisitions'], ['purchaseOrderLine', 'purchase orders'],
        ['goodsReceiptLine', 'goods receipts'], ['debitNoteLine', 'debit notes'],
        ['salesPackageMaterialUsage', 'sales package material usage'], ['bomLine', 'other BOM component lines'],
        ['materialIssueLine', 'material issues'], ['stockAdjustment', 'stock adjustments'],
        ['stockIssue', 'stock issues'], ['stockReservation', 'stock reservations'],
        ['stockTransfer', 'stock transfers'], ['stockSnapshot', 'stock snapshots'],
        ['lossEvent', 'loss events'], ['replacementChallan', 'replacement challans'],
        ['jobWorkOrderLine', 'job-work orders'], ['jobWorkMaterialIssue', 'job-work material issues'],
        ['jobWorkCustodyLedger', 'job-work custody records'], ['wastageRule', 'wastage rules'],
        ['jobWorkReceiptReturn', 'job-work returns'], ['packSize', 'pack sizes'],
      ];
      const linked = await Promise.all(blockers.map(async ([delegate, label]) => {
        const count = await db[delegate].count({ where: { materialId: { in: materialIds } } });
        return count ? `${count} ${label}` : null;
      }));
      const blockingLinks = linked.filter(Boolean);
      if (blockingLinks.length) throw new ConflictError(`Conversion is blocked by ${blockingLinks.join(', ')}. Resolve or migrate those records first.`);

      const childStockCount = await db.stockBalance.count({
        where: { materialId: { in: materialIds.slice(1) }, OR: [{ onHandQuantity: { not: 0 } }, { reservedQuantity: { not: 0 } }] },
      });
      const childLedgerCount = await db.stockLedgerEntry.count({ where: { materialId: { in: materialIds.slice(1) } } });
      const childCapabilityCount = await db.vendorCapability.count({ where: { materialId: { in: materialIds.slice(1) } } });
      if (childStockCount || childLedgerCount || childCapabilityCount) {
        throw new ConflictError('Variant stock or vendor-specific history exists. Variant records must be migrated before conversion.');
      }

      const productId = randomUUID();
      const conversionMetadata = {
        ...specs,
        productType: 'Goods',
        convertedFromMaterialId: material.id,
        convertedFromMaterialCode: material.code,
        convertedByActorId: actorId,
        convertedAt: new Date().toISOString(),
        conversionRequestId: requestId || null,
      };
      const product = await db.product.create({ data: {
        id: productId, sku: material.code, name: material.name, description: material.description,
        productFamilyId: family.id, categoryId: category.id, uomId: material.uomId,
        status: material.status as LifecycleStatus, version: 1,
        traceabilityMode: material.traceabilityMode, expiryTracking: material.expiryTracking,
        issueStrategy: material.issueStrategy, shelfLifeWarningDays: material.shelfLifeWarningDays,
        defaultReceivingLocationId: material.defaultReceivingLocationId,
        defaultPickingLocationId: material.defaultPickingLocationId,
        metadata: conversionMetadata as Prisma.InputJsonValue,
      } });

      const variantIds = new Map<string, string>();
      for (const variant of variants) {
        const variantSkuConflict = await db.productVariant.findUnique({ where: { sku: variant.code }, select: { id: true } });
        if (variantSkuConflict) throw new ConflictError(`Variant code [${variant.code}] is already used by a Product.`);
        const variantProduct = await db.productVariant.create({ data: {
          id: randomUUID(), productId, sku: variant.code, name: variant.name,
          status: variant.status as LifecycleStatus,
          specifications: { ...(variant.specs || {}), convertedFromMaterialId: variant.id } as Prisma.InputJsonValue,
        } });
        variantIds.set(variant.id, variantProduct.id);
      }
      const remapVariantMetadata = (value: unknown) => Array.isArray(value)
        ? value.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry;
          const row = entry as Record<string, unknown>;
          const oldId = typeof row.id === 'string' ? row.id : '';
          const newId = variantIds.get(oldId);
          return newId ? { ...row, id: newId, productRecordId: newId } : row;
        })
        : value;
      await db.product.update({ where: { id: productId }, data: { metadata: {
        ...conversionMetadata,
        variants: remapVariantMetadata(specs.variants),
        measurementVariants: remapVariantMetadata(specs.measurementVariants),
      } as Prisma.InputJsonValue } });

      for (const sourceMaterialId of materialIds) {
        const productVariantId = variantIds.get(sourceMaterialId) || null;
        await db.bomVersion.updateMany({
          where: { materialId: sourceMaterialId },
          data: { materialId: null, productId, productVariantId },
        });
        await db.productRoute.updateMany({
          where: { materialId: sourceMaterialId },
          data: { materialId: null, productId, productVariantId },
        });
        await db.stockLedgerEntry.updateMany({
          where: { materialId: sourceMaterialId }, data: { materialId: null, productId },
        });
        if (sourceMaterialId === materialId) {
          await db.stockBalance.updateMany({
            where: { materialId: sourceMaterialId },
            data: { materialId: null, productId, itemKey: `PRODUCT:${productId}` },
          });
        }
      }
      await db.vendorCapability.updateMany({
        where: { materialId: materialId },
        data: { materialId: null, productId },
      });

      await db.material.updateMany({
        where: { id: { in: materialIds } },
        data: { status: 'SUPERSEDED', deactivatedAt: new Date() },
      });
      await db.material.update({
        where: { id: materialId },
        data: { specs: { ...specs, convertedToProductId: productId, convertedAt: new Date().toISOString() } as Prisma.InputJsonValue },
      });
      await db.auditLog.create({ data: {
        userId: actorId, action: 'material.convert_to_product', resource: 'Product', resourceId: productId,
        before: { materialId, code: material.code, name: material.name } as Prisma.InputJsonValue,
        after: { productId, sku: product.sku, name: product.name, categoryId: category.id, productFamilyId: family.id } as Prisma.InputJsonValue,
        requestId: requestId || 'system',
      } });

      return db.product.findUniqueOrThrow({
        where: { id: productId }, include: { category: true, productFamily: true, uom: true, variants: true, bomVersions: true },
      });
    }, { timeout: 30000 });
  }
}

export const materialToProductConversionService = new MaterialToProductConversionService();
