import { describe, it, expect, beforeEach } from 'vitest';
import {
  PURCHASE_ORDER_CREATION_DRAFT_KEY,
  getSavedPoDraft,
  clearSavedPoDraft,
  PurchaseOrderCreationDraft,
} from '../../src/features/purchases/utils';

describe('Purchase Order Draft Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no draft exists', () => {
    expect(getSavedPoDraft()).toBeNull();
  });

  it('saves and retrieves an in-progress purchase order draft', () => {
    const draft: PurchaseOrderCreationDraft = {
      departmentId: 'dept-123',
      needDate: '2026-10-15',
      priority: 'HIGH',
      vendorId: 'vendor-456',
      paymentTerms: 'Net 45',
      deliveryLocation: 'Indore Central Store',
      costCenter: 'CC-01',
      projectCode: 'PROJ-99',
      requestedBudget: '150000',
      businessJustification: 'Urgent production component replenishment',
      notes: 'Please expedite delivery',
      lines: [
        {
          tempId: 'line-1',
          itemSelectorKey: 'mat:mat-1',
          itemId: 'mat-1',
          itemType: 'material',
          itemName: 'Stainless Steel Rod 10mm',
          uomId: 'uom-kg',
          quantity: '500',
          unitPrice: '120',
          needDate: '2026-10-15',
          preferredMake: 'Tata Steel',
        },
      ],
      savedAt: '2026-10-06T12:00:00.000Z',
    };

    localStorage.setItem(PURCHASE_ORDER_CREATION_DRAFT_KEY, JSON.stringify(draft));

    const retrieved = getSavedPoDraft();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.vendorId).toBe('vendor-456');
    expect(retrieved?.departmentId).toBe('dept-123');
    expect(retrieved?.lines).toHaveLength(1);
    expect(retrieved?.lines[0].itemName).toBe('Stainless Steel Rod 10mm');
    expect(retrieved?.lines[0].quantity).toBe('500');
    expect(retrieved?.businessJustification).toBe('Urgent production component replenishment');
  });

  it('clears saved purchase order draft', () => {
    const draft: PurchaseOrderCreationDraft = {
      departmentId: 'dept-1',
      needDate: '2026-10-15',
      priority: 'NORMAL',
      vendorId: 'vendor-1',
      paymentTerms: 'Net 30',
      deliveryLocation: 'Indore HQ Plant',
      costCenter: '',
      projectCode: '',
      requestedBudget: '',
      businessJustification: '',
      notes: '',
      lines: [],
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(PURCHASE_ORDER_CREATION_DRAFT_KEY, JSON.stringify(draft));
    expect(getSavedPoDraft()).not.toBeNull();

    clearSavedPoDraft();
    expect(getSavedPoDraft()).toBeNull();
    expect(localStorage.getItem(PURCHASE_ORDER_CREATION_DRAFT_KEY)).toBeNull();
  });
});
