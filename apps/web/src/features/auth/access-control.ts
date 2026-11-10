/** Client-side navigation guard. The API remains the source of truth; this
 * prevents flashing links/pages that the current role cannot view. */
export function normalizeRole(role?: string | null) {
  const normalized = (role || 'employee').trim().toLowerCase().replace(/[\s-]+/g, '_');
  // Older Store Manager accounts use `storemanager` or the legacy `manager`
  // enum value. Keep them aligned with the canonical RBAC role so navigation
  // and page guards behave consistently during the migration.
  if (normalized === 'storemanager' || normalized === 'manager') return 'store_manager';
  if (normalized === 'departmentincharge' || normalized === 'department_in_charge') return 'department_incharge';
  if (normalized === 'departmenthead' || normalized === 'department_head') return 'department_head';
  if (normalized === 'shopflooroperator' || normalized === 'shop_floor_operator') return 'shop_floor_operator';
  if (
    normalized === 'sales' ||
    normalized === 'sales_rep' ||
    normalized === 'sales_representative' ||
    normalized === 'sales_officer' ||
    normalized === 'sales_manager' ||
    normalized === 'salesmanager' ||
    normalized === 'salesexecutive'
  ) {
    return 'sales_executive';
  }
  return normalized;
}

type ViewRule = { prefix: string; roles: string[]; permissions: string[] };

// This is the client-side projection of the server RBAC catalogue. Roles are
// retained for legacy accounts, while permission keys make custom/future roles
// work without adding another frontend role branch.
const RAW_VIEW_RULES: ViewRule[] = [
  // Access & Admin
  { prefix: '/access', roles: ['admin', 'subadmin', 'sub_admin'], permissions: ['manage:rolepermission', 'read:user'] },

  // Intelligence & Decision Center
  { prefix: '/intelligence/history', roles: ['admin', 'executive', 'system_admin'], permissions: ['view:intelligenceaudit', 'view:executiveintelligence'] },
  { prefix: '/intelligence/audit', roles: ['admin', 'executive', 'system_admin'], permissions: ['view:intelligenceaudit', 'view:executiveintelligence'] },
  { prefix: '/intelligence', roles: ['admin', 'executive', 'sales_manager', 'inventory_manager', 'store_manager', 'procurement_manager', 'production_manager', 'dispatch_manager', 'department_incharge'], permissions: ['view:executiveintelligence', 'view:moduleintelligence'] },
  { prefix: '/decision-center/audit', roles: ['admin'], permissions: ['view:intelligenceaudit'] },
  { prefix: '/decision-center', roles: ['admin', 'executive', 'sales_manager', 'inventory_manager', 'store_manager', 'procurement_manager', 'production_manager', 'dispatch_manager', 'department_incharge'], permissions: ['view:executiveintelligence', 'view:moduleintelligence'] },

  // Finance & Tally Integration
  { prefix: '/finance/mappings', roles: ['admin', 'accountant', 'finance', 'finance_manager'], permissions: ['create:financemapping', 'approve:financemapping', 'read:financeintegration'] },
  { prefix: '/finance/queue', roles: ['admin', 'accountant', 'finance', 'finance_manager'], permissions: ['queue:financeintegration', 'read:financeintegration'] },
  { prefix: '/finance/exports', roles: ['admin', 'accountant', 'finance', 'finance_manager'], permissions: ['export:financeintegration', 'read:financeintegration'] },
  { prefix: '/finance/errors', roles: ['admin', 'accountant', 'finance', 'finance_manager'], permissions: ['retry:financeintegration', 'read:financeintegration'] },
  { prefix: '/finance/reconciliation', roles: ['admin', 'accountant', 'finance', 'finance_manager'], permissions: ['reconcile:financeintegration', 'read:financeintegration'] },
  { prefix: '/finance', roles: ['admin', 'accountant', 'finance', 'finance_manager', 'store_manager', 'subadmin', 'sub_admin'], permissions: ['read:financeintegration'] },

  // Accounts & AP/AR
  { prefix: '/accounts/purchases', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts', 'read:purchasebill'] },
  { prefix: '/accounts/sales', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts', 'read:salesorder'] },
  { prefix: '/accounts/pro-formas', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/debit-notes', roles: ['admin', 'store_manager', 'finance', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:debitnote', 'read:accounts'] },
  { prefix: '/accounts/credit-notes', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/journals', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'finance_manager'], permissions: ['read:accounts', 'create:journalvoucher', 'submit:journalvoucher', 'approve:journalvoucher', 'post:journalvoucher'] },
  { prefix: '/accounts/ledgers', roles: ['admin', 'accountant', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/payments', roles: ['admin', 'accountant', 'finance_manager'], permissions: ['read:accounts', 'create:purchasebill'] },
  { prefix: '/accounts/banking', roles: ['admin', 'accountant', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/marketplace', roles: ['admin', 'accountant', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/gst', roles: ['admin', 'accountant', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/accounts/reports', roles: ['admin', 'accountant', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts', 'close:accountingperiod'] },
  { prefix: '/accounts/tally', roles: ['admin', 'accountant', 'finance_manager'], permissions: ['read:accounts', 'read:financeintegration'] },
  { prefix: '/accounts/setup', roles: ['admin', 'accountant', 'finance_manager'], permissions: ['manage:accountconfiguration', 'approve:accountconfiguration'] },
  { prefix: '/accounts', roles: ['admin', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:accounts'] },
  { prefix: '/debit-notes', roles: ['admin', 'store_manager', 'finance', 'accountant', 'accounts_preparer', 'accounts_reviewer', 'accounts_auditor', 'finance_manager'], permissions: ['read:debitnote'] },

  // Sales & Orders
  { prefix: '/sales/hold-queue', roles: ['admin', 'sales_manager'], permissions: ['approve:salesorder', 'read:salesorder'] },
  { prefix: '/sales/customers', roles: ['admin', 'sales_executive', 'sales_manager', 'sales', 'employee', 'store_manager'], permissions: ['read:customer'] },
  { prefix: '/customers', roles: ['admin', 'sales_executive', 'sales_manager', 'sales', 'employee', 'store_manager'], permissions: ['read:customer'] },
  { prefix: '/sales/pos', roles: ['admin', 'sales_executive', 'sales_manager', 'sales'], permissions: ['create:salesorder', 'read:salesorder'] },
  { prefix: '/sales/amazon', roles: ['admin', 'sales_manager'], permissions: ['read:salesorder'] },
  { prefix: '/sales/returns', roles: ['admin', 'dispatch_manager', 'store_manager', 'sales_executive'], permissions: ['read:salesorder', 'update:salesorder'] },
  { prefix: '/sales', roles: ['admin', 'sales_executive', 'sales_manager', 'sales', 'employee', 'store_manager'], permissions: ['read:salesorder'] },

  // Production Sections
  { prefix: '/production/execution', roles: ['admin', 'production_manager', 'department_head', 'department_incharge', 'shop_floor_operator', 'operator', 'store_manager'], permissions: ['view:departmentexecution', 'start:departmentexecution', 'update:departmentexecution', 'complete:departmentexecution', 'receive:departmentexecution', 'assign:departmentexecution'] },
  { prefix: '/production/assembly', roles: ['admin', 'production_manager', 'department_head', 'department_incharge', 'dept_head', 'shop_floor_operator', 'operator', 'store_manager'], permissions: ['plan:assemblybatch', 'view:assemblybatch', 'allocate:assemblybatch', 'execute:assemblybatch', 'assign_worker:assemblybatch', 'complete:assemblybatch', 'qc_disposition:assemblybatch'] },
  { prefix: '/production/wip', roles: ['admin', 'production_manager', 'department_head', 'department_incharge', 'shop_floor_operator', 'store_manager'], permissions: ['view:wiptracking', 'trace:wiptracking', 'reconcile:wiptracking', 'manage_exception:wiptracking'] },
  { prefix: '/production/bom', roles: ['admin', 'production_manager', 'department_head', 'store_manager'], permissions: ['view:bomversion', 'create:bomversion', 'update:bomversion', 'validate:bomversion', 'approve:bomversion', 'simulate:bomversion'] },
  { prefix: '/inventory/routing', roles: ['admin', 'production_manager', 'department_head', 'store_manager'], permissions: ['view:productroute', 'read:productroute', 'create:productroute', 'update:productroute'] },
  { prefix: '/production/planning', roles: ['admin', 'production_manager', 'department_head', 'store_manager'], permissions: ['view:productionplan', 'create:productionplan', 'update:productionplan', 'submit:productionplan', 'approve:productionplan', 'release:productionplan'] },
  { prefix: '/production', roles: ['admin', 'production_manager', 'department_head', 'department_incharge', 'dept_head', 'store_manager'], permissions: ['read:production', 'view:productionplan', 'view:departmentexecution', 'view:assemblybatch'] },

  // Job Work
  { prefix: '/job-work', roles: ['admin', 'store_manager', 'production_manager', 'inventory_manager', 'department_head'], permissions: ['read:jobworkorder', 'view:jobworkorder', 'create:jobworkorder', 'issue:jobworkorder', 'receive:jobworkorder', 'reconcile:jobworkorder', 'read:production', 'read:inventory'] },

  // Warehouse & Stock
  { prefix: '/inventory/fg-receipts', roles: ['admin', 'inventory_manager', 'store_manager', 'production_manager'], permissions: ['view:fgreceipt', 'receive:fgreceipt', 'hold:fgreceipt', 'release:fgreceipt', 'view:fgreadyoutput'] },
  { prefix: '/stock/ledger', roles: ['admin', 'inventory_manager', 'store_manager'], permissions: ['read:stockledgerentry', 'read:inventory'] },
  { prefix: '/stock/issues', roles: ['admin', 'inventory_manager', 'store_manager'], permissions: ['read:stockledgerentry', 'create:stockledgerentry'] },
  { prefix: '/stock/adjustments', roles: ['admin', 'inventory_manager', 'store_manager'], permissions: ['read:stockledgerentry', 'create:stockledgerentry'] },
  { prefix: '/stock/reorder', roles: ['admin', 'inventory_manager', 'store_manager'], permissions: ['read:stockledgerentry', 'read:inventory'] },
  { prefix: '/stock', roles: ['admin', 'inventory_manager', 'store_manager'], permissions: ['read:stockledgerentry', 'read:inventory'] },
  { prefix: '/inventory', roles: ['admin', 'inventory_manager', 'store_manager', 'procurement_manager', 'production_manager', 'department_head'], permissions: ['read:inventory', 'view:stockbalance', 'read:product'] },

  // Inventory Items / Product Masters
  { prefix: '/products/pricing-masters', roles: ['admin', 'sales_manager', 'inventory_manager'], permissions: ['view:pricingmaster', 'create:pricingmaster', 'update:pricingmaster', 'delete:pricingmaster'] },
  { prefix: '/products/categories', roles: ['admin', 'inventory_manager'], permissions: ['view:category', 'create:category'] },
  { prefix: '/products/families', roles: ['admin', 'inventory_manager'], permissions: ['view:productfamily', 'create:productfamily'] },
  { prefix: '/inventory/uom', roles: ['admin', 'inventory_manager'], permissions: ['view:unitofmeasure', 'read:unitofmeasure'] },
  { prefix: '/products', roles: ['admin', 'inventory_manager', 'store_manager', 'procurement_manager', 'production_manager', 'department_head', 'department_incharge', 'employee'], permissions: ['read:product', 'view:product'] },

  // Procurement & Vendors
  { prefix: '/procurement/expected-receipts', roles: ['admin', 'store_manager', 'inventory_manager', 'procurement_manager'], permissions: ['read:expectedreceipt', 'submit:expectedreceipt'] },
  { prefix: '/procurement/purchase-orders', roles: ['admin', 'inventory_manager', 'store_manager', 'procurement_manager'], permissions: ['read:purchaseorder', 'create:purchaseorder', 'update:purchaseorder', 'approve:purchaseorder'] },
  { prefix: '/procurement', roles: ['admin', 'inventory_manager', 'store_manager', 'procurement_manager'], permissions: ['read:purchaserequisition', 'read:purchaseorder'] },
  { prefix: '/vendors', roles: ['admin', 'inventory_manager', 'store_manager', 'procurement_manager'], permissions: ['read:vendor', 'view:vendor'] },

  // Receiving & GRN
  { prefix: '/receiving/new', roles: ['admin', 'store_manager', 'grn_clerk', 'inventory_manager'], permissions: ['receive:goodsreceiptnote'] },
  { prefix: '/receiving/discrepancies', roles: ['admin', 'store_manager', 'grn_supervisor', 'inventory_manager'], permissions: ['read:goodsreceiptdiscrepancy', 'resolve_discrepancy:goodsreceiptdiscrepancy'] },
  { prefix: '/receiving/goods-receipts', roles: ['admin', 'store_manager', 'inventory_manager', 'procurement_manager', 'grn_clerk', 'grn_verifier', 'grn_supervisor'], permissions: ['read:goodsreceiptnote'] },
  { prefix: '/receiving', roles: ['admin', 'store_manager', 'inventory_manager', 'procurement_manager', 'grn_clerk', 'grn_verifier', 'grn_supervisor'], permissions: ['read:goodsreceiptnote'] },

  // Quality & Inspection
  { prefix: '/quality/rules', roles: ['admin', 'quality_manager'], permissions: ['configure:qualityinspection', 'view:qualityinspection'] },
  { prefix: '/quality/history', roles: ['admin', 'quality_inspector', 'quality_manager', 'production_manager'], permissions: ['view:qualityinspection', 'read:qualityinspection'] },
  { prefix: '/quality', roles: ['admin', 'quality_inspector', 'quality_manager', 'production_manager', 'department_head'], permissions: ['view:qualityinspection', 'read:qualityinspection', 'inspect:qualityinspection'] },

  // Scrap & Wastage
  { prefix: '/scrap-wastage/abnormal-queue', roles: ['admin', 'quality_manager', 'store_manager'], permissions: ['read:lossevent', 'review:lossevent', 'approve:lossevent'] },
  { prefix: '/scrap-wastage/ledger', roles: ['admin', 'quality_manager', 'store_manager'], permissions: ['read:lossevent', 'post:lossevent'] },
  { prefix: '/scrap-wastage/replacements', roles: ['admin', 'store_manager', 'quality_manager'], permissions: ['replace:lossevent', 'acknowledge:replacementchallan'] },
  { prefix: '/scrap-wastage', roles: ['admin', 'store_manager', 'quality_manager', 'quality_inspector', 'production_manager', 'department_head', 'department_incharge', 'inventory_manager', 'employee', 'shop_floor_operator', 'operator'], permissions: ['read:lossevent', 'report:lossevent', 'view:lossevent'] },

  // Logistics & Dispatch
  { prefix: '/dispatch/allocation', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['allocate:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/picking', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['allocate:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/packing', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['update:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/staging', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['dispatch:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/manifests', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['dispatch:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/dispatched', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['dispatch:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/delivery', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['dispatch:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch/carriers', roles: ['admin', 'dispatch_manager', 'store_manager'], permissions: ['dispatch:salesorder', 'read:salesorder'] },
  { prefix: '/dispatch', roles: ['admin', 'dispatch_manager', 'store_manager', 'sales_executive'], permissions: ['read:salesorder'] },

  // HR Module
  { prefix: '/hr/onboarding', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin'], permissions: ['manage:employee', 'read:user'] },
  { prefix: '/hr/analytics', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin', 'department_head'], permissions: ['manage:employee', 'view:employee', 'read:employee'] },
  { prefix: '/hr/directory', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin', 'department_head', 'store_manager'], permissions: ['read:employee', 'view:employee', 'manage:employee', 'read:user'] },
  { prefix: '/hr/new', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin', 'department_head', 'dept_head'], permissions: ['manage:employee', 'create:employee'] },
  { prefix: '/hr/tasks', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin', 'department_head', 'employee'], permissions: ['read:employee', 'view:employee', 'manage:employee'] },
  { prefix: '/hr', roles: ['admin', 'hr_manager', 'hr', 'subadmin', 'sub_admin', 'department_head'], permissions: ['manage:employee', 'view:employee', 'read:employee'] },

  // Operations Calendar, Self Portal & Attendance
  { prefix: '/calendar', roles: ['admin', 'production_manager', 'department_head', 'department_incharge', 'shop_floor_operator', 'store_manager', 'inventory_manager', 'procurement_manager', 'sales_executive', 'sales_manager', 'dispatch_manager', 'employee', 'accountant', 'subadmin', 'sub_admin'], permissions: ['read:dashboard', 'read:production', 'view:departmentexecution'] },
  { prefix: '/onboarding', roles: ['admin', 'hr_manager', 'hr', 'store_manager', 'employee', 'shop_floor_operator'], permissions: ['read:employee', 'view:employee', 'read:user'] },
  { prefix: '/attendance', roles: ['admin', 'hr_manager', 'hr', 'store_manager', 'employee', 'shop_floor_operator', 'department_head'], permissions: ['read:employee', 'view:employee', 'read:user'] },
  { prefix: '/portal', roles: ['admin', 'hr_manager', 'hr', 'store_manager', 'employee', 'shop_floor_operator', 'department_head', 'subadmin'], permissions: ['read:employee', 'view:employee', 'read:user'] },
];

// Sort descending by prefix length so deeper section routes match before parent modules
const VIEW_RULES: ViewRule[] = [...RAW_VIEW_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
const STORE_MANAGER_BLOCKED_PATHS = ['/accounts', '/finance', '/access', '/intelligence/audit', '/decision-center/audit'];
const STORE_MANAGER_MODULE_PATHS = [
  '/calendar', '/intelligence', '/decision-center', '/products', '/inventory', '/procurement', '/vendors',
  '/receiving', '/production', '/job-work', '/quality', '/scrap-wastage', '/sales', '/customers',
  '/dispatch', '/hr', '/attendance', '/onboarding', '/debit-notes',
];

export function canViewPath(pathname: string, role?: string | null, permissions?: string[] | null) {
  const normalized = normalizeRole(role);
  if (normalized === 'admin' || normalized === 'system_admin') return true;
  // Shop-floor operators use a task-only home page without analytics dashboard permission.
  if (pathname === '/' && (normalized === 'shop_floor_operator' || normalized === 'operator')) return true;
  // Department heads use this dedicated HR onboarding route only to create an operator in their assigned department; the API enforces that scope and role.
  if ((normalized === 'department_head' || normalized === 'dept_head') && (pathname === '/hr/new' || pathname.startsWith('/hr/new/'))) return true;
  if (normalized === 'store_manager') {
    if (STORE_MANAGER_BLOCKED_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
    if (pathname === '/' || STORE_MANAGER_MODULE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  }
  // Production Overview route access
  if (pathname === '/production' || pathname === '/production/') {
    if (['admin', 'system_admin', 'super_admin', 'production_manager', 'department_head', 'department_incharge', 'dept_head', 'store_manager'].includes(normalized)) {
      return true;
    }
  }
  if (pathname === '/') return (permissions ?? []).some((permission) => permission.toLowerCase() === 'read:dashboard');
  const rule = VIEW_RULES.find((candidate) => pathname === candidate.prefix || pathname.startsWith(`${candidate.prefix}/`));
  if (!rule) return pathname === '/' || pathname === '/profile' || pathname === '/notifications' || pathname === '/onboarding' || pathname === '/attendance' || pathname.startsWith('/portal');
  const effectivePermissions = new Set((permissions ?? []).map((permission) => permission.toLowerCase()));
  // Dynamic RBAC is authoritative. A missing/empty capability payload is not
  // treated as permission to browse a protected module: doing so would make a
  // role label such as `sales_executive` bypass an explicit denial. The role
  // list remains documented for migration visibility, but access is granted
  // only by the server-issued capability keys.
  if (effectivePermissions.size === 0) return false;
  return rule.permissions.some((permission) => effectivePermissions.has(permission));
}

export function getFirstAccessibleRoute(role?: string | null, permissions?: string[] | null, isAssembly?: boolean): string {
  const normalized = normalizeRole(role);
  if (normalized === 'admin' || normalized === 'system_admin') return '/';
  if (normalized === 'shop_floor_operator' || normalized === 'operator') {
    return isAssembly ? '/production/assembly' : '/';
  }

  // Check custom granted module paths in logical priority order
  const candidates = [
    ...(isAssembly ? ['/production/assembly'] : []),
    '/accounts',
    '/procurement/purchase-orders',
    '/production/execution',
    '/production',
    '/inventory',
    '/products',
    '/receiving',
    '/sales',
    '/job-work',
    '/quality',
    '/finance',
    '/access',
    '/hr/directory',
    '/attendance',
    '/profile',
  ];

  for (const candidate of candidates) {
    if (canViewPath(candidate, role, permissions)) {
      return candidate;
    }
  }

  return '/';
}
export function friendlyErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status) : undefined;
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (status === 401 || /authentication required|session has expired|unauthorized/i.test(raw)) return 'Your session has expired. Please sign in again.';
  if (status === 403 || /permission denied|actor.*is not authorized/i.test(raw)) {
    const match = raw.match(/perform action \[?(\w+)\]? on resource \[?(\w+)\]?/i);
    if (match) {
      return `Your role does not have authorization to ${match[1]} ${match[2]}. Please request access from an administrator.`;
    }
    return "Your current role does not have authorization to access this feature. Please contact your administrator.";
  }

  // Extract detailed field validation messages if available from API response
  const errorData = typeof error === 'object' && error !== null && 'data' in error ? (error as { data?: any }).data : null;
  const details = errorData?.error?.details || errorData?.details;
  if (Array.isArray(details) && details.length > 0) {
    const validationMsgs = details
      .map((d: any) => (d.field ? `${d.field}: ${d.message}` : d.message))
      .filter(Boolean)
      .join(', ');
    if (validationMsgs) return validationMsgs;
  }

  const concise = raw.replace(/\s*\| URL:.*/i, '').trim();
  if (/duplicate bom component line is not allowed/i.test(concise)) {
    return 'Duplicate items in the BOM formulation are not allowed. Duplicate rows are automatically combined.';
  }
  if (/bucketalreadyexists/i.test(concise)) return 'The file service is temporarily unavailable. Please try again.';
  return concise || 'The request could not be completed. Please try again.';
}
