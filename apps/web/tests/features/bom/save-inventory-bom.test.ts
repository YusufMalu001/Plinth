import { describe, expect, it, vi } from 'vitest';
import { saveInventoryBomVersion } from '@/features/bom/save-inventory-bom';
import type { BomVersionDetail } from '@/features/bom/types';
import { bomApi } from '@/features/bom/api';

const lines = [{
  lineType: 'COMPONENT' as const,
  materialId: 'material-1',
  uomId: 'uom-1',
  quantityMode: 'SCALED' as const,
  quantity: 4,
  roundingRule: 'NONE' as const,
  sequence: 1,
}];

function mockApi() {
  return {
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    validate: vi.fn(),
    approve: vi.fn(),
  } as unknown as Pick<typeof bomApi, 'createDraft' | 'updateDraft' | 'validate' | 'approve'>;
}

describe('saveInventoryBomVersion', () => {
  it('updates quantities and lines on the selected BOM ID', async () => {
    const api = mockApi();
    const updated = { id: 'bom-1', bomNumber: 'Product BOM', status: 'APPROVED' } as BomVersionDetail;
    vi.mocked(api.updateDraft).mockResolvedValue(updated);

    const result = await saveInventoryBomVersion({
      itemId: 'product-1', itemType: 'PRODUCT', updateVersionId: 'bom-1',
      bomNumber: 'Product BOM', lines,
    }, api);

    expect(result.id).toBe('bom-1');
    expect(api.updateDraft).toHaveBeenCalledWith('bom-1', { bomNumber: 'Product BOM', lines });
    expect(api.createDraft).not.toHaveBeenCalled();
    expect(api.validate).not.toHaveBeenCalled();
    expect(api.approve).not.toHaveBeenCalled();
  });

  it('creates and approves a separate BOM for a new recipe', async () => {
    const api = mockApi();
    vi.mocked(api.createDraft).mockResolvedValue({ id: 'bom-2', status: 'DRAFT' } as BomVersionDetail);
    vi.mocked(api.approve).mockResolvedValue({ id: 'bom-2', status: 'APPROVED' } as BomVersionDetail);

    const result = await saveInventoryBomVersion({
      itemId: 'product-1', itemType: 'PRODUCT', bomNumber: 'Another BOM', lines,
    }, api);

    expect(result.id).toBe('bom-2');
    expect(api.createDraft).toHaveBeenCalledWith({ productId: 'product-1', bomNumber: 'Another BOM', lines });
    expect(api.updateDraft).not.toHaveBeenCalled();
    expect(api.validate).toHaveBeenCalledWith('bom-2');
    expect(api.approve).toHaveBeenCalledWith('bom-2');
  });
});
