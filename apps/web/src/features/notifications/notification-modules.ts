export type NotificationModuleId =
  | 'all'
  | 'procurement'
  | 'receiving'
  | 'inventory'
  | 'production'
  | 'quality'
  | 'scrap-wastage'
  | 'sales'
  | 'dispatch'
  | 'accounts'
  | 'hr'
  | 'intelligence';

export interface NotificationModuleMeta {
  id: NotificationModuleId;
  label: string;
  section: 'Supply Chain' | 'Plant & Operations' | 'Finance & Accounts' | 'Workforce' | 'Platform';
  description: string;
  iconName: string;
}

export const NOTIFICATION_MODULE_REGISTRY: NotificationModuleMeta[] = [
  {
    id: 'procurement',
    label: 'Procurement',
    section: 'Supply Chain',
    description: 'Purchase requisitions, purchase orders, RFQs, vendor approvals, and status tracking.',
    iconName: 'ShoppingCart',
  },
  {
    id: 'receiving',
    label: 'Goods Receiving',
    section: 'Supply Chain',
    description: 'Expected receipts, physical intake, GRNs, inspections, and intake discrepancies.',
    iconName: 'PackageCheck',
  },
  {
    id: 'inventory',
    label: 'Warehouse & Stock',
    section: 'Plant & Operations',
    description: 'Stock thresholds, low-stock alerts, reservations, ledger entries, and inventory levels.',
    iconName: 'Package',
  },
  {
    id: 'production',
    label: 'Manufacturing & Plant',
    section: 'Plant & Operations',
    description: 'BOM revisions, shop floor routes, batch execution, WIP tracking, and job work.',
    iconName: 'Factory',
  },
  {
    id: 'quality',
    label: 'Quality & Inspection',
    section: 'Plant & Operations',
    description: 'QC gates, inspection queues, test criteria sign-offs, and quality history.',
    iconName: 'ShieldCheck',
  },
  {
    id: 'scrap-wastage',
    label: 'Scrap & Wastage',
    section: 'Plant & Operations',
    description: 'Scrap reporting, abnormal loss reviews, replacement challans, and tolerance triggers.',
    iconName: 'Trash2',
  },
  {
    id: 'sales',
    label: 'Sales & Orders',
    section: 'Plant & Operations',
    description: 'Sales orders, credit hold queues, pro forma drafts, customer approvals, and POS sales.',
    iconName: 'TrendingUp',
  },
  {
    id: 'dispatch',
    label: 'Logistics & Dispatch',
    section: 'Plant & Operations',
    description: 'Stock shortages, fulfillment batches, picking, packing, manifests, and deliveries.',
    iconName: 'Truck',
  },
  {
    id: 'accounts',
    label: 'Finance & Accounts',
    section: 'Finance & Accounts',
    description: 'Supplier bills, debit notes, credit notes, journals, payments, and tax invoices.',
    iconName: 'Landmark',
  },
  {
    id: 'hr',
    label: 'Human Resources',
    section: 'Workforce',
    description: 'Employee tasks, onboarding checklists, proof submissions, and attendance alerts.',
    iconName: 'Users',
  },
  {
    id: 'intelligence',
    label: 'AI & Decision Center',
    section: 'Platform',
    description: 'Autonomous recommendations, daily business reviews, and Hermes AI advisories.',
    iconName: 'Sparkles',
  },
];

export interface NotificationClassifierInput {
  resource?: string | null;
  href?: string | null;
  title: string;
  message: string;
  category?: string | null;
}

/**
 * Classifies an incoming notification into its canonical module & section.
 */
export function classifyNotificationModule(input: NotificationClassifierInput): {
  moduleId: Exclude<NotificationModuleId, 'all'>;
  section: string;
  moduleLabel: string;
} {
  const resource = (input.resource || '').toLowerCase();
  const href = (input.href || '').toLowerCase();
  const text = `${input.title} ${input.message}`.toLowerCase();

  // 1. Intelligence / Hermes Advisor
  if (
    ['recommendation', 'businesstask', 'intelligencecase', 'dailyinsight', 'intelligencerun'].includes(input.resource || '') ||
    href.includes('/decision-center') ||
    href.includes('/intelligence') ||
    /advisor|hermes|recommendation|daily business review|daily brief|task overdue|ai insight/i.test(text)
  ) {
    return { moduleId: 'intelligence', section: 'Platform', moduleLabel: 'AI & Decision Center' };
  }

  // 2. HR / Workforce
  if (
    resource === 'employeetask' ||
    resource === 'employee' ||
    href.includes('/hr') ||
    href.includes('/portal/tasks') ||
    href.includes('/attendance') ||
    /task proof submitted|task approved|task proof rejected|task assigned|onboarding|attendance|leave/i.test(text)
  ) {
    return { moduleId: 'hr', section: 'Workforce', moduleLabel: 'Human Resources' };
  }

  // 3. Accounts & Finance
  if (
    ['purchasebill', 'salesarproforma', 'salesarinvoice', 'salesarcreditnote', 'salesarreceipt', 'salesarallocation', 'salesarmarketplacebatch', 'journalvoucher', 'accountingentity', 'accountingperiod', 'miscellaneousexpense', 'ledgeraccount', 'debitnote'].includes(input.resource || '') ||
    href.includes('/accounts') ||
    href.includes('/finance') ||
    href.includes('/debit-notes') ||
    /supplier bill|purchase bill|tax invoice|credit note|debit note|journal voucher|payment recorded|accounts|pro forma updated|brs|gstn|tally/i.test(text)
  ) {
    return { moduleId: 'accounts', section: 'Finance & Accounts', moduleLabel: 'Finance & Accounts' };
  }

  // 4. Logistics & Dispatch
  if (
    href.includes('/dispatch') ||
    href.includes('/fulfillment') ||
    resource === 'salesfulfillment' ||
    /stock shortage:.*fulfillment|fulfillment.*backordered|dispatch staging|picking workbench|delivery & pod|manifest/i.test(text)
  ) {
    return { moduleId: 'dispatch', section: 'Plant & Operations', moduleLabel: 'Logistics & Dispatch' };
  }

  // 5. Scrap & Wastage
  if (
    href.includes('/scrap-wastage') ||
    resource === 'lossevent' ||
    /\[scrap reported\]|scrap proposal|replacement material issued|loss event|abnormal loss/i.test(text)
  ) {
    return { moduleId: 'scrap-wastage', section: 'Plant & Operations', moduleLabel: 'Scrap & Wastage' };
  }

  // 6. Quality & Inspection
  if (
    href.includes('/quality') ||
    resource === 'qcinspection' ||
    resource === 'goodsreceiptdiscrepancy' ||
    /inspection queue|qc rule|discrepancy raised|quality inspection|qc criteria/i.test(text)
  ) {
    return { moduleId: 'quality', section: 'Plant & Operations', moduleLabel: 'Quality & Inspection' };
  }

  // 7. Manufacturing & Plant (Production, Assembly, BOM)
  if (
    href.includes('/production') ||
    href.includes('/assembly') ||
    resource === 'departmentexecutionbatch' ||
    resource === 'productionplan' ||
    resource === 'bomversion' ||
    resource === 'assemblybatch' ||
    /bom approved|bom approval|production schedule|production stage|incomplete production|incomplete assembly|assembly batch|shop floor/i.test(text)
  ) {
    return { moduleId: 'production', section: 'Plant & Operations', moduleLabel: 'Manufacturing & Plant' };
  }

  // 8. Goods Receiving
  if (
    href.includes('/receiving') ||
    resource === 'goodsreceiptnote' ||
    resource === 'expectedreceipt' ||
    /goods receipt|grn|receipt finalized|is ready for verification|is ready for sign-off|is signed off/i.test(text)
  ) {
    return { moduleId: 'receiving', section: 'Supply Chain', moduleLabel: 'Goods Receiving' };
  }

  // 9. Sales & Orders
  if (
    href.includes('/sales') ||
    resource === 'salesorder' ||
    /sales order|credit hold|pos sale|amazon order|pro forma created/i.test(text)
  ) {
    return { moduleId: 'sales', section: 'Plant & Operations', moduleLabel: 'Sales & Orders' };
  }

  // 10. Procurement
  if (
    href.includes('/procurement') ||
    resource === 'purchaseorder' ||
    resource === 'purchaserequisition' ||
    resource === 'vendor' ||
    /purchase order|purchase requisition|po-202|supplier lead time|raise po|rfq/i.test(text)
  ) {
    return { moduleId: 'procurement', section: 'Supply Chain', moduleLabel: 'Procurement' };
  }

  // 11. Warehouse & Stock (Inventory)
  if (
    href.includes('/inventory') ||
    href.includes('/stock') ||
    href.includes('/products') ||
    resource === 'material' ||
    resource === 'product' ||
    resource === 'stockadjustment' ||
    resource === 'stockissue' ||
    /low stock alert|predicted stockout|reorder threshold|stock shortage/i.test(text)
  ) {
    return { moduleId: 'inventory', section: 'Plant & Operations', moduleLabel: 'Warehouse & Stock' };
  }

  // Default fallback based on category
  if (input.category === 'inventory') {
    return { moduleId: 'inventory', section: 'Plant & Operations', moduleLabel: 'Warehouse & Stock' };
  }
  if (input.category === 'receipts') {
    return { moduleId: 'receiving', section: 'Supply Chain', moduleLabel: 'Goods Receiving' };
  }
  if (input.category === 'intelligence') {
    return { moduleId: 'intelligence', section: 'Platform', moduleLabel: 'AI & Decision Center' };
  }

  // Generic procurement / operational inbox fallback
  return { moduleId: 'procurement', section: 'Supply Chain', moduleLabel: 'Procurement' };
}
