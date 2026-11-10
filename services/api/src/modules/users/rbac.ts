import { PermissionChecker, ScopeContext, UserRole } from '@synergy/types';
import { prisma } from '../../database';
import { getActorCapabilities, hasCapability, invalidateActorCapabilities } from '../../common/rbac/permission-cache';
import { ForbiddenError, NotFoundError } from '../../common/errors/AppError';

export const PERMISSION_CATALOGUE = [
  ['read','Dashboard','View operational dashboard'],['read','User','View workspace users'],['create','User','Create workspace users'],['update','User','Edit workspace users'],['manage','RolePermission','Edit role permissions'],['read','Product','View products'],['create','Product','Create products'],['update','Product','Edit products'],['approve','Product','Approve products'],['read','Material','View materials'],['manage','MasterData','Manage master data'],['create','Vendor','Create vendor records'],['update','Vendor','Edit vendor records'],['approve','Vendor','Approve vendor records'],['deactivate','Vendor','Activate or deactivate vendors'],['delete','Vendor','Delete vendor records'],['request','PurchaseRequisition','Create purchase requisitions'],['read','PurchaseRequisition','View purchase requisitions'],['submit','PurchaseRequisition','Submit purchase requisitions'],['approve','PurchaseRequisition','Approve purchase requisitions'],['self_approve','PurchaseRequisition','Approve own purchase requisitions'],['reject','PurchaseRequisition','Reject purchase requisitions'],['request_changes','PurchaseRequisition','Return purchase requisitions for changes'],['cancel','PurchaseRequisition','Cancel purchase requisitions'],['create','PurchaseOrder','Create purchase orders'],['read','PurchaseOrder','View purchase orders'],['approve','PurchaseOrder','Approve purchase orders'],['self_approve','PurchaseOrder','Approve own purchase orders'],['issue','PurchaseOrder','Issue purchase orders'],['revise','PurchaseOrder','Revise purchase orders'],['cancel','PurchaseOrder','Cancel purchase orders'],['delete','PurchaseOrder','Delete draft purchase orders'],['export','PurchaseOrder','Export purchase orders'],['read','ExpectedReceipt','View expected receipts'],['submit','ExpectedReceipt','Record expected receipts'],['receive','GoodsReceiptNote','Register incoming goods'],['read','GoodsReceiptNote','View goods receipts'],['update','GoodsReceiptNote','Update open goods receipts'],['verify','GoodsReceiptNote','Record physical verification'],['sign_off','GoodsReceiptNote','Sign off verified receipts'],['finalize','GoodsReceiptNote','Post accepted receipt quantities'],['upload_document','GoodsReceiptNote','Upload receiving documents'],['export','GoodsReceiptNote','Export goods receipts'],['update','GoodsReceiptLabel','Print or reprint receipt labels'],['read','GoodsReceiptDiscrepancy','View receiving discrepancies'],['resolve_discrepancy','GoodsReceiptDiscrepancy','Resolve receiving discrepancies'],['return','GoodsReceiptDiscrepancy','Authorize returns to vendor'],['read','Inventory','View inventory'],['manage','Inventory','Manage inventory'],['read','Production','View production'],['manage','Production','Manage production'],['read','Report','View reports'],['export','Report','Export reports'],['read','AuditLog','View audit history'],['manage','VendorScorecard','Manage vendor scorecards'],['read','VendorEvaluation','View vendor evaluations'],['create','VendorEvaluation','Create vendor evaluations']
] as const;
const permissionKey = (p: { action: string; resource: string }) => `${p.action}:${p.resource}`.toLowerCase();

export class DatabasePermissionChecker implements PermissionChecker {
  async can(actorId: string, action: string, resource: string, _scope?: ScopeContext) {
    const capabilities = await getActorCapabilities(prisma, actorId);
    if (hasCapability(capabilities, action, resource)) return true;
    // Final compatibility check for accounts created with the original
    // `manager` enum before dynamic role assignments were introduced.
    if (['GoodsReceiptNote', 'GoodsReceiptDiscrepancy', 'ExpectedReceipt', 'DebitNote'].includes(resource)) {
      const legacy = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true, userRoles: { select: { id: true } } } });
      // Compatibility is only for accounts that have not been migrated to a
      // dynamic role. Once a dynamic role exists, its grants are authoritative.
      if (legacy?.isActive && legacy.userRoles.length === 0 && String(legacy.role).toLowerCase() === 'manager') return true;
    }
    return false;
  }
}

async function roleView(roleId: string) {
  const [role, permissions] = await Promise.all([prisma.rbacRole.findUnique({ where: { id: roleId }, include: { permissions: true, _count: { select: { userRoles: true } } } }), prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] })]);
  if (!role) return null;
  return { id: role.id, key: role.name, name: role.name, description: role.description, isSystem: role.isSystem, isActive: true, _count: { users: role._count.userRoles }, permissions: permissions.map((p) => ({ ...p, key: permissionKey(p), assigned: (role.isSystem && role.name === 'super-admin') || role.permissions.some((rp) => rp.permissionId === p.id) })) };
}

export async function listRolesWithPermissions() {
  const [roles, permissions] = await Promise.all([prisma.rbacRole.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }], include: { permissions: true, _count: { select: { userRoles: true } } } }), prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] })]);
  return roles.map((role) => ({ id: role.id, role: role.name, key: role.name, name: role.name, description: role.description, isSystem: role.isSystem, isActive: true, _count: { users: role._count.userRoles }, permissions: permissions.map((p) => ({ ...p, key: permissionKey(p), assigned: (role.isSystem && role.name === 'super-admin') || role.permissions.some((rp) => rp.permissionId === p.id) })) }));
}
let permissionCatalogueReady: Promise<void> | null = null;
export async function ensurePermissionCatalogue() {
  if (permissionCatalogueReady) return permissionCatalogueReady;
  const entries = [
    ...PERMISSION_CATALOGUE,
    ['read','StockLedgerEntry','View immutable inventory ledger'],
    ['create','StockLedgerEntry','Post inventory movement'],
    ['read','DebitNote','View debit notes'],
    ['create','DebitNote','Create debit notes'],
    ['submit','DebitNote','Submit debit notes'],
    ['approve','DebitNote','Approve debit notes'],
    ['reject','DebitNote','Reject debit notes'],
    ['request_changes','DebitNote','Request debit note changes'],
    ['view','Product','View products for transactions'],
    ['view','Material','View materials for transactions'],
    ['view','Vendor','View vendors for transactions'],
    ['view','UnitOfMeasure','View units of measure'],
    ['view','Department','View departments for transactions'],
    ['view','EmployeeMaster','View employees for assignments'],
    ['read','EmployeeMaster','View employees for assignments'],
    ['read','MasterData','View master data for transactions'],
    ['read','Customer','View customer accounts'],
    ['create','Customer','Register customer or dealer account'],
    ['update','Customer','Edit customer or dealer account'],
    ['view','Customer','View customer accounts for transactions'],
    ['approve','Customer','Approve customer master account'],
    ['deactivate','Customer','Deactivate customer master account'],
    ['read','SalesOrder','View sales orders'],
    ['create','SalesOrder','Create sales orders'],
    ['update','SalesOrder','Edit sales orders'],
    ['approve','SalesOrder','Approve sales orders'],
    ['cancel','SalesOrder','Cancel sales orders'],
    ['confirm','SalesOrder','Confirm sales orders'],
    ['create','BomVersion','Create BOM versions'],
    ['update','BomVersion','Edit BOM versions'],
    ['validate','BomVersion','Validate BOM versions'],
    ['approve','BomVersion','Approve BOM versions'],
    ['supersede','BomVersion','Supersede BOM versions'],
    ['export','BomVersion','Export BOM versions'],
    ['simulate','BomVersion','Simulate BOM versions'],
    ['view','DepartmentExecution','View department execution batches'],
    ['receive','DepartmentExecution','Receive assigned department work'],
    ['assign','DepartmentExecution','Assign work to department operators'],
    ['start','DepartmentExecution','Start assigned department execution'],
    ['update','DepartmentExecution','Update assigned department execution progress'],
    ['complete','DepartmentExecution','Complete assigned department execution'],
    ['reject','DepartmentExecution','Reject department work handovers'],
    ['handover_propose','DepartmentExecution','Propose department work handovers'],
    ['handover_accept','DepartmentExecution','Accept department work handovers'],
    ['view','WipTracking','View work in progress tracking'],
    ['trace','WipTracking','Trace work in progress'],
    ['reconcile','WipTracking','Reconcile work in progress'],
    ['manage_exception','WipTracking','Manage work in progress exceptions'],
    ['view','ProductionPlan','View production plans and schedules'],
    ['create','ProductionPlan','Create production plans and schedules'],
    ['update','ProductionPlan','Edit production plans and schedules'],
    ['submit','ProductionPlan','Submit production plans and schedules'],
    ['approve','ProductionPlan','Approve production plans and schedules'],
    ['release','ProductionPlan','Release production plans and schedules'],
    ['view','ProductRoute','View product routings'],
    ['read','ProductRoute','View product routings'],
    ['create','ProductRoute','Create product routings'],
    ['update','ProductRoute','Edit product routings'],
    ['read','FinanceIntegration','View integration status, jobs and items'],
    ['create','FinanceMapping','Create integration mapping configurations'],
    ['approve','FinanceMapping','Approve integration mapping configurations'],
    ['queue','FinanceIntegration','Queue eligible transactions for export'],
    ['retry','FinanceIntegration','Investigate and retry failed integration items'],
    ['acknowledge','FinanceIntegration','Record manual finance confirmation'],
    ['reconcile','FinanceIntegration','Perform internal consistency reconciliation'],
    ['report','LossEvent','Report loss or damage event'],
    ['read','LossEvent','View loss events and analytics'],
    ['review','LossEvent','Review loss event classification'],
    ['approve','LossEvent','Approve loss event'],
    ['reject','LossEvent','Reject loss event'],
    ['investigate','LossEvent','Investigate abnormal loss event'],
    ['post','LossEvent','Post inventory effect for loss event'],
    ['replace','LossEvent','Issue replacement challan for loss event'],
    ['view','PricingMaster','View pricing masters'],
    ['create','PricingMaster','Create pricing masters'],
    ['update','PricingMaster','Edit pricing masters'],
    ['delete','PricingMaster','Delete pricing masters'],
    ['export','LossEvent','Export loss events report'],
    ['acknowledge','ReplacementChallan','Acknowledge receipt of replacement challan'],
    ['plan','AssemblyBatch','Plan assembly batch convergence'],
    ['view','AssemblyBatch','View assembly batches and genealogy'],
    ['allocate','AssemblyBatch','Allocate source components and issue lines to assembly'],
    ['execute','AssemblyBatch','Start and record assembly progress'],
    ['assign_worker','AssemblyBatch','Assign workers to assembly batch'],
    ['complete','AssemblyBatch','Complete assembly batch execution'],
    ['qc_disposition','AssemblyBatch','Perform QC inspection disposition on assembly batch'],
    ['view','FgReadyOutput','View finished goods ready output queue'],
    ['create','FgReadyOutput','Create finished goods ready output from assembly'],
    ['update_packaging','FgPackagingRecord','Update finished goods packaging readiness status'],
    ['receive','FgReceipt','Receive finished goods into inventory through gate'],
    ['view','FgReceipt','View finished goods receipt transactions and genealogy'],
    ['hold','FgReceipt','Place finished goods on quarantine or QA hold'],
    ['release','FgReceipt','Release finished goods from hold to available stock'],
    ['view','ExecutiveIntelligence','View enterprise intelligence across authorized modules'],
    ['view','ModuleIntelligence','View intelligence for an authorized department or location'],
    ['review','Recommendation','Review system recommendations and evidence'],
    ['accept','Recommendation','Accept a recommendation for assignment'],
    ['dismiss','Recommendation','Dismiss a recommendation with a reason'],
    ['manage','IntelligencePolicy','Manage business objectives and hard guardrails'],
    ['view','IntelligenceAudit','View model runs, usage, validation and audit metadata'],
    ['manage','IntelligenceCase','Acknowledge, resolve, or suppress intelligence cases'],
    ['simulate','ImpactScenario','Calculate server-side intelligence scenarios'],
    ['manage','Conversation','Manage owned intelligence conversations'],
    ['manage','IntelligenceOutcome','Manage and reconcile intelligence outcomes'],
    ['view','IntelligenceOutcome','View intelligence outcomes'],
    ['create','BusinessTask','Create a task from an accepted recommendation'],
    ['assign','BusinessTask','Assign or reassign a recommendation task'],
    ['update','BusinessTask','Update and complete an assigned business task'],
    ['view','BusinessTask','View authorized recommendation tasks'],
  ] as const;
  // Keep the bootstrap safe even if a module contributes an already-catalogued
  // permission in a later release.
  const uniqueEntries = [...new Map(entries.map(entry => [`${entry[0]}:${entry[1]}`, entry] as const)).values()];
  // One bulk statement replaces dozens of sequential network round trips.
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const values = uniqueEntries.map(([action, resource, description]) => `(gen_random_uuid()::text, ${quote(`${action}:${resource}`.toLowerCase())}, ${quote(action)}, ${quote(resource)}, ${quote(description)}, CURRENT_TIMESTAMP)`).join(',');
  // The business identity of a permission is (action, resource). `key` was
  // added by a compatibility migration and can be stale on older databases,
  // so it must never be the conflict target for catalogue bootstrapping.
  permissionCatalogueReady = prisma.$executeRawUnsafe(`INSERT INTO "permissions" ("id", "key", "action", "resource", "description", "createdAt") VALUES ${values} ON CONFLICT ("action", "resource") DO UPDATE SET "description" = EXCLUDED."description"`).then(() => undefined);
  return permissionCatalogueReady;
}
export async function updateRolePermissions(role: UserRole, permissionIds: string[]) { const target = await prisma.rbacRole.findUnique({ where: { name: String(role) } }); if (!target) return listRolesWithPermissions(); const valid = await prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { id: true } }); await prisma.$transaction(async (tx) => { await tx.rolePermission.deleteMany({ where: { roleId: target.id } }); if (valid.length) await tx.rolePermission.createMany({ data: valid.map((p) => ({ roleId: target.id, permissionId: p.id })) }); }); invalidateActorCapabilities(); return listRolesWithPermissions(); }
export async function ensureShopFloorOperatorRole() {
  await ensurePermissionCatalogue();
  const grants = [
    ['view', 'DepartmentExecution'], ['start', 'DepartmentExecution'],
    ['update', 'DepartmentExecution'], ['complete', 'DepartmentExecution'],
    ['view', 'WipTracking'], ['report', 'LossEvent'], ['read', 'LossEvent'],
    ['acknowledge', 'ReplacementChallan'], ['read', 'MasterData'],
    ['view', 'Product'], ['view', 'Material'], ['view', 'UnitOfMeasure'], ['view', 'Department']
  ] as const;
  const role = await prisma.rbacRole.upsert({
    where: { name: 'shop_floor_operator' },
    update: { description: 'Shop-floor worker executing assigned batches and recording progress', isSystem: true },
    create: { name: 'shop_floor_operator', description: 'Shop-floor worker executing assigned batches and recording progress', isSystem: true }
  });
  const permissions = await prisma.permission.findMany({
    where: { OR: grants.map(([action, resource]) => ({ action, resource })) },
    select: { id: true }
  });
  if (permissions.length !== grants.length) throw new Error('The shop-floor worker role is missing required permission records.');
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({ data: permissions.map(({ id: permissionId }) => ({ roleId: role.id, permissionId })) });
  });
  invalidateActorCapabilities();
  return role;
}
export async function ensureDepartmentInchargeRole() {
  await ensurePermissionCatalogue();
  const grants = [
    ['view', 'DepartmentExecution'], ['receive', 'DepartmentExecution'], ['assign', 'DepartmentExecution'],
    ['start', 'DepartmentExecution'], ['update', 'DepartmentExecution'], ['complete', 'DepartmentExecution'],
    ['reject', 'DepartmentExecution'], ['handover_propose', 'DepartmentExecution'], ['handover_accept', 'DepartmentExecution'],
    ['view', 'WipTracking'], ['trace', 'WipTracking'], ['reconcile', 'WipTracking'], ['manage_exception', 'WipTracking'],
    ['report', 'LossEvent'], ['read', 'LossEvent'], ['read', 'MasterData'], ['view', 'Product'],
    ['view', 'Material'], ['view', 'UnitOfMeasure'], ['read', 'Inventory'], ['read', 'StockLedgerEntry'],
    ['view', 'Department'], ['read', 'EmployeeMaster'],
    ['view', 'ModuleIntelligence'],
  ] as const;
  const role = await prisma.rbacRole.upsert({
    where: { name: 'department_incharge' },
    update: { description: 'Department-scoped shop-floor supervisor', isSystem: true },
    create: { name: 'department_incharge', description: 'Department-scoped shop-floor supervisor', isSystem: true },
  });
  const permissions = await prisma.permission.findMany({
    where: { OR: grants.map(([action, resource]) => ({ action, resource })) },
    select: { id: true },
  });
  if (permissions.length !== grants.length) throw new Error('The department in-charge role is missing required permission records.');
  await prisma.rolePermission.createMany({
    data: permissions.map(({ id: permissionId }) => ({ roleId: role.id, permissionId })),
    skipDuplicates: true,
  });
  invalidateActorCapabilities();
  return role;
}
export async function listRoleDefinitions() { await ensurePermissionCatalogue(); return listRolesWithPermissions(); }
export async function createRoleDefinition(input: { key: string; name: string; description?: string; permissionIds: string[] }) {
  const valid = await prisma.permission.findMany({ where: { id: { in: input.permissionIds } }, select: { id: true } });
  const role = await prisma.rbacRole.create({ data: { name: input.key.trim().toLowerCase(), description: input.description || input.name, permissions: { create: valid.map(({ id }) => ({ permissionId: id })) } } });
  return roleView(role.id);
}
export async function updateRoleDefinition(id: string, input: { name?: string; description?: string | null; isActive?: boolean; permissionIds?: string[] }) {
  const existing = await prisma.rbacRole.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Role not found');
  if (existing.isSystem && input.isActive === false) throw new ForbiddenError('System roles cannot be deactivated');
  if (existing.isSystem && existing.name === 'super-admin' && (input.permissionIds || input.name)) throw new ForbiddenError('Super Admin is immutable');
  await prisma.$transaction(async (tx) => {
    if (input.permissionIds) {
      const valid = await tx.permission.findMany({ where: { id: { in: input.permissionIds } }, select: { id: true } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (valid.length) await tx.rolePermission.createMany({ data: valid.map(({ id: permissionId }) => ({ roleId: id, permissionId })) });
    }
    await tx.rbacRole.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        // RbacRole currently has no persisted active-state column; ignore this
        // legacy request field instead of mutating the location scope flag.
      }
    });
  });
  invalidateActorCapabilities();
  return roleView(id);
}
