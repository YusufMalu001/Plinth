import { getVariantLabel } from '../products/variant-names';

/** Distinct product components referenced by BOM lines, in recipe order. */
export function getBomComponentProducts(
  lines: Array<{ componentProductId?: string | null; componentProduct?: { id?: string; name?: string } | null }>,
  products: Array<{ id: string; name: string }> = [],
) {
  const namesById = new Map<string, string>();
  for (const line of lines) {
    const id = line.componentProductId || line.componentProduct?.id;
    if (!id || namesById.has(id)) continue;
    const name = line.componentProduct?.name || products.find((product) => product.id === id)?.name || 'Unnamed product';
    namesById.set(id, name);
  }
  return [...namesById].map(([id, name]) => ({ id, name }));
}

/** Reads the variant label stored alongside a BOM line's engineering note. */
export function getBomLineVariantLabel(note?: string | null): string | undefined {
  const marker = String(note || '').split(/\s*·\s*/).find((part) => /^Selected variant:/i.test(part.trim()));
  if (!marker) return undefined;
  return marker
    .replace(/^Selected variant:\s*/i, '')
    .replace(/\s*\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)\s*$/i, '')
    .trim() || undefined;
}

/** Resolve a BOM line's parent and variant from expanded or persisted variant records. */
export function getBomLineItemDisplay(line: any, materials: any[] = [], products: any[] = []) {
  const material = materials.find((item) => item.id === (line?.materialId || line?.material?.id));
  const product = products.find((item) => item.id === (line?.componentProductId || line?.componentProduct?.id));
  const item = material || product;
  const specs = item?.specs || {};
  const metadata = item?.metadata || {};
  const isVariant = Boolean(item?.isVariant || specs.isVariant || metadata.isVariant);
  const parentId = item?.parentMaterialId || item?.parentProductId || specs.parentMaterialId || metadata.parentProductId;
  const parent = parentId
    ? materials.find((candidate) => candidate.id === parentId) || products.find((candidate) => candidate.id === parentId)
    : undefined;
  const parentName = item?.parentMaterialName || item?.parentProductName || specs.parentMaterialName || metadata.parentProductName || parent?.name;
  const savedVariantLabel = getBomLineVariantLabel(line?.note);
  return {
    name: isVariant && parentName ? parentName : material?.name || product?.name || line?.material?.name || line?.componentProduct?.name || 'Component',
    variant: (savedVariantLabel ? getVariantLabel(parentName, savedVariantLabel) : undefined)
      || (isVariant ? getVariantLabel(parentName, item?.name, item?.measurementValue || specs.measurementValue || metadata.measurementValue) : undefined),
  };
}

/** Base UOM is always allowed; additional UOMs are explicit item configuration. */
export function getItemAllowedUomIds(item: any, catalog: any[] = []): string[] {
  if (!item) return [];
  const parentId = item.parentMaterialId || item.parentProductId || item.parentOptionId
    || item.specs?.parentMaterialId || item.metadata?.parentProductId;
  const parent = parentId ? catalog.find((candidate) => candidate.id === parentId) : undefined;
  const configured = item.availableUomIds || item.specs?.availableUomIds || item.metadata?.availableUomIds
    || parent?.availableUomIds || parent?.specs?.availableUomIds || parent?.metadata?.availableUomIds || [];
  const baseUomId = item.uomId || item.uom?.id || parent?.uomId || parent?.uom?.id;
  return [...new Set([baseUomId, ...(Array.isArray(configured) ? configured : [])].filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export interface ItemUomRelationLike {
  id?: string;
  fromUomId: string;
  toUomId: string;
  fromQuantity?: number | string;
  toQuantity?: number | string;
  factor?: number | string;
  notes?: string;
}

/** Returns all configured UOM conversion relations for an item (checking item, its specs/metadata, and parent). */
export function getItemUomRelations(item: any, catalog: any[] = []): ItemUomRelationLike[] {
  if (!item) return [];
  const parentId = item.parentMaterialId || item.parentProductId || item.parentOptionId
    || item.specs?.parentMaterialId || item.metadata?.parentProductId;
  const parent = parentId ? catalog.find((candidate) => candidate.id === parentId) : undefined;

  const rawRelations = item.uomRelations
    || item.specs?.uomRelations
    || item.metadata?.uomRelations
    || parent?.uomRelations
    || parent?.specs?.uomRelations
    || parent?.metadata?.uomRelations;

  if (!Array.isArray(rawRelations)) return [];
  return rawRelations;
}

/**
 * Converts a quantity from fromUomId to toUomId based on an item's established UOM relations.
 * Returns the converted quantity rounded to up to 6 decimal places, or null if no conversion relation exists.
 */
export function convertItemQuantityBetweenUoms(
  item: any,
  quantity: number | string | undefined,
  fromUomId: string,
  toUomId: string,
  catalog: any[] = []
): number | null {
  if (!fromUomId || !toUomId) return null;
  const numQty = parseFloat(String(quantity));
  if (isNaN(numQty) || numQty <= 0) return null;
  if (fromUomId === toUomId) return numQty;

  const relations = getItemUomRelations(item, catalog);
  if (!relations.length) return null;

  // 1. Direct match: fromUomId -> toUomId or toUomId -> fromUomId
  const direct = relations.find(
    (r) => (r.fromUomId === fromUomId && r.toUomId === toUomId) ||
           (r.fromUomId === toUomId && r.toUomId === fromUomId)
  );

  if (direct) {
    const fromQ = Number(direct.fromQuantity ?? 1);
    const toQ = Number(direct.toQuantity ?? direct.factor ?? 1);
    if (fromQ > 0 && toQ > 0) {
      if (direct.fromUomId === fromUomId && direct.toUomId === toUomId) {
        const factor = toQ / fromQ;
        return Number((numQty * factor).toFixed(6));
      } else {
        const factor = fromQ / toQ;
        return Number((numQty * factor).toFixed(6));
      }
    }
  }

  // 2. Indirect match via Base UOM (e.g. A -> Base -> B)
  const baseUomId = item.uomId || item.uom?.id;
  if (baseUomId && fromUomId !== baseUomId && toUomId !== baseUomId) {
    const qtyInBase = convertItemQuantityBetweenUoms(item, numQty, fromUomId, baseUomId, catalog);
    if (qtyInBase !== null) {
      return convertItemQuantityBetweenUoms(item, qtyInBase, baseUomId, toUomId, catalog);
    }
  }

  return null;
}

/**
 * Automatically calculates the next incremented BOM name.
 * e.g. "FARDEEN-TEST" -> "FARDEEN-TEST 2"
 *      "FARDEEN-TEST 2" -> "FARDEEN-TEST 3"
 *      "CS9 - RAW" -> "CS9 - RAW 2"
 * Avoids any collision with existingNamesSet.
 */
export function getNextIncrementedBomName(
  rawName: string,
  existingNamesSet: Set<string> = new Set()
): string {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return 'Item BOM';

  // Check if name ends with a sequence number, e.g. "FARDEEN-TEST 2" or "FARDEEN-TEST-2"
  const match = trimmed.match(/^(.*?)(?:[\s\-_]+(\d+))$/);
  let base = trimmed;
  let nextNum = 2;

  if (match && match[1]?.trim()) {
    base = match[1].trim();
    nextNum = parseInt(match[2], 10) + 1;
  }

  let candidate = `${base} ${nextNum}`;
  while (existingNamesSet.has(candidate.toLowerCase())) {
    nextNum += 1;
    candidate = `${base} ${nextNum}`;
  }

  return candidate;
}
