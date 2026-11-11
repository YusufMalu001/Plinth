import { PrismaClient, LifecycleStatus, MaterialType, Role } from '@prisma/client';
import argon2 from 'argon2';
import { seedHsnSacCodes } from './seed-hsn-sac';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Owner-provisioned bootstrap credentials (reported in the refactor log).
  // Rotate after first sign-in.
  const [adminPassword, managerPassword] = await Promise.all([
    argon2.hash('admin123', { type: argon2.argon2id }),
    argon2.hash('storemanager123', { type: argon2.argon2id })
  ]);

  // 1. Seed Users
  console.log('👤 Seeding users...');
  const fullSeed = process.env.SEED_FULL === 'true';
  const usersData: { email: string; name: string; password: string; role: Role }[] = fullSeed
    ? [
      { email: 'admin@gmail.com', name: 'System Admin', password: adminPassword, role: Role.admin },
      { email: 'storemanager@gmail.com', name: 'Store Manager', password: managerPassword, role: Role.manager }
    ]
    : [
      { email: 'admin@gmail.com', name: 'System Admin', password: adminPassword, role: Role.admin },
      { email: 'storemanager@gmail.com', name: 'Store Manager', password: managerPassword, role: Role.manager }
    ];

  // Fixture users can be referenced by receiving/approval history, so the
  // database correctly prevents hard deletion. Reclaim their rows for real
  // accounts (preserving history and foreign keys), and archive any leftover
  // fixture row so it cannot be used to sign in.
  const fixtureEmails = ['approver@test.com', 'clerk@test.com', 'creator@test.com', 'receiver@test.com'];
  const fixtureUsers = await prisma.user.findMany({ where: { email: { in: fixtureEmails } }, orderBy: { email: 'asc' } });
  for (let i = 0; i < fixtureUsers.length; i += 1) {
    const fixture = fixtureUsers[i];
    const replacement = usersData[i];
    if (replacement && !(await prisma.user.findUnique({ where: { email: replacement.email } }))) {
      await prisma.user.update({ where: { id: fixture.id }, data: {
        email: replacement.email,
        name: replacement.name,
        role: replacement.role,
        password: replacement.password,
        isActive: true
      } });
    } else {
      await prisma.user.update({ where: { id: fixture.id }, data: {
        email: `archived-${fixture.id}@invalid.local`,
        name: 'Archived User',
        isActive: false
      } });
    }
  }

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      // Passwords are intentionally reset only when explicitly requested for
      // local development. A normal seed must never overwrite real user
      // credentials.
      update: process.env.SEED_RESET_PASSWORDS === 'true'
        ? { isActive: true, name: u.name, role: u.role, password: u.password }
        : { isActive: true },
      create: {
        email: u.email,
        name: u.name,
        password: u.password,
        role: u.role,
        isActive: true
      }
    });
  }
  console.log(`✅ Seeded ${usersData.length} users`);

  // 2. Seed Units of Measure (UOMs)
  console.log('📐 Seeding Units of Measure (UOM)...');
  const uomList = [
    { code: 'PCS', name: 'PIECES', symbol: 'PCS', dimension: 'COUNT', status: LifecycleStatus.ACTIVE },
    { code: 'KG', name: 'Kilograms', symbol: 'kg', dimension: 'MASS', status: LifecycleStatus.ACTIVE },
    { code: 'G', name: 'Grams', symbol: 'g', dimension: 'MASS', status: LifecycleStatus.ACTIVE },
    { code: 'MTR', name: 'METERS', symbol: 'MTR', dimension: 'LENGTH', status: LifecycleStatus.ACTIVE },
    { code: 'MM', name: 'Millimeters', symbol: 'mm', dimension: 'LENGTH', status: LifecycleStatus.ACTIVE },
    { code: 'LTR', name: 'Liters', symbol: 'L', dimension: 'VOLUME', status: LifecycleStatus.ACTIVE },
    { code: 'ML', name: 'Milliliters', symbol: 'mL', dimension: 'VOLUME', status: LifecycleStatus.ACTIVE },
    { code: 'NOS', name: 'NUMBERS', symbol: 'NOS', dimension: 'COUNT', status: LifecycleStatus.ACTIVE },
    { code: 'BOX', name: 'BOX', symbol: 'BOX', dimension: 'COUNT', status: LifecycleStatus.ACTIVE },
    { code: 'FT', name: 'Feet', symbol: 'ft', dimension: 'LENGTH', status: LifecycleStatus.ACTIVE },
  ];

  const uomMap = new Map<string, string>(); // code -> id

  for (const item of uomList) {
    const uom = await prisma.unitOfMeasure.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        symbol: item.symbol,
        dimension: item.dimension,
        status: item.status
      },
      create: {
        code: item.code,
        name: item.name,
        symbol: item.symbol,
        dimension: item.dimension,
        status: item.status
      }
    });
    uomMap.set(uom.code, uom.id);
  }
  console.log(`✅ Seeded ${uomList.length} Units of Measure`);

  // 3. Seed UOM Conversions
  console.log('🔄 Seeding UOM Conversions...');
  const conversions = [
    { from: 'KG', to: 'G', factor: 1000.0, status: LifecycleStatus.ACTIVE },
    { from: 'MTR', to: 'MM', factor: 1000.0, status: LifecycleStatus.ACTIVE },
    { from: 'LTR', to: 'ML', factor: 1000.0, status: LifecycleStatus.ACTIVE }
  ];

  for (const conv of conversions) {
    const fromUomId = uomMap.get(conv.from);
    const toUomId = uomMap.get(conv.to);
    if (fromUomId && toUomId) {
      await prisma.uomConversion.upsert({
        where: {
          fromUomId_toUomId_version: {
            fromUomId,
            toUomId,
            version: 1
          }
        },
        update: {
          factor: conv.factor,
          status: conv.status
        },
        create: {
          fromUomId,
          toUomId,
          factor: conv.factor,
          version: 1,
          effectiveDate: new Date(),
          status: conv.status
        }
      });
    }
  }
  console.log(`✅ Seeded ${conversions.length} UOM Conversions`);

  await seedHsnSacCodes(prisma);

  // Default local development profile: keep the database empty apart from
  // accounts and reusable UOM masters. The complete fixture catalogue remains
  // available only when explicitly requested with SEED_FULL=true.
  if (!fullSeed) {
    await prisma.$disconnect();
    return;
  }

  // 4. Seed Categories
  console.log('🏷️ Seeding Master Data Categories...');
  const categoriesData = [
    { code: 'CAT-RAW', name: 'Raw Materials', description: 'Metals, polymers, and raw fabrication stock' },
    { code: 'CAT-HDW', name: 'Hardware & Fasteners', description: 'Bolts, nuts, screws, washers, and fittings' }
  ];

  const categoryMap = new Map<string, string>(); // code -> id

  for (const cat of categoriesData) {
    const category = await prisma.category.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        description: cat.description
      },
      create: {
        code: cat.code,
        name: cat.name,
        description: cat.description
      }
    });
    categoryMap.set(category.code, category.id);
  }
  console.log(`✅ Seeded ${categoriesData.length} Categories`);

  // 4b. Seed Factories and Departments
  console.log('🏭 Seeding Factories & Departments...');
  const mainFactory = await prisma.factory.upsert({
    where: { code: 'FAC-MAIN-01' },
    update: {
      name: 'Main Manufacturing Plant',
      status: LifecycleStatus.ACTIVE
    },
    create: {
      code: 'FAC-MAIN-01',
      name: 'Main Manufacturing Plant',
      status: LifecycleStatus.ACTIVE,
      address: { city: 'Pune', state: 'Maharashtra', country: 'India' }
    }
  });

  // Shop-floor departments are intentionally created by administrators in the
  // department workflow. Do not seed legacy departments into the live catalog.
  console.log('✅ Seeded Factory; shop-floor departments are administrator-managed');

  // 4c. Seed RBAC (dynamic Role/Permission/UserRole) - scoped to GRN + Procurement modules only.
  // Every other module keeps running on the AllowAllPermissionChecker default.
  console.log('🔐 Seeding RBAC (GRN + Procurement scope)...');

  const existingMainLocation = await prisma.warehouseLocation.findFirst({
    where: { type: 'STORE', status: LifecycleStatus.ACTIVE },
    orderBy: { createdAt: 'asc' },
  });
  const mainLocation = existingMainLocation
    ? await prisma.warehouseLocation.update({ where: { id: existingMainLocation.id }, data: { name: 'Main Store', factoryId: mainFactory.id, status: LifecycleStatus.ACTIVE } })
    : await prisma.warehouseLocation.create({ data: { code: 'MAIN-STORE', name: 'Main Store', factoryId: mainFactory.id, type: 'STORE', status: LifecycleStatus.ACTIVE } });

  const permissionCatalog: { action: string; resource: string }[] = [
    { action: 'read', resource: 'MasterData' },
    { action: 'view', resource: 'Product' },
    { action: 'view', resource: 'Material' },
    { action: 'view', resource: 'Vendor' },
    { action: 'create', resource: 'Vendor' },
    { action: 'update', resource: 'Vendor' },
    { action: 'approve', resource: 'Vendor' },
    { action: 'deactivate', resource: 'Vendor' },
    { action: 'delete', resource: 'Vendor' },
    { action: 'view', resource: 'UnitOfMeasure' },
    { action: 'view', resource: 'WarehouseLocation' },
    { action: 'receive', resource: 'GoodsReceiptNote' },
    { action: 'read', resource: 'GoodsReceiptNote' },
    { action: 'update', resource: 'GoodsReceiptNote' },
    { action: 'verify', resource: 'GoodsReceiptNote' },
    { action: 'sign_off', resource: 'GoodsReceiptNote' },
    { action: 'finalize', resource: 'GoodsReceiptNote' },
    { action: 'export', resource: 'GoodsReceiptNote' },
    { action: 'upload_document', resource: 'GoodsReceiptNote' },
    { action: 'update', resource: 'GoodsReceiptLabel' },
    { action: 'read', resource: 'GoodsReceiptDiscrepancy' },
    { action: 'resolve_discrepancy', resource: 'GoodsReceiptDiscrepancy' },
    { action: 'return', resource: 'GoodsReceiptDiscrepancy' },
    { action: 'read', resource: 'ExpectedReceipt' },
    { action: 'submit', resource: 'ExpectedReceipt' },
    { action: 'request', resource: 'PurchaseRequisition' },
    { action: 'read', resource: 'PurchaseRequisition' },
    { action: 'submit', resource: 'PurchaseRequisition' },
    { action: 'approve', resource: 'PurchaseRequisition' },
    { action: 'self_approve', resource: 'PurchaseRequisition' },
    { action: 'reject', resource: 'PurchaseRequisition' },
    { action: 'request_changes', resource: 'PurchaseRequisition' },
    { action: 'cancel', resource: 'PurchaseRequisition' },
    { action: 'create', resource: 'PurchaseOrder' },
    { action: 'read', resource: 'PurchaseOrder' },
    { action: 'approve', resource: 'PurchaseOrder' },
    { action: 'self_approve', resource: 'PurchaseOrder' },
    { action: 'issue', resource: 'PurchaseOrder' },
    { action: 'revise', resource: 'PurchaseOrder' },
    { action: 'cancel', resource: 'PurchaseOrder' },
    { action: 'delete', resource: 'PurchaseOrder' },
    { action: 'export', resource: 'PurchaseOrder' },
    // Module 4 - Inventory & Store Management
    { action: 'view', resource: 'StockBalance' },
    { action: 'export', resource: 'StockBalance' },
    { action: 'view', resource: 'StockIssue' },
    { action: 'issue', resource: 'StockIssue' },
    { action: 'view', resource: 'StockTransfer' },
    { action: 'transfer', resource: 'StockTransfer' },
    { action: 'view', resource: 'StockAdjustment' },
    { action: 'adjust', resource: 'StockAdjustment' },
    { action: 'approve', resource: 'StockAdjustment' },
    { action: 'view', resource: 'StockReservation' },
    { action: 'reserve', resource: 'StockReservation' },
    // Module 15 - Sales & Order Management
    { action: 'read', resource: 'SalesOrder' },
    { action: 'create', resource: 'SalesOrder' },
    { action: 'update', resource: 'SalesOrder' },
    { action: 'approve', resource: 'SalesOrder' },
    { action: 'confirm', resource: 'SalesOrder' },
    { action: 'cancel', resource: 'SalesOrder' },
    { action: 'allocate', resource: 'SalesOrder' },
    { action: 'read', resource: 'SalesReport' },
    // Module 8 - Department-Wise Execution & Shop-Floor Tracking
    { action: 'view', resource: 'DepartmentExecution' },
    { action: 'receive', resource: 'DepartmentExecution' },
    { action: 'assign', resource: 'DepartmentExecution' },
    { action: 'start', resource: 'DepartmentExecution' },
    { action: 'update', resource: 'DepartmentExecution' },
    { action: 'complete', resource: 'DepartmentExecution' },
    { action: 'reject', resource: 'DepartmentExecution' },
    { action: 'handover_propose', resource: 'DepartmentExecution' },
    { action: 'handover_accept', resource: 'DepartmentExecution' },
    { action: 'manage', resource: 'DepartmentExecution' },
    { action: 'override_manage', resource: 'DepartmentExecution' },
    // Module 9 - WIP & Batch Tracking
    { action: 'view', resource: 'WipTracking' },
    { action: 'trace', resource: 'WipTracking' },
    { action: 'reconcile', resource: 'WipTracking' },
    { action: 'manage_exception', resource: 'WipTracking' },
    // Module 10 - Quality Management & Inspection
    { action: 'view', resource: 'QualityInspection' },
    { action: 'inspect', resource: 'QualityInspection' },
    { action: 'rework_disposition', resource: 'QualityInspection' },
    { action: 'reject', resource: 'QualityInspection' },
    { action: 'release', resource: 'QualityInspection' },
    { action: 'configure', resource: 'QualityInspection' },
    { action: 'override', resource: 'QualityInspection' },
    // Module 11 - Loss, Damage & Wastage Management
    { action: 'report', resource: 'LossEvent' },
    { action: 'read', resource: 'LossEvent' },
    { action: 'review', resource: 'LossEvent' },
    { action: 'approve', resource: 'LossEvent' },
    { action: 'reject', resource: 'LossEvent' },
    { action: 'investigate', resource: 'LossEvent' },
    { action: 'post', resource: 'LossEvent' },
    { action: 'replace', resource: 'LossEvent' },
    { action: 'export', resource: 'LossEvent' },
    // Module 18 - Finance & Tally Integration
    { action: 'read', resource: 'FinanceIntegration' },
    { action: 'create', resource: 'FinanceMapping' },
    { action: 'approve', resource: 'FinanceMapping' },
    { action: 'queue', resource: 'FinanceIntegration' },
    { action: 'export', resource: 'FinanceIntegration' },
    { action: 'retry', resource: 'FinanceIntegration' },
    { action: 'acknowledge', resource: 'FinanceIntegration' },
    { action: 'reconcile', resource: 'FinanceIntegration' }
  ];

  const permissionMap = new Map<string, string>(); // "action:resource" -> id
  for (const p of permissionCatalog) {
    const key = `${p.action}:${p.resource}`;
    const perm = await prisma.permission.upsert({
      where: { action_resource: { action: p.action, resource: p.resource } },
      update: { key },
      create: { ...p, key }
    });
    permissionMap.set(`${p.action}:${p.resource}`, perm.id);
  }

  const roleDefinitions: {
    name: string;
    description: string;
    isSystem?: boolean;
    allLocations?: boolean;
    permissions: string[];
  }[] = [
    {
      name: 'admin',
      description: 'Full access across GRN and Procurement',
      isSystem: true,
      allLocations: true,
      permissions: permissionCatalog.map((p) => `${p.action}:${p.resource}`)
    },
    {
      name: 'procurement_officer',
      description: 'Raises requisitions and purchase orders',
      permissions: [
        'request:PurchaseRequisition',
        'read:PurchaseRequisition',
        'submit:PurchaseRequisition',
        'cancel:PurchaseRequisition',
        'create:PurchaseOrder',
        'read:PurchaseOrder',
        'read:ExpectedReceipt'
        , 'read:MasterData', 'view:Product', 'view:Material', 'view:Vendor', 'view:UnitOfMeasure'
      ]
    },
    {
      name: 'inventory-manager',
      description: 'Raises and revises detailed material purchase requirements',
      permissions: [
        'request:PurchaseRequisition',
        'read:PurchaseRequisition',
        'submit:PurchaseRequisition',
        'cancel:PurchaseRequisition',
        'read:PurchaseOrder',
        'read:ExpectedReceipt'
        , 'read:MasterData', 'view:Product', 'view:Material', 'view:Vendor', 'view:UnitOfMeasure'
      ]
    },
    {
      name: 'store-manager',
      description: 'Performs store review before administrator approval',
      permissions: [
        'read:SalesOrder', 'update:SalesOrder', 'approve:SalesOrder', 'confirm:SalesOrder', 'cancel:SalesOrder',
        'read:PurchaseRequisition',
        'submit:PurchaseRequisition',
        'approve:PurchaseRequisition',
        'reject:PurchaseRequisition',
        'request_changes:PurchaseRequisition',
        'create:PurchaseOrder',
        'read:PurchaseOrder',
        'read:ExpectedReceipt',
        'submit:ExpectedReceipt',
        'read:MasterData', 'view:Product', 'view:Material', 'view:Vendor', 'view:UnitOfMeasure', 'view:WarehouseLocation',
        'create:Vendor', 'update:Vendor',
        'receive:GoodsReceiptNote', 'read:GoodsReceiptNote', 'update:GoodsReceiptNote',
        'verify:GoodsReceiptNote', 'upload_document:GoodsReceiptNote', 'update:GoodsReceiptLabel',
        'read:GoodsReceiptDiscrepancy'
      ]
    },
    {
      name: 'procurement_manager',
      description: 'Approves requisitions and purchase orders',
      permissions: [
        'read:PurchaseRequisition',
        'submit:PurchaseRequisition',
        'approve:PurchaseRequisition',
        'self_approve:PurchaseRequisition',
        'reject:PurchaseRequisition',
        'request_changes:PurchaseRequisition',
        'cancel:PurchaseRequisition',
        'read:PurchaseOrder',
        'approve:PurchaseOrder',
        'self_approve:PurchaseOrder',
        'issue:PurchaseOrder',
        'revise:PurchaseOrder',
        'cancel:PurchaseOrder',
        'delete:PurchaseOrder',
        'export:PurchaseOrder',
        'read:ExpectedReceipt',
        'submit:ExpectedReceipt'
      ]
    },
    {
      name: 'grn_clerk',
      description: 'Receives goods and captures measurements',
      permissions: [
        'receive:GoodsReceiptNote',
        'read:GoodsReceiptNote',
        'update:GoodsReceiptNote',
        'upload_document:GoodsReceiptNote',
        'update:GoodsReceiptLabel',
        'read:ExpectedReceipt'
      ]
    },
    {
      name: 'grn_verifier',
      description: 'Verifies goods receipt lines and raises discrepancies',
      permissions: [
        'verify:GoodsReceiptNote',
        'read:GoodsReceiptNote',
        'read:GoodsReceiptDiscrepancy',
        'resolve_discrepancy:GoodsReceiptDiscrepancy'
      ]
    },
    {
      name: 'grn_supervisor',
      description: 'Signs off and finalizes goods receipts across all locations',
      allLocations: true,
      permissions: [
        'sign_off:GoodsReceiptNote',
        'finalize:GoodsReceiptNote',
        'export:GoodsReceiptNote',
        'read:GoodsReceiptNote',
        'return:GoodsReceiptDiscrepancy',
        'read:GoodsReceiptDiscrepancy'
      ]
    },
    {
      name: 'store_clerk',
      description: 'Issues, transfers, and reserves stock at their assigned location',
      permissions: [
        'view:StockBalance',
        'view:StockIssue',
        'issue:StockIssue',
        'view:StockTransfer',
        'transfer:StockTransfer',
        'view:StockAdjustment',
        'adjust:StockAdjustment',
        'view:StockReservation',
        'reserve:StockReservation'
      ]
    },
    {
      name: 'store_supervisor',
      description: 'Approves stock adjustments and exports inventory reports across all locations',
      allLocations: true,
      permissions: [
        'view:StockBalance',
        'export:StockBalance',
        'view:StockIssue',
        'issue:StockIssue',
        'view:StockTransfer',
        'transfer:StockTransfer',
        'view:StockAdjustment',
        'adjust:StockAdjustment',
        'approve:StockAdjustment',
        'view:StockReservation',
        'reserve:StockReservation'
      ]
    },
    {
      name: 'sales_executive',
      description: 'Creates, reviews and manages customer sales orders',
      permissions: [
        'read:SalesOrder', 'create:SalesOrder', 'read:SalesReport'
      ]
    },
    {
      name: 'inventory_allocator',
      description: 'Allocates confirmed sales demand against saleable inventory',
      permissions: [
        'read:SalesOrder', 'allocate:SalesOrder', 'read:StockBalance', 'view:StockReservation', 'reserve:StockReservation'
      ]
    },
    {
      name: 'department_incharge',
      description: 'Department Incharge with full stage execution, worker assignment, and handover authority within department',
      permissions: [
        'view:DepartmentExecution',
        'receive:DepartmentExecution',
        'assign:DepartmentExecution',
        'start:DepartmentExecution',
        'update:DepartmentExecution',
        'complete:DepartmentExecution',
        'reject:DepartmentExecution',
        'handover_propose:DepartmentExecution',
        'handover_accept:DepartmentExecution',
        'view:WipTracking',
        'trace:WipTracking',
        'reconcile:WipTracking',
        'manage_exception:WipTracking',
        'report:LossEvent',
        'read:LossEvent',
        'read:MasterData',
        'view:Product',
        'view:Material',
        'view:UnitOfMeasure',
        'read:Inventory',
        'read:StockLedgerEntry'
      ]
    },
    {
      name: 'shop_floor_operator',
      description: 'Shop-floor worker executing assigned batches and recording progress',
      permissions: [
        'view:DepartmentExecution',
        'start:DepartmentExecution',
        'update:DepartmentExecution',
        'complete:DepartmentExecution',
        'view:WipTracking',
        'report:LossEvent',
        'read:LossEvent'
      ]
    },
    {
      name: 'quality_inspector',
      description: 'Performs quality checks and records inspection results',
      allLocations: true,
      permissions: [
        'view:QualityInspection',
        'inspect:QualityInspection',
        'rework_disposition:QualityInspection',
        'read:MasterData',
        'view:Product',
        'view:Material',
        'view:DepartmentExecution',
        'view:WipTracking'
      ]
    },
    {
      name: 'quality_manager',
      description: 'Quality Manager with full authority over criteria, dispositions, releases, and overrides',
      allLocations: true,
      permissions: [
        'view:QualityInspection',
        'inspect:QualityInspection',
        'rework_disposition:QualityInspection',
        'reject:QualityInspection',
        'release:QualityInspection',
        'configure:QualityInspection',
        'override:QualityInspection',
        'read:MasterData',
        'view:Product',
        'view:Material',
        'view:DepartmentExecution',
        'view:WipTracking'
      ]
    }
  ];

  const roleMap = new Map<string, string>(); // name -> id
  for (const r of roleDefinitions) {
    const role = await prisma.rbacRole.upsert({
      where: { name: r.name },
      update: { description: r.description, isSystem: r.isSystem ?? false, allLocations: r.allLocations ?? false },
      create: {
        name: r.name,
        description: r.description,
        isSystem: r.isSystem ?? false,
        allLocations: r.allLocations ?? false
      }
    });
    roleMap.set(r.name, role.id);

    for (const key of r.permissions) {
      const permissionId = permissionMap.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId }
      });
    }
  }
  console.log(`✅ Seeded ${permissionCatalog.length} permissions and ${roleDefinitions.length} roles`);

  // Consolidate Module 3 ownership: store managers operate receiving, while
  // administrators retain sign-off/finalization. Remove legacy GRN grants from
  // the seeded users so re-running the seed cannot leave elevated permissions behind.
  await prisma.userRole.deleteMany({
    where: {
      user: { email: { in: ['storemanager@gmail.com', 'fardeen@plinth.example'] } },
      role: { name: { in: ['grn_clerk', 'grn_verifier', 'grn_supervisor'] } }
    }
  });

  // Assign existing seeded users to roles + the main location/organization.
  const userRoleAssignments: { email: string; roles: string[] }[] = [
    { email: 'admin@gmail.com', roles: ['admin'] },
    { email: 'siddhi@plinth.example', roles: ['admin'] },
    { email: 'yusuf.malu@gmail.com', roles: ['admin'] },
    { email: 'storemanager@gmail.com', roles: ['store-manager', 'procurement_manager'] },
    { email: 'fardeen@plinth.example', roles: ['inventory-manager', 'procurement_officer'] }
  ];

  for (const assignment of userRoleAssignments) {
    const user = await prisma.user.findUnique({ where: { email: assignment.email } });
    if (!user) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: { assignedOrganizationId: mainFactory.id, assignedLocationId: mainLocation.id }
    });

    for (const roleName of assignment.roles) {
      const roleId = roleMap.get(roleName);
      if (!roleId) continue;
      // Prisma's compound-unique shorthand can't take null for a nullable member
      // (organizationId), so this upsert is done manually via findFirst + create.
      const existingGrant = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId, organizationId: null }
      });
      if (!existingGrant) {
        await prisma.userRole.create({ data: { userId: user.id, roleId, organizationId: null } });
      }
    }
  }
  console.log(`✅ Assigned roles and location to ${userRoleAssignments.length} seeded users`);

  // 5. Seed Materials
  console.log('📦 Seeding Materials...');
  const materialsData = [
    {
      code: 'MAT-PIPE-001',
      name: 'SS 3/4" x 0.8mm Pipe - 12 Feet',
      description: 'Used in laser cutting (frame)',
      materialType: MaterialType.RAW_MATERIAL,
      categoryCode: 'CAT-RAW',
      uomCode: 'PCS',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-PIPE-002',
      name: 'SS 3/4" x 0.8mm Pipe - 20.5 Feet',
      description: 'Used in laser cutting (frame)',
      materialType: MaterialType.RAW_MATERIAL,
      categoryCode: 'CAT-RAW',
      uomCode: 'PCS',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-PIPE-003',
      name: 'SS 3/4" x 0.9mm Pipe',
      description: 'Used in E-Rod / D-Rod / Top Rod',
      materialType: MaterialType.RAW_MATERIAL,
      categoryCode: 'CAT-RAW',
      uomCode: 'PCS',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-PIPE-004',
      name: 'SS 1/2" x 0.6mm Pipe',
      description: 'Used in pipe cutting (827mm / 860mm rods)',
      materialType: MaterialType.RAW_MATERIAL,
      categoryCode: 'CAT-RAW',
      uomCode: 'PCS',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-001',
      name: 'SS Hex Bolt 6x40',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-002',
      name: 'SS Hex Bolt 6x50',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-003',
      name: 'SS Hex Bolt 6x60',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-004',
      name: 'SS Hex Bolt 6x70',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-005',
      name: 'Economy SS Screws',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-006',
      name: 'SS 8mm Hex Nut',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-007',
      name: 'SS 6mm Hex Nut',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    },
    {
      code: 'MAT-HDW-008',
      name: 'SS Nylock Nut 6mm',
      description: 'Used in assembly',
      materialType: MaterialType.HARDWARE,
      categoryCode: 'CAT-HDW',
      uomCode: 'EA',
      specs: {},
      status: LifecycleStatus.APPROVED
    }
  ];

  for (const mat of materialsData) {
    const uomId = uomMap.get(mat.uomCode);
    const categoryId = categoryMap.get(mat.categoryCode);

    if (!uomId) {
      console.warn(`⚠️ UOM ${mat.uomCode} not found for material ${mat.code}`);
      continue;
    }

    await prisma.material.upsert({
      where: { code: mat.code },
      update: {
        name: mat.name,
        description: mat.description,
        materialType: mat.materialType,
        categoryId: categoryId || null,
        uomId,
        specs: mat.specs,
        status: mat.status
      },
      create: {
        code: mat.code,
        name: mat.name,
        description: mat.description,
        materialType: mat.materialType,
        categoryId: categoryId || null,
        uomId,
        specs: mat.specs,
        status: mat.status,
        version: 1
      }
    });
  }
  console.log(`✅ Seeded ${materialsData.length} Materials`);

  // 6. Seed CS8 finished/semi-finished products from the production workbook.
  // These are the real component names used on the CS8 production schedules;
  // upsert keeps the seed safe to re-run without creating duplicate masters.
  console.log('🏗️ Seeding CS8 products from PS - CS8 workbook...');
  const cs8Category = await prisma.category.upsert({
    where: { code: 'CAT-CS8' },
    update: {
      name: 'CS8 Components',
      description: 'Finished and semi-finished CS8 production components',
      status: LifecycleStatus.ACTIVE
    },
    create: {
      code: 'CAT-CS8',
      name: 'CS8 Components',
      description: 'Finished and semi-finished CS8 production components',
      status: LifecycleStatus.ACTIVE
    }
  });
  const cs8Family = await prisma.productFamily.upsert({
    where: { code: 'FAM-CS8' },
    update: { name: 'CS8', categoryId: cs8Category.id, status: LifecycleStatus.ACTIVE },
    create: { code: 'FAM-CS8', name: 'CS8', categoryId: cs8Category.id, status: LifecycleStatus.ACTIVE }
  });
  const cs8Products = [
    { sku: 'PROD-001', name: 'CS8 - Lower Frame with Rods', description: 'CS8 laser-cut lower frame with rods' },
    { sku: 'PROD-002', name: 'CS8 - Lower Frame without Rods', description: 'CS8 laser-cut lower frame without rods' },
    { sku: 'PROD-003', name: 'CS8 - Top Frame with Rods', description: 'CS8 laser-cut top frame with rods' },
    { sku: 'PROD-004', name: 'CS8 - Top Frame without Rods', description: 'CS8 laser-cut top frame without rods' },
    { sku: 'PROD-005', name: 'CS8 - Top Rod', description: 'CS8 top rod assembly' },
    { sku: 'PROD-006', name: 'CS8 - Top Rod LHS', description: 'CS8 left-hand top rod' },
    { sku: 'PROD-007', name: 'CS8 - Top Rod RHS', description: 'CS8 right-hand top rod' },
    { sku: 'PROD-008', name: 'CS8 - 827mm Pipe', description: 'CS8 middle rod cut to 827mm' },
    { sku: 'PROD-009', name: 'CS8 - 860mm Pipe', description: 'CS8 middle rod cut to 860mm' },
    { sku: 'PROD-010', name: 'CS8 - Side Cap', description: 'CS8 side cap' },
    { sku: 'PROD-011', name: 'CS8 - Bottom Cap', description: 'CS8 bottom cap' },
    { sku: 'PROD-012', name: 'E-Rod', description: 'E-Rod cut from SS 3/4 x 0.9mm pipe' },
    { sku: 'PROD-013', name: 'D-Rod', description: 'D-Rod cut from SS 3/4 x 0.9mm pipe' }
  ];
  const pcsUomId = uomMap.get('PCS');
  if (!pcsUomId) throw new Error('PCS UOM is required before seeding CS8 products');
  for (const product of cs8Products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        description: product.description,
        productFamilyId: cs8Family.id,
        categoryId: cs8Category.id,
        uomId: pcsUomId,
        status: LifecycleStatus.APPROVED,
        effectiveDate: new Date('2026-01-01T00:00:00.000Z')
      },
      create: {
        sku: product.sku,
        name: product.name,
        description: product.description,
        productFamilyId: cs8Family.id,
        categoryId: cs8Category.id,
        uomId: pcsUomId,
        status: LifecycleStatus.APPROVED,
        version: 1,
        effectiveDate: new Date('2026-01-01T00:00:00.000Z')
      }
    });
  }
  console.log(`✅ Seeded ${cs8Products.length} CS8 products`);

  // 7. Seed Pack Sizes for Hardware & Packaging Materials
  console.log('📦 Seeding Pack Sizes...');
  const hexBolt = await prisma.material.findUnique({ where: { code: 'MAT-HDW-001' } });
  const boxUomId = uomMap.get('BOX');
  const eaUomId = uomMap.get('EA');

  if (hexBolt && boxUomId && eaUomId) {
    const existingPack = await prisma.packSize.findFirst({
      where: { materialId: hexBolt.id, uomId: boxUomId }
    });
    if (!existingPack) {
      await prisma.packSize.create({
        data: {
          materialId: hexBolt.id,
          uomId: boxUomId,
          packQty: 100.0,
          effectiveDate: new Date(),
          status: LifecycleStatus.APPROVED,
          version: 1
        }
      });
      console.log('✅ Seeded PackSize for MAT-HDW-001 (100 EA / BOX)');
    }
  }

  // 8. Seed Mapping Configuration for Module 18 (PURCHASE_ORDER only)
  try {
    console.log('📑 Seeding Module 18 Mapping Configuration (PURCHASE_ORDER)...');
    const adminUser = await prisma.user.findFirst({ where: { role: Role.admin } });
    const managerUser = await prisma.user.findFirst({ where: { role: Role.manager } });

    if (adminUser) {
      const existingPoMapping = await prisma.mappingConfiguration.findFirst({
        where: { sourceType: 'PURCHASE_ORDER', version: 1 }
      });
      if (!existingPoMapping) {
        await prisma.mappingConfiguration.create({
          data: {
            sourceType: 'PURCHASE_ORDER',
            version: 1,
            status: LifecycleStatus.APPROVED,
            fieldMapping: {
              voucherType: 'Purchase',
              vendorLedger: 'vendor.name',
              date: 'po.createdAt',
              poNumber: 'po.poNumber',
              narration: 'Purchase Order {{po.poNumber}} to {{vendor.name}}',
              lineItems: {
                itemCode: 'line.material.code || line.product.sku',
                description: 'line.material.name || line.product.name',
                quantity: 'line.quantity',
                unitPrice: 'line.unitPrice',
                uom: 'line.uom.code',
                taxRate: 'line.taxRate',
                totalAmount: 'line.lineTotal'
              },
              totalAmount: 'po.totalAmount',
              subtotal: 'po.subtotal',
              taxAmount: 'po.taxAmount',
              currency: 'po.currency'
            },
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            createdById: managerUser ? managerUser.id : adminUser.id,
            approvedById: adminUser.id,
            approvedAt: new Date('2026-01-01T00:00:00.000Z')
          }
        });
        console.log('✅ Seeded approved MappingConfiguration v1 for PURCHASE_ORDER');
      }
    }
  } catch (err) {
    console.log('ℹ️ MappingConfiguration seed skipped or table not present.');
  }

  // 9. Seed Loss Management & Wastage Analytics
  try {
    const { seedLossManagement } = await import('./seed-loss-management');
    await seedLossManagement(prisma);
  } catch (err) {
    console.log('ℹ️ Loss management seed skipped or table not present.');
  }

  console.log('🌱 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
