import { bomApi } from './api';
import type { CreateBomDraftInput } from './types';

type BomSaveApi = Pick<typeof bomApi, 'createDraft' | 'updateDraft' | 'validate' | 'approve'>;

interface SaveInventoryBomInput {
  itemId: string;
  itemType: 'PRODUCT' | 'MATERIAL';
  bomNumber?: string;
  productVariantId?: string | null;
  updateVersionId?: string;
  lines: NonNullable<CreateBomDraftInput['lines']>;
}

/** A selected saved BOM keeps its identity; only a new recipe creates a version. */
export async function saveInventoryBomVersion(
  input: SaveInventoryBomInput,
  api: BomSaveApi = bomApi
) {
  if (input.updateVersionId) {
    return api.updateDraft(input.updateVersionId, {
      bomNumber: input.bomNumber,
      lines: input.lines,
    });
  }

  const draft = await api.createDraft({
    ...(input.itemType === 'MATERIAL' ? { materialId: input.itemId } : { productId: input.itemId }),
    ...(input.productVariantId ? { productVariantId: input.productVariantId } : {}),
    bomNumber: input.bomNumber,
    lines: input.lines,
  });
  if (draft.status === 'APPROVED') return draft;
  if (draft.status === 'DRAFT' || draft.status === 'VALIDATION_PENDING') {
    await api.validate(draft.id);
  }
  return api.approve(draft.id);
}
