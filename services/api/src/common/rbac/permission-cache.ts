import { PrismaClient } from '@prisma/client';

export interface ActorCapabilities {
  active: boolean;
  admin: boolean;
  storeManager?: boolean;
  allLocations: boolean;
  permissions: Set<string>;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: Promise<ActorCapabilities> }>();
const STORE_MANAGER_RESTRICTED_RESOURCES = new Set([
  'Accounts', 'AccountConfiguration', 'AccountingPeriod', 'AccountingEntity', 'LedgerAccount',
  'JournalVoucher', 'JournalLine', 'PurchaseBill', 'FinanceIntegration', 'FinanceMapping',
]);

const key = (action: string, resource: string) => `${action}:${resource}`;

// Older accounts store the role on User.role and may not yet have a row in
// user_roles. Keep those accounts usable during the RBAC migration; this is
// deliberately limited to the receiving capabilities of a Store Manager.
const LEGACY_STORE_MANAGER_PERMISSIONS = [
  ['read', 'Dashboard'],
  ['read', 'Calendar'], ['view', 'Calendar'],
  ['create', 'PurchaseOrder'], ['read', 'PurchaseOrder'], ['update', 'PurchaseOrder'], ['approve', 'PurchaseOrder'], ['request_changes', 'PurchaseOrder'], ['reject', 'PurchaseOrder'], ['revise', 'PurchaseOrder'], ['send', 'PurchaseOrder'],
  ['request', 'PurchaseRequisition'], ['read', 'PurchaseRequisition'], ['submit', 'PurchaseRequisition'], ['approve', 'PurchaseRequisition'], ['request_changes', 'PurchaseRequisition'],
  ['view', 'Product'], ['view', 'Material'], ['view', 'Vendor'], ['create', 'Vendor'], ['update', 'Vendor'], ['view', 'UnitOfMeasure'], ['view', 'WarehouseLocation'], ['view', 'Department'],
  ['read', 'GoodsReceiptNote'], ['receive', 'GoodsReceiptNote'], ['update', 'GoodsReceiptNote'],
  ['verify', 'GoodsReceiptNote'], ['sign_off', 'GoodsReceiptNote'], ['finalize', 'GoodsReceiptNote'],
  ['export', 'GoodsReceiptNote'], ['upload_document', 'GoodsReceiptNote'], ['update', 'GoodsReceiptLabel'],
  ['read', 'GoodsReceiptDiscrepancy'], ['resolve_discrepancy', 'GoodsReceiptDiscrepancy'],
  ['return', 'GoodsReceiptDiscrepancy'], ['read', 'ExpectedReceipt'], ['submit', 'ExpectedReceipt'],
  ['read', 'MasterData'], ['read', 'StockLedgerEntry'], ['create', 'StockLedgerEntry'],
  ['read', 'DebitNote'],
  ['read', 'StockAdjustment'], ['adjust', 'StockAdjustment'], ['approve', 'StockAdjustment'], ['post', 'StockAdjustment'],
  ['view', 'ProductionPlan'], ['create', 'ProductionPlan'], ['update', 'ProductionPlan'], ['submit', 'ProductionPlan'], ['approve', 'ProductionPlan'], ['release', 'ProductionPlan'],
  ['read', 'Production'], ['manage', 'Production'],
  ['view', 'ProductRoute'], ['read', 'ProductRoute'], ['create', 'ProductRoute'], ['update', 'ProductRoute'],
  ['view', 'DepartmentExecution'], ['receive', 'DepartmentExecution'], ['assign', 'DepartmentExecution'], ['start', 'DepartmentExecution'], ['update', 'DepartmentExecution'], ['complete', 'DepartmentExecution'], ['reject', 'DepartmentExecution'], ['handover', 'DepartmentExecution'], ['handover_propose', 'DepartmentExecution'], ['handover_accept', 'DepartmentExecution'], ['manage', 'DepartmentExecution'], ['override_manage', 'DepartmentExecution'],
  ['read', 'LossEvent'], ['report', 'LossEvent'], ['review', 'LossEvent'], ['approve', 'LossEvent'], ['reject', 'LossEvent'], ['investigate', 'LossEvent'], ['post', 'LossEvent'], ['replace', 'LossEvent'], ['export', 'LossEvent'], ['acknowledge', 'ReplacementChallan'],
  ['read', 'JobWorkOrder'], ['view', 'JobWorkOrder'], ['create', 'JobWorkOrder'], ['approve', 'JobWorkOrder'], ['issue', 'JobWorkOrder'], ['receive', 'JobWorkOrder'], ['reconcile', 'JobWorkOrder'], ['close', 'JobWorkOrder'], ['export', 'JobWorkOrder'],
] as const;

/**
 * Resolves every capability for a user in one query and shares the in-flight
 * promise between concurrent middleware/service checks. This avoids repeating
 * remote RBAC queries several times during a single request burst.
 */
export function getActorCapabilities(prisma: PrismaClient, actorId: string): Promise<ActorCapabilities> {
  if (actorId === 'system') return Promise.resolve({ active: true, admin: true, allLocations: true, permissions: new Set() });
  const cached = cache.get(actorId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = prisma.user.findUnique({
    where: { id: actorId },
    select: {
      role: true,
      isActive: true,
      userRoles: {
        select: {
          role: {
            select: {
              name: true,
              allLocations: true,
              permissions: { select: { permission: { select: { action: true, resource: true } } } }
            }
          }
        }
      }
    }
  }).then(actor => {
    if (!actor) return { active: false, admin: false, allLocations: false, permissions: new Set<string>() };
    const roles = actor.userRoles.map(grant => grant.role);
    const legacyRole = String(actor.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const permissions = new Set(roles.flatMap(role => role.permissions.map(grant => key(grant.permission.action, grant.permission.resource))));
    // Support legacy role enum 'manager' (Store Manager in UI) as well as dynamic roles
    const isStoreManager =
      legacyRole === 'store_manager' ||
      legacyRole === 'storemanager' ||
      legacyRole === 'manager' ||
      roles.some(role =>
        /^(store|inventory|operations|plant)[-_ ]?manager$/i.test(role.name.trim())
      );
    if (isStoreManager) {
      LEGACY_STORE_MANAGER_PERMISSIONS.forEach(([action, resource]) => permissions.add(key(action, resource)));
    }
    const isFinance =
      legacyRole === 'finance_manager' ||
      legacyRole === 'accountant' ||
      legacyRole === 'accounts_preparer' ||
      legacyRole === 'accounts_reviewer' ||
      legacyRole === 'cfo' ||
      roles.some(role => /^(finance|account|accounts)[-_ ]?(manager|preparer|reviewer|executive)?$/i.test(role.name.trim()));
    if (isFinance) {
      ['Accounts', 'AccountConfiguration', 'AccountingPeriod', 'AccountingEntity', 'LedgerAccount', 'JournalVoucher', 'JournalLine', 'PurchaseBill', 'SalesARInvoice', 'SalesARReceipt', 'SalesARMarketplaceBatch', 'Customer'].forEach(res => {
        ['read', 'view', 'create', 'update', 'submit', 'approve', 'post', 'manage', 'allocate'].forEach(act => {
          permissions.add(key(act, res));
        });
      });
    }
    return {
      active: actor.isActive,
      admin: legacyRole === 'admin' || actor.role === 'admin' || roles.some(role => role.name === 'admin' || role.name === 'super-admin'),
      storeManager: isStoreManager,
      allLocations: legacyRole === 'admin' || isStoreManager || isFinance || roles.some(role => role.allLocations),
      permissions
    };
  }).catch(error => {
    cache.delete(actorId);
    throw error;
  });
  cache.set(actorId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function invalidateActorCapabilities(actorId?: string): void {
  if (actorId) cache.delete(actorId);
  else cache.clear();
}

export function hasCapability(capabilities: ActorCapabilities, action: string, resource: string): boolean {
  if (!capabilities.active) return false;
  if (capabilities.admin) return true;
  if (capabilities.storeManager && STORE_MANAGER_RESTRICTED_RESOURCES.has(resource)) return false;
  if (capabilities.storeManager && resource === 'DebitNote' && action !== 'read') return false;
  if (capabilities.storeManager || capabilities.permissions.has(key(action, resource))) return true;
  if (resource === 'QualityInspection' && (
    capabilities.permissions.has(key('qc_disposition', 'AssemblyBatch')) ||
    capabilities.permissions.has(key('execute', 'AssemblyBatch')) ||
    capabilities.permissions.has(key('view', 'AssemblyBatch')) ||
    capabilities.permissions.has(key('manage', 'Production')) ||
    capabilities.admin ||
    capabilities.storeManager
  )) {
    return true;
  }
  if (action === 'view' && ['Department', 'Product', 'Material', 'Vendor', 'UnitOfMeasure', 'WarehouseLocation', 'BomVersion', 'ProductionPlan', 'ProductRoute', 'Customer', 'SalesOrder', 'SalesChannel'].includes(resource)
    && (capabilities.permissions.has(key('read', 'MasterData')) || capabilities.permissions.has(key('read', 'Production')) || capabilities.permissions.has(key('manage', 'Production')) || capabilities.permissions.has(key('read', resource)) || capabilities.permissions.has(key('create', resource)))) {
    return true;
  }
  if (action === 'read' && ['Customer', 'SalesOrder', 'SalesChannel'].includes(resource)
    && (capabilities.permissions.has(key('view', resource)) || capabilities.permissions.has(key('create', resource)))) {
    return true;
  }
  if ((action === 'create' || action === 'update') && resource === 'Customer'
    && (capabilities.permissions.has(key('manage', 'MasterData')) || capabilities.permissions.has(key('create', 'SalesOrder')) || capabilities.permissions.has(key('manage', 'Sales')) || capabilities.permissions.has(key('create', 'Customer')) || capabilities.permissions.has(key('update', 'Customer')))) {
    return true;
  }
  if (['BomVersion', 'ProductionPlan', 'ProductRoute'].includes(resource) && (capabilities.permissions.has(key('manage', 'Production')) || capabilities.permissions.has(key('read', 'Production')))) {
    return true;
  }
  if (resource === 'LossEvent' && (action === 'view' || action === 'read') && (capabilities.permissions.has(key('report', 'LossEvent')) || capabilities.permissions.has(key('read', 'LossEvent')))) {
    return true;
  }
  if (resource === 'ReplacementChallan' && (action === 'view' || action === 'read') && (capabilities.permissions.has(key('acknowledge', 'ReplacementChallan')) || capabilities.permissions.has(key('read', 'LossEvent')))) {
    return true;
  }
  if (resource === 'JobWorkOrder' && (capabilities.permissions.has(key('manage', 'Inventory')) || capabilities.permissions.has(key('read', 'Inventory')) || capabilities.permissions.has(key('manage', 'Production')) || capabilities.permissions.has(key('read', 'Production')))) {
    return true;
  }
  if (resource === 'StockLedgerEntry' && action === 'read' && (capabilities.permissions.has(key('read', 'Inventory')) || capabilities.permissions.has(key('view', 'StockBalance')))) {
    return true;
  }
  return false;
}
