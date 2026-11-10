import { Router } from 'express';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import {
  ProductsRepository,
  MaterialsRepository,
  UomRepository,
  VendorsRepository,
  CustomersRepository,
  OrgStructureRepository,
  QcWastageRulesRepository,
  RoutingRepository,
  ImportRepository
} from '../repositories';
import {
  ProductsService,
  MaterialsService,
  UomService,
  VendorsService,
  CustomersService,
  OrgStructureService,
  QcWastageRulesService,
  RoutingService,
  ImportExportService,
  SummaryService
} from '../services';
import {
  ProductsController,
  MaterialsController,
  UomController,
  VendorsController,
  CustomersController,
  OrgStructureController,
  QcWastageRulesController,
  RoutingController,
  ImportExportController,
  SummaryController
} from '../controllers';
import { authenticate } from '../../../common/middleware/auth';
import { isAdminActor } from '../../../common/middleware/auth';
import { ForbiddenError } from '../../../common/errors/AppError';
import { authorize, getDefaultPermissionChecker } from '../../../common/middleware/authorize';
import { validate } from '../../../common/middleware/validation';
import { prisma } from '../../../database';
import { ProductionRouteGraphService } from '../../production/services/production-route-graph.service';
import { materialToProductConversionService } from '../services/material-to-product-conversion.service';

import {
  createCategorySchema,
  updateCategorySchema,
  createProductFamilySchema,
  updateProductFamilySchema,
  createProductSchema,
  updateProductSchema,
  productSpecialPresetSchema,
  createProductVariantSchema,
  updateProductVariantSchema,
  createMaterialSchema,
  updateMaterialSchema,
  createUomSchema,
  updateUomSchema,
  createUomConversionSchema,
  createPackSizeSchema,
  createVendorSchema,
  updateVendorSchema,
  createCustomerSchema,
  updateCustomerSchema,
  createFactorySchema,
  updateFactorySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  createWorkCenterSchema,
  updateWorkCenterSchema,
  createWarehouseLocationSchema,
  updateWarehouseLocationSchema,
  createEmployeeMasterSchema,
  updateEmployeeMasterSchema,
  createSalesChannelSchema,
  updateSalesChannelSchema,
  createQcRuleSchema,
  updateQcRuleSchema,
  createWastageRuleSchema,
  updateWastageRuleSchema,
  createProductRouteSchema,
  updateProductRouteSchema,
  createRouteStepSchema,
  updateRouteStepSchema,
  saveProductionRouteGraphSchema,
  transitionStatusSchema,
  submitValidationSchema,
  approveMasterSchema,
  rejectMasterSchema,
  deactivateMasterSchema,
  createVendorEvaluationSchema,
  createVendorScorecardSchema,
  commitImportBatchSchema
} from '@synergy/validation';
import multer from 'multer';
import { ConflictError } from '../../../common/errors/AppError';

const router = Router();
const graphService = new ProductionRouteGraphService();

router.get('/product-special-presets', authenticate, authorize('view', 'Product'), async (_req, res, next) => {
  try {
    const items = await (prisma as any).productSpecialPreset.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});
router.post('/product-special-presets', authenticate, authorize('create', 'Product'), validate(productSpecialPresetSchema), async (req, res, next) => {
  try {
    const { id, ...values } = req.body;
    const item = await (prisma as any).productSpecialPreset.upsert({
      where: { id },
      create: { id, ...values },
      update: values,
    });
    res.status(201).json({ success: true, data: item, requestId: req.id });
  } catch (error) {
    next(error);
  }
});
router.put('/product-special-presets/:id', authenticate, authorize('update', 'Product'), validate(productSpecialPresetSchema), async (req, res, next) => {
  try {
    const { id: bodyId, ...values } = req.body;
    if (bodyId !== req.params.id) throw new ConflictError('Preset ID in the URL does not match the request body.');
    const item = await (prisma as any).productSpecialPreset.upsert({
      where: { id: req.params.id },
      create: { id: req.params.id, ...values },
      update: values,
    });
    res.json({ success: true, data: item, requestId: req.id });
  } catch (error) {
    next(error);
  }
});
router.delete('/product-special-presets/:id', authenticate, authorize('update', 'Product'), async (req, res, next) => {
  try {
    const item = await (prisma as any).productSpecialPreset.upsert({
      where: { id: req.params.id },
      create: { id: req.params.id, isDeleted: true },
      update: { isDeleted: true },
    });
    res.json({ success: true, data: item, requestId: req.id });
  } catch (error) {
    next(error);
  }
});
const upload = multer({ storage: multer.memoryStorage() });
const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|svg\+xml)$/.test(file.mimetype))
});

// Shared dependencies
const permissionChecker = getDefaultPermissionChecker();
import { DbAuditWriter } from '../../../common/audit/db-audit-writer';
const auditWriter = new DbAuditWriter();

// Repositories
const productsRepo = new ProductsRepository();
const materialsRepo = new MaterialsRepository();
const uomRepo = new UomRepository();
const vendorsRepo = new VendorsRepository();
const customersRepo = new CustomersRepository();
const orgRepo = new OrgStructureRepository();
const qcWastageRepo = new QcWastageRulesRepository();
const routingRepo = new RoutingRepository();
const importRepo = new ImportRepository();

// Services
const productsService = new ProductsService(productsRepo, permissionChecker, auditWriter);
const materialsService = new MaterialsService(materialsRepo, uomRepo, permissionChecker, auditWriter);
const uomService = new UomService(uomRepo, permissionChecker, auditWriter);
const vendorsService = new VendorsService(vendorsRepo, permissionChecker, auditWriter);
const customersService = new CustomersService(customersRepo, permissionChecker, auditWriter);
const orgService = new OrgStructureService(orgRepo, permissionChecker, auditWriter);
const qcWastageService = new QcWastageRulesService(qcWastageRepo, permissionChecker, auditWriter);
const routingService = new RoutingService(routingRepo, orgRepo, permissionChecker, auditWriter);
const importExportService = new ImportExportService(
  importRepo,
  productsService,
  materialsService,
  uomService,
  vendorsService,
  customersService,
  permissionChecker,
  auditWriter
);

const summaryService = new SummaryService();

// Controllers
const productsCtrl = new ProductsController(productsService);
const materialsCtrl = new MaterialsController(materialsService);
const uomCtrl = new UomController(uomService);
const vendorsCtrl = new VendorsController(vendorsService);
const customersCtrl = new CustomersController(customersService);
const orgCtrl = new OrgStructureController(orgService);
const qcWastageCtrl = new QcWastageRulesController(qcWastageService);
const routingCtrl = new RoutingController(routingService);
const importExportCtrl = new ImportExportController(importExportService);
const summaryCtrl = new SummaryController(summaryService);

const requireVendorCreator = (req: any, _res: any, next: (error?: unknown) => void) => {
  const role = String(req.user?.roleDefinitionKey || req.user?.role || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (isAdminActor(req.user) || role === 'store-manager' || role === 'manager') return next();
  return next(new ForbiddenError('Only Store Managers and Admins can create vendors.'));
};

const requireVendorAdmin = (req: any, _res: any, next: (error?: unknown) => void) =>
  isAdminActor(req.user) ? next() : next(new ForbiddenError('Only an administrator can change vendor approval or availability.'));

// Hydrate requisition selectors in one request instead of five independent
// network/database round trips.
router.get('/procurement-selectors', authenticate, authorize('read', 'MasterData'), async (req, res, next) => {
  try {
    // Picker hydration does not need full records or COUNT queries. Six small,
    // projected reads run concurrently and avoid the twelve heavy queries the
    // generic list services would otherwise issue.
    const [vendorItems, productItems, materialItems, uomItems, departmentItems, locationItems, capabilityItems] = await Promise.all([
      prisma.vendor.findMany({ where: { status: { in: ['ACTIVE', 'APPROVED'] } }, take: 1000, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, status: true } }),
      prisma.product.findMany({ take: 1000, orderBy: { name: 'asc' }, select: { id: true, sku: true, name: true, status: true, uomId: true, metadata: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } } }),
      prisma.material.findMany({ take: 1000, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, status: true, uomId: true, specs: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true, name: true } } } }),
      prisma.unitOfMeasure.findMany({ where: { status: 'ACTIVE' }, take: 1000, orderBy: { code: 'asc' }, select: { id: true, code: true, symbol: true, name: true, status: true } }),
      prisma.department.findMany({ take: 1000, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, status: true } }),
      prisma.warehouseLocation.findMany({ take: 1000, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, status: true } }),
      (prisma as any).vendorCapability.findMany({
        where: { vendor: { status: { in: ['ACTIVE', 'APPROVED'] } } },
        select: {
          id: true,
          vendorId: true,
          productId: true,
          materialId: true,
          categoryId: true,
          unitPrice: true,
          leadTimeDays: true,
          moq: true,
        }
      })
    ]);
    const wrap = <T,>(items: T[]) => ({ items, total: items.length });
    const vendors = wrap(vendorItems); const products = wrap(productItems); const materials = wrap(materialItems);
    const uoms = wrap(uomItems); const departments = wrap(departmentItems); const locations = wrap(locationItems);
    const capabilities = wrap(capabilityItems);
    res.json({ success: true, data: { vendors, products, materials, uoms, departments, locations, capabilities }, requestId: req.id });
  } catch (error) { next(error); }
});

// ==============================================================================
// 0. SUMMARY
// ==============================================================================
router.get(
  '/summary',
  authenticate,
  authorize('read', 'MasterData'),
  summaryCtrl.getOverviewSummary
);

router.get('/hsn-sac/lookup', authenticate, authorize('read', 'MasterData'), async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ success: true, data: null, requestId: req.id });
    const record = await prisma.hsnSacCode.findUnique({ where: { code } });
    return res.json({ success: true, data: record, requestId: req.id });
  } catch (error) {
    return next(error);
  }
});

router.get('/hsn-sac', authenticate, authorize('read', 'MasterData'), async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    const items = await prisma.hsnSacCode.findMany({
      where: search ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : undefined,
      orderBy: { code: 'asc' },
      take: limit,
    });
    return res.json({ success: true, data: { items, total: items.length }, requestId: req.id });
  } catch (error) {
    return next(error);
  }
});

const DEFAULT_PRICING_LEVELS = ['Dealer', 'E-Trade', 'Customer'];

router.get('/pricing-levels', authenticate, authorize('view', 'PricingMaster'), async (_req, res, next) => {
  try {
    const records = await prisma.$queryRaw<Array<{ tiers: unknown }>>`SELECT "tiers" FROM "pricing_masters" WHERE "code" = 'PRICING_LEVELS_MASTER' LIMIT 1`;
    let levels = DEFAULT_PRICING_LEVELS;
    if (records.length > 0 && Array.isArray(records[0].tiers) && records[0].tiers.length > 0) {
      levels = Array.from(new Set([...DEFAULT_PRICING_LEVELS, ...records[0].tiers.map(String).map((s) => s.trim()).filter(Boolean)]));
    }
    return res.json({ success: true, data: { levels }, requestId: _req.id });
  } catch (error) {
    return next(error);
  }
});

router.post('/pricing-levels', authenticate, authorize('create', 'PricingMaster'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: { message: 'Level name is required' }, requestId: req.id });
    }
    const records = await prisma.$queryRaw<Array<{ id: string; tiers: unknown }>>`SELECT "id", "tiers" FROM "pricing_masters" WHERE "code" = 'PRICING_LEVELS_MASTER' LIMIT 1`;
    let levels = DEFAULT_PRICING_LEVELS;
    if (records.length > 0 && Array.isArray(records[0].tiers)) {
      levels = Array.from(new Set([...DEFAULT_PRICING_LEVELS, ...records[0].tiers.map(String).map((s) => s.trim()).filter(Boolean)]));
    }
    if (!levels.includes(name)) {
      levels.push(name);
    }
    const levelsJson = JSON.stringify(levels);
    if (records.length > 0) {
      await prisma.$executeRaw`UPDATE "pricing_masters" SET "tiers" = ${levelsJson}::jsonb, "updatedAt" = NOW() WHERE "id" = ${records[0].id}`;
    } else {
      await prisma.$executeRaw`INSERT INTO "pricing_masters" ("id", "code", "name", "description", "fields", "columns", "tiers", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'PRICING_LEVELS_MASTER', 'System Pricing Levels', 'Configured customer pricing levels', '[]'::jsonb, '[]'::jsonb, ${levelsJson}::jsonb, 'ACTIVE', NOW(), NOW())`;
    }
    return res.json({ success: true, data: { levels, created: name }, requestId: req.id });
  } catch (error) {
    return next(error);
  }
});

router.get('/pricing-masters', authenticate, authorize('view', 'PricingMaster'), async (_req, res, next) => {
  try {
    const items = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "code", "name", "description", "fields", "columns", "tiers", "status", "createdAt", "updatedAt" FROM "pricing_masters" WHERE "status" = 'ACTIVE' AND "code" != 'PRICING_LEVELS_MASTER' ORDER BY "name" ASC`;
    return res.json({ success: true, data: { items: items.map((item) => ({ ...item, tiers: parsePricingTiers(item.tiers) })), total: items.length }, requestId: _req.id });
  } catch (error) { return next(error); }
});

interface RawPricingTier {
  id?: string;
  name?: string;
  price?: number | string;
  discountPercentage?: number | string;
  isActive?: boolean;
}

const parsePricingTiers = (raw: unknown) => {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((tier: unknown) => typeof tier === 'object' && tier !== null)
    .map((tier: unknown, idx: number) => {
      const item = tier as RawPricingTier;
      const name = String(item.name || '').trim();
      const price = Number(item.price);
      const discount = Number(item.discountPercentage);
      return {
        id: String(item.id || `tier-${Date.now()}-${idx}`),
        name,
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        discountPercentage: Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0,
        isActive: item.isActive !== false,
      };
    })
    .filter((tier) => tier.name);
};

router.post('/pricing-masters', authenticate, authorize('create', 'PricingMaster'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const rawFields = Array.isArray(req.body?.fields) ? req.body.fields : [];
    const fields: Array<{ name: string; valueType: 'number' | 'text'; defaultValue: string }> = rawFields
      .filter((field: unknown) => typeof field === 'object' && field !== null)
      .map((field: unknown) => {
        const item = field as { name?: unknown; valueType?: unknown; defaultValue?: unknown };
        return { name: String(item.name || '').trim(), valueType: item.valueType === 'text' ? 'text' : 'number', defaultValue: String(item.defaultValue || '').trim() };
      })
      .filter((field: { name: string }) => field.name);
    const rawColumns = Array.isArray(req.body?.columns) ? req.body.columns : [];
    const columns: Array<{ name: string; defaultValue: string }> = rawColumns
      .filter((column: unknown) => typeof column === 'object' && column !== null)
      .map((column: unknown) => {
        const item = column as { name?: unknown; defaultValue?: unknown };
        return { name: String(item.name || '').trim(), defaultValue: String(item.defaultValue || '').trim() };
      })
      .filter((column: { name: string }) => column.name);
    const tiers = parsePricingTiers(req.body?.tiers);
    const fieldNames = fields.map((field) => field.name.toLowerCase());
    if (!name) return res.status(400).json({ success: false, error: { message: 'Pricing master name is required.' }, requestId: req.id });
    if (new Set(fieldNames).size !== fieldNames.length) return res.status(400).json({ success: false, error: { message: 'Pricing field names must be unique.' }, requestId: req.id });
    if (new Set(columns.map((column) => column.name.toLowerCase())).size !== columns.length) return res.status(400).json({ success: false, error: { message: 'Pricing column names must be unique.' }, requestId: req.id });
    if (new Set(tiers.map((tier) => tier.name.toLowerCase())).size !== tiers.length) return res.status(400).json({ success: false, error: { message: 'Tier names must be unique.' }, requestId: req.id });
    if (fields.some((field) => field.valueType === 'number' && field.defaultValue && !Number.isFinite(Number(field.defaultValue)))) return res.status(400).json({ success: false, error: { message: 'Number pricing fields must have numeric default values.' }, requestId: req.id });
    const code = `PM-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Date.now().toString(36).toUpperCase()}`;
    const masterRows = await prisma.$transaction(async (tx) => {
      const created = await tx.$queryRaw<Array<Record<string, unknown>>>`INSERT INTO "pricing_masters" ("id", "code", "name", "description", "fields", "columns", "tiers", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${code}, ${name}, ${String(req.body?.description || '').trim() || null}, ${JSON.stringify(fields)}::jsonb, ${JSON.stringify(columns)}::jsonb, ${JSON.stringify(tiers)}::jsonb, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`;
      if (created[0]) await publishIntelligenceEvent(tx as any, { type: 'PRICE_CHANGED', entityType: 'PricingMaster', entityId: String(created[0].id), correlationId: req.id, occurredAt: created[0].updatedAt as Date, transitionId: String(created[0].id), metadata: { pricingMasterId: String(created[0].id), status: String(created[0].status) } });
      return created;
    });
    const master = masterRows[0];
    return res.status(201).json({ success: true, data: master, requestId: req.id });
  } catch (error) { return next(error); }
});

router.get('/pricing-masters/:id', authenticate, authorize('view', 'PricingMaster'), async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "code", "name", "description", "fields", "columns", "tiers", "status", "createdAt", "updatedAt" FROM "pricing_masters" WHERE "id" = ${req.params.id} LIMIT 1`;
    return res.json({ success: true, data: rows[0] ? { ...rows[0], tiers: parsePricingTiers(rows[0].tiers) } : null, requestId: req.id });
  } catch (error) { return next(error); }
});

router.put('/pricing-masters/:id', authenticate, authorize('update', 'PricingMaster'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "pricing_masters" WHERE "id" = ${id} LIMIT 1`;
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, error: { message: 'Pricing master not found' }, requestId: req.id });
    }
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : String(existing[0].name);
    const description = req.body?.description !== undefined ? (String(req.body.description).trim() || null) : existing[0].description;
    const rawFields = req.body?.fields !== undefined ? req.body.fields : existing[0].fields;
    const fields = (Array.isArray(rawFields) ? rawFields : [])
      .filter((field: unknown) => typeof field === 'object' && field !== null)
      .map((field: unknown) => {
        const item = field as { name?: unknown; valueType?: unknown; defaultValue?: unknown };
        return { name: String(item.name || '').trim(), valueType: item.valueType === 'text' ? 'text' : 'number', defaultValue: String(item.defaultValue || '').trim() };
      })
      .filter((field: { name: string }) => field.name);
    const rawColumns = req.body?.columns !== undefined ? req.body.columns : existing[0].columns;
    const columns = (Array.isArray(rawColumns) ? rawColumns : [])
      .filter((column: unknown) => typeof column === 'object' && column !== null)
      .map((column: unknown) => {
        const item = column as { name?: unknown; defaultValue?: unknown };
        return { name: String(item.name || '').trim(), defaultValue: String(item.defaultValue || '').trim() };
      })
      .filter((column: { name: string }) => column.name);
    const tiers = req.body?.tiers !== undefined ? parsePricingTiers(req.body.tiers) : parsePricingTiers(existing[0].tiers);
    const status = req.body?.status && ['ACTIVE', 'DRAFT', 'DEPRECATED', 'ARCHIVED'].includes(req.body.status) ? req.body.status : existing[0].status;

    const rows = await prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>`UPDATE "pricing_masters" SET "name" = ${name}, "description" = ${description}, "fields" = ${JSON.stringify(fields)}::jsonb, "columns" = ${JSON.stringify(columns)}::jsonb, "tiers" = ${JSON.stringify(tiers)}::jsonb, "status" = ${status}::"LifecycleStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id} RETURNING *`;
      const changedPriceInputs = JSON.stringify(existing[0].tiers) !== JSON.stringify(tiers) || JSON.stringify(existing[0].fields) !== JSON.stringify(fields) || JSON.stringify(existing[0].columns) !== JSON.stringify(columns) || existing[0].status !== status;
      if (changedPriceInputs && updated[0]) await publishIntelligenceEvent(tx as any, { type: 'PRICE_CHANGED', entityType: 'PricingMaster', entityId: id, correlationId: req.id, occurredAt: updated[0].updatedAt as Date, transitionId: String(updated[0].updatedAt), metadata: { pricingMasterId: id, status: String(updated[0].status) } });
      return updated;
    });
    return res.json({ success: true, data: rows[0], requestId: req.id });
  } catch (error) { return next(error); }
});

router.delete('/pricing-masters/:id', authenticate, authorize('delete', 'PricingMaster'), async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "status", "updatedAt" FROM "pricing_masters" WHERE "id" = ${id} LIMIT 1`;
      if (existing[0]) await publishIntelligenceEvent(tx as any, { type: 'PRICE_CHANGED', entityType: 'PricingMaster', entityId: id, correlationId: req.id, occurredAt: existing[0].updatedAt as Date, transitionId: `${id}:DELETED`, metadata: { pricingMasterId: id, status: 'DELETED' } });
      await tx.$executeRaw`DELETE FROM "pricing_masters" WHERE "id" = ${id}`;
    });
    return res.json({ success: true, data: { id, deleted: true }, requestId: req.id });
  } catch (error) { return next(error); }
});

// ==============================================================================
// 1. PRODUCTS & CATEGORIES
// ==============================================================================

// Categories
router.post(
  '/categories',
  authenticate,
  authorize('create', 'Category'),
  validate(createCategorySchema),
  productsCtrl.createCategory
);
router.get(
  '/categories',
  authenticate,
  authorize('view', 'Category'),
  productsCtrl.listCategories
);
router.get(
  '/categories/:id',
  authenticate,
  authorize('view', 'Category'),
  productsCtrl.getCategoryById
);
router.put(
  '/categories/:id',
  authenticate,
  authorize('update', 'Category'),
  validate(updateCategorySchema),
  productsCtrl.updateCategory
);
router.post(
  '/categories/:id/status',
  authenticate,
  authorize('update', 'Category'),
  validate(transitionStatusSchema),
  productsCtrl.transitionCategoryStatus
);
router.post(
  '/categories/:id/submit',
  authenticate,
  authorize('update', 'Category'),
  validate(submitValidationSchema),
  productsCtrl.submitCategoryForValidation
);
router.post(
  '/categories/:id/approve',
  authenticate,
  authorize('approve', 'Category'),
  validate(approveMasterSchema),
  productsCtrl.approveCategory
);
router.post(
  '/categories/:id/reject',
  authenticate,
  authorize('update', 'Category'),
  validate(rejectMasterSchema),
  productsCtrl.rejectCategory
);
router.post(
  '/categories/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Category'),
  validate(deactivateMasterSchema),
  productsCtrl.deactivateCategory
);
// Helper to cascade-delete a product, its persisted variant items, and related records.
async function cascadeDeleteProduct(tx: any, productId: string) {
  // Variant inventory rows are persisted as separate Product records as well
  // as ProductVariant rows. Remove those child records first so deleting a
  // parent cannot leave hidden variants behind in the catalog or name checks.
  const productExists = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!productExists) return null;

  const childVariantProducts = await tx.product.findMany({
    where: { metadata: { path: ['parentProductId'], equals: productId } },
    select: { id: true },
  });
  for (const child of childVariantProducts) {
    await cascadeDeleteProduct(tx, child.id);
  }

  // 1. Transaction & ledger records
  await tx.stockLedgerEntry.deleteMany({ where: { productId } });
  await tx.stockBalance.deleteMany({ where: { productId } });
  await tx.stockIssue.deleteMany({ where: { productId } });
  await tx.stockReservation.deleteMany({ where: { productId } });
  await tx.stockAdjustment.deleteMany({ where: { productId } });
  await tx.stockSnapshot.deleteMany({ where: { productId } });
  await tx.stockTransfer.deleteMany({ where: { productId } });

  // 2. Purchasing lines
  await tx.goodsReceiptLine.deleteMany({ where: { productId } });
  await tx.purchaseOrderLine.deleteMany({ where: { productId } });
  await tx.purchaseRequisitionLine.deleteMany({ where: { productId } });

  // 3. Find all BOM versions for this product
  const targetBomVersions = await tx.bomVersion.findMany({
    where: { productId },
    select: { id: true },
  });
  const bomVersionIds = targetBomVersions.map((b: any) => b.id);

  // 4. Production Plans & Assembly Batches
  const planWhere = {
    OR: [
      { productId },
      ...(bomVersionIds.length > 0 ? [{ bomVersionId: { in: bomVersionIds } }] : []),
    ],
  };

  // 4a. FG Receipts & FG Ready Outputs
  await tx.fgReceipt.deleteMany({
    where: {
      OR: [
        { productId },
        { fgReadyOutput: { productId } },
        { fgReadyOutput: { assemblyBatch: { productId } } },
        { fgReadyOutput: { assemblyBatch: { productionPlan: planWhere } } },
        ...(bomVersionIds.length > 0 ? [{ fgReadyOutput: { assemblyBatch: { bomVersionId: { in: bomVersionIds } } } }] : []),
      ],
    },
  });

  await tx.fgPackagingRecord.deleteMany({
    where: {
      fgReadyOutput: {
        OR: [
          { productId },
          { assemblyBatch: { productId } },
          { assemblyBatch: { productionPlan: planWhere } },
          ...(bomVersionIds.length > 0 ? [{ assemblyBatch: { bomVersionId: { in: bomVersionIds } } }] : []),
        ],
      },
    },
  });

  await tx.fgReadyOutput.deleteMany({
    where: {
      OR: [
        { productId },
        { assemblyBatch: { productId } },
        { assemblyBatch: { productionPlan: planWhere } },
        ...(bomVersionIds.length > 0 ? [{ assemblyBatch: { bomVersionId: { in: bomVersionIds } } }] : []),
      ],
    },
  });

  // 4b. Assembly Batches & Components
  await tx.assemblyBatchComponent.deleteMany({
    where: {
      OR: [
        { assemblyBatch: { productId } },
        { assemblyBatch: { productionPlan: planWhere } },
        ...(bomVersionIds.length > 0 ? [{ assemblyBatch: { bomVersionId: { in: bomVersionIds } } }] : []),
      ],
    },
  });

  await tx.assemblyWorkerAssignment.deleteMany({
    where: {
      assemblyBatch: {
        OR: [
          { productId },
          { productionPlan: planWhere },
          ...(bomVersionIds.length > 0 ? [{ bomVersionId: { in: bomVersionIds } }] : []),
        ],
      },
    },
  });

  await tx.assemblyProgressEvent.deleteMany({
    where: {
      assemblyBatch: {
        OR: [
          { productId },
          { productionPlan: planWhere },
          ...(bomVersionIds.length > 0 ? [{ bomVersionId: { in: bomVersionIds } }] : []),
        ],
      },
    },
  });

  await tx.assemblyBatch.deleteMany({
    where: {
      OR: [
        { productId },
        { productionPlan: planWhere },
        ...(bomVersionIds.length > 0 ? [{ bomVersionId: { in: bomVersionIds } }] : []),
      ],
    },
  });

  // 4c. Break self-referential carry forward loops in production plans
  await tx.productionPlan.updateMany({
    where: planWhere,
    data: { carryForwardFromId: null, carryForwardToId: null },
  });

  // 4d. Clean child relations of production plans
  await tx.productionPlanRequirement.deleteMany({
    where: {
      OR: [
        { productionPlan: planWhere },
        { itemType: 'PRODUCT', itemId: productId },
      ],
    },
  });
  await tx.productionMaterialIssue.deleteMany({ where: { productionPlan: planWhere } });
  await tx.productionOutput.deleteMany({ where: { productionPlan: planWhere } });
  await tx.departmentExecutionBatch.deleteMany({ where: { productionPlan: planWhere } });
  await tx.productionPlanEvent.deleteMany({ where: { productionPlan: planWhere } });

  // 4e. Material Issues
  await tx.materialIssueReturn.deleteMany({
    where: {
      OR: [
        { materialIssueLine: { componentProductId: productId } },
        { materialIssue: { productionPlan: planWhere } },
        ...(bomVersionIds.length > 0 ? [{ materialIssue: { bomVersionId: { in: bomVersionIds } } }] : []),
      ],
    },
  });
  await tx.materialIssueLine.deleteMany({
    where: {
      OR: [
        { componentProductId: productId },
        { materialIssue: { productionPlan: planWhere } },
        ...(bomVersionIds.length > 0 ? [{ materialIssue: { bomVersionId: { in: bomVersionIds } } }] : []),
      ],
    },
  });
  await tx.materialIssue.deleteMany({
    where: {
      OR: [
        { productionPlan: planWhere },
        ...(bomVersionIds.length > 0 ? [{ bomVersionId: { in: bomVersionIds } }] : []),
      ],
    },
  });

  // 4f. Delete production plans
  await tx.productionPlan.deleteMany({ where: planWhere });

  // 5. BOMs & Routing
  await tx.bomLine.deleteMany({
    where: {
      OR: [
        { componentProductId: productId },
        { bomVersion: { productId } },
      ],
    },
  });
  await tx.bomGoldenExample.deleteMany({ where: { bomVersion: { productId } } });
  await tx.bomSimulationRun.deleteMany({ where: { bomVersion: { productId } } });

  await tx.bomVersion.updateMany({
    where: { productId },
    data: { supersededById: null },
  });
  await tx.bomVersion.deleteMany({ where: { productId } });

  await tx.routeStep.deleteMany({ where: { route: { productId } } });
  await tx.productRoute.deleteMany({ where: { productId } });

  // 6. Loss events, challans
  await tx.lossEvent.deleteMany({ where: { productId } });
  await tx.replacementChallan.deleteMany({ where: { productId } });

  // 7. Job Work
  await tx.jobWorkOrderLine.deleteMany({ where: { productId } });
  await tx.jobWorkOrder.deleteMany({ where: { productId } });
  await tx.jobWorkMaterialIssue.deleteMany({ where: { productId } });
  await tx.jobWorkCustodyLedger.deleteMany({ where: { productId } });
  await tx.jobWorkReceiptReturn.deleteMany({ where: { productId } });

  // 8. Variants
  await tx.productVariant.deleteMany({ where: { productId } });

  // 9. Break product self-referencing supersessions
  await tx.product.updateMany({
    where: { supersededById: productId },
    data: { supersededById: null },
  });
  await tx.product.updateMany({
    where: { id: productId },
    data: { supersededById: null },
  });

  // 10. Delete the Product itself
  return tx.product.delete({ where: { id: productId } });
}

router.delete('/categories/:id', authenticate, authorize('manage', 'MasterData'), async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    const deleted = await prisma.$transaction(async (tx) => {
      // 1. Unlink materials assigned to this category
      await tx.material.updateMany({
        where: { categoryId },
        data: { categoryId: null },
      });

      // 2. Unlink any child categories referencing this category as parent
      await tx.category.updateMany({
        where: { parentId: categoryId },
        data: { parentId: null },
      });

      // 3. Find all product families (sub-categories) under this category
      const families = await tx.productFamily.findMany({
        where: { categoryId },
        select: { id: true },
      });
      const familyIds = families.map((f: any) => f.id);

      // 4. Find all products referencing this category directly OR through its product families
      const targetProducts = await tx.product.findMany({
        where: {
          OR: [
            { categoryId },
            ...(familyIds.length > 0 ? [{ productFamilyId: { in: familyIds } }] : []),
          ],
        },
        select: { id: true },
      });

      // Cascade delete each referencing product
      for (const prod of targetProducts) {
        await cascadeDeleteProduct(tx, prod.id);
      }

      // 5. Delete all product families under this category
      if (familyIds.length > 0) {
        await tx.productFamily.updateMany({
          where: { categoryId },
          data: { supersededById: null },
        });
        await tx.productFamily.deleteMany({
          where: { categoryId },
        });
      }

      // 6. Break category self-supersession
      await tx.category.updateMany({
        where: { supersededById: categoryId },
        data: { supersededById: null },
      });
      await tx.category.updateMany({
        where: { id: categoryId },
        data: { supersededById: null },
      });

      // 7. Delete the category itself
      return tx.category.delete({ where: { id: categoryId } });
    });

    res.json({ success: true, data: deleted, requestId: req.id });
  } catch (error: any) {
    if (error instanceof ConflictError) return next(error);
    if (error?.code === 'P2003') return next(new ConflictError(`This category is still referenced by other master data (${error?.meta?.field_name || 'relations'}) and cannot be deleted.`));
    next(error);
  }
});

// Product Families
router.post(
  '/product-families',
  authenticate,
  authorize('create', 'ProductFamily'),
  validate(createProductFamilySchema),
  productsCtrl.createProductFamily
);
router.get(
  '/product-families',
  authenticate,
  authorize('view', 'ProductFamily'),
  productsCtrl.listProductFamilies
);
router.get(
  '/product-families/:id',
  authenticate,
  authorize('view', 'ProductFamily'),
  productsCtrl.getProductFamilyById
);
router.put(
  '/product-families/:id',
  authenticate,
  authorize('update', 'ProductFamily'),
  validate(updateProductFamilySchema),
  productsCtrl.updateProductFamily
);
router.post(
  '/product-families/:id/status',
  authenticate,
  authorize('update', 'ProductFamily'),
  validate(transitionStatusSchema),
  productsCtrl.transitionProductFamilyStatus
);
router.delete('/product-families/:id', authenticate, authorize('manage', 'MasterData'), async (req, res, next) => {
  try {
    const familyId = req.params.id;

    const deleted = await prisma.$transaction(async (tx) => {
      // 1. Find all products referencing this product family
      const targetProducts = await tx.product.findMany({
        where: { productFamilyId: familyId },
        select: { id: true },
      });

      // Cascade delete each referencing product
      for (const prod of targetProducts) {
        await cascadeDeleteProduct(tx, prod.id);
      }

      // 2. Break any supersession references on product family
      await tx.productFamily.updateMany({
        where: { supersededById: familyId },
        data: { supersededById: null },
      });
      await tx.productFamily.updateMany({
        where: { id: familyId },
        data: { supersededById: null },
      });

      // 3. Delete the product family itself
      return tx.productFamily.delete({ where: { id: familyId } });
    });

    res.json({ success: true, data: deleted, requestId: req.id });
  } catch (error: any) {
    if (error instanceof ConflictError) return next(error);
    if (error?.code === 'P2003') return next(new ConflictError(`This product family is still referenced by other data (${error?.meta?.field_name || 'relations'}) and cannot be deleted.`));
    next(error);
  }
});

// Products
router.post(
  '/products',
  authenticate,
  authorize('create', 'Product'),
  validate(createProductSchema),
  productsCtrl.createProduct
);
router.post(
  '/products/images',
  authenticate,
  authorize('create', 'Product'),
  productImageUpload.array('images', 12),
  productsCtrl.uploadProductImages
);
router.get(
  '/products',
  authenticate,
  authorize('view', 'Product'),
  productsCtrl.listProducts
);
router.get(
  '/products/:id',
  authenticate,
  authorize('view', 'Product'),
  productsCtrl.getProductById
);
router.get(
  '/products/:id/versions',
  authenticate,
  authorize('view', 'Product'),
  productsCtrl.getProductVersionHistory
);
router.get(
  '/products/:id/vendor-pricing',
  authenticate,
  authorize('view', 'Product'),
  async (req, res, next) => {
    try {
      const productId = req.params.id;
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true } });
      // Also look for potential matching material ID if this product corresponds to material
      const rows = await (prisma as any).vendorCapability.findMany({
        where: {
          OR: [
            { productId },
            { materialId: productId },
            ...(product?.categoryId ? [{ categoryId: product.categoryId }] : []),
          ]
        },
        include: {
          vendor: {
            select: {
              id: true,
              code: true,
              name: true,
              currency: true,
              status: true,
              paymentTerms: true,
              leadTimeDays: true
            }
          }
        },
        orderBy: { unitPrice: 'asc' }
      });
      res.json({ success: true, data: rows, requestId: req.id });
    } catch (error) { next(error); }
  }
);

router.get(
  '/materials/:id/vendor-pricing',
  authenticate,
  authorize('view', 'MasterData'),
  async (req, res, next) => {
    try {
      const materialId = req.params.id;
      const material = await prisma.material.findUnique({ where: { id: materialId }, select: { categoryId: true } });
      const rows = await (prisma as any).vendorCapability.findMany({
        where: {
          OR: [
            { materialId },
            { productId: materialId },
            ...(material?.categoryId ? [{ categoryId: material.categoryId }] : []),
          ]
        },
        include: {
          vendor: {
            select: {
              id: true,
              code: true,
              name: true,
              currency: true,
              status: true,
              paymentTerms: true,
              leadTimeDays: true
            }
          }
        },
        orderBy: { unitPrice: 'asc' }
      });
      res.json({ success: true, data: rows, requestId: req.id });
    } catch (error) { next(error); }
  }
);
router.put(
  '/products/:id',
  authenticate,
  authorize('update', 'Product'),
  validate(updateProductSchema),
  productsCtrl.updateProduct
);
router.delete('/products/:id', authenticate, authorize('manage', 'MasterData'), async (req, res, next) => {
  try {
    const deactivated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!product) return null;

      // Catalog deletion must preserve production and BOM history. Retire the
      // product and its persisted variants instead of cascading through those records.
      const variants = await tx.product.findMany({
        where: { metadata: { path: ['parentProductId'], equals: req.params.id } },
        select: { id: true },
      });
      const ids = [req.params.id, ...variants.map((variant: { id: string }) => variant.id)];
      await tx.product.updateMany({
        where: { id: { in: ids } },
        data: { status: 'INACTIVE', deactivatedAt: new Date() },
      });
      return { id: req.params.id, deactivatedIds: ids };
    });
    res.json({ success: true, data: deactivated, requestId: req.id });
  } catch (error) {
    next(error);
  }
});
router.post(
  '/products/:id/status',
  authenticate,
  authorize('update', 'Product'),
  validate(transitionStatusSchema),
  productsCtrl.transitionProductStatus
);
router.post(
  '/products/:id/submit',
  authenticate,
  authorize('update', 'Product'),
  validate(submitValidationSchema),
  productsCtrl.submitProductForValidation
);
router.post(
  '/products/:id/approve',
  authenticate,
  authorize('approve', 'Product'),
  validate(approveMasterSchema),
  productsCtrl.approveProduct
);
router.post(
  '/products/:id/reject',
  authenticate,
  authorize('update', 'Product'),
  validate(rejectMasterSchema),
  productsCtrl.rejectProduct
);
router.post(
  '/products/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Product'),
  validate(deactivateMasterSchema),
  productsCtrl.deactivateProduct
);

// Variants
router.post(
  '/products/variants',
  authenticate,
  authorize('create', 'ProductVariant'),
  validate(createProductVariantSchema),
  productsCtrl.createProductVariant
);
router.get(
  '/products/variants',
  authenticate,
  authorize('view', 'ProductVariant'),
  productsCtrl.listProductVariants
);
router.get(
  '/products/variants/:id',
  authenticate,
  authorize('view', 'ProductVariant'),
  productsCtrl.getProductVariantById
);
router.put(
  '/products/variants/:id',
  authenticate,
  authorize('update', 'ProductVariant'),
  validate(updateProductVariantSchema),
  productsCtrl.updateProductVariant
);
router.delete('/products/variants/:id', authenticate, authorize('update', 'ProductVariant'), async (req, res, next) => {
  try {
    const result = await prisma.productVariant.updateMany({
      where: { id: req.params.id },
      data: { status: 'INACTIVE', deactivatedAt: new Date() },
    });
    res.json({ success: true, data: { id: req.params.id, deactivated: result.count > 0 }, requestId: req.id });
  } catch (error) {
    next(error);
  }
});

// ==============================================================================
// 2. MATERIALS
// ==============================================================================

router.post(
  '/materials',
  authenticate,
  authorize('create', 'Material'),
  validate(createMaterialSchema),
  materialsCtrl.createMaterial
);
router.get(
  '/materials',
  authenticate,
  authorize('view', 'Material'),
  materialsCtrl.listMaterials
);
router.get(
  '/materials/:id',
  authenticate,
  authorize('view', 'Material'),
  materialsCtrl.getMaterialById
);
router.get(
  '/materials/:id/versions',
  authenticate,
  authorize('view', 'Material'),
  materialsCtrl.getMaterialVersionHistory
);
router.post(
  '/materials/:id/convert-to-product',
  authenticate,
  authorize('update', 'Material'),
  authorize('create', 'Product'),
  async (req, res, next) => {
    try {
      const product = await materialToProductConversionService.convert(req.params.id, req.user!.id, req.id);
      res.status(201).json({ success: true, data: product, requestId: req.id });
    } catch (error) {
      next(error);
    }
  }
);
router.put(
  '/materials/:id',
  authenticate,
  authorize('update', 'Material'),
  validate(updateMaterialSchema),
  materialsCtrl.updateMaterial
);
router.delete('/materials/:id', authenticate, authorize('manage', 'MasterData'), async (req, res, next) => {
  try {
    const deactivated = await prisma.$transaction(async (tx) => {
      const result = await tx.material.updateMany({
        where: { id: req.params.id },
        data: { status: 'INACTIVE', deactivatedAt: new Date() },
      });
      return result.count ? { id: req.params.id, deactivated: true } : null;
    });
    res.json({ success: true, data: deactivated, requestId: req.id });
  } catch (error) {
    next(error);
  }
});
router.post(
  '/materials/:id/status',
  authenticate,
  authorize('update', 'Material'),
  validate(transitionStatusSchema),
  materialsCtrl.transitionMaterialStatus
);
router.post(
  '/materials/:id/submit',
  authenticate,
  authorize('update', 'Material'),
  validate(submitValidationSchema),
  materialsCtrl.submitMaterialForValidation
);
router.post(
  '/materials/:id/approve',
  authenticate,
  authorize('approve', 'Material'),
  validate(approveMasterSchema),
  materialsCtrl.approveMaterial
);
router.post(
  '/materials/:id/reject',
  authenticate,
  authorize('update', 'Material'),
  validate(rejectMasterSchema),
  materialsCtrl.rejectMaterial
);
router.post(
  '/materials/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Material'),
  validate(deactivateMasterSchema),
  materialsCtrl.deactivateMaterial
);

// ==============================================================================
// 3. UNIT OF MEASURE (UOM)
// ==============================================================================

router.post(
  '/uom',
  authenticate,
  authorize('create', 'UnitOfMeasure'),
  validate(createUomSchema),
  uomCtrl.createUom
);
router.get(
  '/uom',
  authenticate,
  authorize('view', 'UnitOfMeasure'),
  uomCtrl.listUoms
);
router.get(
  '/uom/:id',
  authenticate,
  authorize('view', 'UnitOfMeasure'),
  uomCtrl.getUomById
);
router.put(
  '/uom/:id',
  authenticate,
  authorize('update', 'UnitOfMeasure'),
  validate(updateUomSchema),
  uomCtrl.updateUom
);
router.delete('/uom/:id', authenticate, authorize('manage', 'MasterData'), async (req, res, next) => {
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      // 1. Delete conversions involving this UOM
      await tx.uomConversion.deleteMany({
        where: {
          OR: [{ fromUomId: req.params.id }, { toUomId: req.params.id }]
        }
      });
      // 2. Delete pack sizes using this UOM
      await tx.packSize.deleteMany({
        where: { uomId: req.params.id }
      });
      // 3. Clean up transactions and references
      await tx.stockLedgerEntry.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockBalance.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockIssue.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockReservation.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockAdjustment.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockSnapshot.deleteMany({ where: { uomId: req.params.id } });
      await tx.stockTransfer.deleteMany({ where: { uomId: req.params.id } });

      await tx.goodsReceiptLine.deleteMany({ where: { uomId: req.params.id } });
      await tx.purchaseOrderLine.deleteMany({ where: { uomId: req.params.id } });
      await tx.purchaseRequisitionLine.deleteMany({ where: { uomId: req.params.id } });

      await tx.assemblyBatchComponent.deleteMany({ where: { uomId: req.params.id } });
      await tx.materialIssueReturn.deleteMany({ where: { materialIssueLine: { uomId: req.params.id } } });
      await tx.materialIssueLine.deleteMany({ where: { uomId: req.params.id } });

      await tx.lossEvent.deleteMany({ where: { uomId: req.params.id } });
      await tx.replacementChallan.deleteMany({ where: { uomId: req.params.id } });
      await tx.fgReadyOutput.deleteMany({ where: { uomId: req.params.id } });
      await tx.fgReceipt.deleteMany({ where: { uomId: req.params.id } });

      await tx.jobWorkOrderLine.deleteMany({ where: { uomId: req.params.id } });
      await tx.jobWorkMaterialIssue.deleteMany({ where: { uomId: req.params.id } });
      await tx.jobWorkCustodyLedger.deleteMany({ where: { uomId: req.params.id } });
      await tx.jobWorkReceiptReturn.deleteMany({ where: { uomId: req.params.id } });

      // 4. Find fallback active UOM to reassign any business references
      const fallbackUom = (await tx.unitOfMeasure.findFirst({
        where: {
          id: { not: req.params.id },
          status: 'ACTIVE'
        },
        orderBy: { code: 'asc' }
      })) || (await tx.unitOfMeasure.findFirst({
        where: {
          id: { not: req.params.id }
        },
        orderBy: { code: 'asc' }
      }));

      if (fallbackUom) {
        await tx.product.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.material.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.bomLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.bomGoldenExample.updateMany({ where: { inputUomId: req.params.id }, data: { inputUomId: fallbackUom.id } });
        await tx.bomSimulationRun.updateMany({ where: { requestedUomId: req.params.id }, data: { requestedUomId: fallbackUom.id } });
        await tx.productionPlan.updateMany({ where: { quantityUomId: req.params.id }, data: { quantityUomId: fallbackUom.id } });
        await tx.productionPlanRequirement.updateMany({ where: { requiredUomId: req.params.id }, data: { requiredUomId: fallbackUom.id } });
        await tx.productionPlanRequirement.updateMany({ where: { inventoryUomId: req.params.id }, data: { inventoryUomId: fallbackUom.id } });
        await tx.productionMaterialIssue.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.productionOutput.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.materialIssueLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.assemblyBatchComponent.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.fgReadyOutput.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.fgReceipt.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.jobWorkOrder.updateMany({ where: { targetUomId: req.params.id }, data: { targetUomId: fallbackUom.id } });
        await tx.jobWorkOrderLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.jobWorkMaterialIssue.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.jobWorkCustodyLedger.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.jobWorkReceiptReturn.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.purchaseRequisitionLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.purchaseOrderLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.goodsReceiptLine.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockLedgerEntry.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockBalance.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockAdjustment.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockIssue.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockReservation.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockSnapshot.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.stockTransfer.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.lossEvent.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
        await tx.replacementChallan.updateMany({ where: { uomId: req.params.id }, data: { uomId: fallbackUom.id } });
      } else {
        const referencingTotal =
          (await tx.product.count({ where: { uomId: req.params.id } })) +
          (await tx.material.count({ where: { uomId: req.params.id } })) +
          (await tx.bomLine.count({ where: { uomId: req.params.id } }));
        if (referencingTotal > 0) {
          throw new ConflictError(
            `This UOM cannot be deleted because it is the only remaining UOM in the system and is referenced by existing business records.`
          );
        }
      }
      return tx.unitOfMeasure.delete({ where: { id: req.params.id } });
    });
    res.json({ success: true, data: deleted, requestId: req.id });
  } catch (error: any) {
    if (error instanceof ConflictError) return next(error);
    if (error?.code === 'P2003') return next(new ConflictError(`This UOM is still referenced by existing business records (${error?.meta?.field_name || 'relations'}). Please deactivate it instead.`));
    next(error);
  }
});
router.post(
  '/uom/:id/status',
  authenticate,
  authorize('update', 'UnitOfMeasure'),
  validate(transitionStatusSchema),
  uomCtrl.transitionUomStatus
);
router.post(
  '/uom/:id/submit',
  authenticate,
  authorize('update', 'UnitOfMeasure'),
  validate(submitValidationSchema),
  uomCtrl.submitUomForValidation
);
router.post(
  '/uom/:id/approve',
  authenticate,
  authorize('approve', 'UnitOfMeasure'),
  validate(approveMasterSchema),
  uomCtrl.approveUom
);
router.post(
  '/uom/:id/reject',
  authenticate,
  authorize('update', 'UnitOfMeasure'),
  validate(rejectMasterSchema),
  uomCtrl.rejectUom
);
router.post(
  '/uom/:id/deactivate',
  authenticate,
  authorize('deactivate', 'UnitOfMeasure'),
  validate(deactivateMasterSchema),
  uomCtrl.deactivateUom
);

// Conversions & Pack sizes
router.post(
  '/uom/conversions',
  authenticate,
  authorize('create', 'UomConversion'),
  validate(createUomConversionSchema),
  uomCtrl.createConversion
);
router.get(
  '/uom/conversions',
  authenticate,
  authorize('view', 'UomConversion'),
  uomCtrl.listConversions
);
router.get(
  '/uom/conversions/:id',
  authenticate,
  authorize('view', 'UomConversion'),
  uomCtrl.getConversionById
);
router.post(
  '/uom/conversions/:id/status',
  authenticate,
  authorize('update', 'UomConversion'),
  validate(transitionStatusSchema),
  uomCtrl.transitionConversionStatus
);

router.post(
  '/uom/pack-sizes',
  authenticate,
  authorize('create', 'PackSize'),
  validate(createPackSizeSchema),
  uomCtrl.createPackSize
);
router.get(
  '/uom/pack-sizes',
  authenticate,
  authorize('view', 'PackSize'),
  uomCtrl.listPackSizes
);
router.get(
  '/uom/pack-sizes/:id',
  authenticate,
  authorize('view', 'PackSize'),
  uomCtrl.getPackSizeById
);
router.post(
  '/uom/pack-sizes/:id/status',
  authenticate,
  authorize('update', 'PackSize'),
  validate(transitionStatusSchema),
  uomCtrl.transitionPackSizeStatus
);

// ==============================================================================
// 4. VENDORS
// ==============================================================================

router.post(
  '/vendors',
  authenticate,
  requireVendorCreator,
  authorize('create', 'Vendor'),
  validate(createVendorSchema),
  vendorsCtrl.createVendor
);
router.get(
  '/vendors',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.listVendors
);
router.get(
  '/vendors/analytics/scoring',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.getVendorAnalytics
);
router.get(
  '/vendor-scoring/policy',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.getActiveScoringPolicy
);
router.post(
  '/vendor-scoring/policy',
  authenticate,
  authorize('manage', 'VendorScorecard'),
  vendorsCtrl.updateScoringPolicy
);
router.get(
  '/vendors/:id/scoring-detail',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.getVendorEvaluationDetail
);
router.get(
  '/vendors/:id',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.getVendorById
);
router.get(
  '/vendors/:id/profile',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.getVendorProfile
);
router.get(
  '/vendors/:id/evaluations',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.listEvaluations
);
router.post(
  '/vendors/:id/evaluations',
  authenticate,
  authorize('create', 'VendorEvaluation'),
  validate(createVendorEvaluationSchema),
  vendorsCtrl.createEvaluation
);
router.put(
  '/vendors/:id',
  authenticate,
  authorize('update', 'Vendor'),
  validate(updateVendorSchema),
  vendorsCtrl.updateVendor
);
router.delete(
  '/vendors/:id',
  authenticate,
  requireVendorAdmin,
  authorize('delete', 'Vendor'),
  vendorsCtrl.deleteVendor
);
router.post(
  '/vendors/:id/status',
  authenticate,
  requireVendorAdmin,
  authorize('update', 'Vendor'),
  validate(transitionStatusSchema),
  vendorsCtrl.transitionVendorStatus
);
router.post(
  '/vendors/:id/submit',
  authenticate,
  requireVendorAdmin,
  authorize('update', 'Vendor'),
  validate(submitValidationSchema),
  vendorsCtrl.submitVendorForValidation
);
router.post(
  '/vendors/:id/approve',
  authenticate,
  requireVendorAdmin,
  authorize('approve', 'Vendor'),
  validate(approveMasterSchema),
  vendorsCtrl.approveVendor
);
router.post(
  '/vendors/:id/reject',
  authenticate,
  requireVendorAdmin,
  authorize('update', 'Vendor'),
  validate(rejectMasterSchema),
  vendorsCtrl.rejectVendor
);
router.post(
  '/vendors/:id/deactivate',
  authenticate,
  requireVendorAdmin,
  authorize('deactivate', 'Vendor'),
  validate(deactivateMasterSchema),
  vendorsCtrl.deactivateVendor
);
router.get(
  '/vendor-scorecards',
  authenticate,
  authorize('view', 'Vendor'),
  vendorsCtrl.listScorecards
);
router.post(
  '/vendor-scorecards',
  authenticate,
  authorize('manage', 'VendorScorecard'),
  validate(createVendorScorecardSchema),
  vendorsCtrl.createScorecard
);
router.post(
  '/vendor-scorecards/:id/activate',
  authenticate,
  authorize('manage', 'VendorScorecard'),
  vendorsCtrl.activateScorecard
);

// ==============================================================================
// 5. CUSTOMERS
// ==============================================================================

router.post(
  '/customers',
  authenticate,
  authorize('create', 'Customer'),
  validate(createCustomerSchema),
  customersCtrl.createCustomer
);
router.get(
  '/customers',
  authenticate,
  authorize('view', 'Customer'),
  customersCtrl.listCustomers
);
router.get(
  '/customers/:id',
  authenticate,
  authorize('view', 'Customer'),
  customersCtrl.getCustomerById
);
router.put(
  '/customers/:id',
  authenticate,
  authorize('update', 'Customer'),
  validate(updateCustomerSchema),
  customersCtrl.updateCustomer
);
router.post(
  '/customers/:id/status',
  authenticate,
  authorize('update', 'Customer'),
  validate(transitionStatusSchema),
  customersCtrl.transitionCustomerStatus
);
router.post(
  '/customers/:id/submit',
  authenticate,
  authorize('update', 'Customer'),
  validate(submitValidationSchema),
  customersCtrl.submitCustomerForValidation
);
router.post(
  '/customers/:id/approve',
  authenticate,
  authorize('approve', 'Customer'),
  validate(approveMasterSchema),
  customersCtrl.approveCustomer
);
router.post(
  '/customers/:id/reject',
  authenticate,
  authorize('update', 'Customer'),
  validate(rejectMasterSchema),
  customersCtrl.rejectCustomer
);
router.post(
  '/customers/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Customer'),
  validate(deactivateMasterSchema),
  customersCtrl.deactivateCustomer
);

// ==============================================================================
// 6. ORGANIZATIONAL STRUCTURE
// ==============================================================================

router.post(
  '/org/factories',
  authenticate,
  authorize('create', 'Factory'),
  validate(createFactorySchema),
  orgCtrl.createFactory
);
router.get(
  '/org/factories',
  authenticate,
  authorize('view', 'Factory'),
  orgCtrl.listFactories
);
router.get(
  '/org/factories/:id',
  authenticate,
  authorize('view', 'Factory'),
  orgCtrl.getFactoryById
);
router.put(
  '/org/factories/:id',
  authenticate,
  authorize('update', 'Factory'),
  validate(updateFactorySchema),
  orgCtrl.updateFactory
);
router.post(
  '/org/factories/:id/status',
  authenticate,
  authorize('update', 'Factory'),
  validate(transitionStatusSchema),
  orgCtrl.transitionFactoryStatus
);
router.post(
  '/org/factories/:id/submit',
  authenticate,
  authorize('update', 'Factory'),
  validate(submitValidationSchema),
  orgCtrl.submitFactoryForValidation
);
router.post(
  '/org/factories/:id/approve',
  authenticate,
  authorize('approve', 'Factory'),
  validate(approveMasterSchema),
  orgCtrl.approveFactory
);
router.post(
  '/org/factories/:id/reject',
  authenticate,
  authorize('update', 'Factory'),
  validate(rejectMasterSchema),
  orgCtrl.rejectFactory
);
router.post(
  '/org/factories/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Factory'),
  validate(deactivateMasterSchema),
  orgCtrl.deactivateFactory
);

router.post(
  '/org/departments',
  authenticate,
  authorize('create', 'Department'),
  validate(createDepartmentSchema),
  orgCtrl.createDepartment
);
router.get(
  '/org/departments',
  authenticate,
  authorize('view', 'Department'),
  orgCtrl.listDepartments
);
router.get(
  '/org/departments/:id',
  authenticate,
  authorize('view', 'Department'),
  orgCtrl.getDepartmentById
);
router.put(
  '/org/departments/:id',
  authenticate,
  authorize('update', 'Department'),
  validate(updateDepartmentSchema),
  orgCtrl.updateDepartment
);
router.post(
  '/org/departments/:id/status',
  authenticate,
  authorize('update', 'Department'),
  validate(transitionStatusSchema),
  orgCtrl.transitionDepartmentStatus
);
router.post(
  '/org/departments/:id/submit',
  authenticate,
  authorize('update', 'Department'),
  validate(submitValidationSchema),
  orgCtrl.submitDepartmentForValidation
);
router.post(
  '/org/departments/:id/approve',
  authenticate,
  authorize('approve', 'Department'),
  validate(approveMasterSchema),
  orgCtrl.approveDepartment
);
router.post(
  '/org/departments/:id/reject',
  authenticate,
  authorize('update', 'Department'),
  validate(rejectMasterSchema),
  orgCtrl.rejectDepartment
);
router.post(
  '/org/departments/:id/deactivate',
  authenticate,
  authorize('deactivate', 'Department'),
  validate(deactivateMasterSchema),
  orgCtrl.deactivateDepartment
);

router.post(
  '/org/work-centers',
  authenticate,
  authorize('create', 'WorkCenter'),
  validate(createWorkCenterSchema),
  orgCtrl.createWorkCenter
);
router.get(
  '/org/work-centers',
  authenticate,
  authorize('view', 'WorkCenter'),
  orgCtrl.listWorkCenters
);
router.get(
  '/org/work-centers/:id',
  authenticate,
  authorize('view', 'WorkCenter'),
  orgCtrl.getWorkCenterById
);
router.put(
  '/org/work-centers/:id',
  authenticate,
  authorize('update', 'WorkCenter'),
  validate(updateWorkCenterSchema),
  orgCtrl.updateWorkCenter
);
router.post(
  '/org/work-centers/:id/status',
  authenticate,
  authorize('update', 'WorkCenter'),
  validate(transitionStatusSchema),
  orgCtrl.transitionWorkCenterStatus
);

router.post(
  '/org/locations',
  authenticate,
  authorize('create', 'WarehouseLocation'),
  validate(createWarehouseLocationSchema),
  orgCtrl.createWarehouseLocation
);
router.get(
  '/org/locations',
  authenticate,
  authorize('view', 'WarehouseLocation'),
  orgCtrl.listWarehouseLocations
);
router.get(
  '/org/locations/:id',
  authenticate,
  authorize('view', 'WarehouseLocation'),
  orgCtrl.getWarehouseLocationById
);
router.put(
  '/org/locations/:id',
  authenticate,
  authorize('update', 'WarehouseLocation'),
  validate(updateWarehouseLocationSchema),
  orgCtrl.updateWarehouseLocation
);

router.post(
  '/org/employees',
  authenticate,
  authorize('create', 'EmployeeMaster'),
  validate(createEmployeeMasterSchema),
  orgCtrl.createEmployee
);
router.get(
  '/org/employees',
  authenticate,
  authorize(['view', 'read'], ['EmployeeMaster', 'Department', 'MasterData', 'DepartmentExecution'] as any),
  orgCtrl.listEmployees
);
router.get(
  '/org/employees/:id',
  authenticate,
  authorize(['view', 'read'], ['EmployeeMaster', 'Department', 'MasterData', 'DepartmentExecution'] as any),
  orgCtrl.getEmployeeById
);
router.put(
  '/org/employees/:id',
  authenticate,
  authorize('update', 'EmployeeMaster'),
  validate(updateEmployeeMasterSchema),
  orgCtrl.updateEmployee
);

router.post(
  '/org/sales-channels',
  authenticate,
  authorize('create', 'SalesChannel'),
  validate(createSalesChannelSchema),
  orgCtrl.createSalesChannel
);
router.get(
  '/org/sales-channels',
  authenticate,
  authorize('view', 'SalesChannel'),
  orgCtrl.listSalesChannels
);
router.get(
  '/org/sales-channels/:id',
  authenticate,
  authorize('view', 'SalesChannel'),
  orgCtrl.getSalesChannelById
);
router.put(
  '/org/sales-channels/:id',
  authenticate,
  authorize('update', 'SalesChannel'),
  validate(updateSalesChannelSchema),
  orgCtrl.updateSalesChannel
);

// ==============================================================================
// 7. QC & WASTAGE RULES
// ==============================================================================

router.post(
  '/rules/qc',
  authenticate,
  authorize('create', 'QcRule'),
  validate(createQcRuleSchema),
  qcWastageCtrl.createQcRule
);
router.get(
  '/rules/qc',
  authenticate,
  authorize('view', 'QcRule'),
  qcWastageCtrl.listQcRules
);
router.get(
  '/rules/qc/effective',
  authenticate,
  authorize('view', 'QcRule'),
  qcWastageCtrl.resolveEffectiveQcRule
);
router.get(
  '/rules/qc/:id',
  authenticate,
  authorize('view', 'QcRule'),
  qcWastageCtrl.getQcRuleById
);
router.put(
  '/rules/qc/:id',
  authenticate,
  authorize('update', 'QcRule'),
  validate(updateQcRuleSchema),
  qcWastageCtrl.updateQcRule
);
router.post(
  '/rules/qc/:id/status',
  authenticate,
  authorize('update', 'QcRule'),
  validate(transitionStatusSchema),
  qcWastageCtrl.transitionQcRuleStatus
);

router.post(
  '/rules/wastage',
  authenticate,
  authorize('create', 'WastageRule'),
  validate(createWastageRuleSchema),
  qcWastageCtrl.createWastageRule
);
router.get(
  '/rules/wastage',
  authenticate,
  authorize('view', 'WastageRule'),
  qcWastageCtrl.listWastageRules
);
router.get(
  '/rules/wastage/effective',
  authenticate,
  authorize('view', 'WastageRule'),
  qcWastageCtrl.resolveEffectiveWastageRule
);
router.get(
  '/rules/wastage/:id',
  authenticate,
  authorize('view', 'WastageRule'),
  qcWastageCtrl.getWastageRuleById
);
router.put(
  '/rules/wastage/:id',
  authenticate,
  authorize('update', 'WastageRule'),
  validate(updateWastageRuleSchema),
  qcWastageCtrl.updateWastageRule
);
router.post(
  '/rules/wastage/:id/status',
  authenticate,
  authorize('update', 'WastageRule'),
  validate(transitionStatusSchema),
  qcWastageCtrl.transitionWastageRuleStatus
);

// ==============================================================================
// 8. ROUTING & STEPS
// ==============================================================================

router.post('/routing/graphs', authenticate, authorize('create', 'ProductRoute'), validate(saveProductionRouteGraphSchema), async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await graphService.save(req.body), requestId: req.id });
  } catch (error) { next(error); }
});
router.put('/routing/graphs/:id', authenticate, authorize('update', 'ProductRoute'), validate(saveProductionRouteGraphSchema), async (req, res, next) => {
  try {
    res.json({ success: true, data: await graphService.save(req.body, req.params.id), requestId: req.id });
  } catch (error) { next(error); }
});

router.post(
  '/routing/routes',
  authenticate,
  authorize('create', 'ProductRoute'),
  validate(createProductRouteSchema),
  routingCtrl.createRoute
);
router.get(
  '/routing/routes',
  authenticate,
  authorize('view', 'ProductRoute'),
  routingCtrl.listRoutes
);
router.get(
  '/routing/routes/effective',
  authenticate,
  authorize('view', 'ProductRoute'),
  routingCtrl.resolveEffectiveRoute
);
router.get(
  '/routing/routes/:id',
  authenticate,
  authorize('view', 'ProductRoute'),
  routingCtrl.getRouteById
);
router.put(
  '/routing/routes/:id',
  authenticate,
  authorize('update', 'ProductRoute'),
  validate(updateProductRouteSchema),
  routingCtrl.updateRoute
);
router.post(
  '/routing/routes/:id/steps',
  authenticate,
  authorize('update', 'ProductRoute'),
  validate(createRouteStepSchema),
  routingCtrl.addRouteStep
);
router.put(
  '/routing/routes/:id/steps/:stepId',
  authenticate,
  authorize('update', 'ProductRoute'),
  validate(updateRouteStepSchema),
  routingCtrl.updateRouteStep
);
router.delete(
  '/routing/routes/:id/steps/:stepId',
  authenticate,
  authorize('update', 'ProductRoute'),
  routingCtrl.deleteRouteStep
);
router.post(
  '/routing/routes/:id/status',
  authenticate,
  authorize('update', 'ProductRoute'),
  validate(transitionStatusSchema),
  routingCtrl.transitionRouteStatus
);

// ==============================================================================
// 9. IMPORT & EXPORT
// ==============================================================================

router.post(
  '/import/stage',
  authenticate,
  authorize('import', 'MasterData'),
  upload.single('file'),
  // validate(stageImportBatchSchema), // Disable schema validation here because we parse body & file in controller
  importExportCtrl.stageBatch
);
router.get(
  '/import/batches/:id/preview',
  authenticate,
  authorize('import', 'MasterData'),
  importExportCtrl.getBatchPreview
);
router.post(
  '/import/batches/:batchId/rows/:rowId/resolve',
  authenticate,
  authorize('import', 'MasterData'),
  importExportCtrl.resolveDuplicate
);
router.post(
  '/import/batches/:id/commit',
  authenticate,
  authorize('import', 'MasterData'),
  validate(commitImportBatchSchema),
  importExportCtrl.commitBatch
);
router.get(
  '/export',
  authenticate,
  authorize('export', 'MasterData'),
  importExportCtrl.exportData
);

export default router;
