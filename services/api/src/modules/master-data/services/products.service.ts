import { Category, ProductFamily, Product, ProductVariant, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { ProductsRepository } from '../repositories/products.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ReferentialIntegrityError, ValidationError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { reorderEvaluatorService } from '../../inventory/services/reorder-evaluator.service';
import { modernReorderEvaluatorService } from '../../inventory/services/modern-reorder-evaluator.service';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import { assertInventoryNameAvailable } from './inventory-name-uniqueness';
import { syncProductInventoryUom } from './sync-product-inventory-uom';
import { assertUomQuantities } from './uom-quantity.validation';
export class ProductsService {
  constructor(
    private readonly repository: ProductsRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async reevaluateProductStock(productId: string): Promise<void> {
    const legacyBalances = await prisma.stockBalance.findMany({ where: { productId }, select: { id: true } });
    if (legacyBalances.length) {
      await Promise.all(legacyBalances.map(balance => reorderEvaluatorService.evaluateAndTrigger(balance.id)));
      return;
    }
    const modernBalances = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory_balances WHERE "itemType" = 'PRODUCT' AND "itemId" = ${productId}
    `;
    await Promise.all(modernBalances.map(balance => modernReorderEvaluatorService.evaluate(balance.id)));
  }

  // ============================================================================
  // CATEGORIES
  // ============================================================================

  async createCategory(params: {
    code: string;
    name: string;
    description?: string;
    parentId?: string;
    parentCategoryId?: string;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<Category> {
    const normalizedCode = ProductsService.normalizeCode(params.code);
    const existing = await this.repository.findCategoryByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Category with code [${normalizedCode}] already exists.`);
    }

    const parentId = params.parentId || params.parentCategoryId;
    if (parentId) {
      const parent = await this.repository.findCategoryById(parentId);
      if (!parent) {
        throw new NotFoundError(`Parent Category [${parentId}] not found.`);
      }
      MasterDataLifecycleService.assertIsReferenceable('Parent Category', parent.id, parent.status);
    }

    const created = await this.repository.createCategory({
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description,
      ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
      // Categories are structural master data, not controlled production
      // records. They are usable immediately after creation; no validation or
      // approval queue is required.
      status: 'ACTIVE'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'category.create',
      entityType: 'Category',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listCategories(params?: {
    parentId?: string | null;
    parentCategoryId?: string | null;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Category[]; total: number }> {
    const parentId = params?.parentId !== undefined ? params.parentId : params?.parentCategoryId;
    return this.repository.listCategories({
      parentId,
      status: params?.status,
      search: params?.search,
      skip: params?.skip,
      take: params?.take
    });
  }

  async getCategoryById(id: string): Promise<Category> {
    const category = await this.repository.findCategoryById(id);
    if (!category) {
      throw new NotFoundError(`Category [${id}] not found.`);
    }
    return category;
  }

  async updateCategory(id: string, params: {
    name?: string;
    description?: string;
    parentId?: string | null;
    actorId: string;
    requestId?: string;
  }): Promise<Category> {
    const category = await this.getCategoryById(id);
    if (params.parentId) {
      const parent = await this.getCategoryById(params.parentId);
      MasterDataLifecycleService.assertIsReferenceable('Parent Category', parent.id, parent.status);
    }

    const updated = await this.repository.updateCategory(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.parentId !== undefined
        ? params.parentId
          ? { parent: { connect: { id: params.parentId } } }
          : { parent: { disconnect: true } }
        : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'category.update',
      entityType: 'Category',
      entityId: updated.id,
      before: category,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async updateCategoryStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Category> {
    const category = await this.getCategoryById(params.id);

    MasterDataLifecycleService.validateTransition(category.status, params.targetStatus, 'Category');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Category'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countCategoryActiveReferences(params.id);
      const totalRefs = refs.childCategories + refs.productFamilies + refs.products + refs.materials;
      if (totalRefs > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Category [${category.code}]. It has active references (${refs.childCategories} subcategories, ${refs.productFamilies} families, ${refs.products} products, ${refs.materials} materials).`,
          refs
        );
      }
    }

    const updated = await this.repository.updateCategory(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: `category.status_change`,
      entityType: 'Category',
      entityId: updated.id,
      before: { status: category.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // PRODUCT FAMILIES
  // ============================================================================

  async createProductFamily(params: {
    code: string;
    name: string;
    description?: string;
    categoryId: string;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<ProductFamily> {
    const normalizedCode = ProductsService.normalizeCode(params.code);
    const existing = await this.repository.findFamilyByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`ProductFamily with code [${normalizedCode}] already exists.`);
    }

    const category = await this.getCategoryById(params.categoryId);
    MasterDataLifecycleService.assertIsReferenceable('Category', category.id, category.status);

    const created = await this.repository.createFamily({
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description,
      category: { connect: { id: params.categoryId } },
      // Families are structural master data and become referenceable as soon
      // as they are created. Product/BOM approval remains separate.
      status: 'ACTIVE'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_family.create',
      entityType: 'ProductFamily',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listProductFamilies(params?: {
    categoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductFamily[]; total: number }> {
    return this.repository.listFamilies(params);
  }

  async getFamilyById(id: string): Promise<ProductFamily> {
    const family = await this.repository.findFamilyById(id);
    if (!family) {
      throw new NotFoundError(`ProductFamily [${id}] not found.`);
    }
    return family;
  }

  async updateProductFamily(id: string, params: {
    name?: string;
    description?: string;
    categoryId?: string;
    actorId: string;
    requestId?: string;
  }): Promise<ProductFamily> {
    const family = await this.getFamilyById(id);
    if (params.categoryId) {
      const category = await this.getCategoryById(params.categoryId);
      MasterDataLifecycleService.assertIsReferenceable('Category', category.id, category.status);
    }

    const updated = await this.repository.updateFamily(id, {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.categoryId ? { category: { connect: { id: params.categoryId } } } : {})
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_family.update',
      entityType: 'ProductFamily',
      entityId: updated.id,
      before: family,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async updateFamilyStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<ProductFamily> {
    const family = await this.getFamilyById(params.id);

    MasterDataLifecycleService.validateTransition(family.status, params.targetStatus, 'ProductFamily');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'ProductFamily'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const activeProducts = await this.repository.countFamilyActiveProducts(params.id);
      if (activeProducts > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate ProductFamily [${family.code}]. It has ${activeProducts} active products.`,
          { activeProducts }
        );
      }
    }

    const updated = await this.repository.updateFamily(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_family.status_change',
      entityType: 'ProductFamily',
      entityId: updated.id,
      before: { status: family.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async createProduct(params: {
    sku?: string;
    name: string;
    description?: string;
    productFamilyId?: string;
    categoryId?: string;
    uomId: string;
    initialQuantity?: number;
    minStockLevel?: number;
    reorderPoint?: number;
    leadTimeDays?: number;
    costPrice?: number;
    sellingPrice?: number;
    metadata?: Record<string, unknown>;
    actorId: string;
    activateImmediately?: boolean;
    requestId?: string;
  }): Promise<Product> {
    let rawSku = params.sku?.trim();
    if (!rawSku) {
      rawSku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }
    const normalizedSku = ProductsService.normalizeCode(rawSku);
    const existing = await this.repository.findProductBySku(normalizedSku);
    if (existing) {
      throw new ConflictError(`Product with SKU [${normalizedSku}] already exists.`);
    }
    await assertInventoryNameAvailable(params.name, (name, current) => this.repository.findInventoryNameConflict(name, current));

    const uom = await this.repository.findUomById(params.uomId);
    if (!uom) {
      throw new NotFoundError(`UnitOfMeasure [${params.uomId}] not found. Select an active unit of measure and try again.`);
    }
    MasterDataLifecycleService.assertIsReferenceable('UnitOfMeasure', uom.id, uom.status);

    let category = params.categoryId ? await this.repository.findCategoryById(params.categoryId) : null;
    let family = params.productFamilyId ? await this.repository.findFamilyById(params.productFamilyId) : null;

    // Product classification is no longer collected in the creation UI, but
    // the legacy schema still requires these relations. Keep that storage
    // concern behind an internal, active fallback record.
    if (!category && family) category = await this.repository.findCategoryById(family.categoryId);
    if (!category) {
      category = await this.repository.findCategoryByCode('UNCATEGORIZED');
      if (!category) {
        category = await this.repository.createCategory({
          code: 'UNCATEGORIZED',
          name: 'Uncategorized',
          description: 'Internal compatibility classification; hidden from product creation.',
          status: 'ACTIVE'
        });
      }
    }
    if (!family) {
      family = await this.repository.findFamilyByCode('UNASSIGNED');
      if (!family) {
        family = await this.repository.createFamily({
          code: 'UNASSIGNED',
          name: 'Unassigned',
          description: 'Internal compatibility classification; hidden from product creation.',
          category: { connect: { id: category.id } },
          status: 'ACTIVE'
        });
      }
    }

    if (!category) throw new NotFoundError(`Category [${params.categoryId}] not found.`);
    if (!family) throw new NotFoundError(`ProductFamily [${params.productFamilyId}] not found.`);
    if (family.categoryId !== category.id) {
      throw new ValidationError('The selected product family must belong to the selected category.');
    }

    MasterDataLifecycleService.assertIsReferenceable('Category', category.id, category.status);
    MasterDataLifecycleService.assertIsReferenceable('ProductFamily', family.id, family.status);

    const initialQuantity = params.initialQuantity !== undefined
      ? params.initialQuantity
      : (params.metadata?.initialQuantity !== undefined ? Number(params.metadata.initialQuantity) : 0);

    const userSku = params.sku?.trim();
    const metadataMerged = {
      ...(params.metadata || {}),
      userSku: userSku || '',
      hasCustomSku: Boolean(userSku),
      ...(initialQuantity !== undefined ? { initialQuantity } : {}),
      ...(params.minStockLevel !== undefined ? { minStockLevel: params.minStockLevel } : {}),
      ...(params.reorderPoint !== undefined ? { reorderPoint: params.reorderPoint } : {}),
      ...(params.leadTimeDays !== undefined ? { leadTimeDays: params.leadTimeDays } : {}),
      ...(params.costPrice !== undefined ? { costPrice: params.costPrice } : {}),
      ...(params.sellingPrice !== undefined ? { sellingPrice: params.sellingPrice } : {})
    };
    assertUomQuantities(uom, metadataMerged);
    const created = await this.repository.createProduct({
      sku: normalizedSku,
      name: params.name.trim(),
      description: params.description,
      productFamily: { connect: { id: family.id } },
      category: { connect: { id: category.id } },
      uom: { connect: { id: params.uomId } },
      metadata: metadataMerged as Prisma.InputJsonValue,
      status: params.activateImmediately ? 'ACTIVE' : 'DRAFT',
      version: 1
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product.create',
      entityType: 'Product',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });
    const hasSafetyBuffer = Number(params.minStockLevel ?? params.metadata?.minStockLevel ?? params.metadata?.safetyStock ?? 0) > 0;
    if (initialQuantity > 0 || hasSafetyBuffer) {
      try {
        let locationId = (params.metadata?.warehouseLocationId as string) || (params.metadata?.locationId as string);
        if (!locationId) {
          const defaultLoc = await prisma.warehouseLocation.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' }
          });
          if (defaultLoc) {
            locationId = defaultLoc.id;
          } else {
            const canonical = await prisma.warehouseLocation.findFirst({ where: { code: 'MAIN-STORE' } });
            if (canonical) {
              locationId = canonical.id;
            } else {
              const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' } });
              const provisioned = await prisma.warehouseLocation.create({
                data: {
                  code: 'MAIN-STORE',
                  name: 'Main Store',
                  type: 'STORE',
                  status: 'ACTIVE',
                  factoryId: factory?.id ?? null
                }
              });
              locationId = provisioned.id;
            }
          }
        }

        if (locationId) {
          if (initialQuantity > 0) {
            try {
              await inventoryPostingService.post(prisma, {
                itemType: 'PRODUCT',
                itemId: created.id,
                uomId: created.uomId,
                locationId,
                movementType: 'RECEIPT',
                quantity: initialQuantity,
                condition: 'AVAILABLE',
                ownership: 'COMPANY',
                unitCost: params.costPrice || 0,
                sourceType: 'PRODUCT_OPENING_BALANCE',
                sourceId: created.id,
                idempotencyKey: `PRODUCT_OPENING_BALANCE:${created.id}`,
                actorId: params.actorId,
                correlationId: params.requestId
              });
            } catch (postErr) {
              console.warn('[ProductsService.createProduct] Modern inventory posting note:', postErr);
            }
          }

          try {
            const itemKey = `PRODUCT:${created.id}`;
            const stockBalance = await prisma.stockBalance.upsert({
              where: {
                itemKey_uomId_locationId_ownership: {
                  itemKey,
                  uomId: created.uomId,
                  locationId,
                  ownership: 'OWNED'
                }
              },
              update: {
                onHandQuantity: { increment: initialQuantity }
              },
              create: {
                itemKey,
                productId: created.id,
                uomId: created.uomId,
                locationId,
                ownership: 'OWNED',
                onHandQuantity: initialQuantity,
                reservedQuantity: 0
              }
            });

            if (initialQuantity > 0) {
              await prisma.stockLedgerEntry.create({
                data: {
                  productId: created.id,
                  uomId: created.uomId,
                  locationId,
                  quantity: initialQuantity,
                  direction: 'IN',
                  entryType: 'ADJUSTMENT_INCREASE',
                  postedByActorId: params.actorId,
                  note: `Opening stock entered during product creation for SKU [${created.sku}]`
                }
              });
            }

            // Evaluate opening stock directly as well as through the outbox.
            // This makes threshold checks independent of worker timing; the
            // evaluator's transactional lock/event check prevents duplicate POs.
            await reorderEvaluatorService.evaluateAndTrigger(stockBalance.id);
          } catch (legacyErr) {
            console.warn('[ProductsService.createProduct] Legacy stock balance note:', legacyErr);
          }
        }
      } catch (stockInitErr) {
        console.warn('[ProductsService.createProduct] Initial stock processing note:', stockInitErr);
      }
    }

    return created;
  }

  async listProducts(params?: {
    categoryId?: string;
    productFamilyId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Product[]; total: number }> {
    return this.repository.listProducts(params);
  }

  async getProductById(id: string): Promise<Product> {
    const product = await this.repository.findProductById(id);
    if (!product) {
      throw new NotFoundError(`Product [${id}] not found.`);
    }
    return product;
  }

  async getProductVersionHistory(id: string): Promise<Array<{
    entityId: string | null;
    actor: string;
    timestamp: Date;
    action: string;
    summary: string;
    before: Prisma.JsonValue;
    after: Prisma.JsonValue;
  }>> {
    const product = await this.getProductById(id);
    
    // 1. Get all related products (same SKU or linked via supersession/merge metadata)
    const baseSku = product.sku.split('__MERGE__')[0];
    const relatedProducts = await this.repository.listProducts({ search: baseSku, take: 100 });
    const productIds = relatedProducts.items.filter(p => p.sku.startsWith(baseSku)).map(p => p.id);
    if (!productIds.includes(product.id)) productIds.push(product.id);

    // 2. Fetch all audit logs for these IDs
    const auditLogs = await prisma.auditLog.findMany({
       where: { resource: 'Product', resourceId: { in: productIds } },
       orderBy: { createdAt: 'asc' }
    });

    // 3. Map into a timeline
    return auditLogs.map(log => ({
       entityId: log.resourceId,
       actor: log.userId || 'system',
       timestamp: log.createdAt,
       action: log.action,
       summary: `Action: ${log.action}`, // Can be enriched based on diff of before/after
       before: log.before,
       after: log.after
    }));
  }

  async updateProduct(id: string, params: {
    sku?: string;
    name?: string;
    description?: string;
    categoryId?: string;
    productFamilyId?: string;
    uomId?: string;
    minStockLevel?: number;
    reorderPoint?: number;
    leadTimeDays?: number;
    costPrice?: number;
    sellingPrice?: number;
    metadata?: Record<string, unknown>;
    actorId: string;
    requestId?: string;
  }): Promise<Product> {
    const product = await this.getProductById(id);
    const nextCategory = params.categoryId
      ? await this.repository.findCategoryById(params.categoryId)
      : (product.categoryId ? await this.repository.findCategoryById(product.categoryId) : null);
    const nextFamily = params.productFamilyId
      ? await this.repository.findFamilyById(params.productFamilyId)
      : (product.productFamilyId ? await this.repository.findFamilyById(product.productFamilyId) : null);
    if (!nextCategory) throw new NotFoundError(`Category [${params.categoryId}] not found.`);
    if (!nextFamily) throw new ValidationError('Select a product family for the selected category.');
    if (nextFamily.categoryId !== nextCategory.id) {
      throw new ValidationError('The selected product family must belong to the selected category. Select a matching subcategory before saving.');
    }
    MasterDataLifecycleService.assertIsReferenceable('Category', nextCategory.id, nextCategory.status);
    MasterDataLifecycleService.assertIsReferenceable('ProductFamily', nextFamily.id, nextFamily.status);
    if (params.name !== undefined && params.name.trim().toLocaleLowerCase() !== product.name.trim().toLocaleLowerCase()) {
      await assertInventoryNameAvailable(
        params.name,
        (name, current) => this.repository.findInventoryNameConflict(name, current),
        { entity: 'PRODUCT', id },
      );
    }

    let normalizedSku: string | undefined;
    const userProvidedSku = params.sku !== undefined ? params.sku.trim() : undefined;
    if (userProvidedSku) {
      normalizedSku = ProductsService.normalizeCode(userProvidedSku);
      if (normalizedSku !== product.sku) {
        const existing = await this.repository.findProductBySku(normalizedSku);
        if (existing && existing.id !== product.id) {
          throw new ConflictError(`Product with SKU [${normalizedSku}] already exists.`);
        }
      }
    }

    const beforeMetadata = product.metadata && typeof product.metadata === 'object' ? (product.metadata as Record<string, unknown>) : {};
    const metadataUpdates: Record<string, unknown> = {
      ...beforeMetadata,
      ...(params.metadata || {}),
    };

    if (userProvidedSku !== undefined) {
      metadataUpdates.userSku = userProvidedSku;
      metadataUpdates.hasCustomSku = Boolean(userProvidedSku);
      if (normalizedSku) {
        metadataUpdates.sku = normalizedSku;
      }
    }

    if (params.minStockLevel !== undefined) metadataUpdates.minStockLevel = params.minStockLevel;
    if (params.reorderPoint !== undefined) metadataUpdates.reorderPoint = params.reorderPoint;
    if (params.leadTimeDays !== undefined) metadataUpdates.leadTimeDays = params.leadTimeDays;
    if (params.costPrice !== undefined) metadataUpdates.costPrice = params.costPrice;
    if (params.sellingPrice !== undefined) metadataUpdates.sellingPrice = params.sellingPrice;

    const selectedUom = await this.repository.findUomById(params.uomId || product.uomId);
    if (!selectedUom) throw new NotFoundError(`UnitOfMeasure [${params.uomId || product.uomId}] not found.`);
    assertUomQuantities(selectedUom, metadataUpdates);

    const dataToUpdate: any = {
      ...(params.name ? { name: params.name.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(normalizedSku ? { sku: normalizedSku } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.productFamilyId ? { productFamilyId: params.productFamilyId } : {}),
      ...(params.uomId ? { uomId: params.uomId } : {}),
      metadata: metadataUpdates as Prisma.InputJsonValue
    };

    // If DRAFT or PENDING_VALIDATION, direct mutation is allowed
    if (product.status === 'DRAFT' || product.status === 'PENDING_VALIDATION') {
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await (tx as any).product.update({ where: { id }, data: dataToUpdate });
        await syncProductInventoryUom(tx, id, saved.uomId);
        return saved;
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product.update_draft',
        entityType: 'Product',
        entityId: updated.id,
        before: product,
        after: updated,
        requestId: params.requestId
      });

      await this.reevaluateProductStock(updated.id);

      return updated;
    }

    // Product edits update the existing master record in place.
    if (product.status === 'APPROVED' || product.status === 'ACTIVE') {
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await (tx as any).product.update({
          where: { id: product.id },
          data: dataToUpdate
        });
        await syncProductInventoryUom(tx, product.id, saved.uomId);
        if (Object.prototype.hasOwnProperty.call(metadataUpdates, 'sellingPrice') && beforeMetadata.sellingPrice !== metadataUpdates.sellingPrice) {
          await publishIntelligenceEvent(tx as any, {
            type: 'PRICE_CHANGED',
            entityType: 'Product',
            entityId: product.id,
            correlationId: params.requestId,
            occurredAt: saved.updatedAt,
            transitionId: saved.updatedAt.toISOString(),
            metadata: { productId: product.id, status: saved.status }
          });
        }
        return saved;
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product.update',
        entityType: 'Product',
        entityId: updated.id,
        before: product,
        after: updated,
        metadata: { editMode: 'in_place' },
        requestId: params.requestId
      });

      await this.reevaluateProductStock(updated.id);

      return updated;
    }

    throw new ConflictError(`Cannot edit Product [${product.sku}] with terminal status [${product.status}].`);
  }

  async transitionProductStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Product> {
    const product = await this.getProductById(params.id);

    MasterDataLifecycleService.validateTransition(product.status, params.targetStatus, 'Product');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Product'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const refs = await this.repository.countProductActiveReferences(params.id);
      if (refs.variants > 0 || refs.routes > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Product [${product.sku}]. It has active references (${refs.variants} variants, ${refs.routes} routes).`,
          refs
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await (tx as any).product.update({ where: { id: params.id }, data: { status: params.targetStatus, deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null } });
      const metadata = product.metadata && typeof product.metadata === 'object' ? product.metadata as Record<string, unknown> : {};
      const becomesEffective = ['APPROVED', 'ACTIVE'].includes(params.targetStatus) && !['APPROVED', 'ACTIVE'].includes(product.status);
      if (becomesEffective && Object.prototype.hasOwnProperty.call(metadata, 'sellingPrice')) {
        await publishIntelligenceEvent(tx as any, { type: 'PRICE_CHANGED', entityType: 'Product', entityId: params.id, correlationId: params.requestId, occurredAt: saved.updatedAt, transitionId: saved.updatedAt.toISOString(), metadata: { productId: params.id, status: saved.status } });
      }
      return saved;
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product.status_change',
      entityType: 'Product',
      entityId: updated.id,
      before: { status: product.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // PRODUCT VARIANTS
  // ============================================================================

  async createProductVariant(params: {
    productId: string;
    sku?: string;
    variantSku?: string;
    name: string;
    color?: string | null;
    size?: string | null;
    specifications?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    costPrice?: number;
    sellingPrice?: number;
    actorId: string;
    requestId?: string;
  }): Promise<ProductVariant> {
    const skuRaw = params.sku || params.variantSku;
    if (!skuRaw) {
      throw new ConflictError('Variant SKU is required.');
    }
    const normalizedSku = ProductsService.normalizeCode(skuRaw);
    const existing = await this.repository.findVariantBySku(normalizedSku);
    if (existing) {
      throw new ConflictError(`ProductVariant with SKU [${normalizedSku}] already exists.`);
    }

    const product = await this.getProductById(params.productId);
    MasterDataLifecycleService.assertIsReferenceable('Product', product.id, product.status);

    const specs = params.specifications || params.attributes || {};

    const created = await this.repository.createVariant({
      sku: normalizedSku,
      name: params.name.trim(),
      color: params.color,
      size: params.size,
      specifications: specs as Prisma.InputJsonValue,
      product: { connect: { id: params.productId } },
      status: 'DRAFT',
      version: 1
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_variant.create',
      entityType: 'ProductVariant',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listProductVariants(params?: {
    productId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductVariant[]; total: number }> {
    return this.repository.listVariants(params);
  }

  async getVariantById(id: string): Promise<ProductVariant> {
    const variant = await this.repository.findVariantById(id);
    if (!variant) {
      throw new NotFoundError(`ProductVariant [${id}] not found.`);
    }
    return variant;
  }

  async updateProductVariant(id: string, params: {
    sku?: string;
    name?: string;
    color?: string | null;
    size?: string | null;
    specifications?: Record<string, unknown>;
    actorId: string;
    requestId?: string;
  }): Promise<ProductVariant> {
    const variant = await this.getVariantById(id);
    let normalizedSku: string | undefined;
    if (params.sku !== undefined) {
      normalizedSku = ProductsService.normalizeCode(params.sku);
      const existing = await this.repository.findVariantBySku(normalizedSku);
      if (existing && existing.id !== variant.id) {
        throw new ConflictError(`ProductVariant with SKU [${normalizedSku}] already exists.`);
      }
    }

    if (variant.status === 'DRAFT' || variant.status === 'PENDING_VALIDATION') {
      const updated = await this.repository.updateVariant(id, {
        ...(normalizedSku ? { sku: normalizedSku } : {}),
        ...(params.name ? { name: params.name.trim() } : {}),
        ...(params.color !== undefined ? { color: params.color } : {}),
        ...(params.size !== undefined ? { size: params.size } : {}),
        ...(params.specifications ? { specifications: params.specifications as Prisma.InputJsonValue } : {})
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product_variant.update_draft',
        entityType: 'ProductVariant',
        entityId: updated.id,
        before: variant,
        after: updated,
        requestId: params.requestId
      });

      return updated;
    }

    if (variant.status === 'APPROVED' || variant.status === 'ACTIVE') {
      const nextVersion = variant.version + 1;
      const { oldVariant, newVariant } = await this.repository.supersedeVariant(variant.id, {
        sku: normalizedSku || variant.sku,
        name: params.name ? params.name.trim() : variant.name,
        color: params.color !== undefined ? params.color : variant.color,
        size: params.size !== undefined ? params.size : variant.size,
        specifications: (params.specifications || variant.specifications) as Prisma.InputJsonValue,
        product: { connect: { id: variant.productId } },
        status: 'DRAFT',
        version: nextVersion
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'product_variant.supersede_version',
        entityType: 'ProductVariant',
        entityId: newVariant.id,
        before: oldVariant,
        after: newVariant,
        metadata: { supersededId: oldVariant.id, newVersion: nextVersion },
        requestId: params.requestId
      });

      return newVariant;
    }

    throw new ConflictError(`Cannot edit ProductVariant [${variant.sku}] with terminal status [${variant.status}].`);
  }

  async transitionVariantStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<ProductVariant> {
    const variant = await this.getVariantById(params.id);

    MasterDataLifecycleService.validateTransition(variant.status, params.targetStatus, 'ProductVariant');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'ProductVariant'
      });
    }

    const updated = await this.repository.updateVariant(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'product_variant.status_change',
      entityType: 'ProductVariant',
      entityId: updated.id,
      before: { status: variant.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
