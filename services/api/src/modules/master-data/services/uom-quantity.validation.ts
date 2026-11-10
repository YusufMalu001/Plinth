import type { UnitOfMeasure } from '@prisma/client';
import { ValidationError } from '../../../common/errors/AppError';

const QUANTITY_FIELDS: Record<string, string> = {
  initialQuantity: 'Opening stock',
  openingStock: 'Opening stock',
  minStockLevel: 'Minimum stock',
  safetyStock: 'Safety stock',
  reorderPoint: 'Reorder point',
  targetMaxStock: 'Target maximum stock',
};

/** Reject fractional inventory quantities when the selected UOM is whole-unit only. */
export function assertUomQuantities(uom: Pick<UnitOfMeasure, 'name' | 'allowFractional'>, values: unknown): void {
  if (uom.allowFractional !== false || !values || typeof values !== 'object') return;

  const validateRecord = (record: Record<string, unknown>, prefix = '') => {
    for (const [key, label] of Object.entries(QUANTITY_FIELDS)) {
      const value = record[key];
      if (value === undefined || value === null || value === '') continue;
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && !Number.isInteger(numberValue)) {
        throw new ValidationError(`${prefix}${label} must be a whole number because ${uom.name} does not allow decimal quantities.`);
      }
    }

    for (const collectionKey of ['measurementVariants', 'variants']) {
      const variants = record[collectionKey];
      if (Array.isArray(variants)) {
        variants.forEach((variant, index) => {
          if (variant && typeof variant === 'object') {
            validateRecord(variant as Record<string, unknown>, `Variant ${index + 1}: `);
          }
        });
      }
    }
  };

  validateRecord(values as Record<string, unknown>);
}
