import { ConflictError } from '../../../common/errors/AppError';

type InventoryEntity = 'PRODUCT' | 'MATERIAL';
type InventoryNameLookup = (name: string, current?: { entity: InventoryEntity; id: string }) => Promise<{ id: string; name: string } | null>;

/** Enforce one case-insensitive name namespace across products and materials. */
export async function assertInventoryNameAvailable(
  name: string,
  findConflict: InventoryNameLookup,
  current?: { entity: InventoryEntity; id: string }
): Promise<void> {
  const normalizedName = name.trim();
  if (!normalizedName) return;

  const duplicate = await findConflict(normalizedName, current);
  if (duplicate) {
    throw new ConflictError(`An inventory item named "${normalizedName}" already exists. Product and material names must be unique across the catalog.`);
  }
}
