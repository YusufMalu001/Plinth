import { describe, it, expect } from 'vitest';
import {
  classifyNotificationModule,
  NOTIFICATION_MODULE_REGISTRY,
} from '../notification-modules';

describe('classifyNotificationModule', () => {
  it('correctly maps purchase orders and requisitions to procurement', () => {
    const res = classifyNotificationModule({
      resource: 'PurchaseOrder',
      href: '/procurement/purchase-orders/po-123',
      title: 'Purchase Order Created & Approved (PO-2026-010)',
      message: 'PO PO-2026-010 has been created and approved.',
    });

    expect(res.moduleId).toBe('procurement');
    expect(res.section).toBe('Supply Chain');
    expect(res.moduleLabel).toBe('Procurement');
  });

  it('correctly maps goods receipts and discrepancies to receiving', () => {
    const res = classifyNotificationModule({
      resource: 'GoodsReceiptNote',
      href: '/receiving/goods-receipts/grn-1',
      title: 'GRN-2026-001 finalized',
      message: 'Physical receipt intake finalized and ready for sign-off.',
    });

    expect(res.moduleId).toBe('receiving');
    expect(res.section).toBe('Supply Chain');
    expect(res.moduleLabel).toBe('Goods Receiving');
  });

  it('correctly maps low stock and inventory alerts to warehouse & stock', () => {
    const res = classifyNotificationModule({
      href: '/inventory',
      title: 'Low Stock Alert: CRCA Sheet 1.2mm',
      message: 'Current stock is 45 sheets. Reorder threshold is 100 sheets.',
      category: 'inventory',
    });

    expect(res.moduleId).toBe('inventory');
    expect(res.section).toBe('Plant & Operations');
    expect(res.moduleLabel).toBe('Warehouse & Stock');
  });

  it('correctly maps BOM approvals and shop floor events to production', () => {
    const res = classifyNotificationModule({
      resource: 'BomVersion',
      href: '/production/bom/bom-1',
      title: 'BOM approved',
      message: 'BOM2 (v2) is now approved and live.',
    });

    expect(res.moduleId).toBe('production');
    expect(res.section).toBe('Plant & Operations');
    expect(res.moduleLabel).toBe('Manufacturing & Plant');
  });

  it('correctly maps sales orders and credit holds to sales', () => {
    const res = classifyNotificationModule({
      resource: 'SalesOrder',
      href: '/sales/orders/so-99',
      title: 'New Sales Order & Pro Forma Created: SO-2026-099',
      message: 'Order created with pending approval.',
    });

    expect(res.moduleId).toBe('sales');
    expect(res.section).toBe('Plant & Operations');
    expect(res.moduleLabel).toBe('Sales & Orders');
  });

  it('correctly maps supplier bills and debit notes to accounts', () => {
    const res = classifyNotificationModule({
      resource: 'PurchaseBill',
      href: '/accounts/purchases/bills/b-1',
      title: 'Supplier Bill INV-991 submitted for approval',
      message: 'A supplier bill was submitted and is awaiting Admin review.',
    });

    expect(res.moduleId).toBe('accounts');
    expect(res.section).toBe('Finance & Accounts');
    expect(res.moduleLabel).toBe('Finance & Accounts');
  });

  it('correctly maps employee task validations to HR', () => {
    const res = classifyNotificationModule({
      resource: 'EmployeeTask',
      href: '/hr/tasks?taskId=t-1',
      title: 'Task Proof Submitted for Validation: Safety Check',
      message: 'Worker submitted proof for review.',
    });

    expect(res.moduleId).toBe('hr');
    expect(res.section).toBe('Workforce');
    expect(res.moduleLabel).toBe('Human Resources');
  });

  it('correctly maps Hermes recommendations to intelligence', () => {
    const res = classifyNotificationModule({
      resource: 'Recommendation',
      href: '/decision-center/recommendations/rec-1',
      title: 'Inventory action suggested',
      message: 'Hermes AI advisor recommended reorder adjustments.',
      category: 'intelligence',
    });

    expect(res.moduleId).toBe('intelligence');
    expect(res.section).toBe('Platform');
    expect(res.moduleLabel).toBe('AI & Decision Center');
  });

  it('contains all registered modules in the registry', () => {
    const ids = NOTIFICATION_MODULE_REGISTRY.map((m) => m.id);
    expect(ids).toContain('procurement');
    expect(ids).toContain('receiving');
    expect(ids).toContain('inventory');
    expect(ids).toContain('production');
    expect(ids).toContain('quality');
    expect(ids).toContain('scrap-wastage');
    expect(ids).toContain('sales');
    expect(ids).toContain('dispatch');
    expect(ids).toContain('accounts');
    expect(ids).toContain('hr');
    expect(ids).toContain('intelligence');
  });
});
