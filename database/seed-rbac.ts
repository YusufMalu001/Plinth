import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const catalogue = [
  ['read', 'Dashboard'],
  ['request', 'PurchaseRequisition'], ['read', 'PurchaseRequisition'], ['submit', 'PurchaseRequisition'], ['approve', 'PurchaseRequisition'],
  ['self_approve', 'PurchaseRequisition'], ['reject', 'PurchaseRequisition'], ['request_changes', 'PurchaseRequisition'], ['cancel', 'PurchaseRequisition'],
  ['create', 'PurchaseOrder'], ['read', 'PurchaseOrder'], ['approve', 'PurchaseOrder'], ['self_approve', 'PurchaseOrder'], ['issue', 'PurchaseOrder'],
  ['revise', 'PurchaseOrder'], ['cancel', 'PurchaseOrder'], ['delete', 'PurchaseOrder'], ['export', 'PurchaseOrder'],
  ['read', 'ExpectedReceipt'], ['submit', 'ExpectedReceipt'],
  ['receive', 'GoodsReceiptNote'], ['read', 'GoodsReceiptNote'], ['update', 'GoodsReceiptNote'], ['verify', 'GoodsReceiptNote'], ['sign_off', 'GoodsReceiptNote'], ['finalize', 'GoodsReceiptNote'], ['export', 'GoodsReceiptNote'],
  ['upload_document', 'GoodsReceiptNote'], ['update', 'GoodsReceiptLabel'], ['read', 'GoodsReceiptDiscrepancy'],
  ['resolve_discrepancy', 'GoodsReceiptDiscrepancy'], ['return', 'GoodsReceiptDiscrepancy'],
  ['manage', 'VendorScorecard'], ['read', 'VendorEvaluation'], ['create', 'VendorEvaluation'],
  ['read', 'StockLedgerEntry'], ['create', 'StockLedgerEntry'], ['read', 'DebitNote'], ['create', 'DebitNote'], ['submit', 'DebitNote'], ['approve', 'DebitNote'], ['reject', 'DebitNote'], ['request_changes', 'DebitNote'],
  ['read', 'MasterData'], ['view', 'Product'], ['view', 'Material'], ['view', 'Vendor'], ['view', 'UnitOfMeasure'], ['view', 'WarehouseLocation'], ['view', 'Department'], ['view', 'EmployeeMaster'], ['read', 'EmployeeMaster'],
  ['view', 'PricingMaster'], ['create', 'PricingMaster'], ['update', 'PricingMaster'], ['delete', 'PricingMaster'],
  ['read', 'Inventory'], ['manage', 'Inventory'],
  ['view', 'BomVersion'], ['create', 'BomVersion'], ['update', 'BomVersion'], ['delete', 'BomVersion'], ['validate', 'BomVersion'], ['approve', 'BomVersion'], ['supersede', 'BomVersion'], ['export', 'BomVersion'], ['simulate', 'BomVersion'],
  ['view', 'ProductionPlan'], ['create', 'ProductionPlan'], ['update', 'ProductionPlan'], ['submit', 'ProductionPlan'], ['approve', 'ProductionPlan'], ['release', 'ProductionPlan'],
  ['view', 'DepartmentExecution'], ['receive', 'DepartmentExecution'], ['assign', 'DepartmentExecution'], ['start', 'DepartmentExecution'], ['update', 'DepartmentExecution'], ['complete', 'DepartmentExecution'], ['reject', 'DepartmentExecution'], ['handover_propose', 'DepartmentExecution'], ['handover_accept', 'DepartmentExecution'], ['manage', 'DepartmentExecution'], ['override_manage', 'DepartmentExecution'],
  ['plan', 'AssemblyBatch'], ['view', 'AssemblyBatch'], ['allocate', 'AssemblyBatch'], ['execute', 'AssemblyBatch'], ['assign_worker', 'AssemblyBatch'], ['complete', 'AssemblyBatch'], ['qc_disposition', 'AssemblyBatch'],
  ['view', 'QualityInspection'], ['inspect', 'QualityInspection'], ['configure', 'QualityInspection'], ['rework_disposition', 'QualityInspection'], ['override', 'QualityInspection'], ['release', 'QualityInspection'],
  ['view', 'WipTracking'], ['trace', 'WipTracking'], ['reconcile', 'WipTracking'], ['manage_exception', 'WipTracking'],
  ['create', 'SalesOrder'], ['read', 'SalesOrder'], ['view', 'SalesOrder'], ['update', 'SalesOrder'], ['confirm', 'SalesOrder'], ['approve', 'SalesOrder'], ['cancel', 'SalesOrder'], ['allocate', 'SalesOrder'], ['dispatch', 'SalesOrder'], ['export', 'SalesOrder'],
  ['create', 'Customer'], ['read', 'Customer'], ['view', 'Customer'], ['update', 'Customer'], ['approve', 'Customer'], ['deactivate', 'Customer'],
  ['read', 'SalesChannel'], ['manage', 'SalesChannel'],
  ['create', 'JobWorkOrder'], ['read', 'JobWorkOrder'], ['view', 'JobWorkOrder'], ['approve', 'JobWorkOrder'], ['issue', 'JobWorkOrder'], ['receive', 'JobWorkOrder'], ['reconcile', 'JobWorkOrder'], ['close', 'JobWorkOrder'], ['export', 'JobWorkOrder'],
  ['view', 'ExecutiveIntelligence'], ['view', 'ModuleIntelligence'], ['review', 'Recommendation'], ['accept', 'Recommendation'], ['dismiss', 'Recommendation'],
  ['manage', 'IntelligencePolicy'], ['view', 'IntelligenceAudit'], ['manage', 'IntelligenceCase'], ['simulate', 'ImpactScenario'], ['manage', 'Conversation'], ['view', 'IntelligenceOutcome'], ['manage', 'IntelligenceOutcome'], ['create', 'BusinessTask'], ['assign', 'BusinessTask'], ['update', 'BusinessTask'], ['view', 'BusinessTask'],
  ['report', 'LossEvent'], ['read', 'LossEvent'], ['review', 'LossEvent'], ['approve', 'LossEvent'], ['acknowledge', 'ReplacementChallan'],
  ['read', 'Employee'], ['view', 'Employee'], ['manage', 'Employee'], ['create', 'Employee']
] as const;

const rolePermissions: Record<string, string[]> = {
  admin: catalogue.map(([action, resource]) => `${action}:${resource}`),
  executive: [
    'view:ExecutiveIntelligence', 'view:ModuleIntelligence', 'review:Recommendation', 'accept:Recommendation', 'dismiss:Recommendation',
    'view:IntelligenceAudit', 'create:BusinessTask', 'assign:BusinessTask', 'update:BusinessTask', 'view:BusinessTask',
    'read:Dashboard', 'read:SalesOrder', 'read:Inventory', 'read:PurchaseOrder', 'view:ProductionPlan'
  ],
  sales_executive: [
    'create:SalesOrder', 'read:SalesOrder', 'view:SalesOrder', 'update:SalesOrder', 'confirm:SalesOrder', 'allocate:SalesOrder', 'dispatch:SalesOrder', 'export:SalesOrder',
    'create:Customer', 'read:Customer', 'view:Customer', 'update:Customer',
    'read:SalesChannel',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:WarehouseLocation', 'read:Inventory',
    'view:PricingMaster'
  ],
  sales_manager: [
    'create:SalesOrder', 'read:SalesOrder', 'view:SalesOrder', 'update:SalesOrder', 'confirm:SalesOrder', 'approve:SalesOrder', 'cancel:SalesOrder', 'allocate:SalesOrder', 'dispatch:SalesOrder', 'export:SalesOrder',
    'create:Customer', 'read:Customer', 'view:Customer', 'update:Customer', 'approve:Customer', 'deactivate:Customer',
    'read:SalesChannel', 'manage:SalesChannel',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:WarehouseLocation', 'read:Inventory',
    'view:PricingMaster', 'create:PricingMaster', 'update:PricingMaster',
    'view:ModuleIntelligence', 'review:Recommendation', 'accept:Recommendation', 'dismiss:Recommendation', 'create:BusinessTask', 'assign:BusinessTask', 'update:BusinessTask', 'view:BusinessTask'
  ],
  'inventory-manager': ['request:PurchaseRequisition', 'read:PurchaseRequisition', 'submit:PurchaseRequisition', 'cancel:PurchaseRequisition', 'read:PurchaseOrder', 'read:ExpectedReceipt', 'read:MasterData', 'view:Product', 'view:Material', 'view:Vendor', 'view:UnitOfMeasure', 'view:Department', 'view:BomVersion', 'export:BomVersion', 'simulate:BomVersion', 'view:ProductionPlan', 'view:WipTracking', 'trace:WipTracking', 'read:SalesOrder', 'view:SalesOrder', 'view:ModuleIntelligence', 'review:Recommendation', 'accept:Recommendation', 'dismiss:Recommendation', 'create:BusinessTask', 'assign:BusinessTask', 'update:BusinessTask', 'view:BusinessTask'],
  'store-manager': [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'request:PurchaseRequisition', 'read:PurchaseRequisition', 'submit:PurchaseRequisition', 'approve:PurchaseRequisition', 'reject:PurchaseRequisition', 'request_changes:PurchaseRequisition',
    'create:PurchaseOrder', 'read:PurchaseOrder', 'read:ExpectedReceipt', 'submit:ExpectedReceipt',
    'read:MasterData', 'view:Product', 'view:Material', 'view:Vendor', 'view:UnitOfMeasure', 'view:WarehouseLocation', 'view:Department', 'view:EmployeeMaster',
    'receive:GoodsReceiptNote', 'read:GoodsReceiptNote', 'update:GoodsReceiptNote', 'verify:GoodsReceiptNote', 'sign_off:GoodsReceiptNote', 'finalize:GoodsReceiptNote', 'export:GoodsReceiptNote', 'upload_document:GoodsReceiptNote',
    'update:GoodsReceiptLabel', 'read:GoodsReceiptDiscrepancy',
    'create:VendorEvaluation', 'read:VendorEvaluation',
    'read:DebitNote',
    'read:StockLedgerEntry', 'create:StockLedgerEntry', 'read:Inventory', 'manage:Inventory',
    'view:BomVersion', 'create:BomVersion', 'update:BomVersion', 'delete:BomVersion', 'validate:BomVersion', 'approve:BomVersion', 'supersede:BomVersion', 'export:BomVersion', 'simulate:BomVersion',
    'view:ProductionPlan', 'create:ProductionPlan', 'update:ProductionPlan', 'submit:ProductionPlan', 'approve:ProductionPlan', 'release:ProductionPlan',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution', 'manage:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:SalesOrder', 'view:SalesOrder', 'update:SalesOrder', 'allocate:SalesOrder', 'dispatch:SalesOrder',
    'read:Customer', 'view:Customer',
    'create:JobWorkOrder', 'read:JobWorkOrder', 'view:JobWorkOrder', 'approve:JobWorkOrder', 'issue:JobWorkOrder', 'receive:JobWorkOrder', 'reconcile:JobWorkOrder', 'close:JobWorkOrder', 'export:JobWorkOrder',
    'view:ModuleIntelligence', 'review:Recommendation', 'accept:Recommendation', 'dismiss:Recommendation', 'create:BusinessTask', 'assign:BusinessTask', 'update:BusinessTask', 'view:BusinessTask'
  ],
  production_manager: [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'view:BomVersion', 'create:BomVersion', 'update:BomVersion', 'delete:BomVersion', 'validate:BomVersion', 'approve:BomVersion', 'supersede:BomVersion', 'export:BomVersion', 'simulate:BomVersion',
    'view:ProductionPlan', 'create:ProductionPlan', 'update:ProductionPlan', 'submit:ProductionPlan', 'approve:ProductionPlan', 'release:ProductionPlan',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution', 'manage:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department', 'view:WarehouseLocation', 'view:EmployeeMaster',
    'report:LossEvent', 'read:LossEvent', 'review:LossEvent', 'approve:LossEvent', 'acknowledge:ReplacementChallan',
    'read:Inventory', 'read:StockLedgerEntry',
    'create:JobWorkOrder', 'read:JobWorkOrder', 'view:JobWorkOrder', 'approve:JobWorkOrder', 'issue:JobWorkOrder', 'receive:JobWorkOrder', 'reconcile:JobWorkOrder', 'close:JobWorkOrder', 'export:JobWorkOrder'
  ],
  'production-manager': [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'view:BomVersion', 'create:BomVersion', 'update:BomVersion', 'delete:BomVersion', 'validate:BomVersion', 'approve:BomVersion', 'supersede:BomVersion', 'export:BomVersion', 'simulate:BomVersion',
    'view:ProductionPlan', 'create:ProductionPlan', 'update:ProductionPlan', 'submit:ProductionPlan', 'approve:ProductionPlan', 'release:ProductionPlan',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution', 'manage:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department', 'view:WarehouseLocation', 'view:EmployeeMaster',
    'report:LossEvent', 'read:LossEvent', 'review:LossEvent', 'approve:LossEvent', 'acknowledge:ReplacementChallan',
    'read:Inventory', 'read:StockLedgerEntry',
    'create:JobWorkOrder', 'read:JobWorkOrder', 'view:JobWorkOrder', 'approve:JobWorkOrder', 'issue:JobWorkOrder', 'receive:JobWorkOrder', 'reconcile:JobWorkOrder', 'close:JobWorkOrder', 'export:JobWorkOrder'
  ],
  department_incharge: [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'view:QualityInspection', 'inspect:QualityInspection', 'configure:QualityInspection',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department', 'view:WarehouseLocation', 'view:EmployeeMaster',
    'report:LossEvent', 'read:LossEvent', 'review:LossEvent', 'acknowledge:ReplacementChallan',
    'read:Inventory', 'read:StockLedgerEntry'
  ],
  department_head: [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'view:QualityInspection', 'inspect:QualityInspection', 'configure:QualityInspection',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department', 'view:WarehouseLocation', 'view:EmployeeMaster',
    'report:LossEvent', 'read:LossEvent', 'review:LossEvent', 'acknowledge:ReplacementChallan',
    'read:Inventory', 'read:StockLedgerEntry'
  ],
  'department-head': [
    'plan:AssemblyBatch', 'view:AssemblyBatch', 'allocate:AssemblyBatch', 'execute:AssemblyBatch', 'assign_worker:AssemblyBatch', 'complete:AssemblyBatch', 'qc_disposition:AssemblyBatch',
    'view:DepartmentExecution', 'receive:DepartmentExecution', 'assign:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution', 'reject:DepartmentExecution', 'handover_propose:DepartmentExecution', 'handover_accept:DepartmentExecution',
    'view:WipTracking', 'trace:WipTracking', 'reconcile:WipTracking', 'manage_exception:WipTracking',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department', 'view:WarehouseLocation', 'view:EmployeeMaster',
    'report:LossEvent', 'read:LossEvent', 'review:LossEvent', 'acknowledge:ReplacementChallan',
    'read:Inventory', 'read:StockLedgerEntry',
    'view:ModuleIntelligence', 'review:Recommendation', 'accept:Recommendation', 'dismiss:Recommendation', 'create:BusinessTask', 'assign:BusinessTask', 'update:BusinessTask', 'view:BusinessTask'
  ],
  shop_floor_operator: [
    'view:AssemblyBatch', 'execute:AssemblyBatch', 'complete:AssemblyBatch',
    'view:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution',
    'view:WipTracking',
    'report:LossEvent', 'read:LossEvent', 'acknowledge:ReplacementChallan',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department'
  ],
  operator: [
    'view:AssemblyBatch', 'execute:AssemblyBatch', 'complete:AssemblyBatch',
    'view:DepartmentExecution', 'start:DepartmentExecution', 'update:DepartmentExecution', 'complete:DepartmentExecution',
    'view:WipTracking',
    'report:LossEvent', 'read:LossEvent', 'acknowledge:ReplacementChallan',
    'read:MasterData', 'view:Product', 'view:Material', 'view:UnitOfMeasure', 'view:Department'
  ]
};

async function main() {
  const ids = new Map<string, string>();
  for (const [action, resource] of catalogue) {
    // Use the legacy normalized key as the conflict target. This works for
    // both modern rows and databases migrated from the original RBAC schema,
    // where the action/resource compound key may not match the stored key.
    const [permission] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "permissions" ("id", "key", "action", "resource", "description", "createdAt")
      VALUES (gen_random_uuid()::text, ${`${action}:${resource}`.toLowerCase()}, ${action}, ${resource}, ${`${action} ${resource}`}, CURRENT_TIMESTAMP)
      ON CONFLICT ("action", "resource") DO UPDATE SET "key" = EXCLUDED."key", "description" = EXCLUDED."description"
      RETURNING "id"
    `;
    ids.set(`${action}:${resource}`, permission.id);
  }
  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await prisma.rbacRole.upsert({
      where: { name },
      update: { isSystem: true, allLocations: name === 'admin' || name === 'store-manager' || name === 'sales_manager' || name === 'sales_executive' },
      create: { name, description: `${name.replaceAll('-', ' ')} role`, isSystem: true, allLocations: name === 'admin' || name === 'store-manager' || name === 'sales_manager' || name === 'sales_executive' }
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const missingKeys = keys.filter(key => !ids.has(key));
    if (missingKeys.length) throw new Error(`RBAC seed configuration references unknown permissions for ${name}: ${missingKeys.join(', ')}`);
    await prisma.rolePermission.createMany({ data: keys.map(key => ({ roleId: role.id, permissionId: ids.get(key)! })), skipDuplicates: true });
  }
  const assignments: Record<string, string[]> = {
    'fardeen@plinth.example': ['inventory-manager'],
    'inventorymanager@gmail.com': ['inventory-manager'],
    'manager@plinth.example': ['store-manager'],
    'admin@plinth.example': ['admin'],
    'sales@plinth.example': ['sales_executive'],
    'sales.executive@plinth.example': ['sales_executive'],
    'salesmanager@plinth.example': ['sales_manager']
  };
  for (const [email, roleNames] of Object.entries(assignments)) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) continue;
    const roles = await prisma.rbacRole.findMany({ where: { name: { in: roleNames } }, select: { id: true } });
    await prisma.userRole.createMany({ data: roles.map(role => ({ userId: user.id, roleId: role.id })), skipDuplicates: true });
  }
  console.log(`Seeded ${catalogue.length} permissions and ${Object.keys(rolePermissions).length} workflow roles.`);
}

main().finally(() => prisma.$disconnect());
